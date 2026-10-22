#!/usr/bin/env node
// Exercise the actual reusable Logo motion control, not a private graph import.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../..'),base=path.resolve(root,process.env.STUDIO_LOGO_BASE||'reports/studio-logo-motion-20261017'),folder=path.resolve(process.env.STUDIO_LOGO_PROOF_DIR||path.join(base,'proof'));
process.env.STUDIO_KINETIC_PROOF_DIR=folder;
Object.assign(process.env,{STUDIO_QA_TIMELINE_HEIGHT:'560',STUDIO_QA_HIDE_MEDIA:'1'});
const {pause,seek,range,recording}=require('./kinetic-type-proof'),h=require('../creative-templates/studio-proof');
const q=require('../../test/e2e/playwright/studio-stability/run'),{hash}=require('../../src/creativeTemplates/contract');
const {chromium}=require('playwright');
const config=JSON.parse(fs.readFileSync(path.join(base,'config.json'))),name=config.projectName;
const decisions=doc=>{const {revision:_revision,journal:_journal,idempotency:_idempotency,...rest}=doc;return hash(rest);};
async function save(page,label){const r=await h.save(page,label);for(const suffix of ['project.private.json','document.json']){
 const f=path.join(folder,`${label}-${suffix}`);fs.writeFileSync(f+'.gz',zlib.gzipSync(fs.readFileSync(f)),{mode:0o600});fs.unlinkSync(f);}return r;}
