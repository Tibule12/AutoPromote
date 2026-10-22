#!/usr/bin/env node
// Real signed-in Studio authoring, shared canonical render and actual playback.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),zlib=require('zlib');
const runRoot=path.resolve(process.env.STUDIO_MOTION_RUN_DIR||'reports/studio-five-words-20261016');
const custom=process.env.STUDIO_MOTION_RUN_DIR?JSON.parse(fs.readFileSync(path.join(runRoot,'config.json'))):{};
const folder=path.join(runRoot,'proof');fs.mkdirSync(folder,{recursive:true});
Object.assign(process.env,{STUDIO_KINETIC_PROOF_DIR:folder,STUDIO_QA_TIMELINE_HEIGHT:'560',STUDIO_QA_HIDE_MEDIA:'1'});
const {pause,seek,range,recording}=require('./kinetic-type-proof'),h=require('../creative-templates/studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {hash}=require('../../src/creativeTemplates/contract'),{chromium}=require('playwright');
const name=custom.projectName||'MAKE EVERY FRAME FEEL ALIVE — studio cut',output=custom.output||'five-words';
const expected=JSON.parse(fs.readFileSync(path.join(runRoot,'design.json')));
const seconds=expected.seconds,backupName=custom.backupName||'MAKE-EVERY-FRAME-FEEL-ALIVE.autopromote.json';
const decisions=doc=>{const {revision,journal,idempotency,...rest}=doc;return hash(rest)};
async function save(page,label){const r=await h.save(page,label);for(const suffix of ['project.private.json','document.json']){const f=path.join(folder,`${label}-${suffix}`);fs.writeFileSync(f+'.gz',zlib.gzipSync(fs.readFileSync(f)),{mode:0o600});fs.unlinkSync(f);}return r;}
async function open(page,title=name){await page.getByRole('button',{name:title,exact:true}).click();await h.rail(page);await pause(page);}
async function layout(page){
 const resize=page.getByRole('separator',{name:'Resize timeline',exact:true});await resize.focus();
 for(let i=0;i<40;i++){const value=Number(await resize.getAttribute('aria-valuenow'));if(Math.abs(value-560)<24)break;await resize.press(value<560?'ArrowUp':'ArrowDown');}
 await page.keyboard.press('Escape');const t=page.getByTestId('studio-pro-timeline');
 await t.getByRole('button',{name:'Composition layers',exact:true}).click();
 const filter=t.getByRole('button',{name:'At playhead',exact:true});if(await filter.getAttribute('aria-pressed')!=='true')await filter.click();
 const hide=page.getByRole('button',{name:'Hide media',exact:true});if(await hide.isVisible())await hide.click();
}
async function poses(page){for(const t of custom.poses||[.25,.75,1.6,2.6,3.85,4.6,5.9,6.8,8.2,9.6,10.7,12.8,14.5,15.5]){
 await seek(page,t);await page.waitForTimeout(350);await page.locator('.after-preview-loading').waitFor({state:'hidden',timeout:90000});
 await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});
}}
async function setup(page){
 assert(!fs.existsSync(path.join(folder,'native-design.json')),'Preserve the completed edit.');
 await page.getByRole('region',{name:'Saved Studio projects',exact:true}).waitFor();
 if(await page.getByRole('button',{name,exact:true}).count())await open(page);
 else{
  await open(page,custom.baseProject||'BREAK THE LOOP — depth and rhythm');await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
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
 await seek(page,seconds);await page.getByTestId('pro-quick-trim-end').click();
 const trimmed=await save(page,'trimmed');assert.equal(trimmed.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick,Math.round(seconds*90000));
 assert.equal(trimmed.snapshot.timeline.length,1);assert.equal(trimmed.snapshot.projectMedia.length,1);
 await page.getByRole('tab',{name:'Media',exact:true}).click();await page.getByRole('button',{name:'Remove unused media',exact:true}).click();
 assert.equal((await save(page,'setup')).snapshot.motionKeyframes.length,0);
 console.log(`Separate clean ${seconds}-second Studio project prepared; earlier movie/project preserved.`);
}
async function design(page){
 assert(!fs.existsSync(path.join(folder,'native-design.json')),'Preserve the completed edit.');await open(page);
 const baseline=await save(page,'before-import');assert.equal(baseline.snapshot.overlays.length,0);
 await layout(page);await seek(page,0);await q.tool(page,'Graphics');
 const stop=await recording(page);
 try{
  const panel=page.getByTestId('studio-graphics-import');if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
  await page.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.join(runRoot,custom.graphics||'assets/five-words.graphics.json'));
  await panel.getByRole('status').waitFor();assert((await panel.getByRole('status').innerText()).includes('imported.'),await panel.getByRole('status').innerText());
  const imported=await save(page,'imported');assert.equal(imported.snapshot.overlays.length,expected.layers);assert.equal(imported.snapshot.motionKeyframes.length,expected.keys);
  await page.getByTestId('studio-undo-button').click();assert.equal((await save(page,'import-undone')).snapshot.overlays.length,0);
  await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await save(page,'import-redone')).snapshot.studioDocument),decisions(imported.snapshot.studioDocument));
  await q.tool(page,'Sound');await page.getByTestId('background-sound-input').setInputFiles(path.join(runRoot,custom.score||'assets/Five-words-score.wav'));
  const duck=page.getByLabel(/Duck under speech/);if(await duck.isChecked())await duck.uncheck();
  const loop=page.getByLabel(/Loop for the full clip/);if(await loop.isChecked())await loop.uncheck();
  await range(page.getByLabel('Music fade in',{exact:true}),.05);await range(page.getByLabel('Music fade out',{exact:true}),.2);
  await range(page.locator('.inspector-range').filter({hasText:'Background volume'}).locator('input[type=range]'),85);
  await q.tool(page,'Graphics');await seek(page,.4);await layout(page);
  const titleButtons=page.locator('.title-layer-list button');
  await (custom.projectName?titleButtons:titleButtons.filter({has:page.locator('strong',{hasText:/^MAKE$/})})).first().click();
  const before=await save(page,'before-title-edit');await page.getByLabel('Title text color',{exact:true}).fill(custom.projectName?'#ff29c4':'#fffdf4');
  assert.notEqual(decisions((await save(page,'title-edited')).snapshot.studioDocument),decisions(before.snapshot.studioDocument));
  await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await save(page,'title-undone')).snapshot.studioDocument),decisions(before.snapshot.studioDocument));
  await layout(page);await poses(page);
 }finally{await stop();}
 const saved=await save(page,'final');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await open(page);
 const reopened=await save(page,'reopened');assert.equal(hash(saved.snapshot.studioDocument),hash(reopened.snapshot.studioDocument));
 assert(!/headphones|woman-listening|woman-takes|man-dancing|BREAK THE LOOP/i.test(JSON.stringify(reopened.snapshot.studioDocument)));
 fs.writeFileSync(path.join(folder,'native-design.json'),JSON.stringify({projectId:reopened.id,canonicalHash:hash(reopened.snapshot.studioDocument),layers:expected.layers,groups:expected.groups,keys:expected.keys,
  seconds,nativeImportUndoRedo:true,nativeTitleColorEditUndo:true,exactColdReopen:true,nativeControlsOnly:true,graphInjection:false,unrelatedFootageReferences:false,gpuJobs:0},null,2));
 console.log(`New ${expected.layers}-layer/${expected.keys}-key word animation authored in Studio and exactly cold-reopened.`);
}
async function main(){
 const action=process.argv[2]||'setup';
 const context=await chromium.launchPersistentContext(path.resolve('reports/studio-keyframe-selection-20261015/proof/browser-profile.private'),{
 ignoreDefaultArgs:['--disable-dev-shm-usage'],channel:'chromium',headless:true,args:['--mute-audio','--disk-cache-size=16777216',`--host-resolver-rules=MAP localhost ${process.env.STUDIO_QA_LOOPBACK || '127.0.0.1'}`],viewport:{width:1920,height:1200},acceptDownloads:true});
 const page=context.pages()[0];page.setDefaultTimeout(60000);let submissions=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/media/process')submissions++;});
 try{
  await page.goto('http://localhost:5000/?studioFiveWords=20261016',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
  if(action==='rename'){
   const target=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(folder,'setup-project.private.json.gz')))).id;
   await page.getByRole('region',{name:'Saved Studio projects',exact:true}).waitFor();
   const candidates=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('autopromote-viral-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').getAll();q.onsuccess=()=>{db.close();resolve(q.result.filter(p=>p.name==='MAKE EVERY FRAME FEEL ALIVE').map(p=>({id:p.id,updatedAt:p.updatedAt})).sort((a,b)=>b.updatedAt-a.updatedAt));};};}));
   const index=candidates.findIndex(p=>p.id===target);assert(index>=0);await page.getByRole('button',{name:'MAKE EVERY FRAME FEEL ALIVE',exact:true}).nth(index).click();await h.rail(page);
   await page.getByLabel('Project name',{exact:true}).fill(name);assert.equal((await save(page,'renamed')).id,target);
  }else if(action==='duplicate-recovery'){
   assert(custom.recoveryFromProject,'Select the exact preserved orphaned project');
   await open(page,custom.recoveryFromProject);
   const original=await save(page,'orphan-preserved');
   await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
   await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
   await page.getByLabel('Project name',{exact:true}).fill(name);
   const duplicate=await save(page,'recovery-duplicate');assert.notEqual(duplicate.id,original.id);
   assert.equal(duplicate.snapshot.overlays.length,expected.layers);assert.equal(duplicate.snapshot.motionKeyframes.length,expected.keys);
   await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await open(page);
   const reopened=await save(page,'recovery-reopened');assert.equal(hash(duplicate.snapshot.studioDocument),hash(reopened.snapshot.studioDocument));
   const evidence=path.join(folder,'native-design.json');
   assert(!fs.existsSync(path.join(folder,'native-design.original.json')),'Recovery duplication already recorded');
   fs.copyFileSync(evidence,path.join(folder,'native-design.original.json'));
   const design=JSON.parse(fs.readFileSync(evidence));Object.assign(design,{projectId:reopened.id,canonicalHash:hash(reopened.snapshot.studioDocument),
    exactColdReopen:true,recoveryDuplicateOf:original.id,originalProjectPreserved:true});fs.writeFileSync(evidence,JSON.stringify(design,null,2));
  }else if(action==='setup')await setup(page);else if(action==='design')await design(page);else{
   await open(page);
   if(action==='render'){
    const state=await context.storageState({indexedDB:true});
    const safe={cookies:state.cookies,origins:state.origins.filter(o=>o.origin==='http://localhost:5000').map(o=>({...o,indexedDB:(o.indexedDB||[]).filter(d=>d.name==='firebaseLocalStorageDb')}))};
    require('../creative-templates/studio-session').saveAuthenticatedState(safe,path.resolve('reports/studio-platform-packaging-20261016/proof/publisher-session.private.json'));
    await h.render(page,output);
   }
   else if(action==='recover')await h.recover(page,output);
   else if(action==='poses'){await layout(page);await poses(page);}
   else if(action==='view'){
    await q.tool(page,'Export');await page.getByTestId('rendered-output-ready').waitFor({timeout:120000});await layout(page);
    await require('../creative-templates/materials-editing-proof').view(page,output);
    await h.rail(page);await pause(page);const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();
    const download=await pending,backup=path.join(folder,backupName);await download.saveAs(backup);fs.chmodSync(backup,0o600);
    const saved=JSON.parse(fs.readFileSync(backup)),receipt=JSON.parse(fs.readFileSync(path.join(folder,output,'render-receipt.json')));assert.equal(hash(saved.snapshot.studioDocument),receipt.projectHash);
    fs.writeFileSync(path.join(folder,'native-backup.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),normalStudioBackupDownload:true,bytes:fs.statSync(backup).size,authenticationExported:false},null,2));
   }else throw Error('Unknown action');
  }
  assert.equal(submissions,action==='render'?1:0);
 }catch(error){await page.screenshot({path:path.join(folder,`failure-${action}-${Date.now()}.png`)}).catch(()=>{});fs.writeFileSync(path.join(folder,'last-failure.private.txt'),(await page.locator('body').innerText()).slice(-18000),{mode:0o600});throw error;}
 finally{await context.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
