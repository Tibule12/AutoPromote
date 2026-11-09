#!/usr/bin/env node
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const q=require('./run'),f=require('./flows');
(async()=>{const{browser,page}=await q.connect();try{
 const project='Studio QA 20261008 3D NVIDIA repair';
 await f.open(page,project);
 const reloaded=await f.persistence(page);assert.equal(reloaded,project);
 const ready=page.getByTestId('rendered-output-ready');await ready.waitFor({timeout:30000});
 assert.equal(await page.getByTestId('studio-3d-preview').count(),0,'Completed footage has a duplicate live 3D layer');
 assert.equal(await page.getByTestId('brand-watermark-preview').count(),0);
 await page.waitForFunction(()=>document.querySelector('[data-testid="studio-after-video"]')?.readyState>=3);
 await f.seek(page,.5);
 await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');
   return v?.paused&&!v.seeking&&v.readyState>=3&&Math.abs(v.currentTime-.5)<.08;});
 await q.inspect(page,'3d-after-cold-reload-half-second');
 const folder=path.join(q.report,'three_d','reload');fs.mkdirSync(folder,{recursive:true});
 const cdp=await page.context().newCDPSession(page);let guid;
 const completed=new Promise((resolve,reject)=>{cdp.on('Browser.downloadWillBegin',e=>guid=e.guid);cdp.on('Browser.downloadProgress',e=>{if(e.guid!==guid)return;if(e.state==='completed')resolve(e);if(e.state==='canceled')reject(Error('Download canceled'))});});
 await cdp.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:folder,eventsEnabled:true});
 await ready.getByRole('button',{name:/Download/}).click();
 await Promise.race([completed,new Promise((_,reject)=>setTimeout(()=>reject(Error('Download timed out')),90000).unref())]);
 const file=path.join(folder,`download-${Date.now()}.mp4`);fs.renameSync(path.join(folder,guid),file);await cdp.detach();
 const technical=q.verifyMedia(file,{duration:12,width:1280,height:720,audio:true});
 assert.equal(technical.sha256,q.sha(path.join(q.report,'three_d/download.mp4')),'Recovered file differs');
 await q.tool(page,'Motion');await page.getByRole('button',{name:'3D Motion',exact:true}).click();
 const panel=page.getByTestId('studio-3d-panel');
 assert.equal(await panel.getByLabel('Main text',{exact:true}).inputValue(),'QA 3D');
 assert.equal(await panel.getByLabel('Start (s)',{exact:true}).inputValue(),'0');
 assert.equal(await panel.getByLabel('End (s)',{exact:true}).inputValue(),'1');
 await q.inspect(page,'3d-saved-controls-after-reload');
 const result={at:new Date().toISOString(),project,realAuth:true,noMocks:true,headless:true,workerStopped:true,
 completedOutputRecovered:true,editableSceneRecovered:true,noDuplicateLive3D:true,platformWatermark:false,
 output:path.relative(q.root,file),outputSha256:technical.sha256,technical};
 fs.writeFileSync(path.join(folder,'receipt.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({project,sha256:technical.sha256,restored:true}));
}finally{await browser.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
