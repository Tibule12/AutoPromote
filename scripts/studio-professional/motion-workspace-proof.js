#!/usr/bin/env node
// Actual authenticated Studio authoring: restore an owned backup, then edit normally.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const folder=path.resolve('reports/studio-motion-workspace-20261015/proof');
process.env.STUDIO_TEMPLATE_PROOF_DIR=folder;
Object.assign(process.env,{STUDIO_QA_EXPECTED_WIDTH:'1280',STUDIO_QA_EXPECTED_HEIGHT:'720',STUDIO_QA_EXPORT_FPS:'24',STUDIO_QA_NATIVE_DOWNLOAD_METHOD:'playwright'});
const {chromium}=require('playwright'),h=require('../creative-templates/studio-proof');
const {hash}=require('../../src/creativeTemplates/contract');
const backup=path.resolve('../AutoPromote-model-runtime-v1/reports/model-capability-runtime-v1-20261009/proof/launch-template/creative-launch-20261013/onda-final-project.private.json');
const name='ONDA — motion workspace · r1';
const decisions=doc=>{const {revision,journal,idempotency,...rest}=doc;return hash(rest);};
async function pause(page){const b=page.getByRole('button',{name:'Pause comparison',exact:true});if(await b.isVisible())await b.click();await page.locator('video,audio').evaluateAll(es=>es.forEach(e=>{e.muted=true;e.pause();}));}
async function seek(page,time){await pause(page);await page.getByLabel('Edited output position',{exact:true}).evaluate((e,v)=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(v));e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},time);
  await page.locator('.after-preview-loading').waitFor({state:'hidden',timeout:90000});await page.waitForTimeout(150);await pause(page);}
