#!/usr/bin/env node
// Actual current App and canonical renderer in existing isolated emulators.
// Native UI only: no project graph injection, auth bypass or network mocks.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..'),folder=process.env.AUTOPROMOTE_EDIT_PROOF_DIR?path.resolve(process.env.AUTOPROMOTE_EDIT_PROOF_DIR):path.resolve(__dirname,'../proof/recovery-edit');
fs.mkdirSync(folder,{recursive:true,mode:0o700});
Object.assign(process.env,{STUDIO_TEMPLATE_PROOF_DIR:folder,STUDIO_KINETIC_PROOF_DIR:folder,
  STUDIO_QA_TIMELINE_HEIGHT:'420',STUDIO_QA_HIDE_MEDIA:'1'});
const h=require(path.join(root,'scripts/creative-templates/studio-proof'));
const q=require(path.join(root,'test/e2e/playwright/studio-stability/run'));
const {pause,seek,range,recording}=require(path.join(root,'scripts/studio-professional/kinetic-type-proof'));
const {hash}=require(path.join(root,'src/creativeTemplates/contract'));
const directory=process.argv[2],action=process.argv[3]||'author-render';
const config=JSON.parse(fs.readFileSync(path.join(directory,'config.json')));
const login=JSON.parse(fs.readFileSync(path.join(directory,'browser-private.json')));
assert.equal(config.env.GCLOUD_PROJECT,'demo-autopromote-credits');
assert.equal(config.env.UNIFIED_CREDITS_SANDBOX,'true');
assert.equal(new URL(config.origin).hostname,'127.0.0.1');
const stateFile=path.join(folder,'session.private.json'),progressFile=path.join(folder,'edit-progress.json');
const progress=fs.existsSync(progressFile)?JSON.parse(fs.readFileSync(progressFile)):{};
const title=process.env.AUTOPROMOTE_EDIT_TITLE||'THE VIDEO I NEVER RECORDED — native motion opening';
const source=path.resolve(__dirname,'edit-assets/presenter-source-proxy.mp4');
const done=(key,value=true)=>{progress[key]=value;fs.writeFileSync(progressFile,JSON.stringify(progress,null,2)+'\n')};
const decisions=d=>{const{revision,journal,idempotency,...v}=d;return hash(v)};
async function entry(p){
  await p.goto(config.origin,{waitUntil:'domcontentloaded'});
  const signin=p.getByRole('button',{name:'Sign In',exact:true});
  await signin.or(p.getByTestId('shared-credit-balance')).first().waitFor({timeout:45000});
  if(await signin.isVisible()){
    await signin.click();await p.locator('#login-email').fill(login.email);
    await p.locator('#login-password').fill(login.password);
    await p.locator('form input[type=checkbox]').check();await p.locator('form button[type=submit]').click();
  }
  await p.getByTestId('shared-credit-balance').waitFor({timeout:45000});
  const script=await p.locator('script[src*="/static/js/main."]').getAttribute('src');
  const expected=fs.readdirSync(path.join(config.build,'static/js')).find(x=>/^main\..*\.js$/.test(x));
  assert(script.endsWith(expected));
  assert(!await p.evaluate(()=>!!window.__E2E_BYPASS));
  fs.writeFileSync(path.join(folder,'isolated-build.json'),JSON.stringify({origin:config.origin,
    demoProject:config.env.GCLOUD_PROJECT,bundle:expected,
    bundleSha256:hash(fs.readFileSync(path.join(config.build,'static/js',expected))),
    worktree:root,actualFrontend:true,actualBackend:true,canonicalCpuRenderer:true,
    productionAuthImported:false,headlessMuted:true},null,2)+'\n');
  await p.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
  console.log('Verified current Studio opened with ordinary isolated-demo sign-in.');
}
async function open(p){await p.getByRole('button',{name:title,exact:true}).click();await h.rail(p);await pause(p)}
async function backup(p,label){
  await h.rail(p);const versions=p.getByLabel('Include saved versions in backup',{exact:true});
  if(await versions.count()&&await versions.isChecked())await versions.uncheck();
  const download=p.waitForEvent('download');await p.getByRole('button',{name:'Download project backup',exact:true}).click();
  await(await download).saveAs(path.join(folder,`${label}.autopromote.json`));
}
async function number(p,label,value){
  const input=p.getByRole('spinbutton',{name:label,exact:true});
  if(Math.abs(Number(await input.inputValue())-value)<.00001)await input.fill(String(value===0?.01:value-.01));
  await input.fill(String(value));await input.blur();
}
async function author(p){
  assert(!progress.authored,'Preserve authored project; reopen it instead.');
  if(await p.getByRole('button',{name:title,exact:true}).count())await open(p);
  else{
  await p.locator('.creator-studio-dropzone input[type=file]').setInputFiles(source);
  await p.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:180000});
  await h.rail(p);await pause(p);await p.getByLabel('Project name',{exact:true}).fill(title);
  await seek(p,0);await q.tool(p,'Reframe');
  await p.getByTestId('reframe-aspect-16-9').click();await p.getByTestId('reframe-preserve-frame').click();
  const rounded=p.getByLabel('Rounded main footage',{exact:true});if(await rounded.count()&&await rounded.isChecked())await rounded.uncheck();
  await q.tool(p,'Sound');await p.getByLabel('Use voice repair on export',{exact:true}).uncheck();
  await q.tool(p,'Cut');await p.getByTestId('pro-video-clip-1').click();await seek(p,16);
  await p.getByTestId('inspector-cut-trim-end').click();
  }
  let before=await h.save(p,'raw-assembly');
  assert.equal(before.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick,16*90000);
  await backup(p,'RAW-EDITABLE');
  const stop=await recording(p);
  try{
    await q.tool(p,'Graphics');const panel=p.getByTestId('studio-graphics-import');
    if(!await panel.evaluate(e=>e.open))await panel.locator('summary').click();
    await p.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.join(__dirname,'edit-assets/native-opening.graphics.json'));
    await panel.getByRole('status').waitFor();assert((await panel.getByRole('status').innerText()).includes('imported.'),await panel.innerText());
    let after=await h.save(p,'graphics');assert.equal(after.snapshot.overlays.length,23);
    await p.getByTestId('studio-undo-button').click();assert.equal(decisions((await h.save(p,'graphics-undone')).snapshot.studioDocument),decisions(before.snapshot.studioDocument));
    await p.getByTestId('studio-redo-button').click();assert.equal(decisions((await h.save(p,'graphics-redone')).snapshot.studioDocument),decisions(after.snapshot.studioDocument));
    console.log('Native graphic import and Undo/Redo pass.');
    await q.tool(p,'Motion');await p.getByRole('button',{name:'Transform keyframes',exact:true}).click();
    await p.getByLabel('Target layer',{exact:true}).selectOption('main-video');
    const poses=JSON.parse(fs.readFileSync(path.join(__dirname,'edit-assets/native-main-poses.json')));
    for(const[t,x,y,scale,rotate]of poses){
      await seek(p,t);await p.getByRole('button',{name:/^◆ Add transform keyframe at/}).click();
      for(const[label,v]of [['X',x],['Y',y],['Scale',scale],['Rotate',rotate]])await number(p,label,v);
    }
    await h.save(p,'main-motion');console.log('Native camera and recording-frame movement saved.');
    for(const t of [0,2.6,3.5,6.4,8.7,10.8,13.1,15.7]){
      await seek(p,t);await q.tool(p,'Cut');await p.keyboard.press('Escape');
      await p.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=2},null,{timeout:20000}).catch(()=>{});
      await p.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});
      const observed=await p.getByTestId('studio-after-video').evaluate(v=>({currentTime:v.currentTime,paused:v.paused,seeking:v.seeking,readyState:v.readyState}));
      fs.writeFileSync(path.join(folder,`live-${t}-clock.json`),JSON.stringify({programmeTime:t,...observed},null,2));
    }
  }finally{await stop()}
  const saved=await h.save(p,'authored');assert.equal(saved.snapshot.overlays.length,23);assert.equal(saved.snapshot.audioRestoration.enabled,false);
  await backup(p,'NATIVE-OPENING');done('authored',{projectId:saved.id,projectHash:hash(saved.snapshot.studioDocument)});
}
async function render(p){
  assert(!progress.renderSubmitted,'Recover the saved accepted job instead of submitting again.');
  const events=[];let submitted,rejectFailure;
  const failure=new Promise((_,reject)=>{rejectFailure=reject});failure.catch(()=>{});
  p.on('request',req=>{if(new URL(req.url()).pathname==='/api/media/process'){
    fs.writeFileSync(path.join(folder,'render-request.private.json'),req.postData(),{mode:0o600});done('renderRequestCaptured');
  }});
  p.on('response',async response=>{
    const route=new URL(response.url()).pathname;
    if(route==='/api/media/process'||route.startsWith('/api/media/status/')){
      const value=await response.json().catch(()=>({}));events.push({route,httpStatus:response.status(),status:value.status});
      if(route==='/api/media/process'&&value.jobId){submitted=value.jobId;done('renderSubmitted',submitted)}
      if(value.status==='failed'){
        fs.writeFileSync(path.join(folder,'render-failed.private.json'),JSON.stringify(value,null,2));
        rejectFailure(Error(value.error||'Native render failed; inspect retained worker evidence.'));
      }
    }
  });
  await q.tool(p,'Export');await p.getByLabel('Export resolution',{exact:true}).selectOption('720p');
  await p.getByLabel('Export frame rate',{exact:true}).selectOption('24');
  await h.save(p,'before-export');
  await p.getByRole('button',{name:/^Render (Final Clip|Again)$/}).click();
  const consent=p.getByRole('dialog',{name:'Studio export',exact:true});await consent.waitFor({timeout:30000});
  await p.screenshot({path:path.join(folder,'local-export-consent.png')});
  await consent.getByRole('button',{name:/^Approve /}).click();
  const download=p.getByRole('button',{name:'Download Rendered Clip',exact:true});
  await Promise.race([download.waitFor({timeout:210000}),failure]);
  assert(submitted,'Expected ordinary owned render acknowledgment.');
  const result=p.waitForEvent('download');await download.click();await(await result).saveAs(path.join(folder,'final.mp4'));
  const saved=await h.save(p,'exported');await backup(p,'NATIVE-OPENING-FINAL');
  fs.writeFileSync(path.join(folder,'native-render.json'),JSON.stringify({jobId:submitted,
    projectId:saved.id,projectHash:hash(saved.snapshot.studioDocument),events,
    outputSha256:hash(fs.readFileSync(path.join(folder,'final.mp4'))),
    origin:config.origin,localEmulatorsOnly:true,providerGenerationRequests:0},null,2)+'\n');
  done('rendered');console.log('Actual native opening exported and downloaded.');
  const delivered=path.join(folder,'opening');fs.mkdirSync(delivered,{recursive:true});
  fs.copyFileSync(path.join(folder,'final.mp4'),path.join(delivered,'final.mp4'));
  fs.writeFileSync(path.join(delivered,'render-receipt.json'),JSON.stringify({jobId:submitted,projectId:saved.id,
    projectHash:hash(saved.snapshot.studioDocument),outputSha256:hash(fs.readFileSync(path.join(folder,'final.mp4')))},null,2));
  await require(path.join(root,'scripts/creative-templates/materials-editing-proof')).view(p,'opening');
  done('fullStudioPlayback');
}
async function observePlayback(p){
  let renderRequests=0;p.on('request',r=>{if(new URL(r.url()).pathname==='/api/media/process')renderRequests++});
  await open(p);await q.tool(p,'Export');await p.getByTestId('rendered-output-ready').waitFor({timeout:60000});
  const before=await h.save(p,'playback-before'),results=[];
  for(const mode of ['finished','live']){
    const toggle=p.getByRole('button',{name:mode==='live'?'Show Live Edit':'Show Finished Video',exact:true});
    if(await toggle.isVisible())await toggle.click();
    await seek(p,0);
    await p.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=3},null,{timeout:20000});
    await pause(p);
    await p.getByTestId('studio-after-video').evaluate(v=>{
      const initial=v.getVideoPlaybackQuality(),frames=[],events=[];
      let id,started;
      window.__motionPlaybackCycleComplete=false;
      const listen=e=>{if(e.type==='playing'&&started===undefined)started=performance.now();if(e.type==='ended')window.__motionPlaybackCycleComplete=true;events.push({type:e.type,time:v.currentTime,wallMs:performance.now()})};
      const names=['playing','ended','waiting','stalled','pause'];for(const n of names)v.addEventListener(n,listen);
      const frame=(now,m)=>{if(frames.at(-1)?.mediaTime>15.5&&m.mediaTime<.5)window.__motionPlaybackCycleComplete=true;frames.push({mediaTime:m.mediaTime,wallMs:now,programmeTime:Number(document.querySelector('[aria-label="Edited output position"]')?.value),planes:[...document.querySelectorAll('[data-testid="studio-perspective-surface"]')].map(e=>({time:Number(e.dataset.programmeTime),visible:getComputedStyle(e.parentElement).visibility}))});id=v.requestVideoFrameCallback(frame)};
      id=v.requestVideoFrameCallback(frame);
      window.__finishMotionPlayback=()=>{
        v.cancelVideoFrameCallback(id);for(const n of names)v.removeEventListener(n,listen);
        const last=v.getVideoPlaybackQuality();
        return{started,ended:v.ended,cycleComplete:window.__motionPlaybackCycleComplete,mediaTime:v.currentTime,wallSeconds:(performance.now()-started)/1000,
          decodedFrames:last.totalVideoFrames-initial.totalVideoFrames,droppedFrames:last.droppedVideoFrames-initial.droppedVideoFrames,
          frames,events,finishedOutputVisible:document.querySelector('[data-testid="hook-preview-frame"]').classList.contains('has-rendered-output')};
      };
    });
    await p.getByRole('button',{name:'Play comparison',exact:true}).click();
    let observationError=null;
    await p.waitForFunction(()=>window.__motionPlaybackCycleComplete,null,{timeout:35000}).catch(e=>{observationError=e.message});
    const result=await p.evaluate(()=>{const r=window.__finishMotionPlayback();delete window.__finishMotionPlayback;return r});
    results.push({mode,...result,observationError});
    fs.writeFileSync(path.join(folder,'live-and-finished-playback.json'),JSON.stringify({results,renderRequests,headlessMuted:true,screencast:false},null,2));
    console.log(`${mode}: ${result.decodedFrames} decoded, ${result.droppedFrames} dropped; complete cycle ${result.cycleComplete}.`);
    assert(!observationError,observationError);await pause(p);
  }
  const after=await h.save(p,'playback-after');assert.equal(hash(before.snapshot.studioDocument),hash(after.snapshot.studioDocument));assert.equal(renderRequests,0);
  fs.writeFileSync(path.join(folder,'live-and-finished-playback.json'),JSON.stringify({results,renderRequests,canonicalHash:hash(after.snapshot.studioDocument),
    headlessMuted:true,screencast:false,scope:'Actual native live-edit and finished-file playback clocks; listening and perceptual creative acceptance remain separate.'},null,2));
  await seek(p,6.4);await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.press('Escape');
  await p.screenshot({path:path.join(folder,'actual-studio-frontend.png')});
}
async function importGraphics(p,file){
  await q.tool(p,'Graphics');const panel=p.getByTestId('studio-graphics-import');
  if(!await panel.evaluate(e=>e.open))await panel.locator('summary').click();
  await p.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.join(__dirname,'edit-assets',file));
  await panel.getByRole('status').waitFor();assert((await panel.getByRole('status').innerText()).includes('imported.'),await panel.innerText());
}
async function motionTarget(p,id){
  await q.tool(p,'Motion');await p.getByRole('button',{name:'Transform keyframes',exact:true}).click();
  await p.getByLabel('Target layer',{exact:true}).selectOption(id);
}
async function projectedEdit(p){
  assert(!progress.authored,'Retain the authored perspective edit.');
  await p.locator('.creator-studio-dropzone input[type=file]').setInputFiles(source);
  await p.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:180000});
  await h.rail(p);await pause(p);await p.getByLabel('Project name',{exact:true}).fill(title);
  await q.tool(p,'Reframe');await p.getByTestId('reframe-aspect-16-9').click();await p.getByTestId('reframe-preserve-frame').click();
  const rounded=p.getByLabel('Rounded main footage',{exact:true});if(await rounded.count()&&await rounded.isChecked())await rounded.uncheck();
  await q.tool(p,'Sound');await p.getByLabel('Use voice repair on export',{exact:true}).uncheck();
  await q.tool(p,'Cut');await p.getByTestId('pro-video-clip-1').click();await seek(p,16);await p.getByTestId('inspector-cut-trim-end').click();
  await h.save(p,'raw-assembly');await backup(p,'RAW-EDITABLE');
  const stop=await recording(p),planes=[];
  try{
    await importGraphics(p,'perspective-background.graphics.json');
    for(const [index,start,end,left]of [[0,2.5,7.5,true],[1,8.25,14.5,false]]){
      await h.rail(p);await p.getByRole('tab',{name:'Media',exact:true}).click();await seek(p,start);
      const card=p.getByTestId('project-media-library').locator('article').filter({has:p.getByRole('button',{name:'Preview presenter-source-proxy.mp4',exact:true})});
      await card.getByRole('button',{name:'Preview presenter-source-proxy.mp4',exact:true}).click();await card.getByRole('button',{name:'Add as B-roll',exact:true}).click();
      await pause(p);let added=await h.save(p,`plane-${index}-added`);const id=added.snapshot.overlays.at(-1).id;planes.push(id);
      await q.tool(p,'B-roll');await p.getByRole('button',{name:'Picture-in-picture',exact:true}).click();
      await range(p.getByLabel('B-roll source start',{exact:true}),start);
      await range(p.getByRole('slider',{name:'Frame corner curve',exact:true}),0);
      await motionTarget(p,id);
      for(const [label,value]of [['Motion layer in point',start],['Motion layer duration',end-start],['Motion layer width',88],['Motion layer height',88]]){
        const input=p.getByLabel(label,{exact:true});await input.fill(String(value));await input.blur();
      }
      await q.tool(p,'Composite');await p.getByText('Composite target',{exact:true}).locator('..').locator('select').selectOption(id);
      const panel=p.getByTestId('studio-perspective-inspector');await panel.locator('summary').click();
      const before=await h.save(p,`plane-${index}-before-projection`);
      await panel.getByRole('button',{name:left?'Tilt plane left':'Tilt plane right',exact:true}).click();
      const after=await h.save(p,`plane-${index}-projected`);assert(after.snapshot.overlays.find(o=>o.id===id).perspective);
      await p.getByTestId('studio-undo-button').click();assert.equal(decisions((await h.save(p,`plane-${index}-undone`)).snapshot.studioDocument),decisions(before.snapshot.studioDocument));
      await p.getByTestId('studio-redo-button').click();assert.equal(decisions((await h.save(p,`plane-${index}-redone`)).snapshot.studioDocument),decisions(after.snapshot.studioDocument));
      // Apply crossed geometry through the real UI; it must not change the graph.
      if(!await panel.evaluate(e=>e.open))await panel.locator('summary').click();
      await panel.getByLabel('Perspective top right X',{exact:true}).fill('0');
      await panel.getByLabel('Perspective top right Y',{exact:true}).fill('100');
      await panel.getByRole('button',{name:'Apply plane corners',exact:true}).click();await panel.getByRole('alert').waitFor();
      assert.equal(decisions((await h.save(p,`plane-${index}-invalid-rejected`)).snapshot.studioDocument),decisions(after.snapshot.studioDocument));
      await panel.getByRole('button',{name:left?'Tilt plane left':'Tilt plane right',exact:true}).click();
      await motionTarget(p,id);
      for(const [t,progressValue,scale]of [[start,0,1],[start+.9,100,.94],[end-.9,100,.97],[end-.04,0,1]]){
        await seek(p,t);await p.getByRole('button',{name:/^◆ Add transform keyframe at/}).click();
        for(const [label,v]of [['X',50],['Y',45],['Scale',scale],['Rotate',left?-2:2],['Perspective progress',progressValue]])await number(p,label,v);
        await range(p.getByRole('slider',{name:/^Opacity/}),1);
      }
      console.log(`Real moving video plane ${index+1} authored; native history and malformed-corner rejection pass.`);
    }
    await importGraphics(p,'perspective-titles.graphics.json');
    const saved=await h.save(p,'authored');await backup(p,'NATIVE-OPENING');done('authored',{projectId:saved.id,projectHash:hash(saved.snapshot.studioDocument),planes});
    for(const t of [0,2.5,2.95,3.5,6.4,7.46,8.25,9.2,10.8,13.1,14.46,15.7]){
      await seek(p,t);await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.press('Escape');
      await p.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=2},null,{timeout:20000});
      await p.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});
    }
  }finally{await stop()}
}
async function gridEdit(p){
  assert(!progress.authored);
  await p.locator('.creator-studio-dropzone input[type=file]').setInputFiles(source);
  await p.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:180000});
  await h.rail(p);await pause(p);await p.getByLabel('Project name',{exact:true}).fill(title);
  await q.tool(p,'Reframe');await p.getByTestId('reframe-aspect-16-9').click();await p.getByTestId('reframe-preserve-frame').click();
  await q.tool(p,'Color');const rounded=p.getByLabel('Rounded main footage',{exact:true});if(await rounded.count()&&await rounded.isChecked())await rounded.uncheck();
  await q.tool(p,'Sound');await p.getByLabel('Use voice repair on export',{exact:true}).uncheck();
  await q.tool(p,'Cut');await p.getByTestId('pro-video-clip-1').click();await seek(p,3);await p.getByTestId('inspector-cut-trim-end').click();
  const stop=await recording(p);
  try{
    await importGraphics(p,'plane-grid.graphics.json');const added=await h.save(p,'grid-added'),id=added.snapshot.overlays.at(-1).id;
    await q.tool(p,'Composite');await p.getByText('Composite target',{exact:true}).locator('..').locator('select').selectOption(id);
    const panel=p.getByTestId('studio-perspective-inspector');await panel.locator('summary').click();await panel.getByRole('button',{name:'Tilt plane left',exact:true}).click();
    await motionTarget(p,id);
    for(const [t,value]of [[0,0],[1,100],[2,100],[2.95,0]]){
      await seek(p,t);await p.getByRole('button',{name:/^◆ Add transform keyframe at/}).click();await number(p,'Perspective progress',value);
    }
    for(const t of [0,.5,1,2.95]){
      await seek(p,t);await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.press('Escape');await p.waitForTimeout(250);
      await p.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`grid-live-${t}.png`)});
    }
    const saved=await h.save(p,'authored');await backup(p,'NATIVE-OPENING');done('authored',{projectId:saved.id,projectHash:hash(saved.snapshot.studioDocument)});
  }finally{await stop()}
}
async function frameClockReview(p){
  await q.tool(p,'Cut'); await seek(p,0); await pause(p);
  await p.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=3},null,{timeout:30000});
  const before=await h.save(p,'clock-before'); let renderRequests=0;
  p.on('request',r=>{if(new URL(r.url()).pathname==='/api/media/process')renderRequests++});
  const results=[];
  for(const capture of [false,true]){
    await seek(p,0);await pause(p);
    const stop=capture?await recording(p):null;
    await p.getByTestId('studio-after-video').evaluate(v=>{
      const frames=[],initial=v.getVideoPlaybackQuality();let callback,done=false;
      window.__frameClockComplete=false;
      const tick=(_now,m)=>{
        if(done)return;
        if(frames.at(-1)?.mediaTime>15.5&&m.mediaTime<.5)window.__frameClockComplete=true;
        const mediaTime=m.mediaTime;
        requestAnimationFrame(()=>frames.push({mediaTime,
          canvasTime:Number(document.querySelector('[data-testid="studio-program-canvas"]')?.dataset.programmeTime),
          layers:[...document.querySelectorAll('[data-studio-layer-id][data-programme-time]')].map(e=>({id:e.dataset.studioLayerId,time:Number(e.dataset.programmeTime),visible:getComputedStyle(e).visibility!=='hidden'}))}));
        callback=v.requestVideoFrameCallback(tick);
      };
      callback=v.requestVideoFrameCallback(tick);
      const ended=()=>{window.__frameClockComplete=true};v.addEventListener('ended',ended);
      window.__finishFrameClock=()=>{done=true;v.cancelVideoFrameCallback(callback);v.removeEventListener('ended',ended);const quality=v.getVideoPlaybackQuality();return{frames,cycleComplete:window.__frameClockComplete,decoded:quality.totalVideoFrames-initial.totalVideoFrames,dropped:quality.droppedVideoFrames-initial.droppedVideoFrames}};
    });
    await p.getByRole('button',{name:'Play comparison',exact:true}).click();
    await p.waitForFunction(()=>window.__frameClockComplete,null,{timeout:35000});
    results.push({capture,...await p.evaluate(()=>window.__finishFrameClock())});
    await pause(p);if(stop)await stop();
    fs.writeFileSync(path.join(folder,'frame-clock-playback.json'),JSON.stringify({results,renderRequests,headlessMuted:true},null,2));
  }
  const after=await h.save(p,'clock-after');
  assert.equal(hash(before.snapshot.studioDocument),hash(after.snapshot.studioDocument));assert.equal(renderRequests,0);
  fs.writeFileSync(path.join(folder,'frame-clock-playback.json'),JSON.stringify({results,renderRequests,
    canonicalHash:hash(after.snapshot.studioDocument),headlessMuted:true,creativeApproval:false,
    scope:'Actual native live composition clocks, with and without timeline capture; no new render or creative-quality qualification.'},null,2));
  await seek(p,6.4);await p.screenshot({path:path.join(folder,'current-studio.png')});
  await p.goto(config.origin,{waitUntil:'domcontentloaded'});
  await p.getByTestId('shared-credit-balance').waitFor({timeout:30000});
  await p.getByRole('button',{name:'Ask AutoPromote',exact:true}).click();
  const help=p.getByRole('dialog',{name:'Ask AutoPromote'});
  await help.getByLabel('Question',{exact:true}).fill('How do I add keyframes?');
  const pending=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/product-assistance/ask'&&r.request().method()==='POST');
  await help.getByRole('button',{name:'Ask',exact:true}).click();
  const response=await pending,reply=await response.json();assert.equal(response.status(),200);
  assert.equal(reply.features[0].feature_id,'studio.keyframes');
  await help.screenshot({path:path.join(folder,'signed-in-help.png')});
  fs.writeFileSync(path.join(folder,'signed-in-help.json'),JSON.stringify({normalDemoSignIn:true,httpStatus:response.status(),featureId:reply.features[0].feature_id},null,2));
}
async function main(){
  const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio']});
  const context=await browser.newContext({viewport:{width:1920,height:1200},acceptDownloads:true,
    ...(!['revision-render','repair-render','perspective-author-render','projected-render','optimize-projection-render','bounded-background-render','recover-finished','repeat-export'].includes(action)&&fs.existsSync(stateFile)?{storageState:stateFile}:{})});
  const denied=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1'||['data:','blob:'].includes(u.protocol))return route.continue();
    denied.push({origin:u.origin,path:u.pathname});return route.abort();});
  const p=await context.newPage();p.setDefaultTimeout(45000);p.on('dialog',d=>void d.accept());
  p.on('pageerror',e=>fs.appendFileSync(path.join(folder,'browser-errors.txt'),e.message+'\n'));
  try{
    await entry(p);
    if(action==='author-render'){await author(p);await render(p)}
    else if(action==='perspective-author-render'){await projectedEdit(p);await render(p)}
    else if(action==='grid-author-render'){await gridEdit(p);await render(p)}
    else if(action==='frame-clock-review'){
      if(progress.authored)await open(p);else await projectedEdit(p);
      await frameClockReview(p);
    }
    else if(action==='projected-render'){
      assert(progress.authored&&!progress.renderSubmitted,'Recover the native project without duplicating a job.');
      const native=JSON.parse(fs.readFileSync(path.join(folder,'NATIVE-OPENING.autopromote.json')));
      await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,'NATIVE-OPENING.autopromote.json'));
      await p.getByRole('button',{name:title,exact:true}).waitFor();await open(p);
      assert.equal(hash((await h.save(p,'restored-projection')).snapshot.studioDocument),hash(native.snapshot.studioDocument));
      await render(p);
    }
    else if(action==='optimize-projection-render'){
      assert(progress.authored&&progress.renderSubmitted&&!progress.rendered);
      delete progress.renderSubmitted;delete progress.renderRequestCaptured;
      const file=path.join(folder,'NATIVE-OPENING.autopromote.json');const native=JSON.parse(fs.readFileSync(file));
      await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(file);await p.getByRole('button',{name:title,exact:true}).waitFor();await open(p);
      assert.equal(hash((await h.save(p,'restored-projection')).snapshot.studioDocument),hash(native.snapshot.studioDocument));
      for(const layer of native.snapshot.overlays.filter(o=>o.perspective)){
        await motionTarget(p,layer.id);
        for(const key of native.snapshot.motionKeyframes.filter(k=>k.targetId===layer.id&&k.property==='rotation')){
          await seek(p,key.time);await number(p,'Rotate',0);
        }
      }
      const saved=await h.save(p,'projection-without-extra-rotation');await backup(p,'NATIVE-OPENING-OPTIMIZED');
      done('optimized',{projectHash:hash(saved.snapshot.studioDocument),nativeRemovedDecorativeRotation:true});
      for(const t of [0,2.5,2.95,3.5,6.4,7.46,8.25,9.2,10.8,13.1,14.46,15.7]){
        await seek(p,t);await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.press('Escape');
        await p.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=2},null,{timeout:20000});
        await p.waitForTimeout(200);
        await p.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});
        const clock=await p.getByTestId('studio-after-video').evaluate(v=>({sourceTime:v.currentTime,seeking:v.seeking,readyState:v.readyState,
          planes:[...document.querySelectorAll('[data-testid="studio-perspective-surface"]')].map(e=>({programmeTime:Number(e.dataset.programmeTime),matrix:e.style.transform,visible:getComputedStyle(e.parentElement).visibility}))}));
        fs.writeFileSync(path.join(folder,`live-${t}-clock.json`),JSON.stringify({programmeTime:t,...clock},null,2));
      }
      await render(p);
    }
    else if(action==='bounded-background-render'){
      assert(progress.renderSubmitted&&!progress.rendered);delete progress.renderSubmitted;delete progress.renderRequestCaptured;
      const file=path.join(folder,'NATIVE-OPENING-OPTIMIZED.autopromote.json'),native=JSON.parse(fs.readFileSync(file));
      await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(file);await p.getByRole('button',{name:title,exact:true}).waitFor();await open(p);
      const bg=native.snapshot.overlays.find(o=>o.name==='Studio-depth-background');assert(bg);
      await motionTarget(p,bg.id);await p.getByRole('button',{name:'Reset transform',exact:true}).click();
      await p.getByLabel('Motion layer duration',{exact:true}).fill('5');await p.getByLabel('Motion layer duration',{exact:true}).blur();
      await q.tool(p,'Composite');await p.getByText('Composite target',{exact:true}).locator('..').locator('select').selectOption(bg.id);
      const panel=p.getByTestId('studio-perspective-inspector');await panel.locator('summary').click();
      await panel.getByRole('button',{name:'Tilt plane left',exact:true}).click();await panel.getByRole('button',{name:'Straighten plane',exact:true}).click();
      await q.tool(p,'Motion');await p.getByRole('button',{name:'Logo & layers',exact:true}).click();
      await p.getByRole('button',{name:'Duplicate Studio-depth-background',exact:true}).click();
      const duplicated=await h.save(p,'second-backdrop-added'),copy=duplicated.snapshot.overlays.at(-1);assert(copy.id!==bg.id);
      await motionTarget(p,copy.id);await p.getByRole('button',{name:'Reset transform',exact:true}).click();
      for(const [label,v]of [['Motion layer in point',8.25],['Motion layer duration',6.25]]){await p.getByLabel(label,{exact:true}).fill(String(v));await p.getByLabel(label,{exact:true}).blur();}
      await q.tool(p,'Composite');
      const backward=p.getByRole('button',{name:'Send Studio-depth-background copy backward',exact:true});
      for(let i=0;i<20&&await backward.isEnabled();i++)await backward.click();
      const saved=await h.save(p,'bounded-background-edit');await backup(p,'NATIVE-OPENING-BOUNDED');
      done('boundedBackground',{projectHash:hash(saved.snapshot.studioDocument),splitAtRealSourceBeats:true});
      for(const t of [0,2.5,2.95,3.5,6.4,7.46,8.25,9.2,10.8,13.1,14.46,15.7]){
        await seek(p,t);await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.press('Escape');await p.waitForTimeout(200);
        await p.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});
        fs.writeFileSync(path.join(folder,`live-${t}-clock.json`),JSON.stringify({programmeTime:t,...await p.getByTestId('studio-after-video').evaluate(v=>({sourceTime:v.currentTime,seeking:v.seeking,readyState:v.readyState}))},null,2));
      }
      await render(p);
    }
    else if(action==='recover-finished'){
      const receipt=JSON.parse(fs.readFileSync(path.join(folder,'native-render.json')));
      const file=path.join(folder,'NATIVE-OPENING-FINAL.autopromote.json');
      let jobs=0;p.on('request',r=>{if(new URL(r.url()).pathname==='/api/media/process')jobs++});
      await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(file);await p.getByRole('button',{name:title,exact:true}).waitFor();await open(p);
      const restored=await h.save(p,'finished-independent-restored');assert.equal(hash(restored.snapshot.studioDocument),receipt.projectHash);
      const official={projectId:receipt.projectId,projectHash:receipt.projectHash,outputSha256:receipt.outputSha256,submittedJobId:receipt.jobId};
      const receiptFile=path.join(folder,'owned-export-recovery.json');fs.writeFileSync(receiptFile,JSON.stringify(official,null,2));
      await q.tool(p,'Export');await p.getByLabel('Restore export receipt',{exact:true}).setInputFiles(receiptFile);
      await p.getByTestId('rendered-output-ready').waitFor({timeout:45000});
      await seek(p,6.4);await p.screenshot({path:path.join(folder,'actual-studio-frontend.png')});
      const after=await h.save(p,'finished-recovered');assert.equal(hash(after.snapshot.studioDocument),receipt.projectHash);assert.equal(jobs,0);
      const observed=JSON.parse(fs.readFileSync(path.join(folder,'opening/studio-playback-observation.json')));
      assert(observed.playback.ended&&observed.playback.duration===16);
      fs.writeFileSync(path.join(folder,'recovered-recording-audit.json'),JSON.stringify({projectHash:receipt.projectHash,outputSha256:receipt.outputSha256,
        exactIndependentBackupRestore:true,ordinaryOwnedExportRecovery:true,additionalRenderRequests:jobs,
        savedActualStudioPlayback:observed,recording:'opening/edited-in-studio.mp4',
        limitation:'Original capture reached the end and encoded the recording; the browser closed during its subsequent project check. This independent exact restore and owned recovery complete that identity check.'},null,2));
      done('recoveredFinishedAndRecordingAudited');
    }
    else if(action==='repeat-export'){
      assert(progress.rendered,'Keep the previous completed job before a deliberate native verification export.');
      const receipt=JSON.parse(fs.readFileSync(path.join(folder,'native-render.json')));
      const archive=path.join(folder,`before-boundary-repair-${receipt.outputSha256.slice(0,12)}`);fs.mkdirSync(archive,{recursive:true});
      for(const file of ['native-render.json','final.mp4','NATIVE-OPENING-FINAL.autopromote.json','edit-progress.json'])fs.copyFileSync(path.join(folder,file),path.join(archive,file));
      const nativeFile=path.join(folder,'NATIVE-OPENING-FINAL.autopromote.json'),native=JSON.parse(fs.readFileSync(nativeFile));
      await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(nativeFile);await p.getByRole('button',{name:title,exact:true}).waitFor();await open(p);
      assert.equal(hash((await h.save(p,'before-repaired-export')).snapshot.studioDocument),receipt.projectHash);
      for(const layer of native.snapshot.overlays.filter(o=>o.type==='video'&&o.perspective)){
        await motionTarget(p,layer.id);
        for(const key of native.snapshot.motionKeyframes.filter(k=>k.targetId===layer.id&&k.property==='perspectiveProgress'&&k.value===0)){
          await seek(p,key.time);await number(p,'Y',50);await number(p,'Scale',100/layer.width);
        }
      }
      const changed=await h.save(p,'matched-source-transitions');await backup(p,'NATIVE-OPENING-SEAMLESS');
      progress.previousRenders=[...(progress.previousRenders||[]),receipt.jobId];delete progress.renderSubmitted;delete progress.rendered;delete progress.fullStudioPlayback;
      done('sourceMatchedTransitions',{projectHash:hash(changed.snapshot.studioDocument)});
      await render(p);
    }
    else if(action==='revision-render'){
      assert(progress.renderSubmitted&&!progress.rendered,'Revision follows the retained failed export only.');
      for(const key of Object.keys(progress))delete progress[key];
      await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,'RAW-EDITABLE.autopromote.json'));
      await p.getByRole('button',{name:title,exact:true}).waitFor();
      await author(p);await render(p);
    }
    else if(action==='repair-render'){
      assert(progress.authored&&progress.renderSubmitted&&!progress.rendered,'Repair retry follows the retained failed native export.');
      delete progress.renderSubmitted;delete progress.renderRequestCaptured;
      const nativeFile=path.join(folder,fs.existsSync(path.join(folder,'NATIVE-OPENING-OPTIMIZED.autopromote.json'))?'NATIVE-OPENING-OPTIMIZED.autopromote.json':'NATIVE-OPENING.autopromote.json');
      const native=JSON.parse(fs.readFileSync(nativeFile));
      await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(nativeFile);
      await p.getByRole('button',{name:title,exact:true}).waitFor();await open(p);
      const restored=await h.save(p,'native-restored');
      assert.equal(hash(restored.snapshot.studioDocument),hash(native.snapshot.studioDocument));
      done('nativeBackupRestore',{exact:true,projectHash:hash(restored.snapshot.studioDocument)});
      for(const t of []){ // Existing eight settled native pairs are retained; the edit itself is unchanged.
        await seek(p,t);await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.press('Escape');
        await p.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=2},null,{timeout:20000});
        await p.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});
        const observed=await p.getByTestId('studio-after-video').evaluate(v=>({currentTime:v.currentTime,paused:v.paused,seeking:v.seeking,readyState:v.readyState}));
        fs.writeFileSync(path.join(folder,`live-${t}-clock.json`),JSON.stringify({programmeTime:t,...observed},null,2));
      }
      await render(p);
    }
    else if(action==='observe'||action==='final-review'){
      await observePlayback(p);
      if(action==='final-review')for(const t of [0,2.5,2.95,3.5,6.4,7.46,8.25,9.2,10.8,13.1,14.46,15.7]){
        await seek(p,t);await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.press('Escape');await p.waitForTimeout(300);
        await p.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});
        const clock=await p.getByTestId('studio-after-video').evaluate(v=>({sourceTime:v.currentTime,seeking:v.seeking,readyState:v.readyState}));
        fs.writeFileSync(path.join(folder,`live-${t}-clock.json`),JSON.stringify({programmeTime:t,...clock},null,2));
      }
    }
    else if(action==='inspect'){console.log((await p.locator('body').innerText()).slice(-2200))}
  }catch(e){
    fs.writeFileSync(path.join(folder,'last-error.json'),JSON.stringify({error:e.stack},null,2));
    await p.screenshot({path:path.join(folder,`failure-${Date.now()}.png`)}).catch(()=>{});throw e;
  }finally{
    fs.writeFileSync(stateFile,JSON.stringify(await context.storageState({indexedDB:true})),{mode:0o600});
    fs.writeFileSync(path.join(folder,'denied-external-requests.json'),JSON.stringify(denied,null,2));
    await context.close();await browser.close();
  }
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
