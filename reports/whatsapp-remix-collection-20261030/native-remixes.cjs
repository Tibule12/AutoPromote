// Ordinary signed-in Studio authoring, exact preview, canonical CPU export.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const directory=process.argv[2],root=path.resolve(__dirname,'../..'),folder=process.env.CREDITS_REMIX_COLLECTION?path.resolve(process.env.CREDITS_REMIX_COLLECTION):path.join(__dirname,'private');
const config=JSON.parse(fs.readFileSync(path.join(directory,'browser-private.json')));
const runtime=JSON.parse(fs.readFileSync(path.join(directory,'config.json')));
const ownAccount=process.env.STUDIO_REAL_ACCOUNT_LOCAL==='true';
if(ownAccount){assert.equal(runtime.mode,'real-account-local-cpu');assert.equal(config.origin,'http://localhost:5008');}
else {assert.equal(runtime.env.GCLOUD_PROJECT,'demo-autopromote-credits');assert.equal(new URL(config.origin).hostname,'127.0.0.1');}
if(!ownAccount&&process.env.CREDITS_DEMO_SECOND_ACCOUNT==='true')config.email=runtime.cohort[1]+'@example.test';
const source='/home/tibule12/Downloads/WhatsApp Video 2026-10-30 at 18.23.56.mp4';
const presets=[['chipmunk','Chipmunk'],['slowed_reverb','Slowed + Reverb'],['sped_up','Sped Up'],['deep_voice','Deep Voice'],['nightcore','Nightcore'],['amapiano_space','Amapiano Space'],['warm_vocal','Warm Vocal'],['bass_boost','Bass Boost'],['lo_fi','Lo-Fi Chill'],['telephone','Telephone'],['spatial_8d','8D Spatial']];
const {seek}=require(path.join(root,'test/e2e/playwright/studio-stability/flows'));
const {clickStudioControl}=require(path.join(root,'test/e2e/playwright/studio-timeline-layout'));
fs.mkdirSync(folder,{recursive:true,mode:0o700});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function tool(p,name){await clickStudioControl(p,p.getByRole('navigation',{name:'Creative tools'}).getByRole('button',{name,exact:true}));}
async function pause(p){const b=p.getByRole('button',{name:'Pause comparison',exact:true});if(await b.isVisible())await b.click();}
async function rail(p){await p.getByTestId('studio-pro-timeline').waitFor({timeout:90000});const show=p.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();const head=p.locator('.studio-project-rail__head');if(!await head.evaluate(e=>e.open))await head.locator(':scope > summary').click();}
async function signedIn(p){await(ownAccount?p.getByRole('button',{name:'Viral Clip Studio',exact:true}).first():p.getByTestId('shared-credit-balance')).waitFor({timeout:60000});}
async function save(p,dir,name){await rail(p);await p.getByTestId('studio-save-project').click();await p.waitForFunction(()=>document.querySelector('.studio-project-save-state')?.textContent.includes('Saved locally'));const check=p.getByLabel('Include saved versions in backup',{exact:true});if(await check.isChecked())await check.uncheck();const d=p.waitForEvent('download');await p.getByRole('button',{name:'Download project backup',exact:true}).click();const file=path.join(dir,name+'.autopromote.json');await(await d).saveAs(file);return JSON.parse(fs.readFileSync(file)).snapshot;}
async function retainDelivery(p,context,dir,id,name,browserErrors){
 const download=p.getByRole('button',{name:'Download Rendered Clip',exact:true});
 const pending=p.waitForEvent('download',{timeout:120000});await download.click();const file=path.join(dir,`${name}.mp4`);await(await pending).saveAs(file);
 const after=await save(p,dir,'FINAL-EDITABLE');assert.equal(after.audioRemix.preset,id);
 const submittedProject=JSON.parse(fs.readFileSync(path.join(dir,'BEFORE-DELIVERY.autopromote.json')));
 const restoredProject=JSON.parse(fs.readFileSync(path.join(dir,'FINAL-EDITABLE.autopromote.json')));
 assert.equal(restoredProject.id,submittedProject.id,'Download must remain bound to the submitted project');
 assert.equal(restoredProject.name,submittedProject.name,'Wait for saved-project hydration before accepting its output');
 const loginState=await context.storageState({indexedDB:true});if(ownAccount)fs.writeFileSync(path.join(folder,'account-session.private.json'),JSON.stringify(loginState),{mode:0o600});loginState.origins=loginState.origins.map(origin=>({...origin,indexedDB:(origin.indexedDB||[]).filter(db=>db.name==='firebaseLocalStorageDb')}));
 fs.writeFileSync(path.join(dir,'login.private.json'),JSON.stringify(loginState),{mode:0o600});
 fs.writeFileSync(path.join(dir,'delivery.json'),JSON.stringify({preset:id,name,projectTitle:await p.getByLabel('Project name',{exact:true}).inputValue(),file:path.relative(folder,file),sha256:hash(file),sourceSha256:hash(source),deliveredAt:new Date().toISOString(),nativeAuthoring:true,canonicalCpuRender:true,actualOwnerAccount:ownAccount,headlessMuted:true,browserErrors},null,2));
 console.log(name+': FINAL delivered '+fs.statSync(file).size+' bytes');await p.screenshot({path:path.join(dir,'delivered-studio.png')});
}
async function main(){
 const browser=ownAccount?await chromium.launch({headless:true,args:['--mute-audio','--disk-cache-size=1048576']}):null;
 const options={viewport:{width:1440,height:1000},timezoneId:'Africa/Johannesburg',recordVideo:{dir:path.join(folder,'editing-recordings'),size:{width:1440,height:1000}}};
 const context=ownAccount?await browser.newContext({...options,storageState:fs.existsSync(path.join(folder,'account-session.private.json'))?path.join(folder,'account-session.private.json'):config.sessionFile}):await chromium.launchPersistentContext(path.join(folder,'browser-profile'),{...options,headless:true,args:['--mute-audio','--disk-cache-size=1048576']});
 if(!ownAccount)await context.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname==='127.0.0.1'||['data:','blob:'].includes(u.protocol)?r.continue():r.abort()});
 const p=context.pages()[0]||await context.newPage();p.setDefaultTimeout(45000);p.on('dialog',d=>d.accept());let browserErrors=[];p.on('pageerror',e=>browserErrors.push(e.message));
 if(ownAccount){
  const metadata=[];p.on('requestfailed',r=>{const u=new URL(r.url());metadata.push({origin:u.origin,path:u.pathname,error:r.failure()?.errorText});fs.writeFileSync(path.join(folder,'network-failures.private.json'),JSON.stringify(metadata,null,2),{mode:0o600});});
  p.on('response',async r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/media/multicam/uploads/')){const d=await r.json().catch(()=>({}));fs.writeFileSync(path.join(folder,'upload-'+u.pathname.split('/').at(-1)+'.private.json'),JSON.stringify({status:r.status(),data:d},null,2),{mode:0o600});if(d.url){const test=await context.request.get(d.url).catch(()=>null);fs.writeFileSync(path.join(folder,'uploaded-source-check.json'),JSON.stringify({httpStatus:test?.status(),contentType:test?.headers()['content-type'],sha256:test?.ok()?crypto.createHash('sha256').update(await test.body()).digest('hex'):null},null,2));}}});
 }
 try{
  await p.goto(config.origin);const signin=p.getByRole('button',{name:'Sign In',exact:true});
  const authenticated=await signedIn(p).then(()=>true,()=>false);
  if(!authenticated){assert(!ownAccount,'The genuine saved account must sign in normally; never create a test session');await signin.click();await p.locator('#login-email').fill(config.email);await p.locator('#login-password').fill(config.password);await p.locator('form input[type=checkbox]').check();await p.locator('form button[type=submit]').click();}
  await signedIn(p);
  const wanted=process.argv[3]?presets.filter(([id])=>id===process.argv[3]):presets;
  for(const[id,name]of wanted){
   const dir=path.join(folder,id);fs.mkdirSync(dir,{recursive:true,mode:0o700});const title=`${name} — WhatsApp remix · 30 October${id==='deep_voice'?' · Correct source trim':''}`;
   if(fs.existsSync(path.join(dir,'delivery.json'))){console.log(name+': delivery already retained');continue;}
   await p.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
   await p.getByLabel('Restore project backup',{exact:true}).waitFor();
   console.log(name+': Studio opened');
   const existing=p.getByRole('button',{name:title,exact:true});
   if(ownAccount&&fs.existsSync(path.join(dir,'SUBMITTED.json'))&&!await existing.count()){
    await p.waitForFunction(()=>!document.querySelector('input[aria-label="Restore project backup"]')?.disabled);
    await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(dir,'BEFORE-DELIVERY.autopromote.json'));
    await existing.first().waitFor();
   }
   const reopening=Boolean(await existing.count());
   if(reopening){await existing.first().click();await p.waitForFunction(expected=>document.querySelector('input[aria-label="Project name"]')?.value===expected,title,{timeout:60000});}else{
    await p.locator('.creator-studio-dropzone input[type=file]').setInputFiles(source);
    if(ownAccount)await Promise.race([p.getByRole('button',{name:'Open Creator Studio',exact:true}).waitFor({timeout:120000}),p.getByRole('heading',{name:'Source could not be loaded',exact:true}).waitFor({timeout:120000}).then(()=>{throw Error('The owned source upload returned an unplayable URL; inspect retained source/network metadata');})]);
    await p.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:180000});
   }
   if(fs.existsSync(path.join(dir,'SUBMITTED.json'))){
    await rail(p);await tool(p,'Export');
    const retry=p.getByRole('button',{name:'Retry status check',exact:true});if(await retry.isVisible())await retry.click();
    await p.getByRole('button',{name:'Download Rendered Clip',exact:true}).waitFor({timeout:180000});
    await retainDelivery(p,context,dir,id,name,browserErrors);await p.reload();await signedIn(p);continue;
   }
   await rail(p);await pause(p);await seek(p,0);await p.getByLabel('Project name',{exact:true}).fill(title);
   await tool(p,'Reframe');await p.getByTestId('reframe-aspect-16-9').click();await p.getByTestId('reframe-follow-subject').click();
   await p.getByLabel('Speaker zoom',{exact:true}).fill('1');
   await tool(p,'Color');await p.getByLabel('Rounded main footage',{exact:true}).check();
   await p.getByLabel('Canvas margin',{exact:true}).fill('2.5');await p.getByLabel('Corner curve',{exact:true}).fill('8');
   await p.getByRole('button',{name:'True black',exact:true}).click();
   await tool(p,'Sound');await p.getByLabel('Use voice repair on export',{exact:true}).uncheck();
   await p.getByTestId(`audio-remix-preset-${id}`).click();await pause(p);await seek(p,0);
   await p.getByTestId('audio-remix-panel').getByRole('group',{name:'Protect source',exact:true}).getByRole('button',{name:'Music',exact:true}).click();
   const rate=parseFloat(await p.getByTestId('audio-remix-panel').locator('.audio-remix-stepper strong').first().innerText());assert(rate>=.5&&rate<=1.5);
   // The scrubber is on the processed output clock. The source outro starts
   // at 78.04s, so reach source 78.00s using this preset's actual speed.
   const prepared=['PREPARED-NOT-SUBMITTED.autopromote.json','BEFORE-DELIVERY.autopromote.json'].map(n=>path.join(dir,n)).find(f=>fs.existsSync(f));
   const preparedEnd=prepared?JSON.parse(fs.readFileSync(prepared)).snapshot.timeline.at(-1).endRequest:null;
   if(preparedEnd===null||Math.abs(preparedEnd-78)>=.02){await seek(p,Math.round(78/rate*100)/100);await p.getByTestId('pro-quick-trim-end').click();}await seek(p,0);
   const setup=await save(p,dir,'BEFORE-SETUP');
   await tool(p,'Hook');const hook=p.getByTestId('clip-studio-inspector');
   await hook.getByRole('checkbox',{name:/Enable opening hook/}).check();
   await hook.getByRole('button',{name:'Zoom Focus',exact:true}).click();
   await hook.getByLabel('Hook text',{exact:true}).fill(`HEAR THE DIFFERENCE\n${name.toUpperCase()}`);
   const showTimeline=p.getByRole('button',{name:'Show timeline',exact:true});if(await showTimeline.isVisible())await showTimeline.click();
   await hook.locator('.inspector-range input[type=range]').fill('2.5');await pause(p);
   await seek(p,1);await p.getByRole('button',{name:'Compare',exact:true}).click();
   await p.screenshot({path:path.join(dir,'opening-hook-and-wide-after.png')});
   await seek(p,5);await p.screenshot({path:path.join(dir,'clean-wide-after.png')});await seek(p,0);
   await tool(p,'Export');await p.getByLabel('Export resolution',{exact:true}).selectOption('720p');await p.getByLabel('Export frame rate',{exact:true}).selectOption('25');
   await save(p,dir,'EDITABLE');
   await pause(p);await seek(p,0);await tool(p,'Sound');
   let snapshot=await save(p,dir,'PRE-FINAL-CUT');
   if(Math.abs(snapshot.timeline.at(-1).endRequest-78)>=.02){
    await pause(p);await seek(p,Math.round(78/snapshot.previewSpeed*100)/100);
    const observedSourceTime=await p.getByTestId('studio-after-video').evaluate(v=>v.currentTime);
    console.log(name+': source clock at final trim '+observedSourceTime.toFixed(3));
    assert(Math.abs(observedSourceTime-78)<.03,'Native source playhead must reach the requested end frame');
    await p.getByTestId('pro-quick-trim-end').click();await seek(p,0);
   }
   snapshot=await save(p,dir,'BEFORE-DELIVERY');assert.equal(snapshot.audioRemix.preset,id);assert(snapshot.audioRemix.enabled);
   assert.equal(snapshot.reframeAspect,'16:9');assert.equal(snapshot.smartCropMode,'speaker_track');assert(snapshot.smartCrop);
   assert(snapshot.reframeModeCuts.every(cut=>cut.mode==='speaker_track'),'A single wide crop must fill After');
   assert.equal(snapshot.mainFrame.enabled,true);assert.equal(snapshot.mainFrame.insetPercent,2.5);assert.equal(snapshot.mainFrame.radiusPercent,8);
   assert(snapshot.addHook);assert.equal(snapshot.hookTemplate,'zoom_focus');assert(Math.abs(snapshot.hookEndTime-snapshot.hookStartTime-2.5)<.001);assert.equal(snapshot.overlays.length,0,'Use the actual Hook sequence, not a replacement static title');
   assert.equal(snapshot.audioRemix.contentType,'music');assert(Math.abs(snapshot.timeline.at(-1).endRequest-78)<.02,'End on the final source picture before the TikTok outro');
   console.log(name+': native project saved, preset '+snapshot.audioRemix.speed+'×');
   const previewResponse=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/media/preview-audio-remix'&&r.request().method()==='POST',{timeout:90000});
   await p.getByRole('button',{name:/Preview Remix/}).click();const response=await previewResponse,payload=await response.json();
   assert.equal(response.status(),200,payload.message||payload.error);assert.equal(payload.receipt.preset,id);
   fs.writeFileSync(path.join(dir,'exact-preview-receipt.json'),JSON.stringify(payload.receipt,null,2));
   const audio=await context.request.get(payload.preview_url);assert(audio.ok());fs.writeFileSync(path.join(dir,'exact-preview.m4a'),await audio.body());
   const audioPlayer=p.getByTestId('exact-audio-remix-preview');await audioPlayer.evaluate(a=>a.pause());
   console.log(name+': exact canonical audio preview ready');
   await tool(p,'Export');const dismiss=p.getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.count())await dismiss.click();
   fs.writeFileSync(path.join(dir,'SUBMITTED.json'),JSON.stringify({at:new Date().toISOString(),state:'submission-started-reconcile-before-retry'}));
   const submittedResponse=ownAccount?p.waitForResponse(r=>new URL(r.url()).pathname==='/api/media/process'&&r.request().method()==='POST',{timeout:120000}):null;
   await p.getByRole('button',{name:/^(Render Final Clip|Render Again)$/}).click();
   if(submittedResponse){const response=await submittedResponse;fs.writeFileSync(path.join(dir,'actual-submission-response.private.json'),JSON.stringify({status:response.status(),data:await response.json()}),{mode:0o600});const state=await context.storageState({indexedDB:true});fs.writeFileSync(path.join(dir,'submission-session.private.json'),JSON.stringify(state),{mode:0o600});fs.writeFileSync(path.join(folder,'account-session.private.json'),JSON.stringify(state),{mode:0o600});}
   if(!ownAccount){const consent=p.getByRole('dialog',{name:'Studio export',exact:true});await consent.waitFor();await consent.getByRole('button',{name:/^Approve /}).click();}
   const download=p.getByRole('button',{name:'Download Rendered Clip',exact:true});
   await Promise.race([download.waitFor({timeout:650000}),p.getByTestId('studio-export-error').waitFor({timeout:650000}).then(async()=>{throw Error(await p.getByTestId('studio-export-error').innerText())})]);
   await retainDelivery(p,context,dir,id,name,browserErrors);
   await p.reload();await signedIn(p);
  }
 }catch(error){await p.screenshot({path:path.join(folder,'current-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(folder,'current-failure.json'),JSON.stringify({message:error.message,browserErrors},null,2));throw error;}
 finally{await context.close();if(browser)await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
