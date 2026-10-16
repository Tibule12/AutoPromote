#!/usr/bin/env node
// Real Queue form editing only; no request replay or database writes.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=path.resolve('reports/studio-platform-packaging-20261016'),bookFile=path.join(root,'platform-packages.json');
const labels={youtube:'YouTube',tiktok:'TikTok',instagram:'Instagram',linkedin:'LinkedIn',facebook:'Facebook',reddit:'Reddit'};
async function main(){
 const book=JSON.parse(fs.readFileSync(bookFile));
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1']});
 const context=await browser.newContext({storageState:path.join(root,'proof/publisher-session.private.json'),timezoneId:'Africa/Johannesburg',viewport:{width:1800,height:1200}});
 const page=await context.newPage();page.setDefaultTimeout(60000);const observed=new Map(),writes=[];
 page.on('response',async r=>{const url=new URL(r.url());if(url.pathname==='/api/content/my-promotion-schedules'&&r.ok()){for(const s of (await r.json()).schedules||[])observed.set(s.id,s);}if(r.request().method()==='PATCH'&&url.pathname.endsWith('/post-copy'))writes.push({path:url.pathname,httpStatus:r.status()});});
 const persist=()=>fs.writeFileSync(bookFile,JSON.stringify(book,null,2)+'\n');
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Queue',exact:true}).click();
  await page.locator('.schedule-detail').waitFor();await page.getByLabel('Queue period',{exact:true}).selectOption('all');await page.locator('.schedule-loading').waitFor({state:'hidden'});
  const history=page.getByRole('button',{name:/^View history/});if(await history.isVisible())await history.click();
  for(const post of book.posts.filter(p=>p.existingScheduleId&&!p.copyVerified)){
   const current=observed.get(post.existingScheduleId);assert(current,'Retained schedule absent');assert.equal(current.contentId,post.existingContentId);assert.equal(current.platform,post.platform);assert.equal(current.isActive,false);assert(['pending','paused'].includes(current.status),'Already started publishing; do not edit');
   const subject=post.storyId==='cycling'?'Cycling':'Headphones';
   await page.locator('.schedule-subject').filter({has:page.getByRole('heading',{name:subject,exact:true})}).getByRole('button',{name:/^Timeline /}).first().click();
   const detail=page.locator('.schedule-detail'),destination=detail.locator('.schedule-destination').filter({has:page.locator('.schedule-destination-toggle strong',{hasText:new RegExp(`^${labels[post.platform]}$`)})});
   const toggle=destination.locator('.schedule-destination-toggle');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
   await destination.getByRole('button',{name:`Edit ${labels[post.platform]} copy`,exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Edit post copy',exact:true});assert.equal(await dialog.locator('select').inputValue(),post.existingScheduleId);
   await dialog.locator('input').fill(post.title);await dialog.locator('textarea').fill(post.description);
   const response=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/content/promotion-schedules/${post.existingScheduleId}/post-copy`&&r.request().method()==='PATCH');
   await dialog.getByRole('button',{name:'Save destination copy',exact:true}).click();assert.equal((await response).status(),200);await dialog.waitFor({state:'hidden'});
   assert((await destination.innerText()).includes(post.title),'Native destination did not refresh its copy');
   post.copyVerified=true;post.copyUpdatedAt=new Date().toISOString();post.status='COPY_UPDATED_SCHEDULE_STILL_PAUSED';persist();
   console.log(JSON.stringify({postId:post.postId,copyUpdated:true,scheduleUnchanged:true}));
  }
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Queue',exact:true}).click();await page.locator('.schedule-detail').waitFor();await page.getByLabel('Queue period',{exact:true}).selectOption('all');await page.locator('.schedule-loading').waitFor({state:'hidden'});
  await page.waitForTimeout(500);
  for(const p of book.posts.filter(p=>p.existingScheduleId)){
   const s=observed.get(p.existingScheduleId);assert.equal(s.platformSpecificSettings.title,p.title);assert.equal(s.platformSpecificSettings.caption,p.description);assert.equal(s.isActive,false);
  }
  fs.writeFileSync(path.join(root,'proof/copy-receipt.json'),JSON.stringify({verifiedAt:new Date().toISOString(),nativeQueueForms:true,updates:writes,coffeeChanges:0,newUploads:0,queueResumes:0},null,2));
 }catch(e){await page.screenshot({path:path.join(root,'proof/copy-failure.png')});fs.writeFileSync(path.join(root,'proof/copy-failure.private.txt'),(await page.locator('body').innerText()).slice(-16000),{mode:0o600});throw e;}
 finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
