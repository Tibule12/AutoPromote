#!/usr/bin/env node
// Read the actual signed-in Queue. No write request or provider dispatch.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {chromium}=require('playwright');const dir=path.resolve('reports/studio-platform-packaging-20261016'),file=path.join(dir,'platform-packages.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function main(){
 const book=JSON.parse(fs.readFileSync(file)),posts=book.posts.filter(p=>p.queueVerified);assert.equal(posts.length,24);
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1']});
 const context=await browser.newContext({storageState:path.join(dir,'proof/publisher-session.private.json'),timezoneId:book.timezone,viewport:{width:1800,height:1200}}),page=await context.newPage();page.setDefaultTimeout(60000);
 const rows=new Map(),contents=new Map();let writes=0;
 page.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method())&&new URL(r.url()).pathname.startsWith('/api/content/'))writes++;});
 page.on('response',async r=>{
  const p=new URL(r.url()).pathname;if(!r.ok())return;
  if(p==='/api/content/my-promotion-schedules')for(const row of (await r.json()).schedules||[])rows.set(row.id,row);
  if(p==='/api/content/my-content')for(const c of (await r.json()).content||[])contents.set(c.id,c);
 });
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Queue',exact:true}).click();await page.locator('.schedule-detail').waitFor();
  const deadline=Date.now()+30000;while((rows.size<24||contents.size===0)&&Date.now()<deadline)await page.waitForTimeout(250);
  const checked=[],mediaChecks=[],downloaded=new Map();
  for(const platform of book.intent.platforms){const p=posts.filter(p=>p.platform===platform);assert.equal(p.length,4);assert.equal(new Set(p.map(p=>p.storyId)).size,4);assert.equal(new Set(p.map(p=>p.scheduledAt)).size,4);}
  for(const p of posts){
   assert(p.visualReviewed&&p.nativeUserFlow);assert.equal(hash(fs.readFileSync(p.media)),p.mediaSha256);
   const expected=p.schedules[0],s=rows.get(expected.id);assert(s,'Missing native Queue destination');assert.equal(s.contentId,p.contentId);assert.equal(s.platform,p.platform);assert.equal(Date.parse(s.startTime),Date.parse(p.scheduledAt));assert.equal(s.status,'pending');assert.equal(s.isActive,true);assert.equal(s.frequency,'once');
   const options=s.platformSpecificSettings||{};assert.equal(options.title,p.title);assert.equal(options.caption||options.commentary||options.description||options.text||s.message,p.submittedCaption||p.description);
   const c=contents.get(p.contentId);assert(c,'Owned scheduled content absent from native content response');
   const url=options.media_url||options.videoUrl||c.persistentMediaUrl||c.url||c.videoUrl||c.fileUrl||c.originalUrl||c.original_url;assert(typeof url==='string'&&/^https:\/\//.test(url),'No native owned media URL');
   let digest=downloaded.get(url);if(!digest){const response=await context.request.get(url);assert(response.ok(),'Owned media is inaccessible');digest=hash(await response.body());downloaded.set(url,digest);}assert.equal(digest,p.mediaSha256,'Scheduled source differs from reviewed movie');
   checked.push({postId:p.postId,scheduleId:s.id,contentId:s.contentId,platform:s.platform,startTime:s.startTime,status:s.status,isActive:s.isActive,frequency:s.frequency});mediaChecks.push({postId:p.postId,sha256:digest,downloadedOwnedBytesMatch:true});
  }
  assert.equal(writes,0);await page.screenshot({path:path.join(dir,'proof/final-native-queue.png')});
  const result={verifiedAt:new Date().toISOString(),nativeQueue:true,normalSignedInUser:true,readOnlyVerification:true,postsPerPlatform:4,platforms:book.intent.platforms,verifiedDestinationSchedules:24,sourceHashesVerified:24,uniqueContentRecords:new Set(posts.map(p=>p.contentId)).size,coffeeMutations:0,providerPublicationVerified:false,checked,mediaChecks};
  fs.writeFileSync(path.join(dir,'queue-verified.json'),JSON.stringify(result,null,2)+'\n');console.log({verifiedSchedules:24,exactMediaHashes:24,platforms:6,coffeeChanges:0});
 }catch(e){fs.writeFileSync(path.join(dir,'proof/verification-failure.private.json'),JSON.stringify({error:e.message,rowKeys:[...rows.values()].slice(0,1).map(Object.keys),contentKeys:[...contents.values()].slice(0,1).map(Object.keys)},null,2),{mode:0o600});throw e;}
 finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
