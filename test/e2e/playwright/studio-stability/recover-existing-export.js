#!/usr/bin/env node
// Observe an already-submitted owned export and download through its native UI.
// Never resubmit a job after a test timeout, inject auth or change the edit.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const q=require('./run');
const jobId=process.env.STUDIO_QA_RECOVER_JOB;
assert(jobId, 'Set the actual previously acknowledged job identity');
(async()=>{
  const {browser,page}=await q.connect();
  const receipt={startedAt:new Date().toISOString(),jobId,realAuth:true,noMocks:true,headless:true,muted:true,
    newRenderSubmissions:0,status:'RUNNING',events:[]};
  let complete,fail;
  const terminal=new Promise((resolve,reject)=>{complete=resolve;fail=reject;});terminal.catch(()=>{});
  const observe=async response=>{
    const route=new URL(response.url()).pathname;
    if(route==='/api/media/process'){receipt.newRenderSubmissions++;fail(new Error('Recovery submitted a duplicate render'));}
    if(route!==`/api/media/status/${jobId}`)return;
    const body=await response.json().catch(()=>({}));
    receipt.events.push({status:response.status(),jobStatus:body.status,at:new Date().toISOString()});
    if(body.status==='completed')complete(body);
    if(body.status==='failed')fail(new Error(String(body.error||'Owned render failed').replace(/https?:\/\/\S+/g,'[url]')));
  };
  page.on('response',observe);
  try{
    receipt.completedResponse=await Promise.race([terminal,new Promise((_,reject)=>setTimeout(
      ()=>reject(new Error('Existing render exceeded its bounded recovery budget')),15*60000).unref())]);
    // Avoid storing signed URLs; native download remains owned by this normal session.
    receipt.completedResponse={status:receipt.completedResponse.status,jobId};
    const ready=page.getByTestId('rendered-output-ready');await ready.waitFor({timeout:60000});
    await page.getByRole('button',{name:'After',exact:true}).click({noWaitAfter:true});
    await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');
      return v?.readyState>=3&&!v.error;},undefined,{timeout:60000});
    const cdp=await page.context().newCDPSession(page);
    try{
      let guid;const done=new Promise((resolve,reject)=>{
        cdp.on('Browser.downloadWillBegin',e=>{guid=e.guid;});
        cdp.on('Browser.downloadProgress',e=>{if(e.guid!==guid)return;
          if(e.state==='completed')resolve(e);if(e.state==='canceled')reject(new Error('Native download cancelled'));});
      });
      await cdp.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:q.report,eventsEnabled:true});
      const downloadEvent=page.waitForEvent('download',{timeout:120000});
      await ready.getByRole('button',{name:'Download Rendered Clip',exact:true}).click({noWaitAfter:true});
      const download=await downloadEvent;
      const finished=await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Native download timed out')),120000).unref())]);
      const file=path.join(q.report,'download.mp4');assert(!fs.existsSync(file),'Preserve previous output');
      fs.renameSync(path.join(q.report,guid),file);
      receipt.download={nativeCompleted:true,bytes:finished.totalBytes,suggestedName:download.suggestedFilename()};
      receipt.technical=q.verifyMedia(file,{duration:6,width:1280,height:720,fps:60,audio:true});
      receipt.output=path.relative(q.root,file);
      for(const time of [.25,.45,.75,1.45,1.55,3.75])execFileSync('ffmpeg',['-v','error','-ss',String(time),
        '-i',file,'-frames:v','1','-y',path.join(q.report,`final-${time}.png`)]);
    }finally{await cdp.detach();}
    assert.equal(receipt.newRenderSubmissions,0);receipt.status='EXISTING_NATIVE_EXPORT_RECOVERED_VISUAL_REVIEW_PENDING';
  }catch(e){receipt.status='FAIL';receipt.error=e.message;process.exitCode=1;}
  finally{receipt.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(q.report,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    page.off('response',observe);await browser.close();console.log(receipt.status);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
