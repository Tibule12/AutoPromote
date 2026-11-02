#!/usr/bin/env node
// Capture the actual Studio UI and its playing monitor's live audio stream.
// Browser/device output stays muted. No soundtrack is substituted from disk.
const {chromium}=require("playwright");
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {spawn}=require("node:child_process");
const ROOT=path.resolve(__dirname,"../.."),report=path.join(ROOT,"reports/unmuted-comeback-20261031"),base="http://127.0.0.1:6341";
function encode(args){return new Promise((resolve,reject)=>{const child=spawn("ffmpeg",args,{stdio:["ignore","ignore","pipe"]});let error="";child.stderr.on("data",b=>error+=b);child.on("error",reject);child.on("close",code=>code?reject(Error(error.slice(-2000))):resolve());});}
async function capture(page,format,options={}){
 const report=options.report||path.join(ROOT,"reports/unmuted-comeback-20261031");
 const endTime=options.endTime??27.4;
 const folder=path.join(report,"private-local",`live-audio-${format}-${Date.now()}`);fs.mkdirSync(folder,{recursive:true});
 const cdp=await page.context().newCDPSession(page),frames=[];
 let bytes=0,failure;
 cdp.on("Page.screencastFrame",event=>{
  bytes+=Buffer.byteLength(event.data,"base64");
  if(bytes>256*1024**2)failure="Capture exceeded its 256 MB frame budget";
  if(!failure){const file=path.join(folder,`${String(frames.length).padStart(6,"0")}.jpg`);fs.writeFileSync(file,Buffer.from(event.data,"base64"));frames.push({file,time:event.metadata.timestamp});}
  void cdp.send("Page.screencastFrameAck",{sessionId:event.sessionId}).catch(()=>{});
 });
 const setup=await page.evaluate(async()=>{
  const video=document.querySelector('[data-testid="studio-after-video"]');
  if(!video||video.readyState<2||video.muted||video.volume===0)throw Error("Finished monitor must be loaded with its audio enabled");
  const stream=video.captureStream(),tracks=stream.getAudioTracks();
  if(tracks.length!==1)throw Error("Actual monitor did not expose one live audio track");
  const context=new AudioContext({sampleRate:48000}),destination=context.createMediaStreamDestination();
  const source=context.createMediaStreamSource(new MediaStream(tracks));source.connect(destination);
  // Continuously clock silence through pauses so recorded timestamps retain
  // real wall time; this signal is exactly zero and never replaces speech.
  const zero=context.createConstantSource();zero.offset.value=0;zero.connect(destination);zero.start();await context.resume();
  const recorder=new MediaRecorder(destination.stream,{mimeType:"audio/webm;codecs=opus",audioBitsPerSecond:192000});
  const chunks=[];recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  const done=new Promise(resolve=>recorder.onstop=resolve);
  window.__studioAudioCapture={context,source,destination,zero,recorder,chunks,done,video,sourceUrl:video.src};
  const watch=()=>{const c=window.__studioAudioCapture;c.maximumMediaTime=Math.max(c.maximumMediaTime||0,video.currentTime);if(!c.finished)c.frame=requestAnimationFrame(watch);};watch();
  return{sourceUrl:video.src,muted:video.muted,volume:video.volume,tracks:tracks.map(t=>({kind:t.kind,enabled:t.enabled,readyState:t.readyState}))};
 });
 await cdp.send("Page.startScreencast",{format:"jpeg",quality:78,maxWidth:1680,maxHeight:1050,everyNthFrame:2});
 // A paused compositor may not paint until the next actual UI change.
 // Establish the screen clock with real seeks before starting sound/playback.
 const seekControl=page.getByLabel("Edited output position",{exact:true});
 // Native keyboard steps use the input's own frame grid. Chrome can reject a
 // decimal fill for repeating 24fps fractions as a malformed range value.
 await seekControl.focus();
 await seekControl.press("Home");
 await seekControl.press("ArrowRight");
 await seekControl.press("ArrowRight");
 await page.waitForTimeout(150);
 await seekControl.press("Home");
 for(let i=0;i<30&&!frames.length;i++)await page.waitForTimeout(100);
 assert(frames.length,"The real Studio UI must paint before recording playback audio");
 await page.waitForTimeout(200);
 const started=await page.evaluate(async()=>{const c=window.__studioAudioCapture;const started=new Promise(resolve=>c.recorder.onstart=()=>resolve({epoch:(performance.timeOrigin+performance.now())/1000,contextTime:c.context.currentTime}));c.recorder.start(250);return started;});
 await page.waitForTimeout(350);
 await page.getByRole("button",{name:"Play edited preview",exact:true}).click();
 const playback=[];
 for(let i=0;i<Math.ceil((endTime+10)/.4);i++){
  await page.waitForTimeout(400);
  const sample=await page.evaluate(()=>{const c=window.__studioAudioCapture;return{epoch:(performance.timeOrigin+performance.now())/1000,mediaTime:c.video.currentTime,maximumMediaTime:c.maximumMediaTime,paused:c.video.paused,ended:c.video.ended,sourceUrl:c.video.src};});
  playback.push(sample);if(sample.maximumMediaTime>endTime)break;
 }
 assert(playback.some(p=>p.maximumMediaTime>endTime),"The recorded Studio playback must reach the end");
 // At EOF Studio can switch its button to Play between a locator count and
 // click. Stop the captured media directly; this is recording transport only.
 await page.evaluate(()=>window.__studioAudioCapture.video.pause());
 await page.waitForTimeout(400);
 const audio=await page.evaluate(async()=>{const c=window.__studioAudioCapture;const stopped=(performance.timeOrigin+performance.now())/1000;c.finished=true;cancelAnimationFrame(c.frame);c.recorder.stop();await c.done;const bytes=new Uint8Array(await new Blob(c.chunks,{type:c.recorder.mimeType}).arrayBuffer());let binary="";for(const value of bytes)binary+=String.fromCharCode(value);c.source.disconnect();c.zero.stop();await c.context.close();return{base64:btoa(binary),stopped,mimeType:c.recorder.mimeType};});
 await cdp.send("Page.stopScreencast");await cdp.detach();
 fs.writeFileSync(path.join(folder,"clock-diagnostic.json"),JSON.stringify({first:frames[0]?.time,last:frames.at(-1)?.time,started,stopped:audio.stopped,frames:frames.length},null,2));
 assert(!failure,failure);assert(frames.length>100);assert(frames[0].time<started.epoch&&frames.at(-1).time>started.epoch);
 const audioPath=path.join(folder,"actual-monitor-audio.webm");fs.writeFileSync(audioPath,Buffer.from(audio.base64,"base64"));
 const list=path.join(folder,"frames.ffconcat"),end=Math.max(audio.stopped,frames.at(-1).time+.05);
 fs.writeFileSync(list,"ffconcat version 1.0\n"+frames.map((f,i)=>`file '${f.file}'\nduration ${Math.max(.001,(frames[i+1]?.time??end)-f.time).toFixed(9)}\n`).join("")+`file '${frames.at(-1).file}'\n`);
 const offset=started.epoch-frames[0].time,output=path.join(report,"review",`Studio playback with sound - ${format}.mp4`);
 await encode(["-nostdin","-v","error","-safe","0","-i",list,"-itsoffset",String(offset),"-i",audioPath,
  "-map","0:v:0","-map","1:a:0","-vf","fps=24,format=yuv420p","-af","aresample=48000:async=1:first_pts=0",
  "-c:v","libx264","-threads","2","-preset","fast","-crf","19","-c:a","aac","-b:a","192k","-t",String(end-frames[0].time),"-movflags","+faststart","-y",output]);
 const result={format,output,audioPath,screenFrames:frames.length,frameBytes:bytes,screenStartEpoch:frames[0].time,audioStartEpoch:started.epoch,audioOffsetSeconds:offset,endedAtEpoch:end,duration:end-frames[0].time,
  audioCapture:"Live HTMLMediaElement.captureStream -> Web Audio MediaStreamDestination -> MediaRecorder; no disk soundtrack",
  deviceOutputMuted:true,timelineVisible:true,completePlayback:true,setup,playback};
 fs.writeFileSync(path.join(folder,"capture.json"),JSON.stringify(result,null,2));console.log(format,"actual Studio picture/audio captured",result.duration.toFixed(2),"seconds",frames.length,"frames");
 return result;
}
async function main(){
 const context=await chromium.launchPersistentContext(path.join(report,"private-local/native-browser"),{headless:true,args:["--mute-audio"],viewport:{width:1680,height:1050}});
 const page=context.pages()[0];page.setDefaultTimeout(20000);const errors=[],external=[],captures=[];
 page.on("pageerror",error=>errors.push(error.message));await context.route("**/*",route=>{const u=new URL(route.request().url());if(["http:","https:"].includes(u.protocol)&&u.origin!==base){external.push(u.origin);return route.abort();}return route.continue();});
 try{
  for(const format of ["portrait","landscape"]){
   const expected=JSON.parse(fs.readFileSync(path.join(report,`review/${format}-native-render.json`)));
   await page.goto(base+`/?project=unmuted-comeback-${format}-20261031&offlineWorker=true`);
   await page.getByRole("button",{name:"After",exact:true}).click();
   let pause=page.getByRole("button",{name:"Pause edited preview",exact:true});if(await pause.count())await pause.click();
   await page.getByRole("button",{name:"Export",exact:true}).click();
   const event=page.waitForResponse(r=>r.url()===base+"/api/cinematic/offline-programmes"&&r.request().method()==="POST");
   await page.getByRole("button",{name:"Render Final Clip",exact:true}).click();const response=await event,job=await response.json();assert(response.ok(),JSON.stringify(job));assert.equal(job.id,expected.id);assert.equal(job.reused,true,"Capture must reuse the completed movie");
   await page.waitForFunction(url=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v?.src.endsWith(url)&&v.readyState>=2;},job.movieUrl);
   pause=page.getByRole("button",{name:"Pause edited preview",exact:true});if(await pause.count())await pause.click();
   await page.getByLabel("Edited output position",{exact:true}).fill("0");await page.waitForTimeout(600);
   captures.push(await capture(page,format));
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const list=path.join(report,"private-local/sound-recordings.ffconcat");fs.writeFileSync(list,"ffconcat version 1.0\n"+captures.map(c=>`file '${c.output}'\n`).join(""));
  const output=path.join(report,"review/Studio Playback with Sound.mp4");
  await encode(["-nostdin","-v","error","-safe","0","-i",list,"-map","0:v:0","-map","0:a:0","-c","copy","-movflags","+faststart","-y",output]);
  fs.writeFileSync(path.join(report,"review/studio-sound-capture.json"),JSON.stringify({headless:true,deviceOutputMuted:true,actualMonitorAudioCaptured:true,external,browserErrors:errors,output,captures},null,2));
  console.log("Actual Studio recording now includes captured live monitor audio",output);
 }finally{await context.close();}
}
if(require.main===module)main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
module.exports={capture};
