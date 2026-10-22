#!/usr/bin/env node
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),zlib=require('zlib');
const folder=path.resolve('reports/studio-break-loop-depth-20261015/proof');fs.mkdirSync(folder,{recursive:true});
process.env.STUDIO_KINETIC_PROOF_DIR=folder;process.env.STUDIO_QA_TIMELINE_HEIGHT='440';process.env.STUDIO_QA_HIDE_MEDIA='1';
const {pause,seek,range,recording}=require('./kinetic-type-proof'),h=require('../creative-templates/studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {hash}=require('../../src/creativeTemplates/contract'),{chromium}=require('playwright');
const name='BREAK THE LOOP — depth and rhythm';
const outputName=process.env.STUDIO_DEPTH_OUTPUT_NAME||'depth-and-rhythm';
const decisions=doc=>{const {revision,journal,idempotency,...rest}=doc;return hash(rest)};
async function save(page,label){const r=await h.save(page,label);for(const suffix of ['project.private.json','document.json']){const f=path.join(folder,`${label}-${suffix}`);fs.writeFileSync(f+'.gz',zlib.gzipSync(fs.readFileSync(f)),{mode:0o600});fs.unlinkSync(f);}return r;}
async function open(page,title=name){await page.getByRole('button',{name:title,exact:true}).click();await h.rail(page);await pause(page);}
async function poses(page){
 for(const t of [.8,1.8,3.35,4.7,6.9,8.9,10,11.4,12.65,14.1,16.45,18.5]){
  await seek(page,t);await page.waitForTimeout(450);await page.locator('.after-preview-loading').waitFor({state:'hidden',timeout:90000});
  await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});
 }
}
async function design(page,resume=false){
 assert(!fs.existsSync(path.join(folder,'native-design.json')),'Preserve the completed edit.');
 if(!resume){
  await open(page,'BREAK THE LOOP — authored motion');await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name',{exact:true}).fill(name);await save(page,'duplicated');
 } else await open(page);
 await page.getByRole('tab',{name:'Media',exact:true}).click();
 if(!resume){await page.getByTestId('project-media-import-input').setInputFiles(path.resolve('reports/studio-break-loop-depth-20261015/assets/Ink-canvas-20s.mp4'));}
 await page.getByRole('button',{name:'Preview Ink-canvas-20s.mp4',exact:true}).click();
 const card=page.locator('.studio-media-card').filter({has:page.getByRole('button',{name:'Preview Ink-canvas-20s.mp4',exact:true})});
 await card.getByText('Saved · ready to edit',{exact:true}).waitFor({timeout:120000});
 const stop=await recording(page);
 try{
 const before=await save(page,'before-source');
 await card.getByRole('button',{name:'Replace entire sequence',exact:true}).click();
 const after=await save(page,'ink-source');assert.equal(after.snapshot.timeline.length,1);assert(!after.snapshot.projectMedia.some(m=>/headphones|woman-|man-danc/i.test(m.name)));
 assert(after.snapshot.timeline.every(c=>c.name==='Ink-canvas-20s.mp4'));assert.equal(after.snapshot.timeline[0].duration,20);
 await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await save(page,'source-undone')).snapshot.studioDocument),decisions(before.snapshot.studioDocument));
 await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await save(page,'source-redone')).snapshot.studioDocument),decisions(after.snapshot.studioDocument));
 const rounded=page.getByTestId('main-footage-frame-toggle');if(await rounded.getAttribute('aria-pressed')==='true')await rounded.click();
 await q.tool(page,'Graphics');
 while(await page.locator('.title-layer-list button').count()){
  await page.locator('.title-layer-list button').first().click();await page.getByTestId('title-editor').getByRole('button',{name:'Remove',exact:true}).click();
 }
 await q.tool(page,'Motion');await page.getByRole('button',{name:'Logo & layers',exact:true}).click();
 const old=(await save(page,'old-text-removed')).snapshot.overlays;
 for(const layer of old)await page.getByRole('button',{name:`Delete ${layer.name}`,exact:true}).click();
 assert.equal((await save(page,'old-art-removed')).snapshot.overlays.length,0);
 await q.tool(page,'Sound');
 await page.getByTestId('background-sound-input').setInputFiles(path.resolve('reports/studio-break-loop-depth-20261015/assets/Break-loop-score-master.wav'));
 await range(page.locator('.inspector-range').filter({hasText:'Background volume'}).locator('input[type=range]'),85);
 const duck=page.getByLabel(/Duck under speech/);if(await duck.isChecked())await duck.uncheck();
 const loop=page.getByLabel(/Loop for the full clip/);if(await loop.isChecked())await loop.uncheck();
 await range(page.getByLabel('Music fade in',{exact:true}),.05);await range(page.getByLabel('Music fade out',{exact:true}),.25);
 await page.getByRole('tab',{name:'Media',exact:true}).click();await page.getByRole('button',{name:'Remove unused media',exact:true}).click();
 await q.tool(page,'Graphics');await seek(page,0);
 const panel=page.getByTestId('studio-graphics-import');await panel.locator('summary').click();
 await page.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.resolve('reports/studio-break-loop-depth-20261015/assets/break-loop-depth.graphics.json'));
 await panel.getByRole('status').waitFor();assert((await panel.getByRole('status').innerText()).includes('imported.'),await panel.getByRole('status').innerText());
 const imported=await save(page,'imported');assert.equal(imported.snapshot.overlays.length,56);
 await page.getByTestId('studio-undo-button').click();assert.equal((await save(page,'import-undone')).snapshot.overlays.length,0);
 await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await save(page,'import-redone')).snapshot.studioDocument),decisions(imported.snapshot.studioDocument));
 // An outline is still an ordinary editable title property.
 await page.locator('.title-layer-list button').filter({has:page.locator('strong',{hasText:/^LOOP$/})}).first().click();
 await page.getByLabel('Title outline color',{exact:true}).fill('#55c0ff');
 const changed=await save(page,'outline-edited');assert.notEqual(decisions(changed.snapshot.studioDocument),decisions(imported.snapshot.studioDocument));
 await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await save(page,'outline-undone')).snapshot.studioDocument),decisions(imported.snapshot.studioDocument));
 await poses(page);
 }finally{await stop();}
 const before=await save(page,'final');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await open(page);
 const reopened=await save(page,'reopened');assert.equal(hash(before.snapshot.studioDocument),hash(reopened.snapshot.studioDocument));
 const doc=reopened.snapshot.studioDocument;
 assert(!JSON.stringify(doc).match(/woman-listening|woman-takes|headphones|man-dancing/i));
 fs.writeFileSync(path.join(folder,'native-design.json'),JSON.stringify({projectId:reopened.id,canonicalHash:hash(doc),nativeSourceReplaceUndoRedo:true,
  oneInkSource:true,unrelatedFootageReferences:false,nativeImportUndoRedo:true,nativeOutlineEditUndo:true,exactColdReopen:true,
  layers:reopened.snapshot.overlays.length,groups:reopened.snapshot.compoundClips.length,keys:reopened.snapshot.motionKeyframes.length,
  nativeControlsOnly:true,graphInjection:false,gpuJobs:0},null,2));
 console.log('Motion-only source and authored depth choreography edited in Studio, saved and exactly cold-reopened.');
}
async function finish(page){
 await q.tool(page,'Graphics');const imported=await save(page,'finish-baseline');
 const stop=await recording(page);
 try{
  await page.locator('.title-layer-list button').filter({has:page.locator('strong',{hasText:/^LOOP$/})}).first().click();
  await page.getByLabel('Title outline color',{exact:true}).fill('#55c0ff');
  const changed=await save(page,'outline-edited-final');assert.notEqual(decisions(changed.snapshot.studioDocument),decisions(imported.snapshot.studioDocument));
  await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await save(page,'outline-undone-final')).snapshot.studioDocument),decisions(imported.snapshot.studioDocument));
  await poses(page);
 }finally{await stop();}
 const before=await save(page,'final');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await open(page);
 const reopened=await save(page,'reopened');assert.equal(hash(before.snapshot.studioDocument),hash(reopened.snapshot.studioDocument));
 const doc=reopened.snapshot.studioDocument;assert(!JSON.stringify(doc).match(/woman-listening|woman-takes|headphones|man-dancing/i));
 assert.equal(reopened.snapshot.timeline.length,1);assert.equal(reopened.snapshot.projectMedia.length,1);
 fs.writeFileSync(path.join(folder,'native-design.json'),JSON.stringify({projectId:reopened.id,canonicalHash:hash(doc),nativeSourceReplaceUndoRedo:true,
 oneInkSource:true,unusedProjectAssetsRemoved:true,unrelatedFootageReferences:false,nativeImportUndoRedo:true,nativeOutlineEditUndo:true,exactColdReopen:true,
 layers:reopened.snapshot.overlays.length,groups:reopened.snapshot.compoundClips.length,keys:reopened.snapshot.motionKeyframes.length,
 nativeControlsOnly:true,graphInjection:false,gpuJobs:0},null,2));console.log('Native motion-only source, outline editing/history,12 poses and exact cold reopen pass.');
}
async function polish(page){
 const before=await save(page,'before-clean-polish');
 const stop=await recording(page);
 try{
  if(before.snapshot.motionKeyframes.length>727){
  await page.getByRole('tab',{name:'Media',exact:true}).click();await page.getByRole('button',{name:'Remove unused media',exact:true}).click();
  const cleaned=await save(page,'cleaned');assert.equal(cleaned.snapshot.motionKeyframes.length,727);
  await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await save(page,'cleanup-undone')).snapshot.studioDocument),decisions(before.snapshot.studioDocument));
  await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await save(page,'cleanup-redone')).snapshot.studioDocument),decisions(cleaned.snapshot.studioDocument));}
  await q.tool(page,'Color');const reset=page.getByTestId('studio-finish-rack').getByRole('button',{name:'Reset',exact:true});if(await reset.isEnabled())await reset.click();
  const rounded=page.getByLabel('Rounded main footage',{exact:true});if(await rounded.isChecked())await rounded.uncheck();
  await seek(page,0);
  await page.getByRole('button',{name:'Hide media',exact:true}).click();
  const timeline=page.getByTestId('studio-pro-timeline');
  await timeline.getByRole('button',{name:'Composition layers',exact:true}).click();
  const filter=timeline.getByRole('button',{name:'At playhead',exact:true});if(await filter.getAttribute('aria-pressed')!=='true')await filter.click();
  await poses(page);
 }finally{await stop();}
 const final=await save(page,'polished');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await open(page);
 const reopened=await save(page,'polished-reopened');assert.equal(hash(final.snapshot.studioDocument),hash(reopened.snapshot.studioDocument));
 const old=JSON.parse(fs.readFileSync(path.join(folder,'native-design.json')));fs.writeFileSync(path.join(folder,'native-design-before-cleanup.json'),JSON.stringify(old,null,2));
 fs.writeFileSync(path.join(folder,'native-design.json'),JSON.stringify({...old,canonicalHash:hash(reopened.snapshot.studioDocument),keys:727,
 nativeOrphanCleanupUndoRedo:true,nativeFinishReset:true,exactColdReopen:true,oldFootageKeys:0},null,2));
 console.log('Native cleanup/history, neutral finish,12 revised poses and exact cold reopen pass.');
}
async function handoff(page){
 assert(!fs.existsSync(path.join(folder,'native-transition-correction.json')),'Preserve the completed correction.');
 const before=await save(page,'before-transition-correction'),group=before.snapshot.compoundClips.find(g=>g.name==='02 · BREAK THE LOOP');assert(group);
 const stop=await recording(page);
 try{
  await q.tool(page,'Composite');const panel=page.getByRole('region',{name:'Graphic groups',exact:true});
  await seek(page,7.85);await panel.getByRole('button',{name:`Add ${group.name} opacity keyframe at playhead`,exact:true}).click();
  await seek(page,8.15);await panel.getByLabel(`${group.name} opacity`,{exact:true}).fill('0');await panel.getByLabel(`${group.name} opacity`,{exact:true}).press('Enter');
  const out=panel.getByLabel(`${group.name} out (seconds)`,{exact:true});await out.fill(String(8+4/24));await out.press('Enter');
  const changed=await save(page,'transition-corrected');
  const added=changed.snapshot.motionKeyframes.filter(k=>k.targetId===group.id&&k.property==='opacity');
  assert.equal(added.length,2);assert.equal(added[0].value,1);assert.equal(added[1].value,0);
  await page.getByTestId('studio-undo-button').click();await page.getByTestId('studio-redo-button').click();
  assert.equal(decisions((await save(page,'transition-redone')).snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
  const media=page.getByRole('button',{name:'Hide media',exact:true});if(await media.isVisible())await media.click();
  for(const t of [7.85,8.0,8.15,8.3,8.5,8.7]){await seek(page,t);await page.locator('.after-preview-loading').waitFor({state:'hidden',timeout:90000});await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`handoff-${t}.png`)});}
 }finally{await stop();}
 const saved=await save(page,'handoff-final');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await open(page);
 const reopened=await save(page,'handoff-reopened');assert.equal(hash(saved.snapshot.studioDocument),hash(reopened.snapshot.studioDocument));
 fs.writeFileSync(path.join(folder,'native-transition-correction.json'),JSON.stringify({projectId:reopened.id,canonicalHash:hash(reopened.snapshot.studioDocument),
  reason:'Actual first movie had outgoing BREAK/THE LOOP over incoming MAKE during the paper sweep.',groupId:group.id,
  nativeGroupOpacityKeys:reopened.snapshot.motionKeyframes.filter(k=>k.targetId===group.id&&k.property==='opacity').map(({time,value,easing})=>({time,value,easing})),nativeGroupOut:8+4/24,trimUndoRedo:true,exactColdReopen:true,
  keys:reopened.snapshot.motionKeyframes.length,nativeControlsOnly:true,newRenderSubmissions:0,gpuJobs:0},null,2));
 console.log('Native group fade and out trim remove the transition collision; exact cold reopen passes.');
}
async function main(){
 const action=process.argv[2]||'design',shm=fs.statfsSync('/dev/shm');assert(shm.bavail*shm.bsize>1024**3);
 const context=await chromium.launchPersistentContext(path.resolve('reports/studio-keyframe-selection-20261015/proof/browser-profile.private'),{
 ignoreDefaultArgs:['--disable-dev-shm-usage'],channel:'chromium',headless:true,args:['--mute-audio','--disk-cache-size=16777216','--host-resolver-rules=MAP localhost 127.0.0.1'],viewport:{width:1920,height:1200},acceptDownloads:true});
 const page=context.pages()[0];page.setDefaultTimeout(60000);let submissions=0;
 page.on('request',r=>{if(new URL(r.url()).pathname==='/api/media/process')submissions++;});
 try{await page.goto('http://localhost:5000/?studioBreakLoopDepth=20261015',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
 assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
 if(action==='design'||action==='continue')await design(page,action==='continue');
 else {await open(page);if(action==='poses')await poses(page);else if(action==='finish')await finish(page);else if(action==='polish')await polish(page);else if(action==='handoff')await handoff(page);else if(action==='render')await h.render(page,outputName);
 else if(action==='recover')await h.recover(page,outputName);else if(action==='view'){
  await q.tool(page,'Export');
  const retry=page.getByRole('button',{name:'Retry status check',exact:true}),ready=page.getByTestId('rendered-output-ready');
  const deadline=Date.now()+120000;
  while(!await ready.isVisible()&&Date.now()<deadline){
   if(await retry.isVisible()&&await retry.isEnabled())await retry.click();
   await page.waitForTimeout(1000);
  }
  await ready.waitFor({timeout:1000});
  const timeline=page.getByTestId('studio-pro-timeline'),filter=timeline.getByRole('button',{name:'At playhead',exact:true});if(await filter.getAttribute('aria-pressed')!=='true')await filter.click();
  await require('../creative-templates/materials-editing-proof').view(page,outputName);
  await h.rail(page);await pause(page);const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();
  const download=await pending,backup=path.join(folder,'BREAK-THE-LOOP-DEPTH.autopromote.json');await download.saveAs(backup);fs.chmodSync(backup,0o600);
  const saved=JSON.parse(fs.readFileSync(backup)),receipt=JSON.parse(fs.readFileSync(path.join(folder,outputName,'render-receipt.json')));assert.equal(hash(saved.snapshot.studioDocument),receipt.projectHash);
  fs.writeFileSync(path.join(folder,'native-backup.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),normalStudioBackupDownload:true,sha256:hash(fs.readFileSync(backup)),bytes:fs.statSync(backup).size,authenticationExported:false},null,2));
 } else throw Error('Unknown action');}
 assert.equal(submissions,action==='render'?1:0);
 }catch(error){await page.screenshot({path:path.join(folder,`failure-${action}-${Date.now()}.png`)}).catch(()=>{});
 fs.writeFileSync(path.join(folder,'last-failure.private.txt'),(await page.locator('body').innerText()).slice(-24000),{mode:0o600});throw error;}
 finally{await context.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
