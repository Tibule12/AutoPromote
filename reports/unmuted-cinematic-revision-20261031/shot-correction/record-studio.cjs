// Review the real Blender movie as one imported clip in the existing Studio.
// Loopback media/bootstrap adapters only; no application changes or export claim.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=process.env.SHOT_REVIEW_FOLDER||__dirname,repo=path.resolve(__dirname,'../../..'),base='http://127.0.0.1:6345';
fs.mkdirSync(path.join(root,'private'),{recursive:true});fs.mkdirSync(path.join(root,'frames'),{recursive:true});
const movie=process.argv[2]||'/home/tibule12/Videos/Unmuted - Shot Correction - 20261031/Corrected Shot - 3 seconds.mp4';
const bytes=fs.readFileSync(movie),hash=crypto.createHash('sha256').update(bytes).digest('hex');
const k=require(path.join(repo,'src/generated/studioDirectorReplayKernel.cjs'));
const s=JSON.parse(fs.readFileSync(path.join(__dirname,'../review/Editable Studio Project.json'))).snapshot;
for(const name of ['projectMedia','angleGroups','overlays','captionSegments','finishKeyframes','reframeKeyframes','speakerStackSources','speakerFocusCuts','reframeModeCuts','soundEffects','motionKeyframes','motionScenes','threeDScenes','subjectVfxScenes','speedKeyframes','voiceovers','adjustmentLayers','compositionOrder','compoundClips'])s[name]=[];
const id='unmuted-shot-correction-20261031',url='/shot-correction-review.mp4',sourceId='corrected-shot';
s.orderedClips=[{id:sourceId,name:'Corrected Blender shot · imported movie',start:0,end:3,duration:3,url,contentHash:hash}];
s.timeline=[{id:'corrected-shot-occurrence',sourceClipId:sourceId,name:'Corrected Blender shot · 3 seconds',startRequest:0,endRequest:3,duration:3,sourceDuration:3,url,contentHash:hash}];
s.selectedClipId=sourceId;s.activeTimelineIndex=0;s.trackStates={};s.audioKeyframes={};s.motionTargetId='main-video';
s.cutRangeStart=0;s.cutRangeEnd=3;s.hookPreviewLoop=false;s.musicTrack=null;s.addMusic=false;s.autoCaptions=false;
s.extractedAudio=null;s.audioRestoration={...s.audioRestoration,enabled:false};s.muteOriginalAudio=false;
s.studioDocument=k.adaptStudioSnapshotToDocument({projectId:id,snapshot:s});
const project={id,name:'UNMUTED · shot correction review',createdAt:Date.now(),updatedAt:Date.now(),snapshot:s};
fs.writeFileSync(path.join(root,'private/review-project.json'),JSON.stringify(project,null,2));
async function main(){
 const assetList=await(await fetch(base+'/api/cinematic/assets')).json();
 assetList.assets.push({id:hash,name:'Corrected Shot - 3 seconds.mp4',duration:3,width:1280,height:720,hasAudio:true,bytes:bytes.length});
 const context=await chromium.launchPersistentContext(path.join(root,'private/review-browser'),{headless:true,args:['--mute-audio'],viewport:{width:1680,height:1050}});
 const page=context.pages()[0],errors=[],external=[];page.setDefaultTimeout(20000);
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(['http:','https:'].includes(u.protocol)&&u.origin!==base){external.push(u.origin);return route.abort();}
  if(u.pathname==='/api/cinematic/assets')return route.fulfill({json:assetList});
  if(u.pathname==='/review-project.json')return route.fulfill({json:project});
  if(u.pathname===url){
   const range=route.request().headers().range;
   if(range){const [,a,b]=/bytes=(\d+)-(\d*)/.exec(range);const first=Number(a),last=b?Math.min(bytes.length-1,Number(b)):bytes.length-1;
    return route.fulfill({status:206,contentType:'video/mp4',headers:{'accept-ranges':'bytes','content-range':`bytes ${first}-${last}/${bytes.length}`},body:bytes.subarray(first,last+1)});}
   return route.fulfill({contentType:'video/mp4',headers:{'accept-ranges':'bytes'},body:bytes});
  }
  return route.continue();
 });
 page.on('pageerror',e=>errors.push(e.message));
 const folder=path.join(root,'private/studio-frames');fs.mkdirSync(folder,{recursive:true});
 let cdp;
 try{
  await page.goto(base+'/?project='+id);await page.getByRole('button',{name:'After',exact:true}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v?.readyState>=2&&v.duration===3;});
  const pause=page.getByRole('button',{name:'Pause edited preview',exact:true});if(await pause.count())await pause.click();
  await page.getByLabel('Edited output position',{exact:true}).focus();await page.keyboard.press('Home');
  await page.keyboard.press('Control+k');await page.getByPlaceholder('Find a tool, effect or workflow…').fill('Save project checkpoint');
  await page.getByRole('button',{name:/Save project checkpoint/}).click();await page.waitForTimeout(800);
  await page.screenshot({path:path.join(root,'frames/studio-review.png')});
  cdp=await context.newCDPSession(page);const frames=[];
  cdp.on('Page.screencastFrame',e=>{const f=path.join(folder,String(frames.length).padStart(5,'0')+'.jpg');fs.writeFileSync(f,Buffer.from(e.data,'base64'));frames.push({file:f,time:e.metadata.timestamp});void cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId});});
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:80,maxWidth:1680,maxHeight:1050,everyNthFrame:1});
  await page.getByLabel('Edited output position',{exact:true}).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Home');
  const started=await page.evaluate(async()=>{
   const v=document.querySelector('[data-testid="studio-after-video"]');assertMedia(v);
   function assertMedia(v){if(v.muted||v.volume===0)throw Error('Actual monitor audio disabled');}
   const stream=v.captureStream();if(stream.getAudioTracks().length!==1)throw Error('No live audio track');
   const ac=new AudioContext({sampleRate:48000}),dest=ac.createMediaStreamDestination();
   ac.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(dest);
   const zero=ac.createConstantSource();zero.offset.value=0;zero.connect(dest);zero.start();await ac.resume();
   const rec=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus'}),chunks=[];
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const done=new Promise(r=>rec.onstop=r);
   window.shotCapture={v,ac,zero,rec,chunks,done,max:0,ended:false};
   v.addEventListener('ended',()=>{const c=window.shotCapture;c.ended=true;c.max=Math.max(c.max,c.v.currentTime);},{once:true});
   const watch=()=>{const c=window.shotCapture;c.max=Math.max(c.max,c.v.currentTime);if(!c.stopped)requestAnimationFrame(watch);};watch();
   const start=new Promise(r=>rec.onstart=()=>r((performance.timeOrigin+performance.now())/1000));rec.start(200);return start;
  });
  await page.waitForTimeout(200);await page.getByRole('button',{name:'Play edited preview',exact:true}).click();
  await page.waitForFunction(()=>window.shotCapture.ended&&window.shotCapture.max>=2.999,null,{timeout:12000});
  await page.evaluate(()=>window.shotCapture.v.pause());await page.waitForTimeout(250);
  const result=await page.evaluate(async()=>{const c=window.shotCapture;c.stopped=true;c.rec.stop();await c.done;const buf=new Uint8Array(await new Blob(c.chunks).arrayBuffer());let value='';for(const b of buf)value+=String.fromCharCode(b);c.zero.stop();await c.ac.close();return{audio:btoa(value),maximumMediaTime:c.max,ended:c.ended,stopped:(performance.timeOrigin+performance.now())/1000};});
  await cdp.send('Page.stopScreencast');await cdp.detach();cdp=null;
  assert(frames.length>=12,'Short-shot capture must contain real moving UI frames');assert(result.ended&&result.maximumMediaTime>=2.999,'Capture the actual end, including the last two picture frames and audio tail');
  const audio=path.join(root,'private/actual-monitor-audio.webm');fs.writeFileSync(audio,Buffer.from(result.audio,'base64'));
  const end=Math.max(result.stopped,frames.at(-1).time+.04),list=path.join(root,'private/studio-frames.ffconcat');
  fs.writeFileSync(list,'ffconcat version 1.0\n'+frames.map((f,i)=>`file '${f.file}'\nduration ${Math.max(.001,(frames[i+1]?.time??end)-f.time)}\n`).join('')+`file '${frames.at(-1).file}'\n`);
  const output=path.join(path.dirname(movie),process.env.SHOT_RECORDING_NAME||'Studio Shot Playback with Sound.mp4');
  execFileSync('ffmpeg',['-v','error','-safe','0','-i',list,'-itsoffset',String(started-frames[0].time),'-i',audio,'-map','0:v:0','-map','1:a:0','-vf','fps=24,format=yuv420p','-af','aresample=48000:async=1:first_pts=0','-c:v','libx264','-threads','2','-crf','19','-c:a','aac','-b:a','192k','-t',String(end-frames[0].time),'-movflags','+faststart',output],{timeout:30000});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  fs.writeFileSync(path.join(root,'studio-playback.json'),JSON.stringify({headless:true,mutedDevice:true,screenFrames:frames.length,maximumMediaTime:result.maximumMediaTime,mediaEnded:result.ended,duration:end-frames[0].time,external,errors,output,
    bootstrap:'Existing Studio, one actual flattened movie; loopback media/bootstrap adapters, native checkpoint and complete playback. No native 3D editing/export claim.',
    audio:'Actual HTMLMediaElement.captureStream monitor audio; no disk soundtrack substitution'},null,2));
 }finally{if(cdp)await cdp.detach().catch(()=>{});await context.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
