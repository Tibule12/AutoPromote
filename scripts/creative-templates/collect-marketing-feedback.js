#!/usr/bin/env node
'use strict';
// Reads actual owned post observations through the application. Never dispatches
// a post, enables the global scheduler or guesses missing platform measurements.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{saveAuthenticatedState}=require('./studio-session');
const folder=path.resolve('reports/model-capability-runtime-v1-20261009/proof/launch-template/marketing-packaging-20261014');
const manifest=path.resolve(process.env.STUDIO_PUBLISHING_MANIFEST||path.join(folder,'platform-posts.private.json'));
async function main(){
 const state=process.env.STUDIO_QA_STORAGE_STATE;assert(state&&fs.existsSync(state));
 const book=JSON.parse(fs.readFileSync(manifest)),posts=book.posts.filter(p=>p.contentId);
 const legacy=JSON.parse(fs.readFileSync('reports/model-capability-runtime-v1-20261009/STUDIO-PUBLISHING-SERIES-20261012.json')).posts.slice(0,2);
 const ids=[...new Set([...posts,...legacy].map(p=>p.contentId).filter(Boolean))];assert(ids.length<=12);
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--disk-cache-size=1048576']});
 const context=await browser.newContext({storageState:state}),page=await context.newPage();let headers,origin;
 page.on('request',request=>{const url=new URL(request.url());if(url.pathname==='/api/content/my-promotion-schedules'){headers=request.headers();origin=url.origin;}});
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Queue',exact:true}).click();
  const deadline=Date.now()+30000;while(!headers&&Date.now()<deadline)await page.waitForTimeout(200);assert(headers?.authorization);
  const response=await context.request.get(origin+'/api/analytics/marketing-posts?contentIds='+ids.map(encodeURIComponent).join(',')+(process.argv.includes('--refresh')?'&refresh=1':''),{headers,timeout:60000});
  assert(response.ok(),'Owned post-observation API unavailable; do not infer zero performance');const observation=await response.json();assert(Array.isArray(observation.results));
  fs.appendFileSync(path.join(folder,'performance-observations.private.jsonl'),JSON.stringify(observation)+'\n',{mode:0o600});
  const library=JSON.parse(fs.readFileSync(path.join(folder,'platform-patterns.json')));
  for(const post of posts){
   const result=observation.results.find(r=>r.contentId===post.contentId);post.lastFeedbackAt=observation.capturedAt;post.performance=result?.posts||[];
   const measured=post.performance.some(p=>Object.values(p.metrics).some(v=>v!==null));
   const pattern=library.platforms[post.platforms[0]];pattern.latestObservationAt=observation.capturedAt;pattern.postId=post.postId;
   pattern.status=measured?'MEASUREMENTS_AVAILABLE_REVIEW_REQUIRED':'AWAITING_MEASUREMENTS';
   pattern.providerPostIds=post.performance.map(p=>p.providerPostId).filter(Boolean);
  }
  fs.writeFileSync(manifest,JSON.stringify(book,null,2)+'\n',{mode:0o600});fs.writeFileSync(path.join(folder,'platform-patterns.json'),JSON.stringify(library,null,2)+'\n');
  console.log(JSON.stringify({requestedOwnedContent:ids.length,postObservations:observation.results.reduce((n,r)=>n+r.posts.length,0),newPackagesWithMeasurements:posts.filter(p=>p.performance.some(o=>Object.values(o.metrics).some(v=>v!==null))).length,freshProviderFetch:observation.freshProviderFetch}));
 }finally{saveAuthenticatedState(await context.storageState({indexedDB:true}),state);await browser.close();}
}
main().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
