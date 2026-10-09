#!/usr/bin/env node
// Decode and play the actual artifact in a native headless, muted video player.
const {chromium}=require('playwright');
const fs=require('fs/promises'),path=require('path'),assert=require('assert/strict');
const {hash}=require('../../src/modelRuntime/contract');
const {root}=require('./proof');
async function main() {
  const kind=process.argv[2] || 'final';
  if(!['generation','final'].includes(kind))throw Error('Use generation | final');
  const relative=kind==='final'?'final/final.mp4':'outputs/generate_video/generated_shot.mp4';
  const bytes=await fs.readFile(path.join(root,relative));
  const browser=await chromium.launch({headless:true,args:['--mute-audio']});
  const receipt={kind,at:new Date().toISOString(),headless:true,muted:true,sha256:hash(bytes),samples:[]};
  try {
    const page=await browser.newPage({viewport:{width:1280,height:760}});
    await page.setContent('<body style="margin:0;background:#000"><video id="actual" muted controls style="width:1280px;height:720px" src="http://127.0.0.1:6021/factory-media/'+relative+'"></video></body>');
    await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
    receipt.before=await page.evaluate(()=>{const v=document.querySelector('video');return {width:v.videoWidth,height:v.videoHeight,duration:v.duration,error:v.error?.code || null};});
    assert(receipt.before.width>0 && receipt.before.duration>0 && !receipt.before.error);
    await page.evaluate(()=>document.querySelector('video').play());
    for(const time of kind==='final'?[.6,2,3.6,5.2,7.4]:[.6,1.8,3,4.4]) {
      await page.waitForFunction(t=>document.querySelector('video').currentTime>=t,time,{timeout:15000});
      const state=await page.evaluate(()=>{const v=document.querySelector('video');return {currentTime:v.currentTime,paused:v.paused,ended:v.ended,frames:v.getVideoPlaybackQuality().totalVideoFrames};});
      receipt.samples.push(state);
      await page.locator('video').screenshot({path:path.join(root,'qa',`${kind}-native-playback-${time}.png`)});
    }
    await page.waitForFunction(()=>document.querySelector('video').ended,null,{timeout:15000});
    receipt.after=await page.evaluate(()=>{const v=document.querySelector('video'),q=v.getVideoPlaybackQuality();return {currentTime:v.currentTime,ended:v.ended,totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames,error:v.error?.code || null};});
    assert(receipt.after.ended && !receipt.after.error);assert(receipt.after.totalVideoFrames>100);
    receipt.status='PASS';receipt.scope='Actual media playback; pixel/contact-sheet inspection is separately recorded. Audio muted, no human listening claimed.';
  } finally {await browser.close();await fs.writeFile(path.join(root,`${kind}-native-playback.json`),JSON.stringify(receipt,null,2));}
  console.log(JSON.stringify({kind,status:receipt.status,sha256:receipt.sha256,duration:receipt.before.duration,...receipt.after}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
