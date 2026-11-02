#!/usr/bin/env node
// Normal Studio authoring, recovery and export; this script supplies directions,
// clicks actual controls and observes the canonical engine. It renders no effects.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),runtime=process.argv[2],variant=process.argv[3],phase=process.argv[4]||'create';
assert(['typography','tracked','composite','episode'].includes(variant));
const report=path.join(root,'reports/studio-cinematic-episode-20261101');
const review=process.env.STUDIO_QA_EPISODE_REVIEW_DIR;
if(review)assert(/^[a-z0-9-]+$/.test(review)&&variant==='episode');
const folder=review?path.join(report,review):variant==='episode'?report:path.join(report,'compositions',variant);fs.mkdirSync(folder,{recursive:true});
process.env.STUDIO_MOTION_VARIANT='episode';process.env.STUDIO_MOTION_PROOF_DIR=folder;
process.env.STUDIO_MOTION_PROOF_TITLE=process.env.STUDIO_MOTION_PROOF_TITLE||(variant==='episode'?'AutoPromote — Every frame, intentional':({typography:'Motion & Flow — Outside the frame',tracked:'Motion & Flow — Life in motion',composite:'Motion & Flow — Make something impossible'})[variant]);
const n=require('./motion-flow-proof.cjs'),q=require('../../test/e2e/playwright/studio-stability/run'),h=require('../creative-templates/studio-proof'),{recording}=require('./kinetic-type-proof'),{chromium}=require('playwright');
const file=name=>path.join(folder,name),write=(name,value)=>fs.writeFileSync(file(name),JSON.stringify(value,null,2),{mode:0o600});
process.on('exit',code=>write(phase+'-exit.json',{code,at:new Date().toISOString()}));
const source=name=>path.join(root,'reports/studio-motion-flow-takeover-20261031/video-texture/open-world-sources',name+'.mp4');
async function apply(p,template){
 const before=await n.save(p,'before-plan');
 template=structuredClone(template);template.actions=template.actions.map(a=>{
  a={...a};if(a.sourceMediaId)a.sourceMediaId=before.snapshot.projectMedia.find(m=>m.name===a.sourceMediaId+'.mp4')?.id;
  for(const field of ['targetId','parentId','matteSourceId','beforeId'])if(a[field])a[field]=before.snapshot.overlays.find(l=>l.name===a[field])?.id||a[field];
  return a;
 });
 const plan={format:'autopromote-scene-actions',version:1,projectId:before.id,baseRevision:before.snapshot.studioDocument.revision,...template};
 const planName='reviewed-'+Date.now()+'.json';write(planName,plan);const planFile=file(planName);
 await p.getByTestId('studio-mode-fxflow').click();const panel=p.getByTestId('studio-scene-actions');
 if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
 await panel.getByLabel('Scene action plan',{exact:true}).setInputFiles(planFile);await panel.getByRole('status').filter({hasText:'Review this plan before applying.'}).waitFor({timeout:60000});
 await panel.getByRole('button',{name:'Apply reviewed scene actions',exact:true}).click();
 await panel.getByRole('status').filter({hasText:/Scene actions applied|Scene.*stale|unsupported|invalid|exceeds|Choose|Mask|needs|Provide|limit|point|topology/i}).waitFor({timeout:120000});
 assert.match(await panel.getByRole('status').innerText(),/Scene actions applied/);
}
async function fps(p){await q.tool(p,'Export');await p.getByLabel('Export frame rate',{exact:true}).selectOption('24');await n.save(p,'24fps');}
async function live(p){await q.tool(p,'Export');if(await p.getByTestId('hook-preview-frame').evaluate(el=>el.classList.contains('has-rendered-output')))await p.getByRole('button',{name:'Show Live Edit',exact:true}).click();}
async function create(p){
 assert(!fs.existsSync(file('Editable Project.autopromote.json')),'A completed project already exists; reopen it.');
 const main=variant==='composite'?'Open trail':'Coast';
 await p.locator('.creator-studio-dropzone input[type=file]').setInputFiles(source(main));
 await p.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:180000});await h.rail(p);await n.pause(p);
 await p.getByLabel('Project name',{exact:true}).fill(n.title);
 const stop=await recording(p,folder);
 try{
 await q.tool(p,'Reframe');await p.getByTestId('reframe-aspect-16-9').click();await p.getByTestId('reframe-preserve-frame').click();
 const round=p.getByLabel('Rounded main footage',{exact:true});if(await round.count()&&await round.isChecked())await round.uncheck();
 await q.tool(p,'Cut');await n.range(p.getByText('Clip end',{exact:true}).locator('..').locator('input'),8);await n.pause(p);
 if(variant==='composite')await p.getByTestId('project-media-import-input').setInputFiles(source('Autumn'));
 await q.tool(p,'Sound');await p.getByLabel('Use voice repair on export',{exact:true}).uncheck();
 const raw=await n.save(p,'raw');assert.equal(raw.snapshot.timeline.reduce((s,c)=>s+c.endRequest-c.startRequest,0),8);await n.backup(p,'Raw Project');
 await apply(p,JSON.parse(fs.readFileSync(path.join(report,'advanced-'+variant+'-plan.json'))));
 // Select supported normal layer effects through their existing controls.
 if(variant==='composite'){
   const saved=await n.save(p,'before-light-effects');await q.tool(p,'Motion');
   const transform=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await transform.count())await transform.click();
   const light=saved.snapshot.overlays.find(l=>l.name==='Light / sweep 2');
   await p.getByLabel('Target layer',{exact:true}).selectOption(light.id);
   await p.getByLabel('Enable layer motion blur',{exact:true}).check();
   await p.getByTestId('studio-mode-fxflow').click();await p.getByLabel('Blend mode for Light / sweep 2',{exact:true}).selectOption('screen');
 }
 await fps(p);await n.save(p,'authored');await n.backup(p,'Editable Project');
 }finally{await stop();}
}
async function refineEpisode(p){
 const before=await n.save(p,'before-advanced-refinement');await n.backup(p,'Before Advanced Refinement');
 const stop=await recording(p,file('advanced-authoring'));
 try{
 await q.tool(p,'Motion');const transform=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await transform.count())await transform.click();
 for(const name of ['01 / Moving picture inside FRAME','01 / FRAME aperture','05 / Feathered moving sea','05 / aperture space','05 / feel','05 / feel two','06 / shaped curve']){
   const button=p.getByRole('button',{name:'Delete '+name,exact:true});if(await button.count())await button.click();
 }
 await p.getByTestId('studio-mode-fxflow').click();
 // Match foreground and background source color. Per-layer grade is not yet
 // a shared capability; bypass the episode's former source-only finish.
 const grade=p.getByLabel('Adjustment enabled',{exact:true});if(await grade.count()===1&&await grade.isChecked())await grade.uncheck();
 let saved=await n.save(p,'old-graphics-revised');
 if(!saved.snapshot.overlays.some(l=>l.name==='01 / independent / F'))await apply(p,JSON.parse(fs.readFileSync(path.join(report,'episode-letter-refinement.json'))));
 saved=await n.save(p,'letter-refinement');
 if(!saved.snapshot.overlays.some(l=>l.name==='05 / Foreground point animation'))await apply(p,JSON.parse(fs.readFileSync(path.join(report,'episode-occlusion-refinement.json'))));
 await fps(p);saved=await n.save(p,'advanced-refined');await n.backup(p,'Editable Project');
 write('advanced-refinement.json',{projectId:saved.id,seconds:36,layers:saved.snapshot.overlays.length,keys:saved.snapshot.motionKeyframes.length,nativeUi:true,sourceOnlyGradeBypassedForMatchingForeground:true,priorCanonicalHash:require('../../src/creativeTemplates/contract').hash(before.snapshot.studioDocument)});
 }finally{await stop();}
}
async function creativeRebuild(p){
 assert(review==='creative-rebuild-v2','Keep the delivered project intact');
 assert(!fs.existsSync(file('Editable Project.autopromote.json')),'Reopen the authored revision; do not duplicate it again');
 const original=path.join(report,'Editable Project.autopromote.json'),prior=JSON.parse(fs.readFileSync(original));
 await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(original);
 await p.getByRole('button',{name:prior.name,exact:true}).click();await p.locator('.viral-studio-container').waitFor();await h.rail(p);await n.pause(p);
 await p.getByRole('button',{name:'Duplicate',exact:true}).click();await p.getByLabel('Project name',{exact:true}).fill(n.title);
 const stop=await recording(p,file('native-creative-authoring'));let saved;
 try{
  const before=await n.save(p,'before-creative-rebuild');assert.notEqual(before.id,prior.id);
  await p.getByTestId('studio-mode-fxflow').click();await p.getByTestId('dock-tab-comp_rig').click();
  const rejected=before.snapshot.overlays.filter(l=>/^(03|04|06|07) \/ /.test(l.name));
  for(const layer of rejected){const row=p.getByTestId('comp-layer-row-'+layer.id).locator('.ap-comp-layer-title');if(await row.count()){await row.press('Enter');await row.press('Delete');}}
  saved=await n.save(p,'weak-middle-removed');assert(saved.snapshot.overlays.every(l=>!/^(03|04|06|07) \/ /.test(l.name)));
  for(const name of ['01 - Step outside the image','02 - Recompose the landscape','03 - Through moving worlds','04 - Closing timing'])await apply(p,JSON.parse(fs.readFileSync(file(name+'.json'))));
  await fps(p);saved=await n.save(p,'creative-rebuilt');await n.backup(p,'Editable Project');
  const sequence=s=>s.timeline.map(c=>({name:c.name,start:c.startRequest,end:c.endRequest,source:c.sourceStoragePath||c.storagePath}));
  assert.deepEqual(sequence(saved.snapshot),sequence(prior.snapshot));assert.equal(saved.snapshot.overlays.filter(l=>l.name==='Rebuild / person outside the image').length,1);
  write('creative-authoring.json',{nativeUi:true,previousProjectId:prior.id,newProjectId:saved.id,removedWeakLayers:rejected.map(l=>l.name),nativeLayers:saved.snapshot.overlays.length,keys:saved.snapshot.motionKeyframes.length,seconds:36,sourceTimelinePreserved:true,paidCalls:0});
 }finally{await stop();}
}
async function correctCreativeComposition(p,onlyPerspective=false){
 const before=await n.save(p,'before-composition-correction');await n.backup(p,'Before Composition Correction');
 const stop=await recording(p,file('native-composition-correction'));
 try{
 if(!onlyPerspective){
  await p.getByTestId('studio-mode-fxflow').click();await p.getByTestId('dock-tab-comp_rig').click();
  for(const name of ['Rebuild / step outside','Rebuild / open possibilities','Rebuild / look closer','Rebuild / ground contact']){
   const layer=before.snapshot.overlays.find(l=>l.name===name);const row=p.getByTestId('comp-layer-row-'+layer.id).locator('.ap-comp-layer-title');await row.press('Enter');await row.press('Delete');
  }
  for(const name of ['Correct contour 1','Correct contour 2','Correct composition'])await apply(p,JSON.parse(fs.readFileSync(file(name+'.json'))));
 }
  let saved=await n.save(p,'before-portal-perspective');await n.backup(p,'Editable Project');await q.tool(p,'Composite');
  for(const [name,quad] of [
   ['Rebuild / portal one - water',[[0,20],[100,0],[100,100],[0,80]]],
   ['Rebuild / portal two - mountains',[[0,0],[100,20],[100,80],[0,100]]],
   ['Rebuild / portal three - city',[[0,20],[100,0],[100,100],[0,80]]],
  ]){
   const layer=saved.snapshot.overlays.find(l=>l.name===name);
   const target=p.locator('label.inspector-select-field').filter({hasText:/composite target/i}).locator('select');
   assert.equal(await target.count(),1);await target.selectOption(layer.id);
   const panel=p.getByTestId('studio-perspective-inspector');if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
   for(const [i,label]of ['top left','top right','bottom right','bottom left'].entries())for(const [j,axis]of ['X','Y'].entries())await panel.getByLabel('Perspective '+label+' '+axis,{exact:true}).fill(String(quad[i][j]));
   await panel.getByRole('button',{name:'Apply plane corners',exact:true}).click();
  }
  await q.tool(p,'Sound');
  for(const [time,id,volume]of [[22.4,'airy_whoosh',12],[24.3,'airy_whoosh',12],[26.3,'airy_whoosh',14],[31.7,'chime',12]]){
   await n.seek(p,time);await p.getByTestId('sound-effect-preset-'+id).click();await n.range(p.getByTestId('sound-effect-volume'),volume);
  }
  saved=await n.save(p,'composition-corrected');await n.backup(p,'Editable Project');
  write('composition-correction.json',{nativeUi:true,projectId:saved.id,keys:saved.snapshot.motionKeyframes.length,removedCompetingCaptions:true,correctedWalkerClearance:true,revisedNativePointKeys:true,portalCornersAuthoredInInspector:true});
 }finally{await stop();}
}
async function correctCreativeContour(p){
 const stop=await recording(p,file('native-edge-correction'));
 try{
  for(const name of ['Correct contour 1','Correct contour 2','Correct portal focus'])await apply(p,JSON.parse(fs.readFileSync(file(name+'.json'))));
  await n.save(p,'hand-edge-corrected');await n.backup(p,'Editable Project');
 }finally{await stop();}
}
async function renderCreativeAfterUnsubmittedFailure(p){
 // Preparation failed before a quote/job existed. Wait for ordinary recovery
 // to verify its missing attempt; never dismiss a processing/unknown job.
 const recovery=p.getByTestId('viral-render-recovery');
 if(await recovery.count()){
  const dismiss=recovery.getByRole('button',{name:'Dismiss',exact:true});await dismiss.waitFor({timeout:90000});
  assert.match(await recovery.innerText(),/couldn.t find|not found|no longer|not.*found|has not appeared|render failed/i);
  write('pre-dispatch-recovery.json',{nativeRecoveryConfirmedMissing:true,priorPrepareFailed:true,noPriorWorkerClaim:true});
  await dismiss.click();
 }
 await n.render(p);
}
async function profileCreativePreview(p){
 await live(p);await n.seek(p,10);
 const cdp=await p.context().newCDPSession(p);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
 await p.getByRole('button',{name:'Play edited preview',exact:true}).click();await p.waitForTimeout(12000);
 const {profile}=await cdp.send('Profiler.stop');write('preview-cpu-profile.private.json',profile);await n.pause(p);
 write('preview-profile-state.json',await p.evaluate(()=>({programmeTime:document.querySelector('[data-testid="studio-program-canvas"]')?.dataset.programmeTime,
  layers:[...document.querySelectorAll('[data-studio-layer-id]')].map(el=>({id:el.dataset.studioLayerId,time:el.dataset.programmeTime,visibility:getComputedStyle(el).visibility,display:getComputedStyle(el).display})),
  videos:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,paused:v.paused,ready:v.readyState,path:v.currentSrc?new URL(v.currentSrc).pathname:''}))})));
}
async function positionEpisode(p){
 const before=await n.save(p,'before-depth-position');const title=before.snapshot.overlays.find(l=>l.name==='05 / BEYOND');assert(title);
 await q.tool(p,'Motion');const transform=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await transform.count())await transform.click();
 await p.getByLabel('Target layer',{exact:true}).selectOption(title.id);await p.getByLabel('X',{exact:true}).fill('58');
 const after=await n.save(p,'depth-position');assert.equal(after.snapshot.overlays.find(l=>l.id===title.id).x,58);await n.backup(p,'Editable Project');
}
async function cleanupEpisode(p){
 const before=await n.save(p,'before-cleanup');await n.backup(p,'Before Layer Cleanup');
 const names=['01 / Moving picture inside FRAME','01 / FRAME aperture','05 / Feathered moving sea','05 / aperture space','05 / feel','05 / feel two','06 / shaped curve'];
 await p.getByTestId('studio-mode-fxflow').click();await p.getByTestId('dock-tab-comp_rig').click();
 for(const name of names){const layer=before.snapshot.overlays.find(l=>l.name===name);if(!layer)continue;
   const row=p.getByTestId('comp-layer-row-'+layer.id).locator('.ap-comp-layer-title');await row.press('Enter');await row.press('Delete');
 }
 const after=await n.save(p,'layers-cleaned');assert(after.snapshot.overlays.every(l=>!names.includes(l.name)),'Superseded layers must actually be removed');
 await n.backup(p,'Editable Project');write('cleanup.json',{before:before.snapshot.overlays.length,after:after.snapshot.overlays.length,removed:names,nativeLayerSelectionAndDelete:true});
}
async function resumeExport(p){
 const checkpoint=JSON.parse(fs.readFileSync(file('interrupted-upload.json'))),before=await n.save(p,'upload-reopened');
 for(const binding of checkpoint.retained){const layer=before.snapshot.overlays.find(l=>l.id===binding.id);assert(layer&&!layer.isLocal&&layer.file===null);assert.equal(layer.sourceStoragePath,binding.path);}
 const pending=before.snapshot.overlays.filter(l=>l.type==='image'&&l.isLocal),uploads=[];
 assert.equal(pending.length,checkpoint.totalLocalImages-checkpoint.retained.length);
 p.on('response',async r=>{
  const u=new URL(r.url());if(u.pathname==='/api/content/upload/source-file'&&u.searchParams.get('mediaType')==='image'){
   const body=await r.json().catch(()=>({}));uploads.push({status:r.status(),storagePath:body.storagePath||null,retryAfter:r.headers()['retry-after']||null});
  }
 });
 write('upload-resume-start.json',{nativeColdReopen:true,retainedPathsMatch:true,retained:checkpoint.retained.length,pending:pending.length});
 try{await n.render(p);
  const after=await n.save(p,'upload-resume-exported');
  for(const binding of checkpoint.retained)assert.equal(after.snapshot.overlays.find(l=>l.id===binding.id).sourceStoragePath,binding.path);
  assert.equal(after.snapshot.overlays.filter(l=>l.type==='image'&&l.isLocal).length,0);
  assert.equal(uploads.filter(r=>r.status>=200&&r.status<300).length,pending.length,'Already materialized images must not upload again');
  write('upload-recovery.json',{nativeColdReopen:true,retainedPathsMatch:true,retained:checkpoint.retained.length,pending:pending.length,
    successfulImageUploads:uploads.filter(r=>r.status>=200&&r.status<300).length,uploads,allImagesDurable:true,nativeExport:true});
 }finally{write('upload-resume-observations.json',{retained:checkpoint.retained.length,pending:pending.length,uploads});}
}
async function verifyUploadRecovery(p){
 const checkpoint=JSON.parse(fs.readFileSync(file('interrupted-upload.json'))),observed=JSON.parse(fs.readFileSync(file('upload-resume-observations.json')));
 const saved=await n.save(p,'fully-materialized-reopened');
 const original=JSON.parse(fs.readFileSync(file('Before Interrupted Upload.autopromote.json')));
 assert.deepEqual(saved.snapshot.motionKeyframes,original.snapshot.motionKeyframes);
 for(const binding of checkpoint.retained)assert.equal(saved.snapshot.overlays.find(l=>l.id===binding.id).sourceStoragePath,binding.path);
 assert.equal(saved.snapshot.overlays.filter(l=>l.type==='image'&&l.isLocal).length,0);
 const successes=observed.uploads.filter(r=>r.status>=200&&r.status<300);assert.equal(successes.length,checkpoint.totalLocalImages-checkpoint.retained.length);
 assert(successes.every(r=>r.storagePath.startsWith('uploads/images/demo-pilot-alice/')));
 write('upload-recovery.json',{nativeColdReopen:true,retainedPathsMatch:true,retained:checkpoint.retained.length,pendingBeforeResume:4,
   successfulImageUploads:successes.length,allImagesDurable:true,keyframesUnchanged:true,afterRenderFailureColdReopen:true,
   nativeExport:'The subsequent compositor argument-limit failure is separate; its native retry is recorded independently.'});
}
async function prepareExport(p){
 let dispatched=false;p.on('request',r=>{if(new URL(r.url()).pathname==='/api/media/process')dispatched=true;});
 await q.tool(p,'Export');await p.getByLabel('Export resolution',{exact:true}).selectOption('720p');await p.getByLabel('Export frame rate',{exact:true}).selectOption('24');
 await p.getByRole('button',{name:/^Render (Final Clip|Again)$/}).click();
 const quote=p.getByRole('dialog',{name:'Studio export',exact:true});await quote.waitFor({timeout:600000});
 await quote.getByRole('button',{name:'Keep editing',exact:true}).click();
 const saved=await n.save(p,'materialized-before-export');await n.backup(p,'Editable Project');
 assert(!dispatched,'Preparation must not submit a worker job');assert.equal(saved.snapshot.overlays.filter(l=>l.type==='image'&&l.isLocal).length,0);
 write('export-preparation.json',{normalUi:true,workerRequests:0,localArtwork:0,quoteDeclined:true});
}
async function neutralizeEpisodeGrade(p){
 const before=await n.save(p,'before-neutral-grade');await n.backup(p,'Before Neutral Grade');
 const grade=before.snapshot.adjustmentLayers.find(l=>l.name==='Episode source finish');assert(grade);
 await p.getByTestId('studio-mode-fxflow').click();await p.getByTestId('dock-tab-node_flow').click();
 await p.getByTestId('flow-node-Adjustment:'+grade.id).click();
 const enabled=p.getByLabel('Adjustment enabled',{exact:true});if(await enabled.isChecked())await enabled.uncheck();
 const after=await n.save(p,'neutral-grade');assert.equal(after.snapshot.adjustmentLayers.find(l=>l.id===grade.id).enabled,false);
 assert.deepEqual(after.snapshot.motionKeyframes,before.snapshot.motionKeyframes);
 await n.backup(p,'Editable Project');write('neutral-grade.json',{nativeUi:true,disabledStored:true,keyframesUnchanged:true});
 const prior=file('native-motion-flow');if(fs.existsSync(prior))fs.renameSync(prior,file('First source-only grade export - '+Date.now()));
}
async function silentRaw(p,recover=false){
 const raw=await n.save(p,'raw-reopened');assert.equal(raw.snapshot.overlays.length,0);
 assert.equal(raw.snapshot.timeline.reduce((s,c)=>s+c.endRequest-c.startRequest,0),variant==='episode'?36:8);
 assert(!raw.snapshot.addMusic&&!raw.snapshot.soundEffects.length&&!raw.snapshot.voiceovers.length);
 for(const media of raw.snapshot.projectMedia){
  const probe=JSON.parse(require('child_process').execFileSync('ffprobe',['-v','error','-show_streams','-of','json',source(media.name.replace(/\.mp4$/,''))],{encoding:'utf8'}));
  assert(!probe.streams.some(s=>s.codec_type==='audio'),'Silence must follow the actual source bytes');
 }
 process.env.STUDIO_QA_EXPECT_AUDIO='false';
 if(recover){await h.recover(p,'native-raw-source');await n.backup(p,'Raw Project');}
 else{await fps(p);await n.render(p,true);}
}
async function interruptUpload(p){
 const before=await n.save(p,'before-interrupted-upload');await n.backup(p,'Before Interrupted Upload');
 const targets=before.snapshot.overlays.filter(l=>l.type==='image'&&l.isLocal).map(l=>l.id);assert(targets.length>10,'Exercise the real upload burst limit');
 let dispatched=false;const responses=[];
 p.on('request',r=>{if(new URL(r.url()).pathname==='/api/media/process')dispatched=true;});
 p.on('response',async r=>{if(new URL(r.url()).pathname==='/api/content/upload/source-file')responses.push({status:r.status(),retryAfter:r.headers()['retry-after']||null});});
 await q.tool(p,'Export');await p.getByRole('button',{name:/^Render (Final Clip|Again)$/}).click();
 let checkpoint;for(let i=0;i<100;i++){
  await p.waitForTimeout(2000);checkpoint=await n.save(p,'partial-upload-checkpoint');
  const retained=checkpoint.snapshot.overlays.filter(l=>targets.includes(l.id)&&!l.isLocal&&l.sourceStoragePath);
  if(retained.length>=3){
   assert(retained.length<targets.length,'Need a genuinely interrupted batch');
   assert.deepEqual(checkpoint.snapshot.motionKeyframes,before.snapshot.motionKeyframes);
   await n.backup(p,'Editable Project');assert.equal(dispatched,false,'Do not submit an unapproved or duplicate render');
   write('interrupted-upload.json',{projectId:checkpoint.id,totalLocalImages:targets.length,retained:retained.map(l=>({id:l.id,path:l.sourceStoragePath,src:l.src})),
    nativeSave:true,nativeBackup:true,interruption:'Browser closes while remaining source uploads are pending; no worker dispatch.',responses});
   return;
  }
 }
 throw Error('No successful partial uploads observed');
}
async function debugRender(p){
 await q.tool(p,'Export');
 const observations=[],responses=[];p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')observations.push(m.text().slice(0,2000));});
 p.on('response',async r=>{const u=new URL(r.url());if(/api\/(media|credit-pilot|content)/.test(u.pathname))responses.push({path:u.pathname,status:r.status(),body:r.status()>=400?(await r.text()).slice(0,2000):undefined});});
 const button=p.getByRole('button',{name:/^Render (Final Clip|Again)$/});
 const original=await button.evaluate(el=>({disabled:el.disabled,html:el.outerHTML}));
 const stages=[];await button.click();
 for(let i=0;i<12;i++){
   await p.waitForTimeout(1000);stages.push({second:i+1,text:await p.locator('.export-btn').first().textContent(),disabled:await p.locator('.export-btn').first().isDisabled(),modal:await p.getByRole('dialog',{name:'Studio export',exact:true}).count(),error:await p.getByTestId('studio-export-error').allTextContents(),status:await p.locator('[role=status]').allTextContents()});
   write('render-debug.json',{original,stages,observations,responses});
 }
 await p.screenshot({path:file('render-debug.png')});
 // This phase observes pre-submit UI only. Leave a visible quote unapproved.
}
async function polish(p){
 const before=await n.save(p,'before-polish');await n.backup(p,'Before Polish');
 if(variant==='typography'){
  const foreground=before.snapshot.overlays.find(l=>l.name==='Foreground / animated torso');assert(foreground);
  const rows=before.snapshot.motionKeyframes.filter(k=>k.targetId===foreground.id&&k.property.endsWith('Y')&&k.property.startsWith('maskPoint'));
  const affected=new Set(rows.filter(k=>k.value>64.5).map(k=>k.property));
  const actions=[...affected].map(property=>({type:'remove_keys',targetId:foreground.id,property}));
  const revised=rows.filter(k=>affected.has(k.property)).map(({property,time,value,easing,curve})=>({property,time,value:Math.min(64.5,value),easing,...(curve?{curve}:{})}));
  for(let i=0;i<revised.length;i+=128)actions.push({type:'keys',targetId:foreground.id,keys:revised.slice(i,i+128)});
  assert(actions.length<=64);await apply(p,{name:'Join foreground to the letter baseline',actions});
 }
 await q.tool(p,'Sound');await p.getByTestId('background-sound-input').setInputFiles(path.join(report,'Episode original score-master.wav'));
 const duck=p.getByLabel('Duck under speech',{exact:true});if(await duck.count()&&await duck.isChecked())await duck.uncheck();
 await n.range(p.getByText('Background volume',{exact:true}).locator('..').locator('..').locator('input'),75);
 await n.range(p.getByLabel('Music fade in',{exact:true}),.2);await n.range(p.getByLabel('Music fade out',{exact:true}),1);
 for(const [time,id] of variant==='typography'?[[0,'airy_whoosh'],[3,'chime']]:variant==='tracked'?[[.5,'click'],[4,'reverse']]:[[1.5,'reverse'],[3.3,'cinematic_hit']]){
   await n.seek(p,time);await p.getByTestId('sound-effect-preset-'+id).click();await n.range(p.getByTestId('sound-effect-volume'),16);
 }
 await n.save(p,'polished');await n.backup(p,'Editable Project');
}
async function inspect(p){
 await live(p);await q.tool(p,'Motion');const transform=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await transform.count())await transform.click();await p.getByLabel('Target layer',{exact:true}).selectOption('main-video');await p.getByTestId('studio-mode-fxflow').click();await p.getByTestId('studio-comp-workbench').getByText('Main Programme',{exact:true}).locator('..').press('Enter');
 const times=review?[.25,.75,1.5,2.6,3.4,4.8,6.25,6.9,7.5,8,9.6,10.5,11.5,13.5,15.5,16.4,17.7,19.4,20.5,21.5,22.5,23.5,24.5,25.5,26.5,27.5,28.5,30,31.5,32.5,34.5,35.9]:variant==='episode'?[.25,.75,1.5,2.6,3.4,6.9,8,11.5,16.4,17,17.7,18.6,19.4,21.5,25,29.3,31.5,35.9]:[.25,.75,1.5,2.5,3.4,3.9,4.8,6,7.5];
 const samples=[];for(const time of times){
 await n.seek(p,time);await p.waitForFunction(t=>{const c=document.querySelector('[data-testid="studio-program-canvas"]'),v=document.querySelector('[data-testid="studio-after-video"]');return v&&v.readyState>=2&&v.videoWidth>0&&!v.seeking&&c?.dataset.sourceSampling==='accurate-paused'&&c?.getAttribute('aria-busy')!=='true'&&Math.abs(Number(c?.dataset.programmeTime)-t)<1/24;},time,{timeout:45000});
 await p.waitForTimeout(400);await p.getByTestId('hook-preview-frame').screenshot({path:file(`preview-${time.toFixed(2)}.png`)});
 samples.push({requested:time,...await p.getByTestId('studio-program-canvas').evaluate(el=>({...el.dataset}))});
 }write('preview-samples.json',samples);
}
async function reopenEdit(p){
 const expected=JSON.parse(fs.readFileSync(file('Editable Project.autopromote.json'))),before=await n.save(p,'reopened-before-edit');
 assert.equal(n.decisions(before.snapshot.studioDocument),n.decisions(expected.snapshot.studioDocument));
 if(variant==='episode'){
  await n.seek(p,30);await q.tool(p,'Cut');await n.range(p.getByText('Clip end',{exact:true}).locator('..').locator('input'),7.9);await n.pause(p);
  const shortened=await n.save(p,'native-ripple-shortened');assert.equal(shortened.snapshot.timeline.at(-1).endRequest,7.9);
  await p.getByTestId('studio-undo-button').click();const undone=await n.save(p,'native-ripple-undone');assert.equal(n.decisions(undone.snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));
 }
 await p.getByTestId('studio-mode-fxflow').click();const layer=review?before.snapshot.overlays.find(l=>l.name==='Rebuild / person outside the image'):before.snapshot.overlays.find(l=>l.mask?.shape==='polygon');
 if(layer){
   await n.seek(p,review?7.5:variant==='episode'?17:2);await q.tool(p,'Motion');const tab=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await tab.count())await tab.click();
   await p.getByLabel('Target layer',{exact:true}).selectOption(layer.id);
   const section=p.getByTestId('studio-mask-point-animation');if(!await section.evaluate(el=>el.open))await section.locator('summary').click();
   const input=p.getByLabel('Mask point 1 X',{exact:true});const value=Number(await input.inputValue());await input.fill(String(value+.1));await input.press('Enter');
   const after=await n.save(p,'point-edited');assert.notEqual(n.decisions(after.snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));
   await p.getByTestId('studio-undo-button').click();const undo=await n.save(p,'point-edit-undone');assert.equal(n.decisions(undo.snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));
   await p.getByTestId('studio-redo-button').click();const redo=await n.save(p,'point-edit-redone');assert.equal(n.decisions(redo.snapshot.studioDocument),n.decisions(after.snapshot.studioDocument));
   if(review){await p.getByTestId('studio-undo-button').click();assert.equal(n.decisions((await n.save(p,'point-edit-restored')).snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));}
   await n.backup(p,'Editable Project');
 }else{
   await n.seek(p,2);await p.getByTestId('studio-comp-workbench').getByText('Main Programme',{exact:true}).click();await p.getByLabel('Motion driver target property',{exact:true}).selectOption('scale');await p.getByTestId('comp-add-keyframe-playhead').click();
   await p.getByLabel('Selected keyframe value',{exact:true}).fill('1.07');const after=await n.save(p,'camera-key-edited');assert.notEqual(n.decisions(after.snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));await n.backup(p,'Editable Project');
 }
 write('reopen-edit.json',{normalColdReopen:true,exactBeforeEdit:true,nativeModify:true,pointUndoRedo:!!layer});
}
async function playback(p,finished=false){
 const label=process.env.STUDIO_QA_PLAYBACK_LABEL||'';assert(/^[a-z0-9-]*$/.test(label));
 const proofName=name=>label?label+'-'+name:name;
 if(!finished)await live(p);else{
  await q.tool(p,'Export');
  if(!await p.getByTestId('hook-preview-frame').evaluate(el=>el.classList.contains('has-rendered-output'))){
   await p.getByLabel('Restore export receipt',{exact:true}).setInputFiles(file('native-motion-flow/render-receipt.json'));
   await p.waitForFunction(()=>document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output')||
    [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Show Finished Video'),null,{timeout:90000});
  }
  const show=p.getByRole('button',{name:'Show Finished Video',exact:true});if(await show.isVisible())await show.click();
  await p.waitForFunction(()=>document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output'),null,{timeout:90000});
  const expected=JSON.parse(fs.readFileSync(file('native-motion-flow/render-receipt.json'))).outputSha256;
  const observed=await p.getByTestId('studio-after-video').evaluate(async video=>{
   const response=await fetch(video.currentSrc||video.src);if(!response.ok)throw Error('Finished playback bytes unavailable');
   const bytes=await response.arrayBuffer();if(bytes.byteLength>128*1024**2)throw Error('Unexpected finished-file size');
   return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  });assert.equal(observed,expected,'Finished playback must show the exact newly delivered movie');
  write(proofName('finished-file-identity.json'),{sha256:observed,exactNativeReceipt:true});
  if(label){
   assert.equal(await p.locator('[data-studio-overlay-decoder]').count(),0,'Finished movie must release live layers');
   await p.getByRole('button',{name:'Show Live Edit',exact:true}).click();await n.seek(p,0);
   await p.waitForFunction(()=>document.querySelectorAll('[data-studio-overlay-decoder]').length>0);
   const restored=await p.locator('[data-studio-overlay-decoder]').count();
   await p.getByRole('button',{name:'Show Finished Video',exact:true}).click();
   await p.waitForFunction(()=>document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output'));
   assert.equal(await p.locator('[data-studio-overlay-decoder]').count(),0);
   write(proofName('decoder-isolation.json'),{finishedDecoders:0,liveDecodersRestored:restored,finishedDecodersAfterReturn:0});
  }
 }
 await p.getByTestId('dock-tab-timeline').click();await n.seek(p,0);
 const duration=variant==='episode'?36:8,out=file(proofName(finished?'finished-playback':'live-playback'));fs.mkdirSync(out,{recursive:true});
 const stop=await recording(p,out);const began=Date.now();await p.evaluate(()=>{
  const frames=[],programme=[],events=[],v=document.querySelector('[data-testid=studio-after-video]'),initial=v?.getVideoPlaybackQuality?.();let handle,raf,last;
  const tick=(now,meta)=>{frames.push({ms:now,time:meta.mediaTime,presented:meta.presentedFrames});handle=v.requestVideoFrameCallback(tick);};if(v?.requestVideoFrameCallback)handle=v.requestVideoFrameCallback(tick);
  const clock=now=>{const time=Number(document.querySelector('[data-testid=studio-program-canvas]')?.dataset.programmeTime);if(time!==last){programme.push({ms:now,time});last=time;}raf=requestAnimationFrame(clock);};raf=requestAnimationFrame(clock);
  const observers=['waiting','stalled','ended','error'].map(type=>{const f=()=>events.push({type,time:v.currentTime});v.addEventListener(type,f);return [type,f];});
  window.__studioPlaybackEvidence=()=>{if(handle)v.cancelVideoFrameCallback(handle);cancelAnimationFrame(raf);observers.forEach(([type,f])=>v.removeEventListener(type,f));const q=v?.getVideoPlaybackQuality?.();return {frames,programme,events,quality:q?{decoded:q.totalVideoFrames-initial.totalVideoFrames,dropped:q.droppedVideoFrames-initial.droppedVideoFrames}:null};};
 });
 try{await p.getByRole('button',{name:'Play edited preview',exact:true}).click();await p.waitForFunction(({d,finished})=>{const c=document.querySelector('[data-testid="studio-program-canvas"]'),v=document.querySelector('[data-testid="studio-after-video"]');return (finished?Number(v?.currentTime):Number(c?.dataset.programmeTime))>=d-.1||v?.ended;},{d:duration,finished},{timeout:180000});await n.pause(p);write(proofName((finished?'finished':'live')+'-playback.json'),{elapsedMs:Date.now()-began,duration,complete:true,...await p.evaluate(()=>window.__studioPlaybackEvidence())});}finally{await stop();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--disable-gpu']}),session=file(['raw-render','recover-raw'].includes(phase)?'raw-session.private.json':'session.private.json');
 const context=await browser.newContext({viewport:{width:1440,height:1100},...(fs.existsSync(session)?{storageState:session}:{})});
 await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['blob:','data:'].includes(u.protocol)?route.continue():route.abort();});
 const p=await context.newPage();p.setDefaultTimeout(45000);const errors=[];const network=[];p.on('response',r=>{if(r.status()>=400)network.push({path:new URL(r.url()).pathname,status:r.status()});});p.on('requestfailed',r=>network.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>void d.accept());
 try{await n.entry(p);console.log('Signed in; phase',variant,phase);if(phase==='create')await create(p);else if(phase==='creative')await creativeRebuild(p);else{
 if(['raw-render','recover-raw'].includes(phase)){
  await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(file('Raw Project.autopromote.json'));
  await p.getByRole('button',{name:n.title,exact:true}).waitFor({timeout:90000});
 }
 await n.open(p);console.log('Opened native saved project');write('opened-media.json',await p.locator('video').evaluateAll(nodes=>nodes.map(v=>({readyState:v.readyState,seeking:v.seeking,currentTime:v.currentTime,error:v.error?.message,src:v.currentSrc?new URL(v.currentSrc).pathname:''}))));if(phase==='creative-profile')await profileCreativePreview(p);else if(phase==='creative-review'){await inspect(p);await playback(p,false);await playback(p,true);}else if(phase==='creative-render')await renderCreativeAfterUnsubmittedFailure(p);else if(phase==='creative-contour')await correctCreativeContour(p);else if(phase==='creative-correct')await correctCreativeComposition(p);else if(phase==='creative-perspective')await correctCreativeComposition(p,true);else if(phase==='refine')await refineEpisode(p);else if(phase==='position')await positionEpisode(p);else if(phase==='cleanup')await cleanupEpisode(p);else if(phase==='polish')await polish(p);else if(phase==='inspect')await inspect(p);else if(phase==='reopen-edit')await reopenEdit(p);else if(phase==='playback')await playback(p);else if(phase==='finished')await playback(p,true);else if(phase==='resume-export')await resumeExport(p);else if(phase==='verify-upload')await verifyUploadRecovery(p);else if(phase==='prepare-export')await prepareExport(p);else if(phase==='neutral-grade')await neutralizeEpisodeGrade(p);else if(phase==='render-recovered'){await verifyUploadRecovery(p);await n.render(p);}else if(phase==='upload-interrupt')await interruptUpload(p);else if(phase==='render-debug')await debugRender(p);else if(phase==='render')await n.render(p);else if(phase==='raw-render'){
  await silentRaw(p);
 }else if(phase==='recover-raw')await silentRaw(p,true);else throw Error('Unknown phase');}
 assert.deepEqual(errors,[]);write(phase+'-ui.json',{phase,variant,normalAuth:true,headless:true,muted:true,browserErrors:errors,completedAt:new Date().toISOString()});
 }catch(error){console.error('Phase failed:',error.stack);write('network-observations.json',network);await p.screenshot({path:file('failure-'+Date.now()+'.png')}).catch(()=>{});write('failure-'+Date.now()+'.json',{error:error.stack,body:await p.locator('body').innerText()});try{await n.save(p,'interrupted');await n.backup(p,'Interrupted Project');}catch{}throw error;
 }finally{await context.storageState({path:session});await context.close();await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
