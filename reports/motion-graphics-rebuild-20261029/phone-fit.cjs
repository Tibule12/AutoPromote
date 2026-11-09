// Actual encoded movies in declared fit scenarios. These are not platform screenshots.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const story=process.argv[2],folder=path.join(__dirname,'proof',story,process.env.STUDIO_MOTION_TAKE||'','tutorial',process.env.STUDIO_TUTORIAL_REVISION||'');
 const plan=JSON.parse(fs.readFileSync(path.join(folder,'lesson-plan.json')));
 const html=path.join(folder,'phone-fit.html');
 fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><title>Actual movie / declared frame fit</title><style>html,body{margin:0;background:#15151e}video{display:block;width:100vw;height:100vh;object-fit:contain}</style><video muted playsinline preload="auto" src="final/final.mp4"></video>');
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--disk-cache-size=16777216']});
 const records=[];
 try{
  for(const [name,width,height,fit]of (plan.fitScenarios||[['phone-contain',390,844,'contain'],['phone-centre-fill',390,844,'cover'],['feed-4-5-fill',400,500,'cover']])){
   const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
   await page.goto(pathToFileURL(html).href);const video=page.locator('video');
   await video.evaluate((v,f)=>{v.style.objectFit=f},fit);
   await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
   for(const row of plan.rows){
    const time=row.start+Math.min(3,row.duration/2);await video.evaluate((v,t)=>{v.currentTime=t},time);
    await page.waitForFunction(t=>{const v=document.querySelector('video');return !v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-t)<.03},time);
    await page.waitForTimeout(100);const file=`${name}-${row.id}.png`;await page.screenshot({path:path.join(folder,file)});
    records.push({name,width,height,fit,time,file});
   }await context.close();
  }
 }finally{await browser.close()}
 fs.writeFileSync(path.join(folder,'phone-fit-observation.json'),JSON.stringify({actualNativeMovie:true,fabricatedPlatformUI:false,
  physicalIPhoneOrExternalPlatformVerified:false,records,limitation:'Declared HTML contain/centre-fill/4:5 framing checks; actual app controls and device-specific platform crops remain unqualified.'},null,2)+'\n');
 console.log(story+': actual movie observed in three declared phone/feed fit scenarios.');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
