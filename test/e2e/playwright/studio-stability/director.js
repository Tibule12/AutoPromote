#!/usr/bin/env node
const fs=require('fs'),path=require('path');const q=require('./run'),f=require('./flows');
(async()=>{const{browser,page}=await q.connect();const events=[];const listener=async r=>{const p=new URL(r.url()).pathname;if(/studio|track-studio/.test(p)){const e={path:p,status:r.status()};try{const d=await r.json();e.code=d.code||d.error;e.shots=d.sceneCuts;e.artifact=!!d.sourceShotArtifact;}catch{}events.push(e)}};page.on('response',listener);try{
 await f.open(page,process.env.STUDIO_QA_DIRECTOR_SOURCE||'Studio QA 20261007 vertical');await f.duplicate(page,process.env.STUDIO_QA_DIRECTOR_PROJECT||'Studio QA 20261007 Director');await f.captionsOff(page);await q.tool(page,'Reframe');await page.getByTestId('reframe-aspect-16-9').click();
 const response=page.waitForResponse(r=>/track-studio-faces|studio\/analysis.*result/.test(r.url()),{timeout:90000});await page.getByTestId('analyze-source-shots').click();const result=await response;await page.waitForTimeout(2000);await q.inspect(page,'director-real-analysis');
 const review=page.getByRole('button',{name:'Review incoming edit',exact:true});
 if(await review.isVisible()){await review.click();await page.waitForTimeout(2500);await q.inspect(page,'director-real-review');}
 const approve=page.getByTestId('studio-director-review-approve');
 if(await approve.isVisible()) {
   await approve.click();
   await page.getByText('Approval recorded on the server; edit applied to this project.',{exact:true}).waitFor({timeout:25000});
   await q.inspect(page,'director-approved-real');
   const attempt=await q.render(page,'director');
   fs.writeFileSync(path.join(q.report,'director-approval-api.json'),JSON.stringify({at:new Date().toISOString(),events},null,2));
   console.log(JSON.stringify({events,output:attempt.output,seconds:attempt.technical.seconds,reviewRequired:true}));
   return;
 }
 const region=page.getByRole('region',{name:'Incoming Director edit review'});const text=await region.count()?await region.innerText():'No normal reviewable proposal presented';
 fs.writeFileSync(path.join(q.report,'director-ui-evidence.json'),JSON.stringify({at:new Date().toISOString(),realAuth:true,noMocks:true,events,reviewText:text},null,2));
 q.record('director',{testedEndToEnd:false,gpuUsed:false,status:'BLOCKED',failureFound:text.includes('No normal')?'No normal reviewable proposal presented after source analysis':'Review and server commit not completed',fixApplied:'None; existing review/source-binding guards preserved',retestResult:'Normal Follow existing camera cuts submitted; owned analysis/review inspected.',remainingIssue:text,userFacingSeverity:'High'}, {at:new Date().toISOString(),events,noMocks:true});
 console.log(JSON.stringify({events,reviewText:text}));
}finally{page.off('response',listener);await browser.close()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
