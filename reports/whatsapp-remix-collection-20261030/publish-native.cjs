// Real Publisher forms. Persist acknowledgements before read-only Queue
// reconciliation so an interrupted response is never blindly resubmitted.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const folder=process.env.CREDITS_REMIX_COLLECTION?path.resolve(process.env.CREDITS_REMIX_COLLECTION):path.join(__dirname,'private'),preset=process.argv[2]||'slowed_reverb',publish=process.argv.includes('--publish');
const dir=path.join(folder,preset),delivery=JSON.parse(fs.readFileSync(path.join(dir,'studio-recording-delivery.json')));
const publishNow=process.env.PUBLISH_NOW==='true'||preset==='chipmunk';
const sessionFile=process.env.PUBLISH_SESSION_FILE?path.resolve(process.env.PUBLISH_SESSION_FILE):path.join(folder,'publisher-live-session.private.json');
const allLabels={youtube:'YouTube',tiktok:'TikTok',instagram:'Instagram',linkedin:'LinkedIn',facebook:'Facebook',reddit:'Reddit'};
const selectedPlatforms=process.env.PUBLISH_PLATFORMS?process.env.PUBLISH_PLATFORMS.split(','):Object.keys(allLabels);
assert(selectedPlatforms.length&&new Set(selectedPlatforms).size===selectedPlatforms.length&&selectedPlatforms.every(key=>allLabels[key]));
const labels=Object.fromEntries(selectedPlatforms.map(key=>[key,allLabels[key]]));
const recordFile=path.join(dir,'publication.json'),record=fs.existsSync(recordFile)?JSON.parse(fs.readFileSync(recordFile)):{preset,steps:[],destinations:Object.keys(labels)};
const persist=()=>fs.writeFileSync(recordFile,JSON.stringify(record,null,2));
const media=path.join(folder,delivery.file);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(media)).digest('hex'),delivery.sha256);
assert.equal(delivery.actualOwnerAccount,true,'Publish the requested real-account Studio recording, not the emulator capture');
assert(delivery.actualStudioScreen&&delivery.realBrowserPlaybackAudio);
if(publish){const timing=JSON.parse(fs.readFileSync(path.join(dir,'playback-sync.json')));assert.equal(timing.syncStatus||timing.status,'PASS','Review actual synchronized Studio playback first');assert(!record.contentId&&!['SUBMITTING','SUBMISSION_UNCERTAIN'].includes(record.status),'Reconcile the previous submission; do not duplicate');}
const title=`${delivery.name} | Studio edit + full remix · AutoPromote`;
const caption=`Hear ${delivery.name}, see the actual AutoPromote Studio edit, then hear the full finished result. Opening Hook, wide rounded picture and the TikTok outro trimmed off.\n\nSource video credit: DJ Owam (@djowam7).\n\nWhich remix should we compare next? #AudioRemix #AutoPromote #DJowam`;
async function main(){
 const browser=await chromium.launch({headless:true,args:['--mute-audio']});
 const context=await browser.newContext({storageState:sessionFile,timezoneId:'Africa/Johannesburg',viewport:{width:1800,height:1200}});
 const p=await context.newPage();p.setDefaultTimeout(60000);let redditName,observedRows=[];
 p.on('response',async r=>{const name=new URL(r.url()).pathname;
  if(name==='/api/reddit/profile'&&r.ok()){const d=await r.json();if(d.connected)redditName=d.name;}
  if(name==='/api/content/my-promotion-schedules'&&r.ok())observedRows=(await r.json()).schedules||[];
  if(name==='/api/content/upload'&&r.request().method()==='POST'){
   const data=await r.json().catch(()=>({}));fs.writeFileSync(path.join(dir,'publisher-response.private.json'),JSON.stringify({status:r.status(),data},null,2),{mode:0o600});
   if(data.content?.id){record.contentId=data.content.id;record.status='UPLOAD_ACKNOWLEDGED_RECONCILE';record.acknowledgedAt=new Date().toISOString();persist();}
  }
 });
 try{
  await p.goto('https://autopromote.org');await p.getByRole('button',{name:'Publisher',exact:true}).waitFor();await p.getByRole('button',{name:'Publisher',exact:true}).click();
  await p.getByRole('tab',{name:'Upload',exact:true}).click();await p.getByLabel('Upload release media',{exact:true}).setInputFiles(media);
  await p.getByRole('button',{name:'Choose destinations →',exact:true}).click();
  for(const label of Object.values(labels))await p.locator('.release-platform-grid label').filter({has:p.locator('strong',{hasText:new RegExp(`^${label}$`)})}).locator('input[type=checkbox]').check();
  await p.getByRole('button',{name:'Customize destinations →',exact:true}).click();
  await p.locator('.release-master-copy input').fill(title);await p.locator('.release-master-copy textarea').fill(caption);
  for(const[platform,label]of Object.entries(labels)){
   await p.getByRole('tab',{name:label,exact:true}).click();await p.getByRole('button',{name:'Use master copy',exact:true}).click();
   if(platform==='tiktok'){
    const form=p.locator('.tiktok-form');await form.locator('#tiktok-title').fill(title);await form.locator('#tiktok-caption').fill(caption);
    const advanced=form.locator('details').filter({hasText:'Advanced TikTok disclosures and consent'});if(!await advanced.evaluate(e=>e.open))await advanced.locator('summary').click();
    const privacy=form.locator('#tiktok-privacy'),values=await privacy.locator('option').evaluateAll(es=>es.map(e=>e.value)),value=values.find(v=>['PUBLIC_TO_EVERYONE','EVERYONE','public'].includes(v));assert(value,'Connected TikTok public destination unavailable');await privacy.selectOption(value);
    await form.getByRole('checkbox',{name:/This content is commercial or promotional/}).check();await form.getByRole('checkbox',{name:/Your Brand/}).check();await form.getByRole('checkbox',{name:/By posting, you agree/}).check();
   }
   if(platform==='facebook'){
    const select=p.locator('.facebook-form select').first();await p.waitForFunction(()=>[...document.querySelectorAll('.facebook-form select option')].some(e=>e.value));
    const options=await select.locator('option').evaluateAll(es=>es.map(e=>({value:e.value,name:e.textContent}))),available=options.filter(o=>o.value),page=available.find(o=>/autopromote/i.test(o.name))||(available.length===1?available[0]:null);assert(page,'Ambiguous Facebook Page');await select.selectOption(page.value);record.facebookPage=page.name;
   }
   if(platform==='reddit'){
    await p.waitForTimeout(250);assert(/^[a-z0-9_-]{3,20}$/i.test(redditName||''),'Connected Reddit own profile unavailable');const form=p.locator('.reddit-form'),manual=form.getByPlaceholder('Type another subreddit if needed');await(await manual.count()?manual:form.locator('.input-with-icon input').first()).fill('u_'+redditName);await form.locator('#reddit-title').fill(title);await form.locator('#reddit-post-text').fill(caption);await form.getByRole('checkbox',{name:/Promotional.*Partner Content/}).check();record.redditDestination='u_'+redditName;
   }
  }
  await p.getByRole('button',{name:'Continue to Delivery →',exact:true}).click();const timing=p.getByRole('region',{name:'Delivery settings',exact:true});
  if(publishNow){await timing.getByRole('radio',{name:/^Publish now/}).check();delete record.scheduledAt;record.deliveryMode='publish_now';}
  else{
   const order=['slowed_reverb','sped_up','deep_voice','nightcore','amapiano_space','warm_vocal','bass_boost','lo_fi','telephone','spatial_8d'];const day=new Date(Date.UTC(2026,9,31+order.indexOf(preset),18));
   record.scheduledAt=day.toISOString();const date=record.scheduledAt.slice(0,10);await timing.getByRole('radio',{name:/^Schedule/}).check();await timing.locator('input[type=date]').fill(date);await timing.locator('input[type=time]').fill('20:00');await timing.locator('select').first().selectOption('Africa/Johannesburg');await timing.locator('select').nth(1).selectOption('once');
  }
  await p.getByRole('button',{name:'Review release →',exact:true}).click();const review=p.getByRole('region',{name:'Review release',exact:true});assert.equal(await review.locator('.release-review-destination').count(),selectedPlatforms.length);
  record.status='REVIEW_READY';record.destinations=selectedPlatforms;delete record.lastError;record.reviewedAt=new Date().toISOString();record.mediaSha256=delivery.sha256;record.title=title;record.caption=caption;persist();await p.screenshot({path:path.join(dir,'publisher-'+selectedPlatforms.length+'-platform-review.png')});console.log(preset+': '+selectedPlatforms.length+'-platform native review ready');
  if(!publish)return;
  record.status='SUBMITTING';record.submittedAt=new Date().toISOString();persist();
  await p.getByRole('button',{name:publishNow?`Publish to ${selectedPlatforms.length} destinations →`:`Schedule ${selectedPlatforms.length} posts →`,exact:true}).click();
  await p.waitForFunction(()=>!document.querySelector('.release-primary')?.textContent.includes('Submitting'),undefined,{timeout:120000});
  const until=Date.now()+30000;while(!record.contentId&&Date.now()<until)await p.waitForTimeout(250);assert(record.contentId,'No upload acknowledgement; reconcile before retrying');
  await p.getByRole('button',{name:'Queue',exact:true}).click();await p.waitForTimeout(2500);
  record.observedDestinations=observedRows.filter(row=>row.contentId===record.contentId).map(row=>({id:row.id,platform:row.platform,status:row.status,isActive:row.isActive,startTime:row.startTime,contentId:row.contentId}));
  record.status=record.observedDestinations.length===selectedPlatforms.length?'UPLOAD_ACKNOWLEDGED_QUEUE_OBSERVED':'UPLOAD_ACKNOWLEDGED_RECONCILE';record.observedAt=new Date().toISOString();persist();console.log(preset+': upload acknowledged; '+record.observedDestinations.length+' Queue destinations observed');
 }catch(error){record.lastError=error.message;if(record.status==='SUBMITTING'&&!record.contentId)record.status='SUBMISSION_UNCERTAIN';persist();await p.screenshot({path:path.join(dir,'publication-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(dir,'publication-failure.private.txt'),await p.locator('body').innerText().catch(()=>''),{mode:0o600});throw error;}
 finally{await context.close();await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
