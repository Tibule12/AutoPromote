#!/usr/bin/env node
// Every mutation is a normal signed-in Queue or Publisher form action.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {chromium}=require('playwright');
const dir=path.resolve('reports/studio-platform-packaging-20261016'),file=path.join(dir,'platform-packages.json');
const labels={youtube:'YouTube',tiktok:'TikTok',instagram:'Instagram',linkedin:'LinkedIn',facebook:'Facebook',reddit:'Reddit'};
const digest=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function main(){
 const id=process.argv[2];const book=JSON.parse(fs.readFileSync(file)),post=book.posts.find(p=>p.postId===id);assert(post,'Select one prepared destination');
 assert(post.visualReviewed&&post.mediaSha256,'Review the actual complete result/timeline before scheduling');
 for(const k of ['audience','problem','hook','payoff','title','description','cta'])assert(typeof post[k]==='string'&&post[k].length>10,k);
 assert(!/^(AutoPromote|Made in AutoPromote|Timeline|EMBER|VELO|ONDA|MAKE SOME NOISE)/i.test(post.title));
 assert.equal(digest(post.media),post.mediaSha256);assert(Date.parse(post.scheduledAt)>Date.now()+60000,'Choose a future time');
 const reconcile=process.argv.includes('--reconcile');
 assert(!post.queueVerified,'Already verified; do not duplicate');
 if(reconcile)assert(post.contentId&&post.status==='UPLOAD_ACKNOWLEDGED_QUEUE_UNVERIFIED','Reconcile only an existing acknowledged content record');
 else assert(!['SUBMITTING','SUBMISSION_UNCERTAIN','UPLOAD_ACKNOWLEDGED_QUEUE_UNVERIFIED'].includes(post.status),'Reconcile the existing acknowledgement before retrying');
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1']});
 const context=await browser.newContext({storageState:path.join(dir,'proof/publisher-session.private.json'),timezoneId:book.timezone,viewport:{width:1800,height:1200},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(60000);const rows=new Map(),mutations=[];let redditName;
 const persist=()=>fs.writeFileSync(file,JSON.stringify(book,null,2)+'\n');
 page.on('response',async r=>{
  const url=new URL(r.url());if(url.pathname==='/api/content/my-promotion-schedules'&&r.ok()){for(const s of (await r.json()).schedules||[])rows.set(s.id,s);}
  if(url.pathname==='/api/reddit/profile'&&r.ok()){const d=await r.json();if(d.connected)redditName=d.name;}
  if(r.request().method()==='POST'&&url.pathname==='/api/content/upload'){
   const d=await r.json().catch(()=>({}));if(d.content?.id){post.contentId=d.content.id;post.status='UPLOAD_ACKNOWLEDGED_QUEUE_UNVERIFIED';post.uploadAcknowledgedAt=new Date().toISOString();persist();}
  }
  if(post.reuseContentId&&r.request().method()==='POST'&&url.pathname===`/api/content/${post.reuseContentId}/promotion-schedules`){
   const d=await r.json().catch(()=>({}));if(d.success&&d.schedules?.length===1){post.contentId=post.reuseContentId;post.status='UPLOAD_ACKNOWLEDGED_QUEUE_UNVERIFIED';post.scheduleAcknowledgedAt=new Date().toISOString();post.reusedOwnedMedia=true;persist();}
  }
 });
 page.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method())&&new URL(r.url()).pathname.startsWith('/api/content/'))mutations.push({method:r.method(),path:new URL(r.url()).pathname});});
 async function queue(all=false){
  await page.getByRole('button',{name:'Queue',exact:true}).click();await page.locator('.schedule-detail').waitFor();
  if(all){await page.getByLabel('Queue period',{exact:true}).selectOption('all');await page.locator('.schedule-loading').waitFor({state:'hidden'});}
 }
 async function master(label,value){await page.locator('.global-controls .form-group').filter({has:page.locator('label',{hasText:new RegExp(`^${label}$`)})}).locator('input,textarea').fill(value);}
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Publisher',exact:true}).waitFor();assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
  if(reconcile){
   console.log(`${id}: reconciling acknowledged content through a read-only Queue reload`);
  }else if(post.existingScheduleId){
   assert(post.copyVerified);await queue(true);const history=page.getByRole('button',{name:/^View history/});if(await history.isVisible())await history.click();
   const current=rows.get(post.existingScheduleId);assert.equal(current?.contentId,post.existingContentId);assert.equal(current?.platformSpecificSettings?.title,post.title);assert.equal(current?.isActive,false);
   const subject=post.storyId==='cycling'?'Cycling':'Headphones';
   // A date change creates a new release row for that destination. Select the
   // retained old timestamp and the intended platform before each mutation.
   const zone='UTC',when=new Date(current.startTime),date=new Intl.DateTimeFormat('en-US',{timeZone:zone,dateStyle:'medium'}).format(when),clock=new Intl.DateTimeFormat('en-US',{timeZone:zone,timeStyle:'short'}).format(when);
   await page.locator('.schedule-subject').filter({has:page.getByRole('heading',{name:subject,exact:true})}).getByRole('button',{name:`Timeline ${date} ${clock} UTC`,exact:true}).click();
   const destination=page.locator('.schedule-detail .schedule-destination').filter({has:page.locator('.schedule-destination-toggle strong',{hasText:new RegExp(`^${labels[post.platform]}$`)})});
   const toggle=destination.locator('.schedule-destination-toggle');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
   await destination.getByRole('button',{name:`Reschedule ${labels[post.platform]}`,exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Reschedule',exact:true});await dialog.getByLabel('Publish date',{exact:true}).fill(post.localTime.slice(0,10));await dialog.getByLabel('Time',{exact:true}).fill(post.localTime.slice(11,16));await dialog.locator('select').selectOption(book.timezone);
   const res=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/content/promotion-schedules/${post.existingScheduleId}/reschedule`&&r.request().method()==='POST');
   await dialog.getByRole('button',{name:'Reschedule 1 destination',exact:true}).click();assert.equal((await res).status(),200);await dialog.waitFor({state:'hidden'});
   post.rescheduledAt=new Date().toISOString();post.status='RESCHEDULED_STILL_PAUSED';persist();
   // Use the refreshed native destination row after its group/time changes.
   await page.reload({waitUntil:'domcontentloaded'});await queue();
   const dateNew=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',dateStyle:'medium'}).format(new Date(post.scheduledAt)),clockNew=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',timeStyle:'short'}).format(new Date(post.scheduledAt));
   await page.locator('.schedule-subject').filter({has:page.getByRole('heading',{name:subject,exact:true})}).getByRole('button',{name:`Timeline ${dateNew} ${clockNew} UTC`,exact:true}).click();
   const dest=page.locator('.schedule-detail .schedule-destination').filter({has:page.locator('.schedule-destination-toggle strong',{hasText:new RegExp(`^${labels[post.platform]}$`)})});await dest.locator('.schedule-destination-toggle').click();
   const resume=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/content/promotion-schedules/${post.existingScheduleId}/resume`&&r.request().method()==='POST');
   await dest.getByRole('button',{name:'Resume destination',exact:true}).click();assert.equal((await resume).status(),200);post.contentId=post.existingContentId;
  }else{
   console.log(`${id}: opening normal Publisher and selecting reviewed media`);
   await page.getByRole('button',{name:'Publisher',exact:true}).click();
   if(post.reuseContentId){
    await page.getByRole('tab',{name:'Project assets',exact:true}).click();
    await page.locator('.release-asset-grid[aria-busy=false]').waitFor();
    const search=page.getByPlaceholder('Search by name or template');if(await search.isVisible())await search.fill(post.reuseAssetTitle);
    const asset=page.locator('.release-asset-grid button').filter({has:page.locator('strong',{hasText:new RegExp(`^${post.reuseAssetTitle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`)})});assert.equal(await asset.count(),1,'Select the exact already owned recording');await asset.click();
   }else{await page.getByRole('tab',{name:'Upload',exact:true}).click();await page.getByLabel('Upload release media',{exact:true}).setInputFiles(path.resolve(post.media));}
   await page.getByRole('button',{name:'Choose destinations →',exact:true}).click();for(const [platform,label]of Object.entries(labels)){const input=page.locator('.release-platform-grid label').filter({has:page.locator('strong',{hasText:new RegExp(`^${label}$`)})}).locator('input[type=checkbox]');await input.setChecked(platform===post.platform);}
   console.log(`${id}: exact single destination selected`);
   await page.getByRole('button',{name:'Customize destinations →',exact:true}).click();await page.locator('.release-master-copy input').fill(post.title);await page.locator('.release-master-copy textarea').fill(post.description);await page.getByRole('tab',{name:labels[post.platform],exact:true}).click();await page.getByRole('button',{name:'Use master copy',exact:true}).click();
   if(post.platform==='tiktok'){
    const form=page.locator('.tiktok-form');await form.locator('#tiktok-title').fill(post.title);await form.locator('#tiktok-caption').fill(post.description);
    const advanced=form.locator('details').filter({hasText:'Advanced TikTok disclosures and consent'});if(!await advanced.evaluate(e=>e.open))await advanced.locator('summary').click();
    const privacy=form.locator('#tiktok-privacy'),values=await privacy.locator('option').evaluateAll(es=>es.map(e=>e.value)),value=values.find(v=>['PUBLIC_TO_EVERYONE','EVERYONE','public'].includes(v));assert(value,'Connected account public privacy unavailable');await privacy.selectOption(value);
    await form.getByRole('checkbox',{name:/This content is commercial or promotional/}).check();await form.getByRole('checkbox',{name:/Your Brand/}).check();await form.getByRole('checkbox',{name:/By posting, you agree/}).check();
   }
   if(post.platform==='facebook'){const select=page.locator('.facebook-form select').first();let match;const until=Date.now()+30000;while(!match&&Date.now()<until){const options=await select.locator('option').evaluateAll(es=>es.map(e=>({value:e.value,label:e.textContent})));const available=options.filter(o=>o.value);match=available.find(o=>/autopromote/i.test(o.label))||(available.length===1?available[0]:null);if(!match)await page.waitForTimeout(250);}assert(match,'Connected Facebook Page must load before selection');await select.selectOption(match.value);post.facebookDestination={id:match.value,name:match.label};}
   if(post.platform==='reddit'){
    const form=page.locator('.reddit-form');await form.waitFor();const limit=Date.now()+20000;while(!redditName&&Date.now()<limit)await page.waitForTimeout(200);assert(/^[a-z0-9_-]{3,20}$/i.test(redditName||''),'Verified own-profile destination required');
    const manual=form.getByPlaceholder('Type another subreddit if needed'),input=await manual.count()?manual:form.locator('.input-with-icon input').first();await input.fill('u_'+redditName);
    await form.locator('#reddit-title').fill(post.title);await form.locator('#reddit-post-text').fill(post.description);await form.getByRole('checkbox',{name:/Promotional.*Partner Content/}).check();post.redditDestination='u_'+redditName;
   }
   await page.getByRole('button',{name:'Continue to Delivery →',exact:true}).click();
   const timing=page.getByRole('region',{name:'Delivery settings',exact:true});await timing.getByRole('radio',{name:/^Schedule/}).check();await timing.locator('input[type=date]').fill(post.localTime.slice(0,10));await timing.locator('input[type=time]').fill(post.localTime.slice(11,16));await timing.locator('select').first().selectOption(book.timezone);await timing.locator('select').nth(1).selectOption('once');
   assert((await timing.innerText()).includes(post.scheduledAt),'Native delivery must show the exact UTC instant');
   await page.getByRole('button',{name:'Review release →',exact:true}).click();const review=page.getByRole('region',{name:'Review release',exact:true});assert.equal(await review.locator('.release-review-destination').count(),1);assert.equal(await review.locator('.release-review-destination summary strong').innerText(),labels[post.platform]);assert((await review.innerText()).includes(post.title));assert((await review.innerText()).includes(post.description));
   console.log(`${id}: normal review reached with platform-specific copy/time`);
   await page.screenshot({path:path.join(dir,'proof',`${post.postId}-review.png`)});post.status='SUBMITTING';post.submittedAt=new Date().toISOString();persist();
   await page.getByRole('button',{name:'Schedule 1 posts →',exact:true}).click();const until=Date.now()+90000;while(!post.contentId&&Date.now()<until){const errors=await page.locator('.release-footer .release-error').allTextContents();if(errors.some(s=>/failed|error|missing|required|not enough|limit exceeded|upload limit/i.test(s)))throw Error(errors.join(' ').slice(0,600));await page.waitForTimeout(500);}assert(post.contentId,'Submission acknowledgement absent; reconcile before retry');
  }
  // Read-only observation of the real Queue response after native reload.
  const end=Date.now()+90000;let found;
  while(Date.now()<end){await page.reload({waitUntil:'domcontentloaded'});await queue();await page.waitForTimeout(500);found=[...rows.values()].filter(s=>s.contentId===post.contentId&&s.platform===post.platform&&Date.parse(s.startTime)===Date.parse(post.scheduledAt)&&s.isActive&&s.status==='pending');if(found.length)break;await page.waitForTimeout(1500);}
  assert.equal(found?.length,1,'Expected exactly one owned future destination');const row=found[0];
  const settings=row.platformSpecificSettings||{};assert.equal(settings.title,post.title);const caption=settings.caption||settings.commentary||settings.description||settings.text||row.message;
  const expectedCaption=!post.existingScheduleId&&post.platform==='instagram'?[post.title,post.description].join('\n\n'):post.description;
  assert.equal(caption,expectedCaption);post.submittedCaption=expectedCaption;
  if(reconcile)assert.equal(mutations.length,0,'Reconciliation must not submit another upload');
  post.queueVerified=true;post.verifiedAt=new Date().toISOString();post.status='SCHEDULED_VERIFIED_IN_APP';post.schedules=[{id:row.id,contentId:row.contentId,platform:row.platform,startTime:row.startTime,status:row.status,isActive:row.isActive,frequency:row.frequency}];post.nativeUserFlow=true;delete post.lastError;persist();
  fs.writeFileSync(path.join(dir,'proof',`${post.postId}-native-mutations.json`),JSON.stringify(mutations,null,2));console.log(JSON.stringify({postId:id,platform:post.platform,localTime:post.localTime,status:post.status}));
 }catch(e){post.lastError=e.message;if(post.status==='SUBMITTING'&&!post.contentId)post.status='SUBMISSION_UNCERTAIN';persist();await page.screenshot({path:path.join(dir,'proof',`${id}-failure.png`)}).catch(()=>{});fs.writeFileSync(path.join(dir,'proof',`${id}-failure.private.txt`),(await page.locator('body').innerText()).slice(-20000),{mode:0o600});throw e;}
 finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
