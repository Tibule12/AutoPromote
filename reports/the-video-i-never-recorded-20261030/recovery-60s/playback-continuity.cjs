// Real-time decoder observation of local raw source only. No Studio, auth,
// cloud media URLs, provider operations or production network connections.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const proof=path.resolve(__dirname,'../proof/recovery-continuity');
const take=Number(process.argv[2]);assert([1,2].includes(take));
(async()=>{
  const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio']});
  const context=await browser.newContext();const page=await context.newPage();
  const network=[];
  page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(new URL(r.url()).origin)});
  try{
    await page.goto(pathToFileURL(path.join(proof,`take-${take}.mp4`)).href,{waitUntil:'domcontentloaded'});
    const video=page.locator('video');await video.waitFor();
    await page.waitForFunction(()=>{const v=document.querySelector('video');return v?.readyState>=3});
    await video.evaluate(async v=>{
      v.muted=true;v.pause();v.currentTime=0;v.playbackRate=1;
      const data={frames:[],events:[],startedAt:0,endedAt:0};
      v.__sourceObservation=data;
      for(const name of ['playing','waiting','stalled','ended','error'])v.addEventListener(name,()=>{
        data.events.push({type:name,wall:performance.now(),time:v.currentTime});
        if(name==='ended')data.endedAt=performance.now();
      });
      const frame=(_now,m)=>{data.frames.push({mediaTime:m.mediaTime,displayTime:m.expectedDisplayTime,presentedFrames:m.presentedFrames});if(!v.ended)v.requestVideoFrameCallback(frame)};
      v.requestVideoFrameCallback(frame);data.startedAt=performance.now();await v.play();
    });
    await page.waitForFunction(()=>document.querySelector('video')?.ended,{timeout:20000});
    const result=await video.evaluate(v=>({take:Number(new URL(v.currentSrc).pathname.match(/take-(\d)/)[1]),
      duration:v.duration,ended:v.ended,position:v.currentTime,width:v.videoWidth,height:v.videoHeight,
      playbackRate:v.playbackRate,quality:{totalVideoFrames:v.getVideoPlaybackQuality().totalVideoFrames,
        droppedVideoFrames:v.getVideoPlaybackQuality().droppedVideoFrames,
        corruptedVideoFrames:v.getVideoPlaybackQuality().corruptedVideoFrames},...v.__sourceObservation}));
    result.networkOrigins=network;result.headless=true;result.muted=true;
    result.scope='Normal-speed local-source decoder observation, not a perceptual voice/lip-sync/creative verdict or AutoPromote preview evidence.';
    assert(result.ended&&result.duration===8&&result.playbackRate===1);
    assert.equal(network.length,0,'No HTTP network access during local source playback.');
    const destination=path.join(proof,`take-${take}-playback.json`);
    if(fs.existsSync(destination))fs.copyFileSync(destination,destination.replace('.json',`-previous-${Date.now()}.json`));
    fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({take,duration:result.duration,ended:result.ended,observedFrames:result.frames.length,droppedFrames:result.quality.droppedVideoFrames,normalSpeed:true,networkRequests:network.length}));
  }finally{await context.close();await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
