#!/usr/bin/env node
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const q=require('./run'),f=require('./flows');
(async()=>{const{browser,page}=await q.connect();try{
 await f.open(page,'Studio QA 20261008 GPU cuts speed');
 const ruler=page.getByTestId('pro-time-ruler');
 assert.equal(Number(await ruler.getAttribute('data-output-duration')),6);
 assert((await page.getByTestId('pro-video-clip-1').innerText()).includes('1.5s'));
 assert((await page.getByTestId('pro-video-clip-2').innerText()).includes('4.5s'));
 await f.seek(page,1.5);
 const footer=page.getByTestId('pro-current-edit');
 assert((await footer.innerText()).includes('0:01'));
 await q.inspect(page,'speed-clock-real-retest');
 fs.writeFileSync(path.join(q.report,'speed-clock-retest.json'),JSON.stringify({at:new Date().toISOString(),
 realAuth:true,noMocks:true,headless:true,rate:2,sourceDuration:12,outputDuration:6,
 clipDisplayDurations:[1.5,4.5],nativeSeekOutputSeconds:1.5,footer:await footer.innerText()},null,2));
 console.log('Real 2x timeline duration, clip labels and native output seek passed');
}finally{await browser.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
