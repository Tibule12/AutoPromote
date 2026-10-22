#!/usr/bin/env node
// Native signed-in editing only: real media import, clip commands, Graphics
// interchange, Sound, Creator FX, Save, export, playback and portable backup.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..'), report = path.join(root, 'reports/studio-real-footage-edit-20261018'), folder = path.join(report, 'proof');
Object.assign(process.env, {STUDIO_TEMPLATE_PROOF_DIR:folder,STUDIO_KINETIC_PROOF_DIR:folder,STUDIO_QA_EXPECTED_WIDTH:'1280',STUDIO_QA_EXPECTED_HEIGHT:'720',STUDIO_QA_EXPORT_FPS:'24',STUDIO_QA_NATIVE_DOWNLOAD_METHOD:'playwright',STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS:'1800000',STUDIO_QA_TIMELINE_HEIGHT:'460',STUDIO_QA_HIDE_MEDIA:'1'});
const h = require('../creative-templates/studio-proof'), q = require('../../test/e2e/playwright/studio-stability/run');
const { pause, seek, range, recording } = require('./kinetic-type-proof'), { hash } = require('../../src/creativeTemplates/contract');
const items=JSON.parse(fs.readFileSync(path.join(root,'reports/studio-real-footage-20261018/sources.json'))).items;
const edl=JSON.parse(fs.readFileSync(path.join(report,'edit-decisions.json'))).shots;
const name='CRAFT — no accident · real footage edit · 20261018';
const duration=r=>r.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick/90000;
async function entry(page){await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));}
async function open(page,title=name){await page.getByRole('region',{name:'Saved Studio projects',exact:true}).getByRole('button',{name:title,exact:true}).click();await h.rail(page);await pause(page);}
async function media(page){await h.rail(page);await page.getByRole('tab',{name:'Media',exact:true}).click();}
async function card(page,id){await media(page);const filename=path.basename(items.find(i=>i.assetId===id).path);return page.getByTestId('project-media-library').locator('article').filter({has:page.getByRole('button',{name:`Preview ${filename}`,exact:true})});}
async function sourceAction(page,id,action){const c=await card(page,id);await c.getByRole('button',{name:/^Preview /}).click();await c.getByRole('button',{name:action,exact:true}).click();await pause(page);}
async function markedSeek(page,time,sourceTime){await seek(page,time);if(sourceTime!==undefined)await page.waitForFunction(t=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-t)<.09;},sourceTime,{timeout:90000});await pause(page);}
async function edit(page){
  assert(!fs.existsSync(path.join(folder,'native-edit.json')),'Preserve delivered edit.');
  const projects=page.getByRole('region',{name:'Saved Studio projects',exact:true});await projects.waitFor();
  if(await projects.getByRole('button',{name,exact:true}).count())await open(page);
  else{await open(page,'Real footage · Boxing · 20261018');await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));await page.getByLabel('Project name',{exact:true}).fill(name);await h.save(page,'duplicated-source');}
  await q.tool(page,'Reframe');await page.getByTestId('reframe-aspect-16-9').click();await page.getByTestId('reframe-preserve-frame').click();
  await q.tool(page,'Color');const rounded=page.getByLabel('Rounded main footage',{exact:true});if(await rounded.isChecked())await rounded.uncheck();
  await q.tool(page,'Sound');const repair=page.getByLabel('Use voice repair on export',{exact:true});if(await repair.isChecked())await repair.uncheck();
  await media(page);const baseline=await h.save(page,'before-source-import');
  const wanted=[...new Set(edl.map(s=>s.assetId))];const missing=items.filter(i=>wanted.includes(i.assetId)&&!baseline.snapshot.projectMedia.some(m=>m.name===path.basename(i.path)));
  if(missing.length)await page.getByTestId('project-media-import-input').setInputFiles(missing.map(i=>path.join(root,i.path)));
  await page.waitForFunction(names=>names.every(name=>[...document.querySelectorAll('[data-testid="project-media-library"] article')].some(c=>c.textContent.includes(name)&&c.classList.contains('is-ready'))),wanted.map(id=>path.basename(items.find(i=>i.assetId===id).path)),{timeout:240000});
  await h.save(page,'owned-sources-ready');
  const stop=await recording(page);
  try{
    const checkpoint=path.join(folder,'cut-progress.json');let completed=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint)).completed:0;
    if(!completed){
      // Replace preserves an existing occurrence's duration. Start this edit
      // with a full native occurrence instead, then delete the inherited one.
      await sourceAction(page,'40967','Add to sequence');await q.tool(page,'Cut');
      await page.getByTestId('pro-video-clip-1').click();await page.getByTestId('inspector-cut-delete').click();
      await h.save(page,'first-full-source-added');
    }
    await q.tool(page,'Cut');await page.getByRole('button',{name:'Clean Cut',exact:true}).click();
    for(let i=completed;i<edl.length;i++){
      const shot=edl[i];let saved=await h.save(page,`cut-${i}-before`);
      if(i>0 && saved.snapshot.timeline.length===i)await sourceAction(page,shot.assetId,'Add to sequence');
      await q.tool(page,'Cut');await page.getByTestId(`pro-video-clip-${i+1}`).click();
      let existing=(await h.save(page,`cut-${i}-selected`)).snapshot.timeline[i];
      const start=Number(existing.startRequest||0);
      if(Math.abs(start-shot.sourceIn)>.05){
        assert(start<shot.sourceIn,'Resume cannot expand a previously trimmed source.');
        await markedSeek(page,shot.programmeIn+shot.sourceIn-start,shot.sourceIn);
        await page.getByTestId('inspector-cut-trim-start').click();
      }
      await markedSeek(page,shot.programmeOut,shot.sourceOut);
      await page.getByTestId('inspector-cut-trim-end').click();
      saved=await h.save(page,`cut-${i}-complete`);existing=saved.snapshot.timeline[i];
      assert(Math.abs(Number(existing.startRequest||0)-shot.sourceIn)<.05,JSON.stringify({i,start:existing.startRequest}));
      assert(Math.abs(Number(existing.endRequest)-shot.sourceOut)<.05,JSON.stringify({i,end:existing.endRequest}));
      assert(Math.abs(duration(saved)-shot.programmeOut)<.05,`Shot ${i+1} output clock`);
      fs.writeFileSync(checkpoint,JSON.stringify({completed:i+1,projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument)},null,2));
      console.log(`Native cut ${i+1}/${edl.length}: ${shot.assetId} ${shot.sourceIn}–${shot.sourceOut}s; programme ${duration(saved).toFixed(3)}s.`);
    }
    const beforeRamp=await h.save(page,'before-ramp');
    if(!beforeRamp.snapshot.speedKeyframes.length){await seek(page,38);await q.tool(page,'Creator FX');await page.getByTestId('creator-section-effects').click();await page.getByRole('button',{name:'Apply smooth speed ramp',exact:true}).click();}
    const ramp=await h.save(page,'ramp-added');assert.equal(ramp.snapshot.speedKeyframes.length,4);
    if(duration(ramp)>60+1/90000){await markedSeek(page,60);await q.tool(page,'Cut');await page.getByTestId('inspector-cut-trim-end').click();}
    const trimmed=await h.save(page,'one-minute-cut');assert(Math.abs(duration(trimmed)-60)<1/24,`Final duration ${duration(trimmed)}`);
    require('node:child_process').execFileSync('python3',[path.join(__dirname,'author-real-footage-edit.py')],{stdio:'inherit'});
    await q.tool(page,'Graphics');const panel=page.getByTestId('studio-graphics-import');if(!await panel.evaluate(e=>e.open))await panel.locator('summary').click();
    await page.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.join(report,'assets/craft.graphics.json'));
    await panel.getByRole('status').waitFor();assert((await panel.getByRole('status').innerText()).includes('imported.'),await panel.innerText());
    await q.tool(page,'Sound');await page.getByTestId('background-sound-input').setInputFiles(path.join(report,'assets/Deep-Urban.mp3'));
    for(const label of ['Keep original audio','Duck under speech','Loop for the full clip']){const e=page.getByLabel(label,{exact:false});if(await e.isChecked())await e.uncheck();}
    await range(page.locator('.inspector-range').filter({hasText:'Background volume'}).locator('input[type=range]'),65);
    await range(page.getByLabel('Music fade in',{exact:true}),.03);await range(page.getByLabel('Music fade out',{exact:true}),1.2);
    const programmeTime=time=>{const tick=Math.round(time*90000);const segment=trimmed.snapshot.studioDocument.outputTimeMap.find(s=>s.outputRange.startTick<=tick&&s.outputRange.endTick>=tick);assert(segment);const o=segment.outputRange,p=segment.programmeRange;return Math.round(p.startTick+(tick-o.startTick)*(p.endTick-p.startTick)/(o.endTick-o.startTick))/90000;};
    for(const [kind,outputTime,volume] of [['impact',0,46],['whoosh',14.65,32],['impact',15,40],['whoosh',24.65,28],['impact',25,35],['whoosh',35.65,32],['impact',36,46],['impact',56,50]]){
      const time=programmeTime(outputTime);
      await page.getByTestId('sound-effect-input').setInputFiles(path.join(report,`assets/original-${kind}.wav`));
      await page.getByTestId('sound-effect-start').fill(String(time));await page.getByTestId('sound-effect-start').blur();
      await range(page.getByTestId('sound-effect-volume'),volume);await range(page.getByTestId('sound-effect-fade-out'),.15);
    }
    await pause(page);await q.tool(page,'Color');
    const rack=page.getByTestId('studio-finish-rack');await range(rack.getByLabel('Contrast',{exact:true}),1.06);await range(rack.getByLabel('Saturation',{exact:true}),.96);await range(rack.getByLabel('Vignette',{exact:true}),.1);
    for(const t of [.8,4,6,16.5,26.5,37.5,46,54,58]){await seek(page,t);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});}
  }finally{await stop();}
  const saved=await h.save(page,'authored');await entry(page);await open(page);const reopened=await h.save(page,'reopened');assert.equal(hash(saved.snapshot.studioDocument),hash(reopened.snapshot.studioDocument));
  assert.equal(reopened.snapshot.timeline.length,25);assert.equal(reopened.snapshot.overlays.length,30);assert.equal(reopened.snapshot.soundEffects.length,8);
  fs.writeFileSync(path.join(folder,'native-edit.json'),JSON.stringify({projectId:saved.id,projectName:name,canonicalHash:hash(saved.snapshot.studioDocument),seconds:duration(saved),sourceShots:25,uniqueFootageSources:7,graphics:30,soundCues:8,speedKeys:4,exactColdReopen:true,nativeControlsOnly:true,graphInjection:false,authBypass:false,gpuJobs:0},null,2));
  console.log('Native one-minute footage edit saved and exactly cold-reopened.');
}
async function main(){
 const action=process.argv[2]||'edit';let browser;
 const args=['--mute-audio','--disk-cache-size=16777216','--host-resolver-rules=MAP localhost 127.0.0.2'];
 const context=action==='restore'?await(browser=await chromium.launch({channel:'chromium',headless:true,args})).newContext({storageState:path.join(root,require('../../config/daily-studio.json').authState),viewport:{width:1920,height:1440},acceptDownloads:true}):await chromium.launchPersistentContext(path.join(root,'reports/studio-keyframe-selection-20261015/proof/browser-profile.private'),{channel:'chromium',headless:true,args,viewport:{width:1920,height:1440},acceptDownloads:true});
 const page=context.pages()[0]||await context.newPage();page.setDefaultTimeout(60000);let jobs=0;
 page.on('request',r=>{if(r.method()==='POST'){const p=new URL(r.url()).pathname;if(p==='/api/media/process')jobs++;assert(!/studio-capabilities\/requests|studio-3d-preview|publisher\/schedule|platform\/post/.test(p));}});
 page.on('pageerror',e=>fs.appendFileSync(path.join(folder,'runtime-errors.private.log'),e.stack+'\n',{mode:0o600}));
 try{
  await entry(page);
  if(action==='edit')await edit(page);
  else if(action==='restore'){
   await page.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);
   await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,'CRAFT.autopromote.json'));await open(page);
   const saved=await h.save(page,'fresh-restored'),backup=JSON.parse(fs.readFileSync(path.join(folder,'CRAFT.autopromote.json')));assert.equal(hash(saved.snapshot.studioDocument),hash(backup.snapshot.studioDocument));
   const receipt=path.join(folder,'fresh-restore.json');if(fs.existsSync(receipt))fs.copyFileSync(receipt,path.join(folder,`previous-fresh-restore-${Date.now()}.json`));
   fs.writeFileSync(receipt,JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),nativeBackupSha256:hash(fs.readFileSync(path.join(folder,'CRAFT.autopromote.json'))),independentExactRestore:true,sourceShots:25,renderJobs:jobs},null,2));
  }else{
   await open(page);
   if(action==='clean'){
    await media(page);const before=await h.save(page,'before-bin-cleanup');
    await page.getByRole('button',{name:'Remove unused media',exact:true}).click();
    const saved=await h.save(page,'clean-source-bin');
    assert.equal(saved.snapshot.timeline.length,25);assert.equal(saved.snapshot.overlays.length,30);
    fs.writeFileSync(path.join(folder,'bin-cleanup.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),before:before.snapshot.projectMedia.map(m=>m.name),after:saved.snapshot.projectMedia.map(m=>m.name),normalControl:true},null,2));
   }
   else if(action==='review'){
    await q.tool(page,'Export');await page.getByTestId('rendered-output-ready').waitFor();
    const live=page.getByRole('button',{name:'Show Live Edit',exact:true});if(await live.isVisible())await live.click();
    await q.tool(page,'Cut');await page.keyboard.press('Escape');
    const saved=await h.save(page,'before-source-review'),doc=saved.snapshot.studioDocument,observations=[];
    for(const t of [.8,6,16.5,26.5,37.5,46,54,58]){
      const out=Math.round(t*90000),segment=doc.outputTimeMap.find(s=>s.outputRange.startTick<=out&&s.outputRange.endTick>=out),o=segment.outputRange,p=segment.programmeRange;
      const tick=p.startTick+(out-o.startTick)*(p.endTick-p.startTick)/(o.endTick-o.startTick);
      const index=doc.clipOccurrences.findIndex(c=>c.programmeRange.startTick<=tick&&c.programmeRange.endTick>tick),occ=doc.clipOccurrences[index],asset=doc.assets.find(a=>a.assetId===occ.assetId),sourceTime=(occ.sourceRange.startTick+tick-occ.programmeRange.startTick)/90000;
      await page.getByTestId(`pro-video-clip-${index+1}`).click();await markedSeek(page,t);
      await page.waitForFunction(({storagePath,time})=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-time)<.09&&decodeURIComponent(v.currentSrc).includes(storagePath);},{storagePath:asset.storagePath,time:sourceTime},{timeout:30000});
      await page.waitForTimeout(900);await page.keyboard.press('Escape');await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`verified-live-${t}.png`)});
      observations.push({outputTime:t,sourceName:occ.parameters.name,sourceTime,sourceIdentityConfirmed:true,readyState:await page.getByTestId('studio-after-video').evaluate(v=>v.readyState)});
    }
    const after=await h.save(page,'after-source-review');assert.equal(hash(after.snapshot.studioDocument),hash(doc));
    fs.writeFileSync(path.join(folder,'source-review.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(doc),observations,nativeSourceSelection:true,precisePausedSourceIdentity:true,fullPixelParityClaimed:false},null,2));
   }
   else if(action==='render')await h.render(page,'film');
   else if(action==='recover')await h.recover(page,'film');
   else if(action==='view'){
    const timeline=page.getByTestId('studio-pro-timeline');await timeline.getByRole('button',{name:'Composition layers',exact:true}).click();
    const active=timeline.getByRole('button',{name:'At playhead',exact:true});if(await active.getAttribute('aria-pressed')!=='true')await active.click();
    await require('../creative-templates/materials-editing-proof').view(page,'film');await h.rail(page);await pause(page);
    const saved=await h.save(page,'delivery'),receipt=JSON.parse(fs.readFileSync(path.join(folder,'film/render-receipt.json')));assert.equal(hash(saved.snapshot.studioDocument),receipt.projectHash);
    const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();await(await event).saveAs(path.join(folder,'CRAFT.autopromote.json'));fs.chmodSync(path.join(folder,'CRAFT.autopromote.json'),0o600);
   }else throw Error('Unknown action');
  }
  assert.equal(jobs,action==='render'?1:0);
 }catch(e){await page.screenshot({path:path.join(folder,`${action}-failure-${Date.now()}.png`)}).catch(()=>{});fs.writeFileSync(path.join(folder,'last-failure.private.txt'),(await page.locator('body').innerText()).slice(-12000),{mode:0o600});throw e;}
 finally{await context.close();if(browser)await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
