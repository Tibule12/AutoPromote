#!/usr/bin/env node
// Ordinary signed-in authoring. Browser evaluation only reads saved records or
// operates an actual input; it never writes a project, identity or response.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'reports/studio-spatial-paths-20261017/proof');
process.env.STUDIO_TEMPLATE_PROOF_DIR=folder;
Object.assign(process.env,{STUDIO_QA_EXPECTED_WIDTH:'1280',STUDIO_QA_EXPECTED_HEIGHT:'720',STUDIO_QA_EXPORT_FPS:'24',STUDIO_QA_NATIVE_DOWNLOAD_METHOD:'playwright'});
const {chromium}=require('playwright'),h=require('../creative-templates/studio-proof');
const q=require('../../test/e2e/playwright/studio-stability/run'),{hash}=require('../../src/creativeTemplates/contract');
const name='Spatial Bezier motion — native controls · 20261017';
const decisions=doc=>{const {revision,journal,idempotency,...rest}=doc;return hash(rest);};
async function pause(page){const b=page.getByRole('button',{name:'Pause comparison',exact:true});if(await b.isVisible())await b.click();
  await page.locator('video,audio').evaluateAll(es=>es.forEach(e=>{e.muted=true;e.pause();}));}
async function seek(page,time){await pause(page);await page.getByLabel('Edited output position',{exact:true}).evaluate((e,v)=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(v));
  e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},time);
  await page.locator('.after-preview-loading').waitFor({state:'hidden',timeout:90000});await page.waitForTimeout(250);await pause(page);}