async function main(){
 const action=process.argv[2]||'design';
 if(action==='design')assert(!fs.existsSync(path.join(folder,'native-design.json')),'Preserve the completed logo project');
 const context=await chromium.launchPersistentContext(path.resolve('reports/studio-keyframe-selection-20261015/proof/browser-profile.private'),{
  channel:'chromium',headless:true,args:['--mute-audio','--disk-cache-size=16777216','--host-resolver-rules=MAP localhost 127.0.0.1'],viewport:{width:1920,height:config.browserHeight||1200}});
 const page=context.pages()[0];page.setDefaultTimeout(60000);let renders=0;
 page.on('request',r=>{if(new URL(r.url()).pathname==='/api/media/process')renders++;});
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
  if(action==='setup'){
   assert.equal(await page.getByRole('button',{name,exact:true}).count(),0,'Preserve the existing logo project');
   await page.getByRole('button',{name:config.baseProject,exact:true}).click();await h.rail(page);await pause(page);
   await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
   await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
   await page.getByLabel('Project name',{exact:true}).fill(name);await save(page,'duplicated');
   await q.tool(page,'Graphics');
   while(await page.locator('.title-layer-list button').count()){
    await page.locator('.title-layer-list button').first().click();await page.getByTestId('title-editor').getByRole('button',{name:'Remove',exact:true}).click();
   }
   await q.tool(page,'Motion');await page.getByRole('button',{name:'Logo & layers',exact:true}).click();
   const old=(await save(page,'before-clear-art')).snapshot.overlays;
   for(const layer of old)await page.getByRole('button',{name:`Delete ${layer.name}`,exact:true}).click();
   const clean=await save(page,'clean-project');assert.equal(clean.snapshot.overlays.length,0);
   assert.equal(clean.snapshot.motionKeyframes.length,0);assert.equal(renders,0);
   console.log('Normal project duplicate and native component cleanup complete.');return;
  }
  await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);await seek(page,0);
  if(action==='diamond-clearance'){
   assert.equal(config.pieceStyle,'diamond');const before=await save(page,'before-diamond-clearance');
   await q.tool(page,'Motion');await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();
   const edits=[];for(const layer of before.snapshot.overlays){
    const ys=before.snapshot.motionKeyframes.filter(k=>k.targetId===layer.id&&k.property==='y').sort((a,b)=>a.time-b.time);
    if(layer.name==='Construction / symbol ribbon 2')edits.push({layer,key:ys[0],value:18},{layer,key:ys[1],value:layer.y+4});
    if(layer.name.startsWith('Wordmark pieces /'))for(const key of ys.slice(0,2)){
     const value=Math.max(10,Math.min(56-layer.height*.6,key.value));if(value!==key.value)edits.push({layer,key,value});
    }
   }
   for(let i=0;i<edits.length;i++){
    const edit=edits[i];await page.getByText('Target layer',{exact:true}).locator('..').locator('select').selectOption({label:edit.layer.name});
    await page.getByLabel('Curve keyframe',{exact:true}).selectOption(edit.key.id);
    await page.getByLabel('Selected motion key value',{exact:true}).fill(String(edit.value));await page.getByLabel('Selected motion key value',{exact:true}).blur();
    if(i===0){const changed=await save(page,'diamond-key-edited');await page.getByTestId('studio-undo-button').click();
     assert.equal(decisions((await save(page,'diamond-key-undone')).snapshot.studioDocument),decisions(before.snapshot.studioDocument));
     await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await save(page,'diamond-key-redone')).snapshot.studioDocument),decisions(changed.snapshot.studioDocument));}
   }
   const final=await save(page,'diamond-clearance');for(const edit of edits)assert(Math.abs(final.snapshot.motionKeyframes.find(k=>k.id===edit.key.id).value-edit.value)<.0001);
   assert.equal(final.snapshot.motionKeyframes.length,901);for(const t of [4.4,4.9,5.5]){await seek(page,t);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`clearance-${t}.png`)});}
   await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);
   const cold=await save(page,'diamond-clearance-cold');assert.equal(hash(cold.snapshot.studioDocument),hash(final.snapshot.studioDocument));
   fs.writeFileSync(path.join(folder,'native-clearance.json'),JSON.stringify({projectId:cold.id,canonicalHash:hash(cold.snapshot.studioDocument),nativeCurveKeyEdits:edits.length,nativeCurveEditUndoRedo:true,exactColdReopen:true,rendersSubmitted:renders},null,2));
   assert.equal(renders,0);console.log('Native curve edits keep logo pieces above the settled words; history and cold reopen passed.');return;
  }
  if(action==='type-weight'){
   assert(config.pieceConstruction);await q.tool(page,'Graphics');const before=await save(page,'before-weight-repair');
   const titles=before.snapshot.overlays.filter(o=>o.type==='text');assert.equal(titles.length,20);
   for(let i=0;i<titles.length;i++){
    await page.locator('.title-layer-list button').nth(i).click();
    await page.getByTestId('title-editor').getByText('Weight',{exact:true}).locator('..').locator('select').selectOption('800');
   }
   const final=await save(page,'supported-title-weights');assert(final.snapshot.overlays.filter(o=>o.type==='text').every(o=>o.fontWeight===800));
   assert.equal(final.snapshot.motionKeyframes.length,727);
   await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
   await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);
   const cold=await save(page,'supported-title-weights-cold');assert.equal(hash(cold.snapshot.studioDocument),hash(final.snapshot.studioDocument));
   fs.writeFileSync(path.join(folder,'native-weight-repair.json'),JSON.stringify({projectId:cold.id,canonicalHash:hash(cold.snapshot.studioDocument),nativeTitleWeight:800,ordinaryTitleLayersEdited:20,exactColdReopen:true,rendersSubmitted:renders},null,2));
   assert.equal(renders,0);console.log('All words changed to the bundled 800 weight through native typography; exact cold reopen passed.');return;
  }
  if(action==='piece-size'){
   assert(config.pieceConstruction);await q.tool(page,'Graphics');
   const before=await save(page,'before-piece-size'),titles=before.snapshot.overlays.filter(o=>o.type==='text');
   assert.equal(titles.length,20);
   for(let i=0;i<titles.length;i++){
    await page.locator('.title-layer-list button').nth(i).click();
    await range(page.getByLabel('Title size',{exact:true}),1.5);
    if(i===0){
     const changed=await save(page,'piece-size-first');assert.equal(changed.snapshot.overlays.find(o=>o.id===titles[i].id).scale,1.5);
     await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await save(page,'piece-size-undo')).snapshot.studioDocument),decisions(before.snapshot.studioDocument));
     await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await save(page,'piece-size-redo')).snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
    }
   }
   const final=await save(page,'readable-piece-type');assert(final.snapshot.overlays.filter(o=>o.type==='text').every(o=>o.scale===1.5));
   for(const at of [5.25,6,6.75,7.5,8.1,9.5]){await seek(page,at);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`readable-${at}.png`)});}
   await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
   await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);
   const cold=await save(page,'readable-piece-cold');assert.equal(hash(cold.snapshot.studioDocument),hash(final.snapshot.studioDocument));
   assert.equal(renders,0);fs.writeFileSync(path.join(folder,'native-type-refinement.json'),JSON.stringify({projectId:cold.id,canonicalHash:hash(cold.snapshot.studioDocument),nativeTitleSize:1.5,ordinaryTitleLayersEdited:20,nativeSizeEditUndoRedo:true,exactColdReopen:true,rendersSubmitted:renders},null,2));
   console.log('All word pieces enlarged through native Title size; Undo/Redo and exact cold reopen passed.');return;
  }
  if(action==='refine'){
   const before=await save(page,'before-rule-refinement');await q.tool(page,'Motion');
   await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();
   await page.getByText('Target layer',{exact:true}).locator('..').locator('select').selectOption({label:'Lockup / accent rule'});
   await page.getByLabel('Y',{exact:true}).fill('66');await page.getByLabel('Y',{exact:true}).blur();
   const revised=await save(page,'rule-refined');assert.equal(revised.snapshot.overlays.find(o=>o.name==='Lockup / accent rule').y,66);
   await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await save(page,'rule-undone')).snapshot.studioDocument),decisions(before.snapshot.studioDocument));
   await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await save(page,'rule-redone')).snapshot.studioDocument),decisions(revised.snapshot.studioDocument));
   await page.getByText('Target layer',{exact:true}).locator('..').locator('select').selectOption({label:'Mark / gradient symbol'});
   await page.getByLabel('Enable layer motion blur',{exact:true}).check();
   const softened=await save(page,'native-motion-blur');assert.equal(softened.snapshot.overlays.find(o=>o.name==='Mark / gradient symbol').motionBlur.enabled,true);
   await seek(page,9.5);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'refined-lockup.png')});
   const final=await save(page,'refined-logo');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
   await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);
   const cold=await save(page,'refined-cold');assert.equal(hash(cold.snapshot.studioDocument),hash(final.snapshot.studioDocument));
   fs.writeFileSync(path.join(folder,'native-refinement.json'),JSON.stringify({projectId:cold.id,canonicalHash:hash(cold.snapshot.studioDocument),nativeRuleY:66,nativeHeroMotionBlur:true,nativeGeometryEditUndoRedo:true,exactColdReopen:true,rendersSubmitted:renders},null,2));
   assert.equal(renders,0);console.log('Native rule/tagline spacing corrected; Undo/Redo and exact cold reopen passed.');return;
  }
  if(action==='sound'){
   await q.tool(page,'Sound');await page.getByTestId('background-sound-input').setInputFiles(path.join(base,config.score));
   const duck=page.getByLabel(/Duck under speech/);if(await duck.isChecked())await duck.uncheck();
   const loop=page.getByLabel(/Loop for the full clip/);if(await loop.isChecked())await loop.uncheck();
   await range(page.getByLabel('Music fade in',{exact:true}),0);await range(page.getByLabel('Music fade out',{exact:true}),.2);
   await range(page.locator('.inspector-range').filter({hasText:'Background volume'}).locator('input[type=range]'),60);
   const final=await save(page,'working-sound');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
   await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);
   const cold=await save(page,'working-sound-cold');assert.equal(hash(cold.snapshot.studioDocument),hash(final.snapshot.studioDocument));
   assert.equal(cold.snapshot.motionKeyframes.length,164);assert.equal(cold.snapshot.musicTrack.volume,.6);assert.equal(renders,0);
   console.log('Smaller working sound imported through native Sound; exact cold reopen passed.');return;
  }
  if(action==='render'){
   page.on('response',async r=>{if(new URL(r.url()).pathname!=='/api/media/process')return;
    const data=await r.json().catch(()=>({}));fs.writeFileSync(path.join(folder,'submission.json'),JSON.stringify({status:r.status(),jobId:data.jobId||data.job_id||null,jobStatus:data.status||null,at:new Date().toISOString()},null,2));
    console.log(JSON.stringify({nativeRenderResponse:r.status(),jobStatus:data.status||null,jobId:data.jobId||data.job_id||null}));});
   await h.render(page,config.output);assert.equal(renders,1);return;
  }
  if(action==='recover'){await h.recover(page,config.output);assert.equal(renders,0);return;}
  if(action==='view'){
   if(config.pieceConstruction){
    const timeline=page.getByTestId('studio-pro-timeline');
    await timeline.getByRole('button',{name:'Composition layers',exact:true}).click();
    const collapse=timeline.getByRole('button',{name:/^Collapse .+ layers$/});
    while(await collapse.count())await collapse.first().click();
    process.env.STUDIO_QA_TIMELINE_HEIGHT=String(config.timelineHeight||560);
    await timeline.locator('.pro-timeline-scroll').hover();await page.mouse.wheel(0,-2400);
   }
   await require('../creative-templates/materials-editing-proof').view(page,config.output);
   const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();
   await(await download).saveAs(path.join(folder,config.backupName));
   if(config.compareProjectHash){
    const preserved=await page.evaluate(title=>new Promise((resolve,reject)=>{const r=indexedDB.open('autopromote-viral-studio',1);r.onerror=()=>reject(r.error);
     r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').getAll();q.onerror=()=>{db.close();reject(q.error);};q.onsuccess=()=>{db.close();resolve(q.result.find(p=>p.name===title));};};}),config.baseProject);
    assert.equal(hash(preserved.snapshot.studioDocument),config.compareProjectHash);
    fs.writeFileSync(path.join(folder,'comparison-source-preserved.json'),JSON.stringify({projectId:preserved.id,canonicalHash:config.compareProjectHash,originalNativeProjectPreserved:true,readOnlyObservation:true},null,2));
   }
   assert.equal(renders,0);return;
  }
  assert.equal(action,'design');
  assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
  const before=await save(page,'before-logo');assert.equal(before.snapshot.overlays.length,0);
  await q.tool(page,'Graphics');const panel=page.getByTestId('studio-logo-motion');await panel.locator('summary').click();
  await page.getByLabel('Logo motion image',{exact:true}).setInputFiles(path.join(base,'assets/AutoPromote-Gradient-Tech-Logo.png'));
  await panel.getByRole('status').filter({hasText:'selected.'}).waitFor();
  if(config.separateBitmap)await panel.getByRole('checkbox',{name:'Separate left symbol from wordmark',exact:true}).check();
  if(config.pieceConstruction){
   await panel.getByRole('checkbox',{name:'Construct words from pieces',exact:true}).check();
   await panel.getByLabel('Logo wordmark slices',{exact:true}).fill(String(config.pieceColumns||11));
   if(config.pieceStyle)await panel.getByLabel('Logo piece choreography',{exact:true}).selectOption(config.pieceStyle);
  }
  const stop=await recording(page);
  try{
   await page.getByRole('button',{name:'Build editable logo motion',exact:true}).click();
   await page.waitForFunction(()=>{const t=document.querySelector('[data-testid="studio-logo-motion"] [role="status"]')?.textContent;return t&&!t.includes('selected.');});
   assert((await panel.getByRole('status').innerText()).includes('Logo motion created.'),await panel.getByRole('status').innerText());
   const built=await save(page,'logo-created');
   if(config.separateBitmap){
    assert(built.snapshot.overlays.some(o=>o.name==='Mark / gradient symbol'));
    if(config.pieceConstruction){
     assert.equal(built.snapshot.overlays.filter(o=>o.name.startsWith('Wordmark pieces /')).length,2*(config.pieceColumns||11));
     assert.equal(built.snapshot.overlays.filter(o=>o.name.startsWith('Words /')&&o.mask?.enabled).length,config.pieceStyle==='diamond'?20:15);
    }else assert(built.snapshot.overlays.some(o=>o.name==='Mark / original gradient wordmark'));
    assert.equal(built.snapshot.overlays.filter(o=>o.name.startsWith('Construction / symbol ribbon')).length,3);
   }else assert.equal(built.snapshot.overlays.filter(o=>o.name.startsWith('Mark / image band')).length,3);
   assert.equal(built.snapshot.overlays.filter(o=>o.name.startsWith('Wordmark /')).length,0,'Retain the PNG lettering');
   await page.getByTestId('studio-undo-button').click();assert.equal((await save(page,'logo-undone')).snapshot.overlays.length,0);
   await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await save(page,'logo-redone')).snapshot.studioDocument),decisions(built.snapshot.studioDocument));
   await q.tool(page,'Sound');await page.getByTestId('background-sound-input').setInputFiles(path.join(base,config.score));
   const duck=page.getByLabel(/Duck under speech/);if(await duck.isChecked())await duck.uncheck();
   const loop=page.getByLabel(/Loop for the full clip/);if(await loop.isChecked())await loop.uncheck();
   await range(page.getByLabel('Music fade in',{exact:true}),0);await range(page.getByLabel('Music fade out',{exact:true}),.2);
   // The ordinary music slider is bounded to 60%; use its actual range.
   await range(page.locator('.inspector-range').filter({hasText:'Background volume'}).locator('input[type=range]'),60);
   await q.tool(page,'Graphics');await seek(page,8);
   await page.locator('.title-layer-list button').first().click();const prior=await save(page,'before-tagline-edit');
   await page.getByLabel('Title text color',{exact:true}).fill('#f00000');
   assert.notEqual(decisions((await save(page,'tagline-edited')).snapshot.studioDocument),decisions(prior.snapshot.studioDocument));
   await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await save(page,'tagline-undone')).snapshot.studioDocument),decisions(prior.snapshot.studioDocument));
   for(const time of config.poses||[.2,.8,1.5,2.2,3.2,4.6,5.7,7.2,9.5]){
    await seek(page,time);await page.waitForTimeout(250);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${time}.png`)});
   }
  }finally{await stop();}
  const final=await save(page,'final-logo');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);
  const cold=await save(page,'cold-logo');assert.equal(hash(cold.snapshot.studioDocument),hash(final.snapshot.studioDocument));
  assert.equal(cold.snapshot.musicTrack?.volume??cold.snapshot.musicVolume,.6);
  const geometry={projectId:cold.id,canonicalHash:hash(cold.snapshot.studioDocument),layers:cold.snapshot.overlays.length,
   keys:cold.snapshot.motionKeyframes.length,groups:cold.snapshot.compoundClips.length,seconds:10,
   actualReusableLogoControl:true,nativeBuildUndoRedo:true,nativeIndependentTaglineEditUndo:true,exactColdReopen:true,
   nativeControlsOnly:true,graphInjection:false,sourceImageSha256:hash(fs.readFileSync(path.join(base,'assets/AutoPromote-Gradient-Tech-Logo.png'))),
   originalGradientAndLetteringRetained:true,separateSymbolAndWordmark:!!config.separateBitmap,
   nativePieceConstructionControl:!!config.pieceConstruction,nativePieceChoreography:config.pieceStyle||'spring',nativeMusicVolume:.6,rendersSubmitted:renders};
  assert.equal(renders,0);fs.writeFileSync(path.join(folder,'native-design.json'),JSON.stringify(geometry,null,2));
  const designFile=path.join(base,'design.json');
  const design=JSON.parse(fs.readFileSync(designFile));Object.assign(design,{layers:geometry.layers,groups:geometry.groups,keys:geometry.keys});fs.writeFileSync(designFile,JSON.stringify(design,null,2));
  console.log(JSON.stringify(geometry));
 }catch(e){await page.screenshot({path:path.join(folder,`logo-failure-${Date.now()}.png`)}).catch(()=>{});fs.writeFileSync(path.join(folder,'last-logo-failure.private.txt'),(await page.locator('body').innerText()).slice(-18000),{mode:0o600});throw e;}
 finally{await context.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
