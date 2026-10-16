#!/usr/bin/env node
// Real signed-in Studio authoring, shared canonical render and actual playback.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),zlib=require('zlib');
const folder=path.resolve('reports/studio-make-some-noise-20261016/proof');fs.mkdirSync(folder,{recursive:true});
Object.assign(process.env,{STUDIO_KINETIC_PROOF_DIR:folder,STUDIO_QA_TIMELINE_HEIGHT:'440',STUDIO_QA_HIDE_MEDIA:'1'});
const {pause,seek,range,recording}=require('./kinetic-type-proof'),h=require('../creative-templates/studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {hash}=require('../../src/creativeTemplates/contract'),{chromium}=require('playwright');
const name='MAKE SOME NOISE — kinetic poster',output='make-some-noise';
const decisions=doc=>{const {revision,journal,idempotency,...rest}=doc;return hash(rest)};
async function save(page,label){const r=await h.save(page,label);for(const suffix of ['project.private.json','document.json']){const f=path.join(folder,`${label}-${suffix}`);fs.writeFileSync(f+'.gz',zlib.gzipSync(fs.readFileSync(f)),{mode:0o600});fs.unlinkSync(f);}return r;}
async function open(page,title=name){await page.getByRole('button',{name:title,exact:true}).click();await h.rail(page);await pause(page);}
async function layout(page){
 const resize=page.getByRole('separator',{name:'Resize timeline',exact:true});await resize.focus();
 for(let i=0;i<40;i++){const value=Number(await resize.getAttribute('aria-valuenow'));if(Math.abs(value-440)<24)break;await resize.press(value<440?'ArrowUp':'ArrowDown');}
 await page.keyboard.press('Escape');const t=page.getByTestId('studio-pro-timeline');
 await t.getByRole('button',{name:'Composition layers',exact:true}).click();
 const filter=t.getByRole('button',{name:'At playhead',exact:true});if(await filter.getAttribute('aria-pressed')!=='true')await filter.click();
 const hide=page.getByRole('button',{name:'Hide media',exact:true});if(await hide.isVisible())await hide.click();
}
async function poses(page){for(const t of [.25,.8,1.8,2.8,3.2,3.9,5.5,6.25,6.9,7.65,8.6,9.3,10.25,11.5]){
 await seek(page,t);await page.waitForTimeout(350);await page.locator('.after-preview-loading').waitFor({state:'hidden',timeout:90000});
 await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});
}}
async function setup(page){
 assert(!fs.existsSync(path.join(folder,'native-design.json')),'Preserve the completed edit.');
 if(await page.getByRole('button',{name,exact:true}).count())await open(page);
 else{
  await open(page,'BREAK THE LOOP — depth and rhythm');await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name',{exact:true}).fill(name);await save(page,'duplicated');
 }
 await q.tool(page,'Graphics');
 while(await page.locator('.title-layer-list button').count()){
  await page.locator('.title-layer-list button').first().click();await page.getByTestId('title-editor').getByRole('button',{name:'Remove',exact:true}).click();
 }
 await q.tool(page,'Motion');await page.getByRole('button',{name:'Logo & layers',exact:true}).click();
 for(const layer of (await save(page,'old-titles-removed')).snapshot.overlays)await page.getByRole('button',{name:`Delete ${layer.name}`,exact:true}).click();
 const clean=await save(page,'clean-background');assert.equal(clean.snapshot.overlays.length,0);
 await seek(page,12);await page.getByTestId('pro-quick-trim-end').click();
 const trimmed=await save(page,'trimmed');assert.equal(trimmed.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick,1080000);
 assert.equal(trimmed.snapshot.timeline.length,1);assert.equal(trimmed.snapshot.projectMedia.length,1);
 await page.getByRole('tab',{name:'Media',exact:true}).click();await page.getByRole('button',{name:'Remove unused media',exact:true}).click();
 assert.equal((await save(page,'setup')).snapshot.motionKeyframes.length,0);
 console.log('Separate clean12-second Studio project prepared; earlier movie/project preserved.');
}
async function design(page){
 assert(!fs.existsSync(path.join(folder,'native-design.json')),'Preserve the completed edit.');await open(page);
 const baseline=await save(page,'before-import');assert.equal(baseline.snapshot.overlays.length,0);
 await layout(page);await seek(page,0);await q.tool(page,'Graphics');
 const stop=await recording(page);
 try{
  const panel=page.getByTestId('studio-graphics-import');if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
  await page.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.resolve('reports/studio-make-some-noise-20261016/assets/make-some-noise.graphics.json'));
  await panel.getByRole('status').waitFor();assert((await panel.getByRole('status').innerText()).includes('imported.'),await panel.getByRole('status').innerText());
  const imported=await save(page,'imported');assert.equal(imported.snapshot.overlays.length,28);assert.equal(imported.snapshot.motionKeyframes.length,293);
  await page.getByTestId('studio-undo-button').click();assert.equal((await save(page,'import-undone')).snapshot.overlays.length,0);
  await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await save(page,'import-redone')).snapshot.studioDocument),decisions(imported.snapshot.studioDocument));
  await q.tool(page,'Sound');await page.getByTestId('background-sound-input').setInputFiles(path.resolve('reports/studio-make-some-noise-20261016/assets/Noise-score-master.wav'));
  const duck=page.getByLabel(/Duck under speech/);if(await duck.isChecked())await duck.uncheck();
  const loop=page.getByLabel(/Loop for the full clip/);if(await loop.isChecked())await loop.uncheck();
  await range(page.getByLabel('Music fade in',{exact:true}),.05);await range(page.getByLabel('Music fade out',{exact:true}),.2);
  await q.tool(page,'Graphics');await seek(page,10.25);await layout(page);
  await page.locator('.title-layer-list button').filter({has:page.locator('strong',{hasText:/^NOISE\.$/})}).click();
  const before=await save(page,'before-title-edit');await page.getByLabel('Title text color',{exact:true}).fill('#fffdf4');
  assert.notEqual(decisions((await save(page,'title-edited')).snapshot.studioDocument),decisions(before.snapshot.studioDocument));
  await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await save(page,'title-undone')).snapshot.studioDocument),decisions(before.snapshot.studioDocument));
  await layout(page);await poses(page);
 }finally{await stop();}
 const saved=await save(page,'final');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await open(page);
 const reopened=await save(page,'reopened');assert.equal(hash(saved.snapshot.studioDocument),hash(reopened.snapshot.studioDocument));
 assert(!/headphones|woman-listening|woman-takes|man-dancing|BREAK THE LOOP/i.test(JSON.stringify(reopened.snapshot.studioDocument)));
 fs.writeFileSync(path.join(folder,'native-design.json'),JSON.stringify({projectId:reopened.id,canonicalHash:hash(reopened.snapshot.studioDocument),layers:28,groups:4,keys:293,
  seconds:12,nativeImportUndoRedo:true,nativeTitleColorEditUndo:true,exactColdReopen:true,nativeControlsOnly:true,graphInjection:false,unrelatedFootageReferences:false,gpuJobs:0},null,2));
 console.log('New28-layer/293-key word animation authored in Studio and exactly cold-reopened.');
}
async function main(){
 const action=process.argv[2]||'setup';
 const context=await chromium.launchPersistentContext(path.resolve('reports/studio-keyframe-selection-20261015/proof/browser-profile.private'),{
 ignoreDefaultArgs:['--disable-dev-shm-usage'],channel:'chromium',headless:true,args:['--mute-audio','--disk-cache-size=16777216','--host-resolver-rules=MAP localhost 127.0.0.1'],viewport:{width:1920,height:1200},acceptDownloads:true});
 const page=context.pages()[0];page.setDefaultTimeout(60000);let submissions=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/media/process')submissions++;});
 try{
  await page.goto('http://localhost:5000/?studioMakeSomeNoise=20261016',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
  if(action==='setup')await setup(page);else if(action==='design')await design(page);else{
   await open(page);
   if(action==='render')await h.render(page,output);
   else if(action==='recover')await h.recover(page,output);
   else if(action==='poses'){await layout(page);await poses(page);}
   else if(action==='view'){
    await q.tool(page,'Export');await page.getByTestId('rendered-output-ready').waitFor({timeout:120000});await layout(page);
    await require('../creative-templates/materials-editing-proof').view(page,output);
    await h.rail(page);await pause(page);const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();
    const download=await pending,backup=path.join(folder,'MAKE-SOME-NOISE.autopromote.json');await download.saveAs(backup);fs.chmodSync(backup,0o600);
    const saved=JSON.parse(fs.readFileSync(backup)),receipt=JSON.parse(fs.readFileSync(path.join(folder,output,'render-receipt.json')));assert.equal(hash(saved.snapshot.studioDocument),receipt.projectHash);
    fs.writeFileSync(path.join(folder,'native-backup.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),normalStudioBackupDownload:true,bytes:fs.statSync(backup).size,authenticationExported:false},null,2));
   }else throw Error('Unknown action');
  }
  assert.equal(submissions,action==='render'?1:0);
 }catch(error){await page.screenshot({path:path.join(folder,`failure-${action}-${Date.now()}.png`)}).catch(()=>{});fs.writeFileSync(path.join(folder,'last-failure.private.txt'),(await page.locator('body').innerText()).slice(-18000),{mode:0o600});throw error;}
 finally{await context.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
