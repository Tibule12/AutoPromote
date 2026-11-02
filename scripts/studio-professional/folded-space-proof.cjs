// Native Studio controls only. Scene files supply editable numeric directions.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),runtime=process.argv[2],phase=process.argv[3]||'create';
const episode=process.env.STUDIO_FOLDED_EPISODE==='true',flowing=process.env.STUDIO_FOLDED_FLOWING==='true'||episode;
const folder=path.join(root,'reports/studio-folded-space-20261101',...(flowing?['flowing-ribbon']:[]),...(episode?['episode']:[]));fs.mkdirSync(folder,{recursive:true});
Object.assign(process.env,{STUDIO_MOTION_VARIANT:'episode',STUDIO_MOTION_PROOF_DIR:folder,
  STUDIO_MOTION_PROOF_TITLE:episode?'AutoPromote — Flowing worlds / Episode':flowing?'AutoPromote — Flowing worlds':'AutoPromote — Folded moving space',STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS:'1800000',STUDIO_QA_UPLOAD_BUDGET_MS:'600000'});
const n=require('./motion-flow-proof.cjs'),q=require('../../test/e2e/playwright/studio-stability/run'),h=require('../creative-templates/studio-proof');
const {recording}=require('./kinetic-type-proof'),{chromium}=require('playwright');
const file=s=>path.join(folder,s),write=(s,d)=>fs.writeFileSync(file(s),JSON.stringify(d,null,2),{mode:0o600});
process.on('exit',code=>write(phase+'-exit.json',{code,at:new Date().toISOString()}));
const source=s=>path.join(root,'reports/studio-motion-flow-takeover-20261031/video-texture/open-world-sources',s+'.mp4');
async function plan(p,input){
 const saved=await n.save(p,'before-plan');const value=structuredClone(input);
 value.actions=value.actions.map(a=>({...a,...(a.sourceMediaId?{sourceMediaId:saved.snapshot.projectMedia.find(m=>m.name===a.sourceMediaId+'.mp4')?.id}:{})}));
 const name='reviewed-'+Date.now()+'.json';write(name,{format:'autopromote-scene-actions',version:1,projectId:saved.id,baseRevision:saved.snapshot.studioDocument.revision,...value});
 await p.getByTestId('studio-mode-fxflow').click();const panel=p.getByTestId('studio-scene-actions');if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
 await panel.getByLabel('Scene action plan',{exact:true}).setInputFiles(file(name));await panel.getByRole('status').filter({hasText:'Review this plan before applying.'}).waitFor();
 await panel.getByRole('button',{name:'Apply reviewed scene actions',exact:true}).click();await panel.getByRole('status').filter({hasText:/Scene actions applied|invalid|unsupported|folds|collapses|exceeds|needs|Choose/i}).waitFor({timeout:120000});
 assert.match(await panel.getByRole('status').innerText(),/Scene actions applied/);
}
async function create(p){
 assert(!fs.existsSync(file('Editable Project.autopromote.json')),'Reopen the previous native project instead');
 await p.locator('.creator-studio-dropzone input[type=file]').setInputFiles(source('Autumn'));await p.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:180000});await h.rail(p);await n.pause(p);
 await p.getByLabel('Project name',{exact:true}).fill(n.title);const stop=await recording(p,file('native-authoring'));
 try{
  await q.tool(p,'Reframe');await p.getByTestId('reframe-aspect-16-9').click();await p.getByTestId('reframe-preserve-frame').click();
  const rounded=p.getByLabel('Rounded main footage',{exact:true});if(await rounded.count()&&await rounded.isChecked())await rounded.uncheck();
  await q.tool(p,'Cut');await n.range(p.getByText('Clip end',{exact:true}).locator('..').locator('input'),8);await n.pause(p);
  await p.getByTestId('project-media-import-input').setInputFiles(source('Summit'));await q.tool(p,'Sound');await p.getByLabel('Use voice repair on export',{exact:true}).uncheck();
  await n.save(p,'raw-source');await n.backup(p,'Raw Project');
  for(const name of fs.readdirSync(folder).filter(n=>/^fold-plan-\d+.json$/.test(n)).sort())await plan(p,JSON.parse(fs.readFileSync(file(name))));
  await n.save(p,'folded-worlds');await finish(p);
 }finally{await stop();}
}
async function revise(p){
 assert(flowing&&!fs.existsSync(file('Editable Project.autopromote.json')));
 const original=path.join(folder,'..','Editable Project.autopromote.json'),prior=JSON.parse(fs.readFileSync(original));
 await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(original);await p.getByRole('button',{name:prior.name,exact:true}).click();await h.rail(p);await n.pause(p);await p.getByRole('button',{name:'Duplicate',exact:true}).click();await p.getByLabel('Project name',{exact:true}).fill(n.title);
 const stop=await recording(p,file('native-authoring'));try{
  const saved=await n.save(p,'before-revision');assert.notEqual(saved.id,prior.id);await p.getByTestId('studio-mode-fxflow').click();await p.getByTestId('dock-tab-comp_rig').click();
  for(const l of saved.snapshot.overlays){const row=p.getByTestId('comp-layer-row-'+l.id).locator('.ap-comp-layer-title');await row.press('Enter');await row.press('Delete');}
  assert.equal((await n.save(p,'cleared-rejected-fold')).snapshot.overlays.length,0);
  for(const name of fs.readdirSync(folder).filter(n=>/^fold-plan-\d+.json$/.test(n)).sort())await plan(p,JSON.parse(fs.readFileSync(file(name))));
  await finish(p);
 }finally{await stop();}
}
async function episodeRevision(p,resume=false){
 assert(episode&&!fs.existsSync(file('Editable Project.autopromote.json')));
 const original=path.join(root,'reports/studio-cinematic-episode-20261101/creative-rebuild-v2/Editable Project.autopromote.json'),prior=JSON.parse(fs.readFileSync(original));
 if(resume)await n.open(p);else{await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(original);await p.getByRole('button',{name:prior.name,exact:true}).click();await h.rail(p);await n.pause(p);await p.getByRole('button',{name:'Duplicate',exact:true}).click();await p.getByLabel('Project name',{exact:true}).fill(n.title);}
 const stop=await recording(p,file('native-authoring'));try{
  const saved=await n.save(p,resume?'resumed-revision':'before-revision');assert.notEqual(saved.id,prior.id);await p.getByTestId('studio-mode-fxflow').click();await p.getByTestId('dock-tab-comp_rig').click();
  for(const l of saved.snapshot.overlays.filter(l=>l.name.startsWith('Rebuild /')||l.name==='05 / foreground promise')){const row=p.getByTestId('comp-layer-row-'+l.id).locator('.ap-comp-layer-title');await row.press('Enter');await row.press('Delete');}
  await n.save(p,'removed-rejected-graphics');await n.seek(p,30);await q.tool(p,'Cut');
  await n.range(p.getByText('Clip end',{exact:true}).locator('..').locator('input'),12);await n.pause(p);await n.range(p.getByText('Clip start',{exact:true}).locator('..').locator('input'),4);await n.pause(p);
  const after=await n.save(p,'source-handoff');assert.equal(after.snapshot.timeline.at(-1).startRequest,4);assert.equal(after.snapshot.timeline.at(-1).endRequest,12);assert.equal(after.snapshot.timeline.reduce((s,c)=>s+c.endRequest-c.startRequest,0),36);
  for(const name of fs.readdirSync(path.join(folder,'..')).filter(n=>/^fold-plan-\d+.json$/.test(n)).sort()){
   const value=JSON.parse(fs.readFileSync(path.join(folder,'..',name)));
   value.actions=value.actions.map(a=>({...a,...(a.startTime!==undefined?{startTime:a.startTime+20}:{}),...(a.keys?{keys:a.keys.map(k=>({...k,time:k.time+20}))}:{})}));
   if(value.graphics){value.graphics.duration=36;value.graphics.layers=value.graphics.layers.map(l=>({...l,startTime:l.startTime+20}));}
   await plan(p,value);
  }
  const composed=await n.save(p,'joined-worlds');await q.tool(p,'Motion');const tab=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await tab.count())await tab.click();
  for(const l of composed.snapshot.overlays.filter(l=>l.name.startsWith('Fold /')&&l.perspective)){await p.getByLabel('Target layer',{exact:true}).selectOption(l.id);await p.getByLabel('Enable layer shadow',{exact:true}).uncheck();}
  await q.tool(p,'Export');await p.getByLabel('Export frame rate',{exact:true}).selectOption('24');await n.save(p,'authored');await n.backup(p,'Editable Project');
 }finally{await stop();}
}
async function finish(p){
  const saved=await n.save(p,'before-finishing');await q.tool(p,'Motion');
  const tab=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await tab.count())await tab.click();
  const select=p.getByLabel('Target layer',{exact:true});
  for(const layer of saved.snapshot.overlays.filter(l=>l.perspective)){await select.selectOption(layer.id);await p.getByLabel('Enable layer shadow',{exact:true}).uncheck();}
  await q.tool(p,'Sound');await p.getByTestId('background-sound-input').setInputFiles(path.join(root,'reports/studio-cinematic-episode-20261101/Episode original score-master.wav'));
  const duck=p.getByLabel('Duck under speech',{exact:true});if(await duck.count()&&await duck.isChecked())await duck.uncheck();
  for(const [time,id,volume]of [[.65,'reverse',12],[2.7,'airy_whoosh',14],[4.25,'chime',12],[6.7,'airy_whoosh',12]]){await n.seek(p,time);await p.getByTestId('sound-effect-preset-'+id).click();await n.range(p.getByTestId('sound-effect-volume'),volume);}
  await q.tool(p,'Export');await p.getByLabel('Export frame rate',{exact:true}).selectOption('24');await n.save(p,'authored');await n.backup(p,'Editable Project');
}
async function inspect(p){
 await q.tool(p,'Export');const show=p.getByRole('button',{name:'Show Live Edit',exact:true});if(await show.isVisible())await show.click();
 await p.getByTestId('studio-mode-fxflow').click();
 await q.tool(p,'Motion');const tab=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await tab.count())await tab.click();await p.getByLabel('Target layer',{exact:true}).selectOption('main-video');
 const samples=[];for(const t of episode?[.25,3,6,11.5,17,20.25,21,21.75,22.5,23.5,24.25,25,26,27,27.9,28,28.1,31.5,35.9]:[.25,1,1.75,2.5,3.5,4.25,5,6,7,7.9]){
  await n.seek(p,t);await p.waitForFunction(t=>{const c=document.querySelector('[data-testid="studio-program-canvas"]');return c?.dataset.sourceSampling==='accurate-paused'&&Math.abs(Number(c?.dataset.programmeTime)-t)<1/24&&c?.getAttribute('aria-busy')!=='true';},t,{timeout:45000});await p.waitForTimeout(500);
  await p.getByTestId('hook-preview-frame').screenshot({path:file('preview-'+t.toFixed(2)+'.png')});samples.push({requested:t,...await p.getByTestId('studio-program-canvas').evaluate(e=>({...e.dataset})),
    planes:await p.locator('[data-studio-layer-id]').evaluateAll(nodes=>nodes.map(n=>{const v=n.querySelector('[data-studio-overlay-decoder]'),c=n.querySelector('[data-studio-shared-video]'),surface=n.querySelector('[data-testid="studio-perspective-surface"]');return surface?{id:n.dataset.studioLayerId,visibility:getComputedStyle(n).visibility,opacity:getComputedStyle(n).opacity,matrix:surface.style.transform,
      sourceTime:c?.style.display==='block'?Number(c.dataset.sourceTime):v?.currentTime,shared:v?.dataset.sharedProgrammeFrame,sharedOwner:v?.dataset.sharedFrameOwner,canvasWidth:c?.width,paused:v?.paused,seeking:v?.seeking}:null;}).filter(Boolean))});
 }write('preview-samples.json',samples);
}
async function reopen(p){
 const expected=JSON.parse(fs.readFileSync(file('Editable Project.autopromote.json')));let before=await n.save(p,'cold-reopened');assert.equal(n.decisions(before.snapshot.studioDocument),n.decisions(expected.snapshot.studioDocument));
 const layer=before.snapshot.overlays.find(l=>l.perspective);await n.seek(p,episode?22.5:2.5);await q.tool(p,'Motion');const tab=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await tab.count())await tab.click();await p.getByLabel('Target layer',{exact:true}).selectOption(layer.id);
 const input=p.getByLabel('Plane top left X',{exact:true});const v=Number(await input.inputValue());await input.fill(String(v+.1));await input.press('Enter');const changed=await n.save(p,'corner-edited');assert.notEqual(n.decisions(changed.snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));await p.getByTestId('studio-undo-button').click();assert.equal(n.decisions((await n.save(p,'corner-undone')).snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));
 await q.tool(p,'Composite');await p.locator('label.inspector-select-field').filter({hasText:/composite target/i}).locator('select').selectOption(layer.id);
 const inspector=p.getByTestId('studio-perspective-inspector');if(!await inspector.evaluate(el=>el.open))await inspector.locator('summary').click();
 const right=inspector.getByLabel('Plane source right',{exact:true}),rv=Number(await right.inputValue());await right.fill(String(Math.min(100,rv+.1)));await inspector.getByRole('button',{name:'Apply source region',exact:true}).click();
 const regionChanged=await n.save(p,'source-region-edited');assert.notEqual(n.decisions(regionChanged.snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));await p.getByTestId('studio-undo-button').click();assert.equal(n.decisions((await n.save(p,'source-region-undone')).snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));
 await p.getByTestId('studio-redo-button').click();assert.equal(n.decisions((await n.save(p,'source-region-redone')).snapshot.studioDocument),n.decisions(regionChanged.snapshot.studioDocument));await p.getByTestId('studio-undo-button').click();assert.equal(n.decisions((await n.save(p,'source-region-restored')).snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));
 write('reopen-edit.json',{nativeColdReopen:true,nativeCornerEditUndo:true,nativeSourceRegionEditUndoRedo:true,exactRestored:true,keys:before.snapshot.motionKeyframes.length,layerCount:before.snapshot.overlays.length});
}
async function guard(p){
 const before=await n.save(p,'before-invalid-combination');const layer=before.snapshot.overlays.find(l=>l.perspective);
 const name='Reject combined corner and progress animation';const value={format:'autopromote-scene-actions',version:1,projectId:before.id,baseRevision:before.snapshot.studioDocument.revision,name,
  actions:[{type:'keys',targetId:layer.id,keys:[{property:'perspectiveProgress',time:22.5,value:50,easing:'linear'}]}]};
 write('rejected-combination-plan.json',value);await p.getByTestId('studio-mode-fxflow').click();const panel=p.getByTestId('studio-scene-actions');if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
 await panel.getByLabel('Scene action plan',{exact:true}).setInputFiles(file('rejected-combination-plan.json'));await panel.getByRole('status').filter({hasText:'Review this plan before applying.'}).waitFor();await panel.getByRole('button',{name:'Apply reviewed scene actions',exact:true}).click();
 await panel.getByRole('status').filter({hasText:'Keep Perspective progress at 100'}).waitFor();
 const after=await n.save(p,'invalid-combination-refused');assert.equal(n.decisions(after.snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));
 await n.seek(p,25);await p.getByTestId('hook-preview-frame').screenshot({path:file('guarded-current-project.png')});write('guard-ui.json',{invalidCombinedTrajectoryRefusedBeforeMutation:true,exactProjectPreserved:true,normalDemoAuth:true});
}
async function playback(p,finished){
 await q.tool(p,'Export');if(finished){await p.getByLabel('Restore export receipt',{exact:true}).setInputFiles(file('native-motion-flow/render-receipt.json'));await p.waitForTimeout(800);const show=p.getByRole('button',{name:'Show Finished Video',exact:true});if(await show.isVisible())await show.click();await p.waitForFunction(()=>document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output'),null,{timeout:90000});}
 else{const show=p.getByRole('button',{name:'Show Live Edit',exact:true});if(await show.isVisible())await show.click();}
 if(!finished)await p.getByTestId('studio-mode-fxflow').click();
 if(finished){
  const expected=JSON.parse(fs.readFileSync(file('native-motion-flow/render-receipt.json'))).outputSha256;
  const actual=await p.getByTestId('studio-after-video').evaluate(async v=>{const r=await fetch(v.currentSrc||v.src);if(!r.ok)throw Error('Finished bytes unavailable');const bytes=await r.arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');});assert.equal(actual,expected);write('finished-file-identity.json',{sha256:actual,exactNativeReceipt:true});assert.equal(await p.locator('[data-studio-overlay-decoder]').count(),0);
 }
 await p.getByTestId('dock-tab-timeline').click();await n.seek(p,0);const stop=await recording(p,file(finished?'finished-playback':'live-playback'));const began=Date.now();
 await p.evaluate(()=>{const v=document.querySelector('[data-testid="studio-after-video"]'),first=v.getVideoPlaybackQuality(),events=[],frames=[];let handle;
  const tick=(t,m)=>{frames.push({ms:t,sourceTime:m.mediaTime,presented:m.presentedFrames});handle=v.requestVideoFrameCallback(tick);};if(v.requestVideoFrameCallback)handle=v.requestVideoFrameCallback(tick);
  const handlers=['waiting','stalled','error','ended'].map(type=>{const f=()=>events.push({type,time:v.currentTime});v.addEventListener(type,f);return[type,f];});window.__foldPlaybackEvidence=()=>{if(handle)v.cancelVideoFrameCallback(handle);handlers.forEach(([t,f])=>v.removeEventListener(t,f));const q=v.getVideoPlaybackQuality();return{events,frames,quality:{decoded:q.totalVideoFrames-first.totalVideoFrames,dropped:q.droppedVideoFrames-first.droppedVideoFrames}};};});
 try{await p.getByRole('button',{name:'Play edited preview',exact:true}).click();await p.waitForFunction(({finished,d})=>{const v=document.querySelector('[data-testid="studio-after-video"]'),c=document.querySelector('[data-testid="studio-program-canvas"]');return (finished?Number(v?.currentTime):Number(c?.dataset.programmeTime))>=d-.05||(finished&&v?.ended&&Number(v?.currentTime)>=d-.1);},{finished,d:episode?36:8},{timeout:240000});
  const terminal=await p.evaluate(()=>({programmeTime:Number(document.querySelector('[data-testid="studio-program-canvas"]')?.dataset.programmeTime),mediaTime:document.querySelector('[data-testid="studio-after-video"]')?.currentTime}));
  assert((finished?terminal.mediaTime:terminal.programmeTime)>=(episode?36:8)-.1,'The complete programme, not an intermediate source, must reach its last frame');
  if(!finished)await n.pause(p);else await p.locator('video,audio').evaluateAll(nodes=>nodes.forEach(v=>v.pause()));
  write((finished?'finished':'live')+'-playback.json',{complete:true,programmeSeconds:episode?36:8,terminal,elapsedMs:Date.now()-began,...await p.evaluate(()=>window.__foldPlaybackEvidence())});
 }catch(error){write((finished?'finished':'live')+'-playback.json',{complete:false,programmeSeconds:episode?36:8,elapsedMs:Date.now()-began,error:error.message,...await p.evaluate(()=>window.__foldPlaybackEvidence())});throw error;}finally{await stop();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--disable-gpu']});const session=file('session.private.json');const context=await browser.newContext({viewport:{width:1440,height:1100},...(fs.existsSync(session)?{storageState:session}:{})});await context.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
 const p=await context.newPage();p.setDefaultTimeout(45000);const errors=[];p.on('pageerror',e=>{errors.push(e.message);write('browser-errors.private.json',errors);});p.on('dialog',d=>void d.accept());
 try{await n.entry(p);if(phase==='create')await create(p);else if(['episode','episode-resume'].includes(phase))await episodeRevision(p,phase==='episode-resume');else if(phase==='revise')await revise(p);else{await n.open(p);if(phase==='finish'){const stop=await recording(p,file('native-finishing'));try{await finish(p);}finally{await stop();}}else if(phase==='inspect')await inspect(p);else if(phase==='reopen')await reopen(p);else if(phase==='render')await n.render(p);else if(phase==='guard')await guard(p);else if(phase==='review'){await inspect(p);await playback(p,false);await playback(p,true);}else if(phase==='guard-review'){await guard(p);await inspect(p);await playback(p,false);await playback(p,true);}else if(phase==='watch'){await playback(p,false);await playback(p,true);}else if(phase==='live')await playback(p,false);else if(phase==='finished')await playback(p,true);else throw Error('Unknown phase');}assert.deepEqual(errors,[]);write(phase+'-ui.json',{nativeControls:true,normalDemoAuth:true,headless:true,muted:true,errors});
 }catch(e){write('failure-'+Date.now()+'.json',{error:e.stack,body:await p.locator('body').innerText()});await p.screenshot({path:file('failure-'+Date.now()+'.png')});try{await n.save(p,'interrupted');await n.backup(p,'Interrupted Project');}catch{}throw e;
 }finally{await context.storageState({path:session});await context.close();await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
