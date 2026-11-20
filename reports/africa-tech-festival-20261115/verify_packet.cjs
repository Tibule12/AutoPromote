const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url'),{chromium}=require('playwright');
const root='/home/tibule12/Documents/AutoPromote — Africa Tech Festival 2026',proof=path.resolve('reports/africa-tech-festival-20261115/private');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--mute-audio','--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.setOffline(true);let errors=[],network=[];
 context.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url())});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(pathToFileURL(root+'/index.html').href);await page.getByRole('heading',{name:'Creative work, kept editable.',exact:true}).waitFor();
  const broken=await page.locator('a[href]').evaluateAll(links=>links.map(a=>({label:a.textContent,href:a.getAttribute('href')})));
  for(const item of broken)if(!/^https?:|mailto:/.test(item.href))assert(fs.existsSync(path.resolve(root,item.href)),item.href);
  await page.screenshot({path:proof+'/offline-dashboard-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile horizontal overflow');await page.screenshot({path:proof+'/offline-dashboard-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.goto(pathToFileURL(root+'/01 Pitch/Present offline.html').href);await page.locator('#slide').waitFor();
  for(let i=0;i<13;i++){await page.waitForFunction(()=>{const im=document.querySelector('#slide');return im.complete&&im.naturalWidth>0});assert.equal(await page.locator('#count').innerText(),`${i+1} / 13`);if(i<12)await page.keyboard.press('ArrowRight')}
  await page.getByRole('button',{name:'Speaker notes',exact:true}).click();assert(await page.locator('#speaker').isVisible());await page.screenshot({path:proof+'/offline-slides-last.png'});
  await page.goto(pathToFileURL(root+'/index.html').href);const video=page.locator('video');await video.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);await video.evaluate(v=>{v.muted=true;v.play()});
  console.log('Offline dashboard, mobile layout, links and all13slides pass. Playing the complete showcase.');
  let last=0;
  while(!await video.evaluate(v=>v.ended)){
   await page.waitForTimeout(1000);const state=await video.evaluate(v=>({time:v.currentTime,error:v.error?.message}));assert(!state.error,state.error);if(state.time-last>30){console.log('Playback '+state.time.toFixed(1)+' seconds');last=state.time}assert(state.time<190,'Bounded video duration');
  }
  const playback=await video.evaluate(v=>({duration:v.duration,ended:v.ended,width:v.videoWidth,height:v.videoHeight,decoded:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames}));assert(playback.ended&&playback.decoded>0);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);fs.writeFileSync(proof+'/browser-verification.json',JSON.stringify({offline:true,externalNetworkRequests:network.length,desktop:true,mobile390:true,relativeLinksResolve:true,allSlidesLoaded:13,speakerNotes:true,completeVideoPlayback:playback,mutedQa:true,errors},null,2));console.log('Complete offline showcase playback passed.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
