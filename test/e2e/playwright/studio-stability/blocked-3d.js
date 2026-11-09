#!/usr/bin/env node
const fs=require('fs');const path=require('path');const q=require('./run');const f=require('./flows');
(async()=>{const{browser,page}=await q.connect();try{
 await f.open(page,process.env.STUDIO_QA_3D_SOURCE||'Studio QA 20261007 baseline');await f.duplicate(page,process.env.STUDIO_QA_3D_PROJECT||'Studio QA 20261007 3D reachability');await f.captionsOff(page);await q.tool(page,'Motion');await page.getByRole('button',{name:'3D Motion',exact:true}).click();
 const panel=page.getByTestId('studio-3d-panel');await panel.getByTitle('Add Cinematic 3D Title at playhead',{exact:true}).click();await panel.getByLabel('Main text',{exact:true}).fill('QA 3D');await panel.getByLabel('Supporting line',{exact:true}).fill('QA existing render path');
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/media/studio-3d/preview');await panel.getByRole('button',{name:'Generate HQ 3D Preview',exact:true}).click();const result=await response;let code;try{code=(await result.json()).error;}catch{}
 await q.inspect(page,'3d-real-submission-retest');const evidence={at:new Date().toISOString(),realAuth:true,noMocks:true,endpoint:'/api/media/studio-3d/preview',status:result.status(),code};
 fs.writeFileSync(path.join(q.report,'3d-submission-retest.json'),JSON.stringify(evidence,null,2));
 if(result.status()!==503)throw Error('3D availability changed: finish the job and inspect its output before classification');
 for(const id of ['three_d','blender','three_d_audio'])q.record(id,{testedEndToEnd:false,gpuUsed:false,status:'BLOCKED',failureFound:'Actual HQ request returns HTTP 503',fixApplied:'None; existing dispatch requires private bucket/Cloud Run service, no retained-NVIDIA adapter exists',retestResult:'Same normal Studio HQ submission remains unavailable',remainingIssue:id==='three_d_audio'?'HQ execution unavailable; Advanced UI also confirms audio response does not change exported frames.':'STUDIO_3D_BUCKET / renderer dispatch unavailable on this actual backend; standalone Blender GPU history is insufficient.',userFacingSeverity:'High'},evidence);
 await panel.locator('.studio-3d-actions').getByRole('button',{name:'Delete',exact:true}).click();await page.getByTestId('studio-save-project').click();console.log(JSON.stringify(evidence));
}finally{await browser.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