async function open(page){await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);}
async function recording(page){
  require('../creative-templates/proof-storage').requireProofSpace(folder);
  const dir=path.join(folder,`editing-frames-${Date.now()}.private`);fs.mkdirSync(dir,{recursive:true});
  const cdp=await page.context().newCDPSession(page),frames=[];let bytes=0,failure;
  cdp.on('Page.screencastFrame',event=>{const data=Buffer.from(event.data,'base64');bytes+=data.length;
    if(bytes>128*1024**2)failure='Editing capture exceeded128MiB';
    if(!failure){const file=path.join(dir,`${String(frames.length).padStart(6,'0')}.jpg`);fs.writeFileSync(file,data);frames.push({file,time:Date.now()/1000});}
    void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId});});
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:65,maxWidth:1600,maxHeight:1200,everyNthFrame:2});
  return async()=>{await cdp.send('Page.stopScreencast');await cdp.detach();assert(!failure,failure);assert(frames.length);
    const list=path.join(dir,'frames.ffconcat');fs.writeFileSync(list,'ffconcat version 1.0\n'+frames.map((f,i)=>`file '${f.file}'\nduration ${Math.max(.001,(frames[i+1]?.time??f.time+.1)-f.time)}\n`).join('')+`file '${frames.at(-1).file}'\n`);
    const output=path.join(folder,`editing-${Date.now()}.mp4`);
    execFileSync('ffmpeg',['-v','error','-y','-safe','0','-i',list,'-vf','fps=24','-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p',output]);
    const keep=new Set([frames[0].file,frames[Math.floor(frames.length/2)].file,frames.at(-1).file]);for(const f of frames)if(!keep.has(f.file))fs.unlinkSync(f.file);fs.unlinkSync(list);
    fs.writeFileSync(path.join(folder,'editing-recording.json'),JSON.stringify({output,frames:frames.length,seconds:frames.at(-1).time-frames[0].time,bytes,nativeControlsOnly:true,muted:true},null,2));};
}
async function dragHandle(page,label,x,y,{cancel=false}={}){
  const control=page.getByRole('button',{name:label,exact:true}),bounds=await control.boundingBox();assert(bounds);
  const svg=await page.getByTestId('studio-motion-path').boundingBox();assert(svg);
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();
  await page.mouse.move(svg.x+svg.width*x/100,svg.y+svg.height*y/100,{steps:10});
  if(cancel)await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(200);
}
async function edit(page){
  assert(!fs.existsSync(path.join(folder,'native-edit.json')),'Preserve the completed native authoring proof');
  if(await page.getByRole('button',{name,exact:true}).count())await open(page);
  else{
    await page.locator('.creator-studio-dropzone input[type=file]').setInputFiles(path.join(folder,'source.mp4'));
    await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:360000});await h.rail(page);await pause(page);
    await page.getByLabel('Project name',{exact:true}).fill(name);
    await q.tool(page,'Reframe');await page.getByTestId('reframe-aspect-16-9').click();await page.getByTestId('reframe-preserve-frame').click();
    const frame=page.getByLabel('Rounded main footage',{exact:true});if(await frame.count()&&await frame.isChecked())await frame.uncheck();
    await q.tool(page,'Sound');await page.getByLabel('Use voice repair on export',{exact:true}).uncheck();
    await q.tool(page,'Graphics');const panel=page.getByTestId('studio-graphics-import');if(!await panel.evaluate(e=>e.open))await panel.locator('summary').click();
    await page.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.join(folder,'../assets/path-study.graphics.json'));
    await panel.getByRole('status').waitFor();assert((await panel.getByRole('status').innerText()).includes('imported.'));
  }
  const before=await h.save(page,'straight-baseline'),layer=before.snapshot.overlays.find(o=>o.name==='Motion mark');assert(layer);
  const timeline=page.getByTestId('studio-pro-timeline');
  const show=timeline.getByRole('button',{name:'Show motion keyframes',exact:true});if(await show.isVisible())await show.click();
  const expand=timeline.getByRole('button',{name:'Expand Motion mark keyframes',exact:true});if(await expand.isVisible())await expand.click();
  const first=before.snapshot.motionKeyframes.find(k=>k.targetId===layer.id&&k.property==='x'&&k.time===2);assert(first);
  await timeline.getByTestId(`motion-timeline-key-${first.id}`).click();await seek(page,1);
  await page.getByRole('button',{name:'Curve path',exact:true}).waitFor();const stop=await recording(page);
  try{
    await page.getByRole('button',{name:'Curve path',exact:true}).click();const enabled=await h.save(page,'curve-enabled');
    assert(enabled.snapshot.motionKeyframes.filter(k=>k.targetId===layer.id&&k.spatialCurve).length===2);
    await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await h.save(page,'curve-undone')).snapshot.studioDocument),decisions(before.snapshot.studioDocument));
    await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await h.save(page,'curve-redone')).snapshot.studioDocument),decisions(enabled.snapshot.studioDocument));
    await dragHandle(page,'Outgoing path handle at 0.000 seconds',15,6);
    await dragHandle(page,'Incoming path handle at 2.000 seconds',85,6);
    const moved=await h.save(page,'arc-authored');
    const arc=moved.snapshot.motionKeyframes.find(k=>k.targetId===layer.id&&k.property==='y'&&k.time===2);
    assert(arc.spatialCurve.every(v=>Math.abs(v+54)<.2));
    await dragHandle(page,'Outgoing path handle at 0.000 seconds',40,40,{cancel:true});
    assert.equal(decisions((await h.save(page,'drag-cancelled')).snapshot.studioDocument),decisions(moved.snapshot.studioDocument));
    await page.getByTestId('studio-undo-button').click();const undone=await h.save(page,'handle-undone');
    assert.notDeepEqual(undone.snapshot.motionKeyframes.find(k=>k.id===arc.id).spatialCurve,arc.spatialCurve);
    await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await h.save(page,'handle-redone')).snapshot.studioDocument),decisions(moved.snapshot.studioDocument));
    for(const [start,end,a,b]of [[2,4,[85,90],[15,90]],[4,6,[20,10],[80,90]],[6,7.75,[85,15],[50,15]]]){
      await seek(page,(start+end)/2);await page.getByRole('button',{name:'Curve path',exact:true}).click();
      await dragHandle(page,`Outgoing path handle at ${start.toFixed(3)} seconds`,...a);
      await dragHandle(page,`Incoming path handle at ${end.toFixed(3)} seconds`,...b);
    }
    await seek(page,1);await page.screenshot({path:path.join(folder,'spatial-handles.png')});
    await timeline.getByRole('button',{name:'Sequence tracks',exact:true}).click();
    const row=timeline.getByTestId('pro-track-row-broll');await row.getByRole('button',{name:'Lock track',exact:true}).click();
    assert(await page.getByRole('button',{name:'Straighten path',exact:true}).isDisabled());
    await row.getByRole('button',{name:'Unlock track',exact:true}).click();
  }finally{await stop();}
  const final=await h.save(page,'final-edit');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await open(page);
  const reopened=await h.save(page,'reopened');assert.equal(hash(reopened.snapshot.studioDocument),hash(final.snapshot.studioDocument));
  fs.writeFileSync(path.join(folder,'native-edit.json'),JSON.stringify({projectId:reopened.id,canonicalHash:hash(reopened.snapshot.studioDocument),layerId:layer.id,
    keys:reopened.snapshot.motionKeyframes.filter(k=>k.targetId===layer.id),curveUndoRedo:true,handleUndoRedo:true,escapeCancel:true,trackLock:true,exactColdReopen:true,
    sourceSha256:hash(fs.readFileSync(path.join(folder,'source.mp4'))),gpuJobs:0,mocks:false,graphInjection:false},null,2));
  console.log('Native spatial handles, four curved intervals, history, cancellation, track lock and cold reopen pass.');
}
async function finishEdit(page){
  const before=await h.save(page,'completed-arc-before-final-checks'),layer=before.snapshot.overlays.find(o=>o.name==='Motion mark');assert(layer);
  assert.equal(before.snapshot.motionKeyframes.filter(k=>k.targetId===layer.id&&k.spatialCurve).length,8);
  const timeline=page.getByTestId('studio-pro-timeline');
  await q.tool(page,'Motion');await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();
  await page.getByLabel('Target layer').selectOption(layer.id);await seek(page,1);
  console.log('Transform workspace selected; checking actual track lock.');
  const stop=await recording(page);
  try{
    await timeline.getByRole('button',{name:'Sequence tracks',exact:true}).click();
    const row=timeline.getByTestId('pro-track-row-broll');await row.getByRole('button',{name:'Lock track',exact:true}).click();
    assert(await page.getByRole('button',{name:'Straighten path',exact:true}).isDisabled());
    await row.getByRole('button',{name:'Unlock track',exact:true}).click();
    console.log('Native path lock check passed.');
    const show=timeline.getByRole('button',{name:'Show motion keyframes',exact:true});if(await show.isVisible())await show.click();
    const expand=timeline.getByRole('button',{name:'Expand Motion mark keyframes',exact:true});if(await expand.isVisible())await expand.click();
    const key=before.snapshot.motionKeyframes.find(k=>k.targetId===layer.id&&k.property==='y'&&k.time===2);
    await timeline.getByTestId(`motion-timeline-key-${key.id}`).click();
    await timeline.getByRole('button',{name:'Timeline graph editor',exact:true}).click();
    const graph=page.getByLabel('Timeline property graph',{exact:true});
    for(const [label,value]of [['Start travel (%/s)',0],['End travel (%/s)',0],['Start influence (%)',65],['End influence (%)',20]]){
      const input=graph.getByLabel(label,{exact:true});await input.fill(String(value));await input.press('Enter');
    }
    const timed=await h.save(page,'travel-timing');
    const pair=timed.snapshot.motionKeyframes.filter(k=>k.targetId===layer.id&&k.time===2);
    assert(pair.every(k=>k.easing==='bezier'&&JSON.stringify(k.curve)==='[0.65,0,0.8,1]'));
    await page.getByTestId('studio-undo-button').click();assert.notEqual(decisions((await h.save(page,'travel-undone')).snapshot.studioDocument),decisions(timed.snapshot.studioDocument));
    await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await h.save(page,'travel-redone')).snapshot.studioDocument),decisions(timed.snapshot.studioDocument));
    await timeline.getByRole('button',{name:'Timeline graph editor',exact:true}).click();
    for(const [text,y]of [['MAKE THE MOVEMENT MEAN SOMETHING',4],['Position. Route. Rhythm.',97]]){
      const title=before.snapshot.overlays.find(o=>o.text===text);assert(title);
      await page.getByLabel('Target layer').selectOption(title.id);
      const input=page.getByLabel('Y',{exact:true});await input.fill(String(y));await input.blur();
    }
    await page.getByLabel('Target layer').selectOption(layer.id);await seek(page,1);
    await page.screenshot({path:path.join(folder,'final-spatial-handles.png')});
  }finally{await stop();}
  const final=await h.save(page,'final-edit');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await open(page);
  const reopened=await h.save(page,'reopened');assert.equal(hash(reopened.snapshot.studioDocument),hash(final.snapshot.studioDocument));
  fs.writeFileSync(path.join(folder,'native-edit.json'),JSON.stringify({projectId:reopened.id,canonicalHash:hash(reopened.snapshot.studioDocument),layerId:layer.id,
    keys:reopened.snapshot.motionKeyframes.filter(k=>k.targetId===layer.id),curveUndoRedo:true,handleUndoRedo:true,escapeCancel:true,trackLock:true,
    flatAxisTravelControls:true,coordinatedXyTimingUndoRedo:true,exactColdReopen:true,
    sourceSha256:hash(fs.readFileSync(path.join(folder,'source.mp4'))),gpuJobs:0,mocks:false,graphInjection:false},null,2));
  console.log('Native travel timing, flat-axis controls, lock and exact cold reopen pass.');
}
async function preview(page){
  await q.tool(page,'Export');
  // Saved completed-render access is recovered asynchronously on ordinary open.
  // Observe that native recovery before switching monitors or sampling a seek.
  await page.getByTestId('rendered-output-ready').waitFor({timeout:90000});
  const live=page.getByRole('button',{name:'Show Live Edit',exact:true});if(await live.isVisible())await live.click();
  await page.getByRole('button',{name:'Show Finished Video',exact:true}).waitFor();
  await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');
    return v&&v.readyState>=2&&!v.seeking&&!document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output');},undefined,{timeout:90000});
  console.log('Native Live Edit source ready.');
  const observations=[];
  for(const time of [.5,1,1.5,3,5,7]){
    await seek(page,time);const frame=page.getByTestId('hook-preview-frame');
    await page.waitForFunction(t=>{const v=document.querySelector('[data-testid="studio-after-video"]'),canvas=document.querySelector('[data-testid="studio-program-canvas"]');
      return v&&v.readyState>=2&&!v.seeking&&Math.abs(v.currentTime-t)<1/48&&canvas?.getAttribute('aria-busy')!=='true';},time,{timeout:90000});
    await frame.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode().catch(()=>{}))));
    await page.waitForTimeout(250);
    await frame.screenshot({path:path.join(folder,`live-${time}.png`)});
    const decoder=await page.getByTestId('studio-after-video').evaluate(v=>({time:v.currentTime,paused:v.paused,seeking:v.seeking,readyState:v.readyState}));
    observations.push({time,decoder,frame:await frame.boundingBox()});
    console.log(`Native paused preview ready at ${time}s.`);
  }
  const saved=await h.save(page,'paired-live');fs.writeFileSync(path.join(folder,'live-samples.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),observations},null,2));
  console.log('Six pre-final native canvas samples retained.');
}
async function backup(page){
  const saved=await h.save(page,'delivery');
  const receipt=JSON.parse(fs.readFileSync(path.join(folder,'curved/render-receipt.json')));
  assert.equal(hash(saved.snapshot.studioDocument),receipt.projectHash);
  const next=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download project backup',exact:true}).click();
  const download=await next,file=path.join(folder,'Spatial-path-study.autopromote.json');
  await download.saveAs(file);assert.equal(await download.failure(),null);fs.chmodSync(file,0o600);
  const restored=JSON.parse(fs.readFileSync(file));
  assert.equal(hash(restored.snapshot.studioDocument),receipt.projectHash);
  fs.writeFileSync(path.join(folder,'backup-receipt.json'),JSON.stringify({projectId:saved.id,
    canonicalHash:receipt.projectHash,backupSha256:hash(fs.readFileSync(file)),nativeDownload:true},null,2));
  console.log('Exact native project backup downloaded.');
}
async function freshRestore(){
  const file=path.join(folder,'Spatial-path-study.autopromote.json'),original=JSON.parse(fs.readFileSync(file));
  const expected=JSON.parse(fs.readFileSync(path.join(folder,'native-edit.json')));
  const receipt=JSON.parse(fs.readFileSync(path.join(folder,'curved/render-receipt.json')));
  assert.equal(hash(original.snapshot.studioDocument),receipt.projectHash);
  const browser=await chromium.launch({channel:'chromium',headless:true,
    args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1']});
  const context=await browser.newContext({storageState:path.join(root,require('../../config/daily-studio.json').authState),
    viewport:{width:1600,height:1200}}),page=await context.newPage(),writes=[];
  page.setDefaultTimeout(60000);
  page.on('request',r=>{const p=new URL(r.url()).pathname;
    if(['POST','PUT','PATCH','DELETE'].includes(r.method())&&(p==='/api/media/process'||p.startsWith('/api/content/')))writes.push(p);});
  try{
    await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
    assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
    await page.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);
    await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(file);await open(page);
    const saved=await h.save(page,'fresh-restored');
    assert.equal(saved.id,original.id);assert.equal(hash(saved.snapshot.studioDocument),receipt.projectHash);
    assert.deepEqual(saved.snapshot.motionKeyframes.filter(k=>k.targetId===expected.layerId),expected.keys);
    await q.tool(page,'Motion');await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();
    await page.getByLabel('Target layer').selectOption(expected.layerId);await seek(page,1);
    await page.screenshot({path:path.join(folder,'fresh-restored.png')});assert.equal(writes.length,0);
    fs.writeFileSync(path.join(folder,'fresh-restore-receipt.json'),JSON.stringify({projectId:saved.id,
      canonicalHash:receipt.projectHash,backupSha256:hash(fs.readFileSync(file)),exactIndependentNativeRestore:true,
      spatialIntervals:4,authBypass:false,renderingOrPublishingWrites:writes},null,2));
    console.log('Exact spatial keys restored through independent signed-in Studio; no render or publishing writes.');
  }finally{await browser.close();}
}
async function main(){
  const action=process.argv[2]||'edit';fs.mkdirSync(folder,{recursive:true});
  if(action==='restore')return freshRestore();
  const context=await chromium.launchPersistentContext(path.join(root,'reports/studio-keyframe-selection-20261015/proof/browser-profile.private'),
    {channel:'chromium',headless:true,args:['--mute-audio','--disk-cache-size=16777216','--host-resolver-rules=MAP localhost 127.0.0.1'],viewport:{width:1600,height:1200},acceptDownloads:true});
  const page=context.pages()[0];page.setDefaultTimeout(60000);let submissions=0;
  page.on('request',r=>{const p=new URL(r.url()).pathname;if(r.method()==='POST'){
    if(p==='/api/media/process')submissions++;
    assert(!/studio-3d-preview|studio-capabilities\/requests|publisher\/schedule|platform\/post/.test(p),'No model or publishing belongs to this proof');}});
  try{
    await page.goto('http://localhost:5000/?spatialPaths=20261017',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
    if(action==='edit')await edit(page);
    else{await open(page);if(action==='finish-edit')await finishEdit(page);else if(action==='preview')await preview(page);else if(action==='render')await h.render(page,'curved');
      else if(action==='view')await require('../creative-templates/materials-editing-proof').view(page,'curved');
      else if(action==='backup')await backup(page);
      else throw Error('Unknown proof action');}
    assert.equal(submissions,action==='render'?1:0);
  }catch(error){
    const stamp=Date.now();
    await page.screenshot({path:path.join(folder,`${action}-failure-${stamp}.png`)}).catch(()=>{});
    const diagnostic=await page.evaluate(()=>({
      slider:document.querySelector('[aria-label="Edited output position"]')?.value,
      rendered:document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output'),
      canvasBusy:document.querySelector('[data-testid="studio-program-canvas"]')?.getAttribute('aria-busy'),
      videos:Array.from(document.querySelectorAll('video[data-testid^="studio-"]')).map(v=>({testid:v.dataset.testid,time:v.currentTime,
        paused:v.paused,seeking:v.seeking,readyState:v.readyState,error:v.error?.code,width:v.videoWidth,height:v.videoHeight})),
    })).catch(()=>null);
    fs.writeFileSync(path.join(folder,`${action}-failure-${stamp}.json`),JSON.stringify(diagnostic,null,2));throw error;
  }
  finally{await context.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
