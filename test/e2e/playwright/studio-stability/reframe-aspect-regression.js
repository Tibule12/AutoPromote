#!/usr/bin/env node
// Real face analysis in landscape -> switch to portrait -> render the same
// source path. Regression for detector centres lost when changing aspect.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const q=require('./run'),f=require('./flows');
(async()=>{const{browser,page}=await q.connect();const requests=[];try{
 await f.open(page,'Studio QA 20261008 captions');
 await f.duplicate(page,'Studio QA 20261008 aspect retest');
 await q.tool(page,'Reframe');await page.getByTestId('reframe-aspect-16-9').click();
 const analysis=page.waitForResponse(r=>/track-studio-faces$|studio-analysis-jobs.*\/result$/.test(new URL(r.url()).pathname),{timeout:90000});
 await page.getByTestId('analyze-source-shots').click();const response=await analysis;assert(response.ok());
 await page.getByText(/Podcast layout draft applied/).waitFor();
 await page.getByTestId('reframe-aspect-9-16').click();
 await page.getByTestId('studio-save-project').click();
 page.on('request',r=>{if(r.url().endsWith('/api/media/process')){const d=r.postDataJSON()?.options?.viralData;requests.push({brandWatermark:d?.brand_watermark,reframe:d?.finish_plan?.reframe,reviewCopy:d?.caption_review_copy})}});
 await q.inspect(page,'aspect-retest-editable');
 const result=await q.render(page,'reframing',{duration:12,width:404,height:720,audio:true,projectName:'Studio QA 20261008 aspect retest'});
 assert(requests.length&&requests.every(r=>r.brandWatermark===false));
 assert(requests[0].reframe?.keyframes.some(k=>Math.abs(k.x-50)>10),'Face path stayed centered after aspect change');
 fs.writeFileSync(path.join(q.report,'reframe-aspect-receipt.json'),JSON.stringify({at:new Date().toISOString(),headless:true,realAuth:true,noMocks:true,gpuUsed:false,analysisStatus:response.status(),requests,output:result.output,technical:result.technical,visualReview:'Pending; inspect faces and caption bounds before PASS'},null,2));
 console.log('Landscape analysis -> portrait export regression completed with a non-centered face path.');
}finally{await browser.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
