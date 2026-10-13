#!/usr/bin/env node
'use strict';
// Replace only the exact retained future entries after their improved media
// has been scheduled through Publisher. Uses the normal owned cancellation API.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {saveAuthenticatedState}=require('./studio-session');
const manifest=path.resolve('reports/model-capability-runtime-v1-20261009/STUDIO-PUBLISHING-SERIES-20261012.json');
const state=process.env.STUDIO_QA_STORAGE_STATE;
async function main(){
  assert(state&&fs.existsSync(state));const book=JSON.parse(fs.readFileSync(manifest));
  const replacements=book.posts.filter(p=>p.supersededSubmissions?.length);
  assert(replacements.every(p=>p.status==='SCHEDULED_VERIFIED_IN_APP'),'Verify replacement uploads before cancellation');
  const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio']});
  const context=await browser.newContext({storageState:state,timezoneId:book.timezone});
  const page=await context.newPage();let headers;
  page.on('request',request=>{if(new URL(request.url()).pathname==='/api/platform/status')headers=request.headers();});
  const persist=()=>fs.writeFileSync(manifest,JSON.stringify(book,null,2)+'\n',{mode:0o600});
  try{
    await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Queue',exact:true}).waitFor({timeout:60000});
    const deadline=Date.now()+20000;while(!headers?.authorization&&Date.now()<deadline)await page.waitForTimeout(200);
    assert(headers?.authorization,'Use only authentication supplied by the actual signed-in App');
    const authenticated={Authorization:headers.authorization};if(headers['x-workspace-id'])authenticated['x-workspace-id']=headers['x-workspace-id'];
    const query=new URLSearchParams({summary:'1',limit:'250',from:new Date().toISOString(),until:new Date(Date.now()+7*86400000).toISOString()});
    const response=await context.request.get('http://localhost:5119/api/content/my-promotion-schedules?'+query,{headers:authenticated});assert.equal(response.status(),200);
    const queued=(await response.json()).schedules;
    for(const replacement of replacements)for(const old of replacement.supersededSubmissions){
      old.cancelledSchedules ||= [];
      for(const item of old.schedules){
        if(old.cancelledSchedules.some(s=>s.id===item.id))continue;
        const current=queued.find(s=>s.id===item.id);assert(current,'Retained superseded entry is absent; reconcile before retry');
        assert.equal(current.contentId,old.contentId);assert.equal(current.status,'pending');assert.equal(current.isActive,true);
        assert(Date.parse(current.startTime)>Date.now(),'Never cancel an executed or already due replacement');
        assert.equal(Date.parse(current.startTime),Date.parse(replacement.scheduledAt));
        const result=await context.request.delete('http://localhost:5119/api/content/promotion-schedules/'+encodeURIComponent(item.id),{headers:authenticated});
        assert.equal(result.status(),200,'Normal owned cancellation must succeed');
        old.cancelledSchedules.push({id:item.id,platform:item.platform,httpStatus:result.status(),cancelledAt:new Date().toISOString()});persist();
      }
      old.status='SUPERSEDED_PENDING_SCHEDULES_CANCELLED';persist();
    }
    console.log(JSON.stringify({improvedRecordingSubmissions:replacements.length,supersededFutureSchedulesCancelled:replacements.reduce((n,p)=>n+p.supersededSubmissions.reduce((m,s)=>m+s.cancelledSchedules.length,0),0),oldFinalFilmsPreserved:true}));
  }finally{saveAuthenticatedState(await context.storageState({indexedDB:true}),state);await browser.close();}
}
main().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
