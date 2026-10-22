#!/usr/bin/env node
// Read-only inventory of the exact retained Studio recording schedules.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const folder=path.resolve('reports/studio-platform-packaging-20261016/proof');
const book=require('../../reports/model-capability-runtime-v1-20261009/STUDIO-PUBLISHING-SERIES-20261012.json');
const originals=book.posts.filter(p=>p.postId.includes('.studio_recording.'));
const retained=new Map(originals.flatMap(p=>p.schedules.map(s=>[s.id,{...s,postId:p.postId,contentId:p.contentId}])));
async function main(){
 const action=process.argv[2]||'inventory';assert.equal(action,'inventory');fs.mkdirSync(folder,{recursive:true});
 const context=await chromium.launchPersistentContext(path.resolve('reports/studio-keyframe-selection-20261015/proof/browser-profile.private'),{
  channel:'chromium',headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1'],viewport:{width:1600,height:1100}});
 const page=context.pages()[0];page.setDefaultTimeout(60000);const rows=new Map(),mutations=[];
 page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/content/my-promotion-schedules'&&r.ok()){
  const data=await r.json().catch(()=>({}));for(const s of data.schedules||[])rows.set(s.id,s);
 }});
 page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.includes('/promotion-schedules/'))mutations.push(new URL(r.url()).pathname);});
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Queue',exact:true}).click();
  await page.locator('.schedule-detail').waitFor({timeout:90000});
  await page.getByLabel('Queue period',{exact:true}).selectOption('all');
  await page.locator('.schedule-loading').waitFor({state:'hidden'});
  await page.waitForTimeout(500);
  const future=[...rows.values()].filter(s=>retained.has(s.id)&&Date.parse(s.startTime)>Date.now());
  for(const s of future){assert.equal(s.contentId,retained.get(s.id).contentId);assert.equal(s.platform,retained.get(s.id).platform);}
  const before=future.map(s=>({id:s.id,contentId:s.contentId,platform:s.platform,startTime:s.startTime,status:s.status,isActive:s.isActive}));
  const matched=[...rows.values()].filter(s=>retained.has(s.id));
  fs.writeFileSync(path.join(folder,'queue-all-recordings.private.json'),JSON.stringify(matched,null,2),{mode:0o600});
  fs.writeFileSync(path.join(folder,'queue-before.json'),JSON.stringify({at:new Date().toISOString(),futureRecordingRows:before,readOnly:action==='inventory'},null,2));
  assert.equal(mutations.length,0);
  console.log(JSON.stringify({action,futureRecordingRows:before.length,activeFutureRecordings:before.filter(s=>s.isActive).length,paused:mutations.length,newSchedules:0}));
 }catch(error){await page.screenshot({path:path.join(folder,`queue-${action}-failure.png`)}).catch(()=>{});throw error;}
 finally{await context.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