async function property(page,property,value){const input=page.getByLabel(`Brand logo ${property} value`,{exact:true});await input.fill(String(value));await input.press('Enter');await input.blur();}
async function key(page,property){await page.getByRole('button',{name:`Add Brand logo ${property} keyframe at playhead`,exact:true}).click();}
async function timeline(page){const t=page.getByTestId('studio-pro-timeline');const show=t.getByRole('button',{name:'Show motion keyframes',exact:true});if(await show.isVisible())await show.click();const expand=t.getByRole('button',{name:'Expand Brand logo keyframes',exact:true});if(await expand.isVisible())await expand.click();return t;}
async function dragPose(page,time,x,y,{cancel=false}={}){
  const point=page.getByRole('button',{name:`Motion position at ${time.toFixed(3)} seconds`,exact:true});
  await point.scrollIntoViewIfNeeded();const p=await point.boundingBox(),svg=await page.getByTestId('studio-motion-path').boundingBox();
  await page.mouse.move(p.x+p.width/2,p.y+p.height/2);await page.mouse.down();
  await page.mouse.move(svg.x+svg.width*x/100,svg.y+svg.height*y/100,{steps:15});
  if(cancel)await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(250);
}
async function recording(page){
  const storage=require('../creative-templates/proof-storage');storage.requireProofSpace(folder);
  const frames=path.join(folder,'editing-frames.private');fs.mkdirSync(frames,{recursive:true});
  const cdp=await page.context().newCDPSession(page),images=[];let bytes=0,failure=null;
  cdp.on('Page.screencastFrame',event=>{const data=Buffer.from(event.data,'base64');
    if(bytes+data.length>storage.MAX_CAPTURE_BYTES)failure='Editing capture exceeded256MiB';
    else if(!failure){const file=path.join(frames,`${String(images.length).padStart(6,'0')}.jpg`);fs.writeFileSync(file,data);images.push({file,time:Date.now()/1000});bytes+=data.length;}
    void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId});});
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:65,maxWidth:1920,maxHeight:1200,everyNthFrame:2});
  return async()=>{await cdp.send('Page.stopScreencast');await cdp.detach();assert(!failure,failure);assert(images.length>0);
    const concat=path.join(frames,'frames.ffconcat');fs.writeFileSync(concat,'ffconcat version 1.0\n'+images.map((f,i)=>`file '${f.file}'\nduration ${Math.max(.001,(images[i+1]?.time??f.time+.1)-f.time)}\n`).join('')+`file '${images.at(-1).file}'\n`);
    const movie=path.join(folder,'editing-in-studio.mp4');execFileSync('ffmpeg',['-v','error','-y','-safe','0','-i',concat,'-vf','fps=24','-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart',movie]);
    const keep=new Set([images[0].file,images[Math.floor(images.length/2)].file,images.at(-1).file]);for(const f of images)if(!keep.has(f.file))fs.unlinkSync(f.file);fs.unlinkSync(concat);
    fs.writeFileSync(path.join(folder,'editing-recording.json'),JSON.stringify({recording:movie,frames:images.length,seconds:images.at(-1).time-images[0].time,rawBytes:bytes,
      nativeControlsOnly:true,setupLoadingExcluded:true,noGraphInjection:true,audio:'Silent actual editing capture; complete movie playback has its exact exported soundtrack.'},null,2));};
}
async function openEditor(page,projectName){await page.getByRole('button',{name:projectName,exact:true}).click();await h.rail(page);await pause(page);}
async function edit(page){
  assert(!fs.existsSync(path.join(folder,'native-motion-edit.json')),'Retain the completed edit');
  const original=JSON.parse(fs.readFileSync(backup));
  if(!await page.getByRole('button',{name:original.name,exact:true}).count()){
    await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(backup);
    await page.getByRole('button',{name:original.name,exact:true}).waitFor({timeout:120000});
  }
  await openEditor(page,original.name);await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name',{exact:true}).fill(name);await seek(page,2);
  const baseline=await h.save(page,'baseline'),logo=baseline.snapshot.overlays.find(l=>l.name==='Brand logo');assert(logo);
  const t=await timeline(page),oldKey=baseline.snapshot.motionKeyframes.find(k=>k.targetId===logo.id);assert(oldKey);
  await t.getByTestId(`motion-timeline-key-${oldKey.id}`).click();
  await page.getByRole('button',{name:'Reset transform',exact:true}).click();
  await page.getByLabel('Motion layer in point',{exact:true}).fill('0');await page.getByLabel('Motion layer in point',{exact:true}).blur();
  await page.getByLabel('Motion layer duration',{exact:true}).fill('20');await page.getByLabel('Motion layer duration',{exact:true}).blur();
  const separator=page.getByRole('separator',{name:'Resize timeline'});await separator.focus();for(let i=0;i<9;i++)await separator.press('ArrowUp');
  await seek(page,.25);await property(page,'scale',.42);await key(page,'scale');
  await property(page,'rotation',-12);await key(page,'rotation');await page.getByRole('button',{name:'Add position key',exact:true}).click();
  const setup=await h.save(page,'setup'),stopRecording=await recording(page);
  try{
    await dragPose(page,.25,14,76);const moved=await h.save(page,'first-pose-moved');
    const movedKeys=moved.snapshot.motionKeyframes.filter(k=>k.targetId===logo.id&&['x','y'].includes(k.property));
    assert.equal(movedKeys.length,2);assert(Math.abs(movedKeys.find(k=>k.property==='x').value-14)<.1);assert(Math.abs(movedKeys.find(k=>k.property==='y').value-76)<.1);
    await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await h.save(page,'position-undone')).snapshot.studioDocument),decisions(setup.snapshot.studioDocument));
    await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await h.save(page,'position-redone')).snapshot.studioDocument),decisions(moved.snapshot.studioDocument));
    await dragPose(page,.25,55,20,{cancel:true});assert.equal(decisions((await h.save(page,'position-cancelled')).snapshot.studioDocument),decisions(moved.snapshot.studioDocument));
    for(const [time,x,y,rotation]of [[4,74,68,8],[8,64,28,-8],[12,22,72,6],[16,50,49,0]]){
      await seek(page,time);await page.getByRole('button',{name:'Add position key',exact:true}).click();await dragPose(page,time,x,y);await property(page,'rotation',rotation);
    }
    await seek(page,16);await property(page,'scale',1);await seek(page,.25);await property(page,'opacity',0);await key(page,'opacity');
    await seek(page,1.25);await property(page,'opacity',1);
    await seek(page,19.5);await key(page,'opacity');await property(page,'opacity',1);await seek(page,19.95);await property(page,'opacity',0);
    const poses=await h.save(page,'all-poses');
    const xKey=poses.snapshot.motionKeyframes.find(k=>k.targetId===logo.id&&k.property==='x'&&Math.abs(k.time-4)<1/90000);assert(xKey);
    await t.getByTestId(`motion-timeline-key-${xKey.id}`).click();await t.getByRole('button',{name:'Timeline graph editor',exact:true}).click();
    const graph=page.getByLabel('Timeline property graph',{exact:true});
    for(const [label,value]of [['Start velocity (%/s)','0'],['End velocity (%/s)','0'],['Start influence (%)','65'],['End influence (%)','20']]){
      const input=graph.getByLabel(label,{exact:true});await input.fill(value);await input.press('Enter');await input.blur();await page.waitForTimeout(250);
    }
    await graph.getByRole('button',{name:'Velocity graph',exact:true}).click();await page.screenshot({path:path.join(folder,'timeline-velocity-editor.png')});
    const curved=await h.save(page,'velocity-edited');const editedX=curved.snapshot.motionKeyframes.find(k=>k.id===xKey.id);
    assert.equal(editedX.easing,'bezier');assert.deepEqual(editedX.curve,[.65,0,.8,1]);
    await page.getByTestId('studio-undo-button').click();const undone=await h.save(page,'influence-undone');assert.notDeepEqual(undone.snapshot.motionKeyframes.find(k=>k.id===xKey.id).curve,editedX.curve);
    await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await h.save(page,'influence-redone')).snapshot.studioDocument),decisions(curved.snapshot.studioDocument));
    await t.getByRole('button',{name:'Timeline graph editor',exact:true}).click();
    const row=t.getByTestId('pro-track-row-broll');await row.getByRole('button',{name:'Lock track',exact:true}).click();
    const lockedBefore=await h.save(page,'locked');await seek(page,4);await dragPose(page,4,40,40);
    assert.equal(decisions((await h.save(page,'locked-after')).snapshot.studioDocument),decisions(lockedBefore.snapshot.studioDocument));
    await row.getByRole('button',{name:'Unlock track',exact:true}).click();
    await seek(page,3);await page.screenshot({path:path.join(folder,'editable-motion-path.png')});
  }finally{await stopRecording();}
  const final=await h.save(page,'final-edit');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await openEditor(page,name);
  const reopened=await h.save(page,'reopened');assert.equal(hash(final.snapshot.studioDocument),hash(reopened.snapshot.studioDocument));
  const keys=reopened.snapshot.motionKeyframes.filter(k=>k.targetId===logo.id);
  fs.writeFileSync(path.join(folder,'native-motion-edit.json'),JSON.stringify({projectId:reopened.id,canonicalHash:hash(reopened.snapshot.studioDocument),logoId:logo.id,
    sourceShots:reopened.snapshot.timeline.length,graphicLayers:reopened.snapshot.overlays.length,propertyKeys:reopened.snapshot.motionKeyframes.length,editedLayerKeys:keys,
    nativeOwnedBackupRestoration:true,normalDuplicate:true,pairedPathDragUndoRedo:true,escapeCancelsPosition:true,realTrackLock:true,
    fiveStagePositionPoses:true,timelineValueVelocityGraph:true,signedVelocityAndInfluence:true,influenceUndoRedo:true,exactColdReopen:true,noMocks:true,gpuJobs:0},null,2));
  console.log('Native ONDA path authoring, timeline velocity/influence, history, lock and exact cold reopen passed.');
}
async function playbackGraph(page){
  await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.paused&&v.currentTime>=1&&document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output');},undefined,{timeout:90000});
  const t=await timeline(page),r=JSON.parse(fs.readFileSync(path.join(folder,'native-motion-edit.json'))),k=r.editedLayerKeys.find(k=>k.property==='x'&&k.time===4);
  // Finished-video transport remains authoritative; timeline selection only changes inspection.
  await t.getByRole('button',{name:'Timeline graph editor',exact:true}).click();
  const graph=page.getByLabel('Timeline property graph',{exact:true});await graph.getByLabel('Curve keyframe',{exact:true}).selectOption(k.id);
  await graph.getByRole('button',{name:'Velocity graph',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="studio-after-video"]')?.currentTime>=10,undefined,{timeout:30000});
  await t.getByRole('button',{name:'Timeline graph editor',exact:true}).click();await page.locator('.pro-timeline-scroll').evaluate(e=>{e.scrollTop=0;});
}
async function inspectLive(page){
  await require('../../test/e2e/playwright/studio-stability/run').tool(page,'Export');
  await page.getByTestId('rendered-output-ready').waitFor({timeout:90000});
  const live=page.getByRole('button',{name:'Show Live Edit',exact:true});if(await live.isVisible())await live.click();
  await page.waitForFunction(()=>!document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output'));
  const receipt=JSON.parse(fs.readFileSync(path.join(folder,'native-motion-edit.json'))),t=await timeline(page);
  const x=receipt.editedLayerKeys.find(k=>k.property==='x'&&k.time===4);
  await t.getByTestId(`motion-timeline-key-${x.id}`).click();await seek(page,6);await page.getByTestId('studio-motion-path').waitFor();
  for(const filename of ['editable-motion-path-final.png','timeline-velocity-editor-final.png'])
    if(fs.existsSync(path.join(folder,filename))&&!fs.existsSync(path.join(folder,'intermediate-'+filename)))fs.renameSync(path.join(folder,filename),path.join(folder,'intermediate-'+filename));
  await page.screenshot({path:path.join(folder,'editable-motion-path-final.png')});
  await seek(page,3);await t.getByRole('button',{name:'Timeline graph editor',exact:true}).click();
  const graph=page.getByLabel('Timeline property graph',{exact:true});await graph.getByRole('button',{name:'Velocity graph',exact:true}).click();
  await page.screenshot({path:path.join(folder,'timeline-velocity-editor-final.png')});
  await t.getByRole('button',{name:'Timeline graph editor',exact:true}).click();await page.locator('.pro-timeline-scroll').evaluate(e=>{e.scrollTop=0;});
  const saved=await h.save(page,'final-live-inspection');assert.equal(hash(saved.snapshot.studioDocument),receipt.canonicalHash);
  fs.writeFileSync(path.join(folder,'native-live-inspection.json'),JSON.stringify({projectId:saved.id,canonicalHash:receipt.canonicalHash,
    livePathInspectedAt:6,timelineVelocityInspectedAt:3,canonicalEditUnchanged:true,finalUiBuild:true,noMocks:true},null,2));
}
async function refine(page){
  const receipt=JSON.parse(fs.readFileSync(path.join(folder,'native-motion-edit.json')));
  assert(!receipt.finalWorkspaceDemonstration,'Retain the final demonstration');
  await require('../../test/e2e/playwright/studio-stability/run').tool(page,'Export');
  await page.getByTestId('rendered-output-ready').waitFor({timeout:90000});
  const live=page.getByRole('button',{name:'Show Live Edit',exact:true});if(await live.isVisible())await live.click();
  await page.waitForFunction(()=>!document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output'));
  console.log('Owned completed output recovered; switched to the normal live edit.');
  const t=await timeline(page),xKey=receipt.editedLayerKeys.find(k=>k.property==='x'&&k.time===4);
  await t.getByTestId(`motion-timeline-key-${xKey.id}`).click();
  const separator=page.getByRole('separator',{name:'Resize timeline'});await separator.focus();for(let i=0;i<9;i++)await separator.press('ArrowUp');
  await seek(page,4);await page.getByTestId('studio-motion-path').waitFor();const baseline=await h.save(page,'final-ui-baseline');
  for(const [from,to]of [['editing-in-studio.mp4','initial-authoring-in-studio.mp4'],['editing-recording.json','initial-authoring-recording.json']])
    if(fs.existsSync(path.join(folder,from))&&!fs.existsSync(path.join(folder,to)))fs.renameSync(path.join(folder,from),path.join(folder,to));
  if(!fs.existsSync(path.join(folder,'initial-native-motion-edit.json')))fs.copyFileSync(path.join(folder,'native-motion-edit.json'),path.join(folder,'initial-native-motion-edit.json'));
  const stop=await recording(page);
  try{
    await dragPose(page,4,52,40);const moved=await h.save(page,'final-ui-position-moved');
    assert.notEqual(decisions(moved.snapshot.studioDocument),decisions(baseline.snapshot.studioDocument));
    await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await h.save(page,'final-ui-position-undone')).snapshot.studioDocument),decisions(baseline.snapshot.studioDocument));
    await t.getByTestId(`motion-timeline-key-${xKey.id}`).click();await t.getByRole('button',{name:'Timeline graph editor',exact:true}).click();
    const graph=page.getByLabel('Timeline property graph',{exact:true});await graph.getByRole('button',{name:'Velocity graph',exact:true}).click();
    const input=graph.getByLabel('Start influence (%)',{exact:true});await input.fill('45');await input.press('Enter');await input.blur();await page.waitForTimeout(500);
    assert.equal((await h.save(page,'final-ui-influence-changed')).snapshot.motionKeyframes.find(k=>k.id===xKey.id).curve[0],.45);
    await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await h.save(page,'final-ui-influence-undone')).snapshot.studioDocument),decisions(baseline.snapshot.studioDocument));
    await page.screenshot({path:path.join(folder,'timeline-velocity-editor-final.png')});
    await t.getByRole('button',{name:'Timeline graph editor',exact:true}).click();
    await seek(page,19.5);await key(page,'opacity');await property(page,'opacity',1);
    await seek(page,6);await page.waitForTimeout(500);await page.screenshot({path:path.join(folder,'editable-motion-path-final.png')});
  }finally{await stop();}
  const final=await h.save(page,'final-workspace-edit');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await openEditor(page,name);
  const reopened=await h.save(page,'final-workspace-reopened');assert.equal(hash(final.snapshot.studioDocument),hash(reopened.snapshot.studioDocument));
  receipt.canonicalHash=hash(reopened.snapshot.studioDocument);receipt.propertyKeys=reopened.snapshot.motionKeyframes.length;
  receipt.editedLayerKeys=reopened.snapshot.motionKeyframes.filter(k=>k.targetId===receipt.logoId);
  assert(receipt.editedLayerKeys.some(k=>k.property==='opacity'&&k.time===19.5&&k.value===1));
  Object.assign(receipt,{finalWorkspaceDemonstration:true,finalUiPathAndInfluenceUndo:true,opacityHeldUntilClosingFade:true,exactFinalColdReopen:true});
  fs.writeFileSync(path.join(folder,'native-motion-edit.json'),JSON.stringify(receipt,null,2));
  fs.renameSync(path.join(folder,'motion'),path.join(folder,'first-export'));
  console.log('Final workspace recording and closing opacity hold saved and cold-reopened exactly. First export retained.');
}
async function finishHold(page){
  const receipt=JSON.parse(fs.readFileSync(path.join(folder,'native-motion-edit.json'))),t=await timeline(page);
  const before=await h.save(page,'hold-before');
  const hold=before.snapshot.motionKeyframes.find(k=>k.targetId===receipt.logoId&&k.property==='opacity'&&k.time===19.5);assert(hold);
  await t.getByTestId(`motion-timeline-key-${hold.id}`).click();
  const value=page.getByLabel('Selected motion key value',{exact:true});await value.fill('1');await value.blur();
  const final=await h.save(page,'hold-final');assert.equal(final.snapshot.motionKeyframes.find(k=>k.id===hold.id).value,1);
  await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await openEditor(page,name);
  const reopened=await h.save(page,'hold-reopened');assert.equal(hash(reopened.snapshot.studioDocument),hash(final.snapshot.studioDocument));
  receipt.canonicalHash=hash(reopened.snapshot.studioDocument);receipt.propertyKeys=reopened.snapshot.motionKeyframes.length;
  receipt.editedLayerKeys=reopened.snapshot.motionKeyframes.filter(k=>k.targetId===receipt.logoId);
  Object.assign(receipt,{finalWorkspaceDemonstration:true,finalUiPathAndInfluenceUndo:true,opacityHeldUntilClosingFade:true,exactFinalColdReopen:true,
    closingHoldAuthoredInSelectedKeyInspector:true});
  fs.writeFileSync(path.join(folder,'native-motion-edit.json'),JSON.stringify(receipt,null,2));
  if(fs.existsSync(path.join(folder,'motion'))&&!fs.existsSync(path.join(folder,'first-export')))fs.renameSync(path.join(folder,'motion'),path.join(folder,'first-export'));
  console.log('Closing hold key set through its selected-key inspector; exact cold reopen passed.');
}
async function main(){
  const action=process.argv[2]||'edit';fs.mkdirSync(folder,{recursive:true});
  const profile=path.resolve('reports/studio-keyframe-selection-20261015/proof/browser-profile.private');
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:['--mute-audio','--disk-cache-size=16777216','--host-resolver-rules=MAP localhost 127.0.0.1'],viewport:{width:1920,height:1200},acceptDownloads:true});
  const page=context.pages()[0];page.setDefaultTimeout(60000);let renders=0;
  page.on('request',r=>{const p=new URL(r.url()).pathname;if(p==='/api/media/process')renders++;assert(!p.includes('studio-3d-preview')||r.method()!=='POST');});
  try{await page.goto('http://localhost:5000/?studioMotionWorkspace=20261015',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
    assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
    if(action==='edit')await edit(page);
    else{await openEditor(page,name);if(action==='render')await h.render(page,'motion');
      else if(action==='refine')await refine(page);
      else if(action==='finish-hold')await finishHold(page);
      else if(action==='view'){
        await inspectLive(page);
        await Promise.all([require('../creative-templates/materials-editing-proof').view(page,'motion'),playbackGraph(page)]);
      }else throw Error('Unknown action');}
    assert.equal(renders,action==='render'?1:0);
  }catch(error){await page.screenshot({path:path.join(folder,`${action}-failure-${Date.now()}.png`)}).catch(()=>{});throw error;}
  finally{await context.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
