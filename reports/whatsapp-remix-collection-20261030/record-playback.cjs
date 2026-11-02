// Capture the actual Studio screen and its real browser audio. Capture-only
// instrumentation observes decoders; it does not alter the edit or responses.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const directory=process.argv[2],folder=process.env.CREDITS_REMIX_COLLECTION?path.resolve(process.env.CREDITS_REMIX_COLLECTION):path.join(__dirname,'private'),root=path.resolve(__dirname,'../..');
const config=JSON.parse(fs.readFileSync(path.join(directory,'browser-private.json')));
const ownAccount=process.env.STUDIO_REAL_ACCOUNT_LOCAL==='true';
if(ownAccount)assert.equal(config.origin,'http://localhost:5008');
const {seek}=require(path.join(root,'test/e2e/playwright/studio-stability/flows'));
const {clickStudioControl}=require(path.join(root,'test/e2e/playwright/studio-timeline-layout'));
async function capture(p,dir,speed){
 const frames=path.join(dir,'capture-frames');
 if(fs.existsSync(frames)){
  const old=fs.readdirSync(frames).filter(name=>name.endsWith('.jpg')).sort();
  for(const i of [0,Math.floor(old.length/2),old.length-1])if(old[i])fs.copyFileSync(path.join(frames,old[i]),path.join(dir,`failed-capture-${i}.jpg`));
  fs.rmSync(frames,{recursive:true,force:true});
 }
 fs.mkdirSync(frames,{recursive:true});
 const session=await p.context().newCDPSession(p),images=[];let bytes=0,failure;
 session.on('Page.screencastFrame',event=>{const buffer=Buffer.from(event.data,'base64');bytes+=buffer.length;if(bytes>384*1024**2)failure='Capture exceeds 384 MiB';if(!failure){const file=path.join(frames,String(images.length).padStart(6,'0')+'.jpg');fs.writeFileSync(file,buffer);images.push({file,time:event.metadata.timestamp});}void session.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});});
 const audioFile=path.join(dir,'browser-audio.webm');fs.writeFileSync(audioFile,Buffer.alloc(0));
 await p.exposeBinding('__captureAudioChunk',(_source,data)=>fs.appendFileSync(audioFile,Buffer.from(data,'base64'))).catch(()=>{});
 await p.evaluate(()=>{
  const video=document.querySelector('[data-testid=studio-after-video]');
  const context=video.__webAudioContext || new AudioContext();
  const source=video.__webAudioSource || context.createMediaElementSource(video);
  video.__webAudioContext=context;video.__webAudioSource=source;
  const destination=context.createMediaStreamDestination();source.connect(destination);
  const recorder=new MediaRecorder(destination.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});
  const quality=()=>{const q=video.getVideoPlaybackQuality?.();return q?{totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames,corruptedVideoFrames:q.corruptedVideoFrames}:null;};
  const state={recorder,source,destination,context,start:null,samples:[],waiting:[],lastSample:-1,initial:quality(),quality,pending:[]};
  recorder.ondataavailable=event=>{if(!event.data.size)return;const next=event.data.arrayBuffer().then(buffer=>{const data=new Uint8Array(buffer);let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));return window.__captureAudioChunk(btoa(binary));});state.pending.push(next);};
  const sample=(_now,metadata)=>{if(state.done)return;if(video.currentTime-state.lastSample>=.2){state.samples.push({wall:Date.now()/1000,media:video.currentTime,presented:metadata.mediaTime,before:document.querySelector('video[aria-label="Untouched source preview"]')?.currentTime??null});state.lastSample=video.currentTime;}state.frame=video.requestVideoFrameCallback(sample);};
  state.play=()=>{if(recorder.state==='inactive'){state.start=Date.now()/1000;recorder.start(500);state.frame=video.requestVideoFrameCallback(sample);}};
  state.wait=()=>{if(!video.paused)state.waiting.push({wall:Date.now()/1000,media:video.currentTime});};
  video.addEventListener('play',state.play);video.addEventListener('waiting',state.wait);window.__studioCapture=state;
  return context.resume();
 });
 await session.send('Page.startScreencast',{format:'jpeg',quality:45,maxWidth:1280,maxHeight:900,everyNthFrame:1});
 const play=p.getByRole('button',{name:'Play comparison',exact:true});await play.click();
 try { await p.waitForFunction(()=>{const v=document.querySelector('[data-testid=studio-after-video]');return v?.ended;},undefined,{timeout:150000}); }
 catch(error){const diagnostic=await p.evaluate(()=>{const v=document.querySelector('[data-testid=studio-after-video]'),s=window.__studioCapture;return {currentTime:v?.currentTime,duration:v?.duration,paused:v?.paused,ended:v?.ended,playbackRate:v?.playbackRate,samples:s?.samples,waiting:s?.waiting};}).catch(()=>({}));fs.writeFileSync(path.join(dir,'failed-playback-timing.json'),JSON.stringify(diagnostic,null,2));throw error;}
 const stats=await p.evaluate(async()=>{const state=window.__studioCapture,video=document.querySelector('[data-testid=studio-after-video]');state.done=true;video.cancelVideoFrameCallback(state.frame);video.removeEventListener('play',state.play);video.removeEventListener('waiting',state.wait);await new Promise(resolve=>{state.recorder.onstop=resolve;state.recorder.stop();});await Promise.all(state.pending);state.source.disconnect(state.destination);return {audioStart:state.start,samples:state.samples,waiting:state.waiting,initialQuality:state.initial,finalQuality:state.quality(),duration:video.duration,ended:video.ended,currentTime:video.currentTime};});
 await session.send('Page.stopScreencast');await session.detach();assert(!failure,failure);assert(images.length>5);assert(stats.ended);assert(fs.statSync(audioFile).size>1000);
 const concat=path.join(frames,'frames.ffconcat');fs.writeFileSync(concat,'ffconcat version 1.0\n'+images.map((image,i)=>`file '${image.file}'\nduration ${Math.max(.001,(images[i+1]?.time??image.time+.04)-image.time)}\n`).join('')+`file '${images.at(-1).file}'\n`);
 const offset=stats.audioStart-images[0].time;
 const args=['-v','error','-y','-safe','0','-i',concat];
 if(offset>=0)args.push('-itsoffset',String(offset));else args.push('-ss',String(-offset));
 args.push('-i',audioFile,'-map','0:v:0','-map','1:a:0','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2,fps=25','-c:v','libx264','-threads','2','-preset','veryfast','-crf','23','-c:a','aac','-b:a','192k','-pix_fmt','yuv420p','-movflags','+faststart',path.join(dir,'Studio — full synchronized playback.mp4'));
 fs.writeFileSync(path.join(dir,'raw-capture-timing.json'),JSON.stringify({...stats,screenFrames:images.length,screenAudioStartOffset:offset},null,2));
 if(process.argv[3])await p.close();
 execFileSync('ffmpeg',args,{timeout:600000});
 const steady=stats.samples.filter(s=>s.media>1&&s.media<stats.duration-.5);
 const first=steady[0],last=steady.at(-1);
 const drift=last&&first?(last.media-first.media)-(last.wall-first.wall):null;
 const dropped=(stats.finalQuality?.droppedVideoFrames||0)-(stats.initialQuality?.droppedVideoFrames||0),total=(stats.finalQuality?.totalVideoFrames||0)-(stats.initialQuality?.totalVideoFrames||0);
 const gaps=stats.samples.slice(1).map((s,i)=>Math.max(0,(s.wall-stats.samples[i].wall)-(s.media-stats.samples[i].media)));
 const verification={...stats,realBrowserAudio:true,realStudioScreen:true,headlessMuted:true,screenFrames:images.length,screenAudioStartOffset:offset,driftSeconds:drift,maxObservedStall:Math.max(0,...gaps),droppedFrames:dropped,totalFrames:total,sourceToOutputSpeed:speed,
  syncStatus:Math.abs(drift??Infinity)<.15&&Math.max(0,...gaps)<.25?'PASS':'REVIEW_REQUIRED',
  smoothnessStatus:dropped/Math.max(1,total)<.01?'PASS':'REVIEW_REQUIRED',
  status:Math.abs(drift??Infinity)<.15&&dropped/Math.max(1,total)<.01&&Math.max(0,...gaps)<.25?'PASS':'REVIEW_REQUIRED'};
 fs.writeFileSync(path.join(dir,'playback-sync.json'),JSON.stringify(verification,null,2));
 for(const image of images)fs.unlinkSync(image.file);fs.unlinkSync(concat);fs.rmdirSync(frames);
 console.log(JSON.stringify({preset:path.basename(dir),status:verification.status,seconds:stats.duration,driftSeconds:drift,droppedFrames:dropped,totalFrames:total,screenFrames:images.length}));
}
async function main(){
 const selected=process.argv[3], independent=Boolean(selected);
 const browser=independent?await chromium.launch({headless:true,args:['--mute-audio','--disk-cache-size=1048576']}):null;
 const context=independent?await browser.newContext({storageState:ownAccount?path.join(folder,'account-session.private.json'):path.join(folder,selected,'login.private.json'),viewport:{width:1440,height:1000},timezoneId:'Africa/Johannesburg'})
   :await chromium.launchPersistentContext(path.join(folder,'browser-profile'),{headless:true,args:['--mute-audio','--disk-cache-size=1048576'],viewport:{width:1440,height:1000},timezoneId:'Africa/Johannesburg'});
 if(!ownAccount)await context.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname==='127.0.0.1'||['data:','blob:'].includes(u.protocol)?r.continue():r.abort()});
 const p=context.pages()[0]||await context.newPage();p.setDefaultTimeout(45000);p.on('dialog',d=>d.accept());
 try{
  for(const name of selected?[selected]:fs.readdirSync(folder)){const dir=path.join(folder,name),delivery=path.join(dir,'delivery.json');if(!fs.existsSync(delivery))continue;
   const previous=path.join(dir,'playback-sync.json');
   if(fs.existsSync(previous)){
    if(JSON.parse(fs.readFileSync(previous)).status==='PASS')continue;
    const retained=path.join(dir,'rejected-canvas-playback-'+Date.now());fs.mkdirSync(retained,{recursive:true});
    for(const file of ['playback-sync.json','raw-capture-timing.json','browser-audio.webm','Studio — full synchronized playback.mp4'])if(fs.existsSync(path.join(dir,file)))fs.renameSync(path.join(dir,file),path.join(retained,file));
   }
   const data=JSON.parse(fs.readFileSync(delivery));if(ownAccount)assert.equal(data.actualOwnerAccount,true);await p.goto(config.origin);await(ownAccount?p.getByRole('button',{name:'Viral Clip Studio',exact:true}).first():p.getByTestId('shared-credit-balance')).waitFor({timeout:60000});await p.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
   const projectTitle=data.projectTitle||`${data.name} — WhatsApp remix · 30 October`;
   if(independent&&(!ownAccount||!await p.getByRole('button',{name:projectTitle,exact:true}).count())){const restore=p.getByLabel('Restore project backup',{exact:true});await restore.waitFor();await p.waitForFunction(()=>!document.querySelector('input[aria-label="Restore project backup"]')?.disabled);await restore.setInputFiles(path.join(dir,'FINAL-EDITABLE.autopromote.json'));}
   await p.getByRole('button',{name:data.projectTitle||`${data.name} — WhatsApp remix · 30 October`,exact:true}).first().click();
   await p.getByTestId('studio-pro-timeline').waitFor({timeout:90000});
   await clickStudioControl(p,p.getByRole('navigation',{name:'Creative tools'}).getByRole('button',{name:'Export',exact:true}));
   if(ownAccount&&fs.existsSync(path.join(dir,'native-export-receipt.json'))){
    await p.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.join(dir,'native-export-receipt.json'));
   }
   await p.getByTestId('rendered-output-ready').waitFor({timeout:90000});
   const finished=p.getByRole('button',{name:'Show Finished Video',exact:true});if(await finished.isVisible())await finished.click();
   if(!ownAccount)await clickStudioControl(p,p.getByRole('navigation',{name:'Creative tools'}).getByRole('button',{name:'Cut',exact:true}));
   const hide=p.getByRole('button',{name:'Hide media',exact:true});if(await hide.isVisible())await hide.click();
   const show=p.getByRole('button',{name:'Show timeline',exact:true});if(await show.isVisible())await show.click();
   await p.getByRole('button',{name:'Compare',exact:true}).click();await seek(p,0);
   if(ownAccount){await p.waitForTimeout(1000);await clickStudioControl(p,p.getByRole('navigation',{name:'Creative tools'}).getByRole('button',{name:'Export',exact:true}));const showFinal=p.getByRole('button',{name:'Show Finished Video',exact:true});if(await showFinal.isVisible())await showFinal.click();await p.getByRole('button',{name:'Compare',exact:true}).click();await seek(p,0);}
   const monitor=p.getByTestId('studio-after-video');const url=await monitor.getAttribute('src');
   const bytes=await context.request.get(url,{timeout:90000});if(!bytes.ok()){fs.writeFileSync(path.join(dir,'failed-finished-media-fetch.private.json'),JSON.stringify({status:bytes.status(),url,body:(await bytes.text()).slice(0,1200)},null,2),{mode:0o600});throw Error('Actual finished media GET failed with '+bytes.status()+' from '+new URL(url).origin);}
   const monitorHash=require('node:crypto').createHash('sha256').update(await bytes.body()).digest('hex');
   assert.equal(monitorHash,data.sha256,'After must play the exact delivered file');
   // Let the ordinary timeline finish its independent thumbnail seeks before
   // recording playback. Those silent decoders otherwise compete with the
   // two visible comparison players during the opening Hook.
   await p.waitForFunction(()=>!document.querySelector('[data-studio-thumbnail-decoder="true"]'),undefined,{timeout:90000});
   await p.getByTestId('studio-pro-timeline').scrollIntoViewIfNeeded();await p.getByRole('heading',{name:'Preview',exact:true}).scrollIntoViewIfNeeded().catch(()=>{});
   const snapshot=JSON.parse(fs.readFileSync(path.join(dir,'FINAL-EDITABLE.autopromote.json'))).snapshot;
   await capture(p,dir,snapshot.previewSpeed);
  }
 }catch(error){await p.screenshot({path:path.join(folder,'recording-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(folder,'recording-failure.txt'),await p.locator('body').innerText().catch(()=>''),{mode:0o600});throw error;}
 finally{await context.close();if(browser)await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
