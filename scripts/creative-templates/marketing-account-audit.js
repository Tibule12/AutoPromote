#!/usr/bin/env node
'use strict';
// Read the actual signed-in application's owned queue/analytics. Optional hold
// touches only pending entries identified in the retained Studio campaign.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {saveAuthenticatedState}=require('./studio-session');
const folder=path.resolve('reports/model-capability-runtime-v1-20261009/proof/launch-template/marketing-packaging-20261014');
const state=process.env.STUDIO_QA_STORAGE_STATE;
const previous=JSON.parse(fs.readFileSync('reports/model-capability-runtime-v1-20261009/STUDIO-PUBLISHING-SERIES-20261012.json'));
const owned=new Set(previous.posts.map(p=>p.contentId).filter(Boolean));
const fields=['id','contentId','platform','startTime','status','isActive','frequency','lastRun','nextRun','platformPostId','externalId','publishedAt','error','lastError'];
const project=s=>Object.fromEntries(fields.filter(k=>s[k]!==undefined).map(k=>[k,s[k]]));
const write=(name,data)=>{fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,name),JSON.stringify(data,null,2)+'\n',{mode:0o600});};
async function main(){
 assert(state&&fs.existsSync(state));
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--disk-cache-size=1048576']});
 const context=await browser.newContext({storageState:state,timezoneId:'Africa/Johannesburg'});
 const page=await context.newPage();let headers,apiOrigin,connections={};
 page.on('request',request=>{if(new URL(request.url()).pathname==='/api/content/my-promotion-schedules'){headers=request.headers();apiOrigin=new URL(request.url()).origin;}});
 page.on('response',async response=>{
  if(new URL(response.url()).pathname!=='/api/platform/status')return;
  const data=await response.json().catch(()=>({}));
  connections=Object.fromEntries(Object.entries(data.platforms||data.status||{}).map(([key,value])=>[key,typeof value==='object'?{connected:value.connected,status:value.status}:value]));
 });
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Queue',exact:true}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'Queue',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.schedules-panel'));
  const deadline=Date.now()+30000;while(!headers&&Date.now()<deadline)await page.waitForTimeout(200);
  assert(headers?.authorization,'The normal application must provide its actual authenticated request');
  const get=async route=>{const response=await context.request.get(apiOrigin+route,{headers});assert((response.headers()['content-type']||'').includes('application/json'),'Expected application API JSON, not a frontend HTML response');return {httpStatus:response.status(),data:await response.json()};};
  const before=await get('/api/content/my-promotion-schedules?limit=250');assert.equal(before.httpStatus,200);assert(Array.isArray(before.data.schedules),'Missing owned queue response');
  const selected=(before.data.schedules||[]).filter(s=>owned.has(s.contentId));
  const audit={capturedAt:new Date().toISOString(),campaign:'STUDIO-PUBLISHING-SERIES-20261012',connections,queue: selected.map(project),otherEntriesExcluded:(before.data.schedules||[]).length-selected.length,hasMore:before.data.meta?.hasMore===true,actions:[]};
  write('account-audit.private.json',audit);
  if(process.argv.includes('--hold')){
   for(const schedule of selected){
    if(!schedule.isActive||!['pending','queued','scheduled','ready'].includes(String(schedule.status).toLowerCase()))continue;
    // The server authenticates ownership and applies the same pause action as Queue.
    const response=await context.request.post(apiOrigin+'/api/content/promotion-schedules/'+encodeURIComponent(schedule.id)+'/pause',{headers,data:{}});
    audit.actions.push({id:schedule.id,platform:schedule.platform,action:'pause',httpStatus:response.status(),reason:'Founder replaced repeated internal-name/same-file marketing with problem-first native packaging.'});write('account-audit.private.json',audit);assert(response.ok(),'Pause rejected; leave remaining entries for reconciliation');
   }
   const after=await get('/api/content/my-promotion-schedules?limit=250');assert.equal(after.httpStatus,200);
   audit.queueAfter=(after.data.schedules||[]).filter(s=>owned.has(s.contentId)).map(project);
   for(const action of audit.actions)assert.equal(audit.queueAfter.find(s=>s.id===action.id)?.isActive,false,'Pause must be verified in the current owned queue');
   await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Queue',exact:true}).click();
   await page.locator('.schedules-panel').waitFor();await page.screenshot({path:path.join(folder,'held-queue.png'),fullPage:false});
  }
  const analytics=await get('/api/analytics/user?range=30d');
  // Aggregate analytics contain default zeroes. Retain the response as an app
  // observation, never as measured post-level retention/search/conversions.
  write('app-analytics.private.json',{capturedAt:new Date().toISOString(),...analytics,limitation:'App aggregates may default missing metrics to zero. No post-level observation or search-volume inference is made.'});
  audit.analyticsHttpStatus=analytics.httpStatus;audit.completedAt=new Date().toISOString();write('account-audit.private.json',audit);
  console.log(JSON.stringify({campaignEntries:selected.length,heldAndVerified:audit.actions.length,statusCounts:selected.reduce((a,s)=>(a[s.status]=(a[s.status]||0)+1,a),{}),analyticsHttpStatus:analytics.httpStatus,hasMore:audit.hasMore}));
 }finally{saveAuthenticatedState(await context.storageState({indexedDB:true}),state);await browser.close();}
}
main().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
