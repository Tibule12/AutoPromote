// Ordinary production Publisher controls; exact approved movies only.
// An uncertain submission is reconciled, never retried automatically.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=__dirname,selection=JSON.parse(fs.readFileSync(path.join(root,'selected-finals.json')));
const key=process.argv[2],submit=process.argv.includes('--submit'),redditOnly=process.argv.includes('--reddit');
const movie=selection.movies.find(m=>m.key===key);assert(movie,'Select three or four');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');assert.equal(sha(fs.readFileSync(movie.media)),movie.sha256);
const labels=redditOnly?{reddit:'Reddit'}:{youtube:'YouTube',tiktok:'TikTok',instagram:'Instagram',linkedin:'LinkedIn',facebook:'Facebook'};
const count=Object.keys(labels).length,tag=key+(redditOnly?'-reddit':'');
const copy={
 three:{time:'18:00',title:'Prism Relay | The crew steps out of the frame',caption:'Two time-shifted frames. Then the crew steps forward.\n\nPerspective, isolated motion and a fading reflection, edited in AutoPromote Studio. Dance footage supplied; visual edit by AutoPromote.\n\nWhich moment would you pull out of the frame? #DanceEdit #MotionGraphics #AutoPromote'},
 four:{time:'20:00',title:'Mirror Pulse | The crew leaves a colour echo',caption:'The crew leaves a colour echo.\n\nCyan and amber motion echoes with a fading floor reflection, edited in AutoPromote Studio. Original dance music retained. Dance footage supplied; visual edit by AutoPromote.\n\nCyan or amber? #DanceEdit #MotionGraphics #AutoPromote'}
}[key];
const expectedAt=`2026-11-10T${key==='three'?'16':'18'}:00:00.000Z`;
assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:selection.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),selection.date,'Today-only authorization has expired');
assert(Date.parse(expectedAt)>Date.now(),'Do not submit a past schedule');
const recordPath=path.join(root,tag+'-release.json');
const record=fs.existsSync(recordPath)?JSON.parse(fs.readFileSync(recordPath)):{key,mediaSha256:movie.sha256,finalResultOnly:true,ownerInstruction:'work on the other two and schedule them',ownerClarification:selection.ownerClarification};
assert(!record.contentId&&!['SUBMITTING','SUBMISSION_UNCERTAIN'].includes(record.status),'Reconcile acknowledged/uncertain submission before any retry');
const persist=()=>fs.writeFileSync(recordPath,JSON.stringify(record,null,2)+'\n');
async function main(){
 const browser=await chromium.launch({headless:true,args:['--mute-audio']});
 const context=await browser.newContext({storageState:path.join(root,'private/owner-session-refreshed.private.json'),timezoneId:selection.timezone,viewport:{width:1800,height:1200}});
 const p=await context.newPage();p.setDefaultTimeout(60000);let redditName,observedRows=[];const pending=new Set();
 p.on('response',res=>{const task=(async()=>{const url=new URL(res.url());
  if(url.pathname==='/api/reddit/profile'&&res.ok()){const data=await res.json();if(data.connected)redditName=data.name;}
  if(url.pathname==='/api/content/my-promotion-schedules'&&res.ok())observedRows=(await res.json()).schedules||[];
  if(res.request().method()==='POST'&&url.pathname.startsWith('/api/content/')){
   const data=await res.json().catch(()=>({}));fs.writeFileSync(path.join(root,'private',tag+'-'+url.pathname.split('/').at(-1)+'-response.private.json'),JSON.stringify({status:res.status(),data},null,2),{mode:0o600});
   if(url.pathname==='/api/content/upload/readiness'&&data.readiness?.allowed===false){record.status='BLOCKED_PREFLIGHT';record.preflight={code:data.readiness.code,message:data.readiness.message,platformLimit:data.readiness.platformLimit,fileNotUploaded:true};persist();}
   if(url.pathname==='/api/content/upload'&&data.content?.id){record.contentId=data.content.id;record.status='UPLOAD_ACKNOWLEDGED_RECONCILE';record.acknowledgedAt=new Date().toISOString();persist();}
   if(redditOnly&&url.pathname===`/api/content/${record.reuseContentId}/promotion-schedules`&&data.success&&data.schedules?.length===1){record.contentId=record.reuseContentId;record.status='UPLOAD_ACKNOWLEDGED_RECONCILE';record.acknowledgedAt=new Date().toISOString();persist();}
  }
 })();pending.add(task);task.finally(()=>pending.delete(task)).catch(()=>{});});
 try{
  await p.goto('https://autopromote.org',{waitUntil:'domcontentloaded'});await p.getByRole('button',{name:'Publisher',exact:true}).waitFor();assert(!await p.evaluate(()=>!!window.__E2E_BYPASS));
  await p.getByRole('button',{name:'Publisher',exact:true}).click();
  if(redditOnly){
   const main=JSON.parse(fs.readFileSync(path.join(root,key+'-release.json')));assert(main.contentId,'Schedule the main release first');assert.equal(main.mediaSha256,movie.sha256);record.reuseContentId=main.contentId;
   const response=JSON.parse(fs.readFileSync(path.join(root,'private',key+'-upload-response.private.json'))).data;assert.equal(response.content?.id,main.contentId);const content=response.content,url=content.persistentMediaUrl||content.url||content.videoUrl||content.fileUrl;assert(/^https:\/\//.test(url||''),'Owned upload URL missing');const downloaded=await context.request.get(url);assert(downloaded.ok());assert.equal(sha(await downloaded.body()),movie.sha256,'Reused asset bytes differ');
   await p.getByRole('tab',{name:'Project assets',exact:true}).click();await p.locator('.release-asset-grid[aria-busy=false]').waitFor();const search=p.getByPlaceholder('Search by name or template');if(await search.isVisible())await search.fill(copy.title);const asset=p.locator('.release-asset-grid button').filter({has:p.locator('strong',{hasText:new RegExp('^'+copy.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})});assert.equal(await asset.count(),1,'Select the exact owned final');await asset.click();
  }else{await p.getByRole('tab',{name:'Upload',exact:true}).click();await p.getByLabel('Upload release media',{exact:true}).setInputFiles(movie.media);}
  await p.getByRole('button',{name:'Choose destinations →',exact:true}).click();
  for(const label of ['YouTube','TikTok','Instagram','LinkedIn','Facebook','Reddit'])await p.locator('.release-platform-grid label').filter({has:p.locator('strong',{hasText:new RegExp(`^${label}$`)})}).locator('input[type=checkbox]').setChecked(Object.values(labels).includes(label));
  await p.getByRole('button',{name:'Customize destinations →',exact:true}).click();await p.locator('.release-master-copy input').fill(copy.title);await p.locator('.release-master-copy textarea').fill(copy.caption);
  for(const [platform,label] of Object.entries(labels)){
   await p.getByRole('tab',{name:label,exact:true}).click();await p.getByRole('button',{name:'Use master copy',exact:true}).click();
   if(platform==='tiktok'){
    const form=p.locator('.tiktok-form');await form.locator('#tiktok-title').fill(copy.title);await form.locator('#tiktok-caption').fill(copy.caption);
    const advanced=form.locator('details').filter({hasText:'Advanced TikTok disclosures and consent'});if(!await advanced.evaluate(e=>e.open))await advanced.locator('summary').click();
    const privacy=form.locator('#tiktok-privacy'),values=await privacy.locator('option').evaluateAll(es=>es.map(e=>e.value));const value=values.find(v=>['PUBLIC_TO_EVERYONE','EVERYONE','public'].includes(v));assert(value,'Connected TikTok public destination unavailable');await privacy.selectOption(value);
    await form.getByRole('checkbox',{name:/This content is commercial or promotional/}).check();await form.getByRole('checkbox',{name:/Your Brand/}).check();await form.getByRole('checkbox',{name:/By posting, you agree/}).check();
   }
   if(platform==='facebook'){
    const select=p.locator('.facebook-form select').first();await p.waitForFunction(()=>[...document.querySelectorAll('.facebook-form select option')].some(e=>e.value));const options=await select.locator('option').evaluateAll(es=>es.map(e=>({value:e.value,name:e.textContent}))),available=options.filter(o=>o.value),page=available.find(o=>/autopromote/i.test(o.name))||(available.length===1?available[0]:null);assert(page,'Ambiguous Facebook Page');await select.selectOption(page.value);record.facebookPage=page.name;
   }
   if(platform==='reddit'){
    await p.waitForFunction(()=>!!document.querySelector('.reddit-form'));const deadline=Date.now()+20000;while(!redditName&&Date.now()<deadline)await p.waitForTimeout(200);assert(/^[a-z0-9_-]{3,20}$/i.test(redditName||''),'Connected Reddit own profile unavailable');const form=p.locator('.reddit-form'),manual=form.getByPlaceholder('Type another subreddit if needed');await (await manual.count()?manual:form.locator('.input-with-icon input').first()).fill('u_'+redditName);await form.locator('#reddit-title').fill(copy.title);await form.locator('#reddit-post-text').fill(copy.caption);await form.getByRole('checkbox',{name:/Promotional.*Partner Content/}).check();record.redditDestination='u_'+redditName;
   }
  }
  await p.getByRole('button',{name:'Continue to Delivery →',exact:true}).click();const timing=p.getByRole('region',{name:'Delivery settings',exact:true});await timing.getByRole('radio',{name:/^Schedule/}).check();await timing.locator('input[type=date]').fill(selection.date);await timing.locator('input[type=time]').fill(copy.time);await timing.locator('select').first().selectOption(selection.timezone);await timing.locator('select').nth(1).selectOption('once');
  assert((await timing.innerText()).includes(expectedAt),'Native delivery must show the exact UTC instant');
  await p.getByRole('button',{name:'Review release →',exact:true}).click();const review=p.getByRole('region',{name:'Review release',exact:true});assert.equal(await review.locator('.release-review-destination').count(),count);for(const detail of await review.locator('.release-review-destination').all()){if(!await detail.evaluate(e=>e.open))await detail.locator('summary').click();assert((await detail.innerText()).includes(copy.title));assert((await detail.innerText()).includes(copy.caption));}const text=await review.innerText();assert(text.includes(copy.title));assert(text.includes('Schedule'));await p.screenshot({path:path.join(root,tag+'-publisher-review.png'),fullPage:true});fs.writeFileSync(path.join(root,tag+'-review.txt'),text);
  Object.assign(record,{status:'REVIEW_READY',reviewedAt:new Date().toISOString(),title:copy.title,caption:copy.caption,scheduledAt:expectedAt,localDate:selection.date,localTime:copy.time,timezone:selection.timezone,frequency:'once',destinations:Object.keys(labels),nativePublisher:true});delete record.lastError;persist();console.log(tag+': native '+count+'-destination review ready');
  if(!submit)return;
  assert.equal(sha(fs.readFileSync(movie.media)),movie.sha256);record.status='SUBMITTING';record.submittedAt=new Date().toISOString();persist();await p.getByRole('button',{name:`Schedule ${count} posts →`,exact:true}).click();
  const until=Date.now()+120000;while(!record.contentId&&Date.now()<until){if(record.status==='BLOCKED_PREFLIGHT')throw Error(record.preflight.message);await p.waitForTimeout(300);}await Promise.allSettled([...pending]);assert(record.contentId,'No upload acknowledgement; reconcile before retrying');
  await p.getByRole('button',{name:'Queue',exact:true}).click();await p.waitForTimeout(2500);record.observedDestinations=observedRows.filter(row=>row.contentId===record.contentId).map(row=>({id:row.id,platform:row.platform,status:row.status,isActive:row.isActive,startTime:row.startTime,contentId:row.contentId,frequency:row.frequency}));record.status='UPLOAD_ACKNOWLEDGED_RECONCILE';record.observedAt=new Date().toISOString();persist();await p.screenshot({path:path.join(root,key+'-queue-after.png')});console.log(key+': acknowledged; '+record.observedDestinations.length+' destination rows observed');
 }catch(e){record.lastError=e.message;if(record.status==='SUBMITTING'&&!record.contentId)record.status='SUBMISSION_UNCERTAIN';persist();await p.screenshot({path:path.join(root,'private',tag+'-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(root,'private',tag+'-failure.txt'),await p.locator('body').innerText().catch(()=>''),{mode:0o600});throw e;}
 finally{await Promise.allSettled([...pending]);await cSave(context);await context.close();await browser.close();}
}
async function cSave(context){await context.storageState({path:path.join(root,'private/owner-session-refreshed.private.json'),indexedDB:true});fs.chmodSync(path.join(root,'private/owner-session-refreshed.private.json'),0o600);}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
