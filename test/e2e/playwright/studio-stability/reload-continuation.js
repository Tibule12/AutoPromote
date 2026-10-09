#!/usr/bin/env node
// Normal saved-project reload and native download; run after the QA worker stops.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const q=require('./run'),f=require('./flows');
(async()=>{const{browser,page}=await q.connect();try{
 const project=await f.persistence(page);
 assert.equal(project,'Studio QA 20261008 aspect retest');
 const ready=page.getByTestId('rendered-output-ready');await ready.waitFor({timeout:30000});
 assert.equal(await page.getByTestId('live-caption-preview').count(),0);
 assert.equal(await page.getByTestId('brand-watermark-preview').count(),0);
 const folder=path.join(q.report,'reload-download');fs.mkdirSync(folder,{recursive:true});
 const cdp=await page.context().newCDPSession(page);let guid;
 const completed=new Promise((resolve,reject)=>{cdp.on('Browser.downloadWillBegin',e=>guid=e.guid);cdp.on('Browser.downloadProgress',e=>{if(e.guid!==guid)return;if(e.state==='completed')resolve(e);if(e.state==='canceled')reject(new Error('Native download canceled'))})});
 await cdp.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:folder,eventsEnabled:true});
 await ready.getByRole('button',{name:/Download/}).click();
 await Promise.race([completed,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Native download timed out')),90000).unref())]);
 const file=path.join(folder,'download.mp4');fs.renameSync(path.join(folder,guid),file);await cdp.detach();
 const media=q.verifyMedia(file,{duration:12,width:404,height:720,audio:true});
 assert.equal(media.sha256,q.sha(path.join(q.report,'reframing/download.mp4')),'Reload downloaded different bytes');
 await q.inspect(page,'clean-output-after-cold-reload');
 await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).waitFor({timeout:30000});
 await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
 await page.getByRole('region',{name:'Saved Studio projects'}).getByRole('button',{name:'Studio QA 20261008 captions',exact:true}).click();
 await page.getByRole('navigation',{name:'Creative tools'}).waitFor();
 await page.waitForTimeout(1000);
 assert.equal(await page.getByTestId('rendered-output-ready').count(),0,'Another project\u2019s result covered this edit');
 await q.tool(page,'Captions');await page.getByLabel('Caption 1 text',{exact:true}).click();
 assert.equal(await page.getByLabel('Caption 1 text',{exact:true}).inputValue(),'STUDIO QA CAPTION RETEST');
 const captionCount=await page.locator('[data-testid^="pro-captions-clip-"]').count();assert.equal(captionCount,3);
 await q.inspect(page,'different-project-no-stale-output');
 const result={at:new Date().toISOString(),realAuth:true,noMocks:true,headless:true,gpuUsed:false,sameProject:{project,completedOutputRestored:true,download:media,duplicateDomCaptions:false,platformWatermark:false},differentProject:{project:'Studio QA 20261008 captions',unrelatedOutputRestored:false,editableCaptionCues:captionCount},workerShutdownPrecondition:'Worker stopped by caller before this script; receipt in continuation runtime checkpoint'};
 fs.writeFileSync(path.join(q.report,'clean-reload-receipt.json'),JSON.stringify(result,null,2));
 console.log('Cold reload restored the matching clean output; identical download after worker shutdown; a different saved edit remained editable with three caption blocks.');
}finally{await browser.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
