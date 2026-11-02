// Real isolated Studio authoring, recovery, paused picture pairs and finished
// playback. Reuses the reviewed native edit; it does not generate a new film.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),prior=path.join(root,'reports/studio-folded-space-20261101/flowing-ribbon/episode');
const out=path.resolve(process.argv[3]),phase=process.argv[4]||'inspect';
assert(out.startsWith(path.join(root,'reports/')));fs.mkdirSync(out,{recursive:true});
const file=n=>path.join(out,n),write=(n,d)=>fs.writeFileSync(file(n),JSON.stringify(d,null,2),{mode:0o600});
const expected=JSON.parse(fs.readFileSync(path.join(prior,'Editable Project.autopromote.json')));
if(!fs.existsSync(file('Editable Project.autopromote.json')))fs.copyFileSync(path.join(prior,'Editable Project.autopromote.json'),file('Editable Project.autopromote.json'));
Object.assign(process.env,{STUDIO_MOTION_VARIANT:'episode',STUDIO_MOTION_PROOF_DIR:out,STUDIO_MOTION_PROOF_TITLE:expected.name});
const n=require('./motion-flow-proof.cjs'),q=require('../../test/e2e/playwright/studio-stability/run'),{recording}=require('./kinetic-type-proof');
async function live(p){await q.tool(p,'Export');const show=p.getByRole('button',{name:'Show Live Edit',exact:true});if(await show.isVisible())await show.click();await p.getByTestId('studio-mode-fxflow').click();}
async function author(p){
 await live(p);const stop=await recording(p,file('native-controls'));try{
  const current=async name=>{await n.backup(p,name);return JSON.parse(fs.readFileSync(file(name+'.autopromote.json')));};
  const before=await n.save(p,'cold-reopened');assert.equal(n.decisions(before.snapshot.studioDocument),n.decisions(expected.snapshot.studioDocument));
  await n.seek(p,22.5);await q.tool(p,'Motion');const tab=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await tab.count())await tab.click();
  const layer=before.snapshot.overlays.find(l=>l.perspective);
  await p.getByLabel('Target layer',{exact:true}).selectOption(layer.id);
  const input=p.getByLabel('Plane top left X',{exact:true}),value=Number(await input.inputValue());await input.fill(String(value+.1));await input.press('Enter');
  const changed=await current('edited');assert.notEqual(n.decisions(changed.snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));
  await p.getByTestId('studio-undo-button').click();assert.equal(n.decisions((await current('undone')).snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));
  await p.getByTestId('studio-redo-button').click();assert.equal(n.decisions((await current('redone')).snapshot.studioDocument),n.decisions(changed.snapshot.studioDocument));
  await p.getByTestId('studio-undo-button').click();const restored=await n.save(p,'restored');assert.equal(n.decisions(restored.snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));
  await q.tool(p,'Node Flow');const panel=p.getByTestId('studio-scene-actions');if(!await panel.evaluate(e=>e.open))await panel.locator('summary').click();
  const media=restored.snapshot.projectMedia.find(m=>m.status==='ready'&&m.storagePath&&m.url&&String(m.name).endsWith('.mp4'));
  assert(media,'The real project needs an owned video source');await panel.getByLabel('Scene evidence source',{exact:true}).selectOption(media.id);
  await panel.getByRole('button',{name:'Build evidence scene plan',exact:true}).click();
  await panel.getByRole('status').filter({hasText:'Review the media and placement'}).waitFor();
  const bad={format:'autopromote-scene-actions',version:1,projectId:restored.id,baseRevision:restored.snapshot.studioDocument.revision,name:'Reject invalid corner-progress combination',actions:[{type:'keys',targetId:layer.id,keys:[{property:'perspectiveProgress',time:22.5,value:50,easing:'linear'}]}]};
  write('rejected-plan.json',bad);await panel.getByLabel('Scene action plan',{exact:true}).setInputFiles(file('rejected-plan.json'));
  await panel.getByRole('status').filter({hasText:'Review this plan before applying.'}).waitFor();await panel.getByRole('button',{name:'Apply reviewed scene actions',exact:true}).click();
  await panel.getByRole('status').filter({hasText:'Keep Perspective progress at 100'}).waitFor();
  const after=await current('rejected-without-mutation');assert.equal(n.decisions(after.snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));
  await n.backup(p,'Verified native project');await p.screenshot({path:file('native-controls.png')});
  write('native-controls.json',{normalDemoAuth:true,nativeSave:true,coldReopenExact:true,cornerEditUndoRedo:true,reviewedPlanBuildsFromCurrentSnapshot:true,invalidPlanRefusedBeforeMutation:true,canonicalDecisionsPreserved:true,layers:after.snapshot.overlays.length,keys:after.snapshot.motionKeyframes.length});
 }finally{await stop();}
}
async function inspect(p){
 await live(p);await q.tool(p,'Motion');const tab=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await tab.count())await tab.click();await p.getByLabel('Target layer',{exact:true}).selectOption('main-video');
 const guides=p.getByRole('button',{name:'⤳ Motion path',exact:true});if(await guides.getAttribute('aria-pressed')==='true')await guides.click();
 const samples=[];
 for(const t of process.env.STUDIO_QA_TIMES?JSON.parse(process.env.STUDIO_QA_TIMES):[.25,3,6,11.5,17,20.25,21,21.75,22.5,23.5,24.25,25,26,27,27.9,28,28.1,31.5,35.9]){
  await n.seek(p,t);await p.waitForFunction(t=>{const c=document.querySelector('[data-testid="studio-program-canvas"]');return c?.dataset.sourceSampling==='accurate-paused'&&Math.abs(Number(c.dataset.programmeTime)-t)<1/24&&c.getAttribute('aria-busy')!=='true';},t,{timeout:45000});await p.waitForTimeout(500);
  await p.getByTestId('hook-preview-frame').screenshot({path:file('preview-'+t.toFixed(2)+'.png')});
  samples.push({requested:t,...await p.getByTestId('studio-program-canvas').evaluate(e=>({...e.dataset})),planes:await p.locator('[data-studio-layer-id]').evaluateAll(nodes=>nodes.map(n=>{const v=n.querySelector('[data-studio-overlay-decoder]'),c=n.querySelector('[data-studio-shared-video]');return v?{id:n.dataset.studioLayerId,shared:v.dataset.sharedProgrammeFrame,owner:v.dataset.sharedFrameOwner,currentTime:v.currentTime,seeking:v.seeking,ready:v.readyState,paused:v.paused,canvasTime:c?.dataset.sourceTime,canvasShown:c?.style.display==='block'}:null;}).filter(Boolean))});
 }
 write('preview-samples.json',samples);
}
async function pause(p){
 await live(p);await p.getByTestId('dock-tab-timeline').click();await n.seek(p,1.5);
 await p.getByRole('button',{name:'Play edited preview',exact:true}).click();
 await p.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.paused&&v.currentTime>1.55;});
 await p.waitForTimeout(300);await n.pause(p);
 const stopped=await p.getByTestId('studio-after-video').evaluate(v=>v.currentTime);await p.waitForTimeout(1200);
 const held=await p.getByTestId('studio-after-video').evaluate(v=>({time:v.currentTime,paused:v.paused}));
 assert(held.paused&&Math.abs(held.time-stopped)<.001,'Operator Pause must hold the current source');
 write('pause.json',{operatorPauseHoldsSource:true,sourceTime:held.time});
}
async function finished(p){
 await q.tool(p,'Export');await p.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.join(prior,'native-motion-flow/render-receipt.json'));
 const show=p.getByRole('button',{name:'Show Finished Video',exact:true});if(await show.isVisible())await show.click();
 await p.waitForFunction(()=>document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output'));
 assert.equal(await p.locator('[data-studio-overlay-decoder]').count(),0);
 const receipt=JSON.parse(fs.readFileSync(path.join(prior,'native-motion-flow/render-receipt.json')));
 const digest=await p.getByTestId('studio-after-video').evaluate(async v=>{const r=await fetch(v.currentSrc||v.src);if(!r.ok)throw Error('Finished movie unavailable');const b=await r.arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('');});assert.equal(digest,receipt.outputSha256);
 await p.getByTestId('dock-tab-timeline').click();await n.seek(p,0);const stop=await recording(p,file('finished-playback'));try{
  await p.evaluate(()=>{const v=document.querySelector('[data-testid="studio-after-video"]'),q=v.getVideoPlaybackQuality(),events=[];for(const type of ['waiting','stalled','ended','error'])v.addEventListener(type,()=>events.push({type,time:v.currentTime}));window.__finishedQuality=()=>{const a=v.getVideoPlaybackQuality();return{mediaTime:v.currentTime,duration:v.duration,paused:v.paused,decoded:a.totalVideoFrames-q.totalVideoFrames,dropped:a.droppedVideoFrames-q.droppedVideoFrames,events};};});
  const began=Date.now();await p.getByRole('button',{name:'Play edited preview',exact:true}).click();await p.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v?.ended&&v.currentTime>=35.95;},null,{timeout:90000});
  write('finished-playback.json',{complete:true,elapsedMs:Date.now()-began,sha256:digest,...await p.evaluate(()=>window.__finishedQuality())});await n.pause(p);
 }finally{await stop();}
}
(async()=>{const browser=await chromium.launch({headless:true,args:['--mute-audio','--disable-gpu']});const context=await browser.newContext({viewport:{width:1440,height:1100},storageState:path.join(prior,'session.private.json')});await context.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['blob:','data:'].includes(u.protocol)?r.continue():r.abort();});const p=await context.newPage();p.setDefaultTimeout(45000);p.on('dialog',d=>void d.accept());const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{await n.entry(p);await n.open(p);if(phase==='author')await author(p);else if(phase==='inspect')await inspect(p);else if(phase==='finished')await finished(p);else if(phase==='pause')await pause(p);else throw Error('Unknown phase');assert.deepEqual(errors,[]);write(phase+'-ui.json',{nativeControls:true,normalDemoAuth:true,headless:true,muted:true,errors});console.log(JSON.stringify({phase,result:'PASS'}));}
 catch(e){write(phase+'-failure.json',{error:e.stack,errors,body:await p.locator('body').innerText().catch(()=> 'Page unavailable')});await p.screenshot({path:file(phase+'-failure.png')}).catch(()=>{});throw e;}
 finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
