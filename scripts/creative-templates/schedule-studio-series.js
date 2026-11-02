#!/usr/bin/env node
'use strict';
// Schedule exact retained Studio deliveries through the normal authenticated
// Publisher UI. Never seed connections, impersonate a user or write schedules
// directly to the database. Receipts persist before any retry can occur.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const {saveAuthenticatedState}=require('./studio-session');
const manifest=path.resolve(process.env.STUDIO_PUBLISHING_MANIFEST || 'reports/model-capability-runtime-v1-20261009/STUDIO-PUBLISHING-SERIES-20261012.json');
const state=process.env.STUDIO_QA_STORAGE_STATE;
const labels={tiktok:'TikTok',youtube:'YouTube',instagram:'Instagram',facebook:'Facebook',linkedin:'LinkedIn',reddit:'Reddit'};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const write=book=>fs.writeFileSync(manifest,JSON.stringify(book,null,2)+'\n',{mode:0o600});
async function labelledValue(page,label,value){
  const group=page.locator('.global-controls .form-group').filter({has:page.locator('label',{hasText:new RegExp(`^${label}$`)})});
  await group.locator('input,textarea').fill(value);
}
async function main(){
  assert(state&&fs.existsSync(state),'A retained authenticated session is required.');
  const book=JSON.parse(fs.readFileSync(manifest));
  const selection=process.argv[2]||book.posts.find(p=>p.status==='PREPARED_NOT_SCHEDULED')?.postId;
  const post=book.posts.find(p=>p.postId===selection);assert(post,'Unknown or completed campaign entry');
  assert.equal(post.status,'PREPARED_NOT_SCHEDULED','An acknowledged/uncertain submission must be reconciled, never submitted again.');
  assert.equal(digest(fs.readFileSync(post.media)),post.mediaSha256,'Media changed after preparation');
  assert(Date.parse(post.scheduledAt)>Date.now(),'Queue time must be in the future');
  const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio']});
  const context=await browser.newContext({storageState:state,timezoneId:book.timezone,viewport:{width:1500,height:1100}});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  const observations=[],queue=[];let platformRaw={},redditProfile;
  page.on('request',req=>{
    const pathname=new URL(req.url()).pathname;
    if(req.method()==='POST'&&['/api/content/upload/readiness','/api/content/upload','/api/content/upload/source-file'].includes(pathname)){
      observations.push({event:'request',path:pathname,at:new Date().toISOString()});
      post.observations=observations;write(book);
    }
  });
  page.on('response',async res=>{
    const url=new URL(res.url());
    if(url.pathname==='/api/platform/status'){const data=await res.json().catch(()=>({}));platformRaw=data.raw||{};}
    if(url.pathname==='/api/reddit/profile'){
      const data=await res.json().catch(()=>({}));if(res.ok()&&data.connected===true)redditProfile=data;
      observations.push({event:'reddit_profile',httpStatus:res.status(),identityVerified:res.ok()&&typeof data.name==='string'});
    }
    if(url.pathname==='/api/content/upload/readiness'){
      const data=await res.json().catch(()=>({}));observations.push({event:'readiness',httpStatus:res.status(),allowed:data.readiness?.allowed===true,errorCode:data.readiness?.code||data.code||null,message:data.readiness?.message||null});
    }
    if(url.pathname==='/api/content/upload'){
      const data=await res.json().catch(()=>({})),input=res.request().postDataJSON();
      observations.push({event:'content_upload',httpStatus:res.status(),contentId:data.content?.id||null,scheduledAt:input.scheduled_promotion_time,platforms:input.target_platforms,isDryRun:input.isDryRun===true,error:typeof data.error==='string'?data.error:null});
      if(data.content?.id){post.contentId=data.content.id;post.status='UPLOAD_ACKNOWLEDGED_QUEUE_UNVERIFIED';post.observations=observations;write(book);}
    }
    if(url.pathname==='/api/content/my-promotion-schedules'){
      const data=await res.json().catch(()=>({}));for(const s of data.schedules||[]){if(s.contentId===post.contentId&&!queue.some(r=>r.id===s.id))queue.push({id:s.id,contentId:s.contentId,platform:s.platform,startTime:s.startTime,status:s.status,isActive:s.isActive,frequency:s.frequency});}
    }
  });
  try{
    await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).waitFor({timeout:60000});
    await page.getByRole('button',{name:'Publisher',exact:true}).click();
    await page.locator('.release-stepper,.publisher-stepper').first().waitFor();
    const modern=await page.locator('.release-stepper').isVisible();
    if(modern){
      await page.getByRole('tab',{name:'Upload',exact:true}).click();
      await page.getByLabel('Upload release media',{exact:true}).setInputFiles(post.media);
      await page.getByRole('button',{name:'Choose destinations →',exact:true}).click();
    }else{
    await page.locator('.publisher-upload-dropzone input[type=file]').setInputFiles(post.media);
    // File selection advances to Platforms. Return through the native Media
    // step to edit the master copy, which is intentionally hidden elsewhere.
    await page.locator('.publisher-stepper li').nth(0).getByRole('button').click();
    await labelledValue(page,'Master Title',post.title);await labelledValue(page,'Master Description',post.description);
    await page.getByRole('button',{name:'Choose platforms →',exact:true}).click();
    }
    // Publisher has preselected defaults. Match the exact requested set so a
    // Reddit-only follow-up cannot repeat TikTok/YouTube deliveries.
    for(const platform of Object.keys(labels)){
      const checkbox=modern ? page.locator('.release-platform-grid label').filter({has:page.locator('strong',{hasText:new RegExp('^'+labels[platform]+'$')})}).locator('input[type=checkbox]')
        : page.locator('.platform-selector').getByRole('checkbox',{name:labels[platform],exact:true});
      if(await checkbox.count())await checkbox.setChecked(post.platforms.includes(platform));
    }
    await page.getByRole('button',{name:modern?'Customize destinations →':'Customize posts →',exact:true}).click();
    if(modern){await page.getByLabel('Master title',{exact:true}).fill(post.title);await page.getByLabel('Master description',{exact:true}).fill(post.description);}
    for(const platform of post.platforms){
      await page.getByRole('tab',{name:labels[platform],exact:true}).click();
      if(modern)await page.getByRole('button',{name:'Use master copy',exact:true}).click();
      if(platform==='youtube'){
        await page.locator('.youtube-form #youtube-title-input').fill(post.title);
        await page.locator('.youtube-form').getByPlaceholder('Tell viewers about your video...').fill(post.description);
      }
      if(platform==='instagram'){
        await page.locator('.instagram-form').getByPlaceholder('Enter an Instagram title').fill(post.title);
        await page.locator('.instagram-form').getByPlaceholder('Write a caption...').fill(post.description);
      }
      if(platform==='facebook')await page.locator('.facebook-form').getByPlaceholder("What's on your mind?").fill(post.description);
      if(platform==='linkedin'){
        await page.locator('.linkedin-form').getByPlaceholder('Share your thoughts or professional update...').fill(post.description);
        await page.locator('.linkedin-form').getByPlaceholder('Professional Video Title').fill(post.title);
      }
      if(platform==='tiktok'){
        const form=page.locator('.tiktok-form');await form.locator('#tiktok-title').fill(post.title);await form.locator('#tiktok-caption').fill(post.description);
        const details=form.locator('details').filter({hasText:'Advanced TikTok disclosures and consent'});if(!await details.evaluate(e=>e.open))await details.locator('summary').click();
        const privacy=form.locator('#tiktok-privacy'),values=await privacy.locator('option').evaluateAll(es=>es.map(e=>e.value));
        const publicValue=values.find(v=>['PUBLIC_TO_EVERYONE','EVERYONE','public'].includes(v));assert(publicValue,'The connected TikTok account has no public privacy option');await privacy.selectOption(publicValue);
        await form.getByRole('checkbox',{name:/This content is commercial or promotional/}).check();await form.getByRole('checkbox',{name:/Your Brand/}).check();
        await form.getByRole('checkbox',{name:/By posting, you agree/}).check();
      }
      if(platform==='facebook'){
        const select=page.locator('.facebook-form select').first();const options=await select.locator('option').evaluateAll(es=>es.map(e=>({value:e.value,label:e.textContent})));
        const match=options.find(o=>/autopromote/i.test(o.label));if(match)await select.selectOption(match.value);
        assert(await select.inputValue(),'The Facebook publishing Page must be selected');
        if(post.platformSurface==='page_feed_video')await page.locator('.facebook-form .card-option').filter({hasText:'News Feed'}).click();
      }
      if(platform==='youtube'&&post.platformSurface==='shorts'){
        const form=page.locator('.youtube-form');await form.getByRole('checkbox',{name:/Shorts \(Portrait/}).check();
        await form.locator('.form-group-modern').filter({has:page.locator('label',{hasText:/^Visibility$/})}).locator('select').selectOption('public');
      }
      if(platform==='instagram'&&post.platformSurface==='reels')await page.locator('.instagram-form').getByRole('button',{name:/Reel \(Recommended\)/}).click();
      if(platform==='reddit'){
        await page.waitForFunction(()=>document.querySelector('.reddit-form')!==null);
        const identityDeadline=Date.now()+20000;
        while(!redditProfile&&Date.now()<identityDeadline&&!observations.some(o=>o.event==='reddit_profile'&&o.httpStatus>=400))await page.waitForTimeout(200);
        const raw=platformRaw.reddit||{},name=redditProfile?.name||raw.meta?.username||raw.meta?.name||raw.name||raw.profile?.name;
        assert(typeof name==='string'&&/^[a-z0-9_-]{3,20}$/i.test(name),'A verified connected Reddit username is needed for own-profile posting');
        const form=page.locator('.reddit-form'),manual=form.getByPlaceholder('Type another subreddit if needed');
        const input=await manual.count()?manual:form.locator('.input-with-icon input').first();await input.fill('u_'+name);
        await form.getByRole('checkbox',{name:/Promotional.*Partner Content/}).check();
        post.redditDestination='u_'+name;
        await form.locator('#reddit-title').fill(post.title);
        await form.locator('#reddit-post-text').fill(post.description);
      }
    }
    if(modern)await page.getByRole('button',{name:'Continue to Delivery →',exact:true}).click();
    const timing=page.locator(modern?'.release-delivery':'.publisher-customize-schedule');
    if(modern)await timing.locator('.release-delivery-modes label').filter({has:page.locator('strong',{hasText:/^Schedule$/})}).locator('input[type=radio]').check();
    else await timing.getByRole('radio',{name:'Schedule',exact:true}).check();
    await timing.locator('input[type=date]').fill(post.localTime.slice(0,10));await timing.locator('input[type=time]').fill(post.localTime.slice(11,16));
    if(modern){await timing.getByLabel('Timezone',{exact:true}).selectOption(book.timezone);await timing.getByLabel('Repeat',{exact:true}).selectOption('once');}
    await page.getByRole('button',{name:modern?'Review release →':'Review publishing →',exact:true}).click();
    const panel=page.locator(modern?'.release-review':'.publisher-review-panel');
    if(modern){assert((await panel.innerText()).includes('Scheduled delivery'));assert.equal(await panel.locator('.release-review-destination').count(),post.platforms.length);assert.equal(await panel.locator('.release-full-copy').textContent(),post.description,'Review must contain this destination’s exact copy');}
    else assert((await panel.innerText()).includes(post.localTime.slice(0,10)),'Review must show the intended date');
    for(const platform of Object.keys(labels))assert.equal((await panel.innerText()).includes(labels[platform]),post.platforms.includes(platform),'Review must match the exact destination set');
    const reviewPath=path.join(path.dirname(manifest),post.postId.replace(/[^a-z0-9.-]/gi,'_')+'-review.png');await panel.screenshot({path:reviewPath});
    post.status='SUBMITTING';post.submittedAt=new Date().toISOString();write(book);
    await page.getByRole('button',{name:modern?`Schedule ${post.platforms.length} posts →`:'Queue publishing →',exact:true}).click();
    const deadline=Date.now()+90000;
    while(!post.contentId&&Date.now()<deadline){
      const errors=await page.locator(modern?'.release-error':'.feedback-message').allTextContents();
      if(observations.some(o=>o.httpStatus>=400||o.event==='readiness'&&!o.allowed))throw new Error('Publisher rejected submission; inspect the retained app result before retrying.');
      if(errors.some(s=>/failed|error|missing|required|not enough|limit exceeded|exceeded.*limit/i.test(s)))throw new Error(errors.join(' ').slice(0,450));
      await page.waitForTimeout(500);
    }
    assert(post.contentId,'No acknowledged owned content upload; do not blindly retry');
    await page.getByRole('button',{name:'Queue',exact:true}).click();
    const queueDeadline=Date.now()+60000;
    while(queue.length<post.platforms.length&&Date.now()<queueDeadline){
      await page.waitForTimeout(3000);
      // Queue has no refresh control. Reload the real App to request its
      // current owned schedules after asynchronous upload processing.
      await page.reload({waitUntil:'domcontentloaded'});
      await page.getByRole('button',{name:'Queue',exact:true}).waitFor({timeout:30000});
      await page.getByRole('button',{name:'Queue',exact:true}).click();
    }
    assert.equal(queue.length,post.platforms.length,'Owned upload exists but all requested schedules are not verified');
    for(const s of queue){assert(post.platforms.includes(s.platform));assert.equal(Date.parse(s.startTime),Date.parse(post.scheduledAt));assert.equal(s.frequency,'once');assert(s.isActive&&s.status==='pending');}
    post.schedules=queue;post.observations=observations;post.status='SCHEDULED_VERIFIED_IN_APP';delete post.lastError;post.verifiedAt=new Date().toISOString();book.externalSchedulesVerified=book.posts.reduce((n,p)=>n+p.schedules.length,0);write(book);
    console.log(JSON.stringify({postId:post.postId,title:post.title,localTime:post.localTime,status:post.status,verifiedSchedules:queue.length,platforms:post.platforms},null,2));
  }catch(error){post.observations=observations;post.lastError=error.message;post.schedules=queue;if(post.status==='SUBMITTING'&&!observations.some(o=>o.event==='content_upload'))post.status='SUBMISSION_UNCERTAIN';write(book);await page.screenshot({path:path.join(path.dirname(manifest),post.postId.replace(/[^a-z0-9.-]/gi,'_')+'-failure.png')}).catch(()=>{});throw error;}
  finally{saveAuthenticatedState(await context.storageState({indexedDB:true}),state);await browser.close();}
}
main().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
