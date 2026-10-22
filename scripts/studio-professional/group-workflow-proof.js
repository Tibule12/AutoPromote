#!/usr/bin/env node
// Normal authenticated Studio restore/edit/save/export. Retained real footage,
// editable project, original soundtrack and sources; no injected project state.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const folder=path.resolve(__dirname,'../../reports/studio-professional-group-workflow-20261014/proof');
process.env.STUDIO_TEMPLATE_PROOF_DIR=folder;
Object.assign(process.env,{STUDIO_QA_EXPECTED_WIDTH:'1280',STUDIO_QA_EXPECTED_HEIGHT:'720',STUDIO_QA_EXPORT_FPS:'24',STUDIO_QA_NATIVE_DOWNLOAD_METHOD:'playwright'});
const {chromium}=require('playwright'),h=require('../creative-templates/studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {hash}=require('../../src/creativeTemplates/contract');
const root=path.resolve(__dirname,'../..'),name='Professional timeline — footage and grouped titles · r2';
const originalName='EMBER — editorial launch · v1.1.2';
const backup=path.resolve(root,'../AutoPromote-model-runtime-v1/reports/model-capability-runtime-v1-20261009/proof/launch-template/creative-launch-20261013/ember-final-project.private.json');
const decisions=doc=>{const {revision,journal,idempotency,...content}=doc;return hash(content);};
const pause=async page=>{const b=page.getByRole('button',{name:'Pause comparison',exact:true});if(await b.isVisible())await b.click();await page.locator('video,audio').evaluateAll(es=>es.forEach(e=>{e.muted=true;e.pause();}));};
async function range(input,value){await input.evaluate((e,n)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(n));e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},value);}
async function seek(page,time){await pause(page);await range(page.getByLabel('Edited output position',{exact:true}),time);await page.waitForTimeout(400);await pause(page);}
async function number(page,label,value){await page.getByLabel(label,{exact:true}).fill(String(value));await page.getByLabel(label,{exact:true}).press('Enter');}
async function resize(page){const s=page.getByRole('separator',{name:'Resize timeline',exact:true});await s.focus();for(let i=0;i<20;i++)await s.press('ArrowUp');await page.keyboard.press('Escape');}
async function edit(page){
 const prefix=`workflow-${Date.now()}`;
 assert(!fs.existsSync(path.join(folder,'workflow-native-edit.json')),'Preserve the completed workflow');
 if(!await page.getByRole('button',{name,exact:true}).count()){
  if(!await page.getByRole('button',{name:originalName,exact:true}).count()){
   await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(backup);
   await page.getByRole('button',{name:originalName,exact:true}).waitFor({timeout:120000});
  }
  await page.getByRole('button',{name:originalName,exact:true}).click();await h.rail(page);await pause(page);
  await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name',{exact:true}).fill(name);
 }else{await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);}
 await q.tool(page,'Export');await page.getByLabel('Export frame rate',{exact:true}).selectOption('24');
 await page.getByLabel('Export resolution',{exact:true}).selectOption('720p');
 const original=await h.save(page,`${prefix}-original`);
 assert(original.snapshot.timeline.length>=3);assert(original.snapshot.overlays.length>=3);
 assert(!original.snapshot.threeDScenes.length&&!original.snapshot.subjectVfxScenes.length,'Deterministic CPU edit only');
 const initialDuration=original.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick/90000;
 assert(initialDuration<=21,'Bounded existing real footage project');
 await resize(page);await seek(page,1);await q.tool(page,'Composite');
 const panel=page.getByRole('region',{name:'Graphic groups',exact:true});
 let group=original.snapshot.compoundClips.find(g=>g.kind==='graphic_group');
 const titles=original.snapshot.overlays.filter(o=>['opening-label','hook-line-1','hook-line-2'].includes(o.name));assert.equal(titles.length,3);
 if(!group){
  for(const title of titles)await panel.getByRole('checkbox',{name:`Group selection ${title.name}`,exact:true}).check();
  await panel.getByRole('button',{name:'Group selected layers',exact:true}).click();
  group=(await h.save(page,`${prefix}-grouped`)).snapshot.compoundClips.find(g=>g.kind==='graphic_group');
 }
 assert(group);const label=group.name;
 const baseline=await h.save(page,`${prefix}-baseline`),timeline=page.getByTestId('studio-pro-timeline');
 const groupBar=timeline.getByTestId(`group-timeline-clip-${group.id}`),button=groupBar.getByRole('button',{name:`Select ${label} group clip`,exact:true});
 await button.click();assert(await page.getByLabel(`${label} move to (seconds)`,{exact:true}).isVisible());
 // Native pointer gesture: the real lane geometry and normal pointer capture.
 const start=Number(await groupBar.getAttribute('data-start')),end=Number(await groupBar.getAttribute('data-end'));
 const beforeMove=await h.save(page,`${prefix}-before-move`),box=await button.boundingBox();
 const lane=await groupBar.locator('..').boundingBox();
 await page.mouse.move(box.x+Math.min(box.width/2,80),box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(box.x+Math.min(box.width/2,80)+lane.width*.5/initialDuration,box.y+box.height/2,{steps:8});await page.mouse.up();
 const moved=await h.save(page,`${prefix}-pointer-moved`);const nextGroup=moved.snapshot.compoundClips.find(g=>g.id===group.id);
 const delta=nextGroup.timing.startTime-start;assert(delta>0);
 for(const title of titles){
  const next=moved.snapshot.overlays.find(o=>o.id===title.id);assert(Math.abs(next.startTime-title.startTime-delta)<1/90000);
  const prior=baseline.snapshot.motionKeyframes.filter(k=>k.targetId===title.id),current=moved.snapshot.motionKeyframes.filter(k=>k.targetId===title.id);
  assert.deepEqual(current,prior.map(k=>({...k,time:Math.round((k.time+delta)*90000)/90000})));
 }
 await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await h.save(page,`${prefix}-move-undone`)).snapshot.studioDocument),decisions(beforeMove.snapshot.studioDocument));
 await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await h.save(page,`${prefix}-move-redone`)).snapshot.studioDocument),decisions(moved.snapshot.studioDocument));
 // Numeric timing, animation and trim are the same group transaction/graph.
 await number(page,`${label} move to (seconds)`,.5);
 await number(page,`${label} in (seconds)`,.75);await number(page,`${label} out (seconds)`,2);
 await seek(page,.75);
 await panel.getByRole('button',{name:`Add ${label} opacity keyframe at playhead`,exact:true}).click();
 await number(page,`${label} opacity`,0);
 await seek(page,1);await number(page,`${label} opacity`,1);
 const animated=await h.save(page,`${prefix}-animated`);const keys=animated.snapshot.motionKeyframes;
 assert.equal(keys.filter(k=>k.targetId===group.id).length,2);
 // Trim at an existing frame. No child key or source phase is rewritten.
 await groupBar.getByRole('button',{name:`Trim ${label} out`,exact:true}).focus();await page.keyboard.press('ArrowLeft');
 const trimmed=await h.save(page,`${prefix}-trimmed`);assert.deepEqual(trimmed.snapshot.motionKeyframes,keys);
 assert(Math.abs(trimmed.snapshot.compoundClips.find(g=>g.id===group.id).timing.duration-(2-.75-1/24))<1/90000);
 await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await h.save(page,`${prefix}-trim-undone`)).snapshot.studioDocument),decisions(animated.snapshot.studioDocument));
 await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await h.save(page,`${prefix}-trim-redone`)).snapshot.studioDocument),decisions(trimmed.snapshot.studioDocument));
 const graphics=timeline.getByTestId('pro-track-row-graphics');await graphics.getByRole('button',{name:'Lock track',exact:true}).click();
 assert(await groupBar.getByRole('button',{name:`Trim ${label} out`,exact:true}).isDisabled());
 await q.tool(page,'Composite');assert(await page.getByLabel(`${label} move to (seconds)`,{exact:true}).isDisabled());
 await graphics.getByRole('button',{name:'Unlock track',exact:true}).click();
 await page.getByRole('button',{name:`Delete ${label} and layers`,exact:true}).click();
 const deleted=await h.save(page,`${prefix}-deleted`);assert(!deleted.snapshot.compoundClips.some(g=>g.id===group.id));assert(!deleted.snapshot.overlays.some(o=>titles.some(t=>t.id===o.id)));
 await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await h.save(page,`${prefix}-delete-undone`)).snapshot.studioDocument),decisions(trimmed.snapshot.studioDocument));
 // Real source editing: split the selected shot, undo and redo its occurrence.
 await seek(page,3);await timeline.getByTestId('pro-video-clip-2').click();await seek(page,3);
 const beforeSplit=await h.save(page,`${prefix}-before-split`);await timeline.getByTestId('pro-quick-split').click();
 const split=await h.save(page,`${prefix}-split`);assert.equal(split.snapshot.timeline.length,beforeSplit.snapshot.timeline.length+1);
 assert.deepEqual(split.snapshot.compoundClips,beforeSplit.snapshot.compoundClips);
 await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await h.save(page,`${prefix}-split-undone`)).snapshot.studioDocument),decisions(beforeSplit.snapshot.studioDocument));
 await page.getByTestId('studio-redo-button').click();const redone=await h.save(page,`${prefix}-split-redone`);assert.equal(decisions(redone.snapshot.studioDocument),decisions(split.snapshot.studioDocument));
 await seek(page,1);await q.tool(page,'Composite');await button.click();
 await timeline.getByRole('button',{name:'Show motion keyframes',exact:true}).click();
 await timeline.getByRole('button',{name:`Expand ${label} keyframes`,exact:true}).click();
 await page.screenshot({path:path.join(folder,'workflow-native-timeline.png')});
 const saved=await h.save(page,`${prefix}-saved`);await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);
 const reopened=await h.save(page,`${prefix}-reopened`);assert.equal(hash(reopened.snapshot.studioDocument),hash(saved.snapshot.studioDocument));
 fs.writeFileSync(path.join(folder,'workflow-native-edit.json'),JSON.stringify({projectId:reopened.id,canonicalHash:hash(reopened.snapshot.studioDocument),baselineProjectId:original.id,baselineCanonicalHash:hash(original.snapshot.studioDocument),templateRef:reopened.snapshot.creativeTemplateInstance.templateRef,
 groups:reopened.snapshot.compoundClips,groupId:group.id,ownedTitleIds:titles.map(t=>t.id),duration:initialDuration,pointerMoveDelta:delta,clips:reopened.snapshot.timeline.length,propertyKeys:reopened.snapshot.motionKeyframes.length,groupKeys:2,
 nativePointerMove:true,atomicMoveUndoRedo:true,frameTrimUndoRedo:true,childKeysAndPhasesPreserved:true,groupDeleteUndo:true,sourceSplitUndoRedo:true,graphicsLock:true,saveColdReopen:true,noMocks:true,gpuJobs:0},null,2));
}
async function main(){
 const action=process.argv[2]||'edit';fs.mkdirSync(folder,{recursive:true});
 const context=await chromium.launchPersistentContext(path.join(folder,'browser-profile.private'),{channel:'chromium',headless:true,
 args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1'],viewport:{width:1600,height:1900},acceptDownloads:true,
 ...(action==='edit'?{recordVideo:{dir:path.join(folder,'workflow-recording.private'),size:{width:1600,height:1900}}}:{})});
 const page=context.pages()[0];page.setDefaultTimeout(45000);let renders=0,gpu=0;
 page.on('request',req=>{const p=new URL(req.url()).pathname;if(p==='/api/media/process')renders++;if(p.includes('studio-3d-preview')&&req.method()==='POST')gpu++;});
 try{
  // Restore the founder's actual retained login before loading the App. Keep
  // newer project stores; an empty document avoids open IndexedDB connections
  // blocking Playwright's storage-state recovery. No application/API is mocked.
  const session=require('../creative-templates/studio-session');
  const route=async request=>request.fulfill({contentType:'text/html',body:'<!doctype html><title>Private session recovery</title>'});
  await context.route('http://localhost:5000/',route);
  await page.goto('http://localhost:5000/');
  // Persistent contexts report only origins visited during this launch.
  const current=await context.storageState({indexedDB:true});
  if(!session.authenticatedLocalState(current)){
   const recoveryPath=path.join(require('node:os').homedir(),'.local/share/autopromote-qa/session/studio-session.private.json.gz');
   const recovery=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(recoveryPath)));
   assert(session.authenticatedLocalState(recovery),'Actual retained login is required');
   await context.setStorageState(session.mergeSessionRecovery(current,recovery));
   console.log('Actual retained login restored; current native project stores preserved.');
  }
  await context.unroute('http://localhost:5000/',route);
  await page.goto('http://localhost:5000/?studioProfessionalSession=group-workflow');await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
  if(action==='prepare'){
   if(!await page.getByRole('button',{name:originalName,exact:true}).count()){
    await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(backup);
    await page.getByRole('button',{name:originalName,exact:true}).waitFor({timeout:120000});
   }
   console.log('Existing footage project restored through owned-media checks.');
  }
  else if(action==='edit')await edit(page);
  else {
   if(!await page.getByRole('button',{name,exact:true}).count()){
    await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,'workflow-live-project.private.json'));
    await page.getByRole('button',{name,exact:true}).waitFor({timeout:120000});
    console.log('Completed edit restored through ordinary owned-project backup recovery.');
   }
   await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);await resize(page);
   if(action==='render')await h.render(page,'workflow');
   else if(action==='recover'){
    await q.tool(page,'Export');
    const ready=page.getByTestId('rendered-output-ready'),deadline=Date.now()+15*60*1000;
    while(!await ready.isVisible()&&Date.now()<deadline){
     const check=page.getByRole('button',{name:'Retry status check',exact:true});
     if(await check.isVisible())await check.click();
     await page.waitForTimeout(5000);
    }
    assert(await ready.isVisible(),'The existing accepted CPU export has not completed within the recovery observation window');
    await h.recover(page,'workflow');
   }
   else if(action==='view'){
    await q.tool(page,'Export');
    if(!await page.getByTestId('rendered-output-ready').isVisible()){
     await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.join(folder,'workflow','render-receipt.json'));
     await page.getByTestId('rendered-output-ready').waitFor({timeout:90000});
    }
    const view=page.getByTestId('studio-pro-timeline');await view.getByRole('button',{name:'Select Group 1 group clip',exact:true}).click();
    await view.getByRole('button',{name:'Show motion keyframes',exact:true}).click();
    await view.getByRole('button',{name:'Expand Group 1 keyframes',exact:true}).click();
    await require('../creative-templates/materials-editing-proof').view(page,'workflow');
   }else if(action==='preview'){
    await q.tool(page,'Export');await page.getByTestId('rendered-output-ready').waitFor({timeout:90000});
    const live=page.getByRole('button',{name:'Show Live Edit',exact:true});if(await live.isVisible())await live.click();
    await page.getByRole('button',{name:'Show Finished Video',exact:true}).waitFor();
    const saved=await h.save(page,'workflow-live'),receipt=JSON.parse(fs.readFileSync(path.join(folder,'workflow','render-receipt.json')));
    assert.equal(hash(saved.snapshot.studioDocument),receipt.projectHash);
    const group=saved.snapshot.compoundClips.find(g=>g.kind==='graphic_group');
    const acceptance=JSON.parse(fs.readFileSync(path.join(folder,'predeclared-checks.json'))),samples=[];
    for(const [i,time] of acceptance.mappedSampleTimes.entries()){
     await seek(page,time);await page.waitForFunction(()=>document.querySelector('[data-testid="studio-program-canvas"]')?.dataset.sourceSampling==='accurate-paused');
     const stage=page.getByTestId('hook-preview-frame');await stage.screenshot({path:path.join(folder,'workflow',`live-${i}.png`)});
     const sampling=await page.getByTestId('studio-program-canvas').evaluate(e=>({mode:e.dataset.sourceSampling,sourceContentHash:e.dataset.sourceContentHash,frameIndex:Number(e.dataset.sourceFrameIndex)}));
     const node=stage.locator(`[data-studio-group-id="${group.id}"]`);const display=await node.evaluate(e=>getComputedStyle(e).display);
     const visible=time>=group.timing.startTime&&time<group.timing.startTime+group.timing.duration;
     assert.equal(display==='none',!visible);
     samples.push({time,frameIndex:Math.round(time*24),sampling,groupVisible:visible,groupPose:await node.evaluate(e=>JSON.parse(e.dataset.studioGroupPose)),stageBox:await stage.boundingBox()});
    }
    fs.writeFileSync(path.join(folder,'workflow','native-live.json'),JSON.stringify({projectId:saved.id,canonicalHash:receipt.projectHash,groups:saved.snapshot.compoundClips,samples},null,2));
   }
   else if(action==='inspect')console.log((await page.locator('body').innerText()).slice(-4500));
   else throw Error('Unknown action');
  }
  assert.equal(renders,action==='render'?1:0);assert.equal(gpu,0);console.log(`Native real-footage ${action} passed; ${renders} CPU exports, zero GPU jobs.`);
 }catch(error){await page.screenshot({path:path.join(folder,`${action}-failure-${Date.now()}.png`)}).catch(()=>{});fs.writeFileSync(path.join(folder,`${action}-failure-${Date.now()}.json`),JSON.stringify({error:error.message,qualified:false}));console.error((await page.locator('body').innerText()).slice(-1200));throw error;}
 finally{const video=page.video();await context.close();if(video){const file=await video.path();console.log('Native editing recording retained:',path.relative(root,file));}}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
