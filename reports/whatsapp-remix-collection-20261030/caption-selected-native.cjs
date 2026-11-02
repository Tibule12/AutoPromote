// Caption the selected edits through genuine local Studio controls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
const report=__dirname,original=path.join(report,'private/own-account-local-v5');
const collection=process.env.STUDIO_CAPTION_COLLECTION?path.resolve(process.env.STUDIO_CAPTION_COLLECTION):path.join(report,'private/selected-three-captioned');
const preset=process.argv[2]||'chipmunk',source=path.join(original,preset);
const delivery=JSON.parse(fs.readFileSync(path.join(source,'delivery.json')));
assert(['chipmunk','slowed_reverb','sped_up'].includes(preset));assert(delivery.actualOwnerAccount);
const dir=path.join(collection,preset);fs.mkdirSync(dir,{recursive:true,mode:0o700});
const applyLyrics=process.argv.includes('--apply-lyrics');
const cueCount=applyLyrics?JSON.parse(fs.readFileSync(path.join(collection,'lyric-timing-provenance.json'))).cues.length:0;
const twice=process.env.STUDIO_CAPTION_REPEAT_COUNT==='2';
const fiveLines=process.env.STUDIO_CAPTION_SEQUENCE==='five-lines';
async function rail(p){const show=p.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();const head=p.locator('.studio-project-rail__head');if(!await head.evaluate(e=>e.open))await head.locator(':scope > summary').click();}
async function save(p,name){await rail(p);await p.getByTestId('studio-save-project').click();await p.waitForFunction(()=>document.querySelector('.studio-project-save-state')?.textContent.includes('Saved locally'));const check=p.getByLabel('Include saved versions in backup',{exact:true});if(await check.isChecked())await check.uncheck();const pending=p.waitForEvent('download');await p.getByRole('button',{name:'Download project backup',exact:true}).click();const file=path.join(dir,name+'.autopromote.json');await(await pending).saveAs(file);return JSON.parse(fs.readFileSync(file));}
async function main(){
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--disk-cache-size=1048576']});
 const state=fs.existsSync(path.join(collection,'account-session.private.json'))?path.join(collection,'account-session.private.json'):path.join(original,'account-session.private.json');
 const context=await browser.newContext({storageState:state,viewport:{width:1440,height:1000},timezoneId:'Africa/Johannesburg',recordVideo:{dir:path.join(collection,'editing-recordings'),size:{width:1440,height:1000}}});
 const p=await context.newPage();p.setDefaultTimeout(60000);p.on('dialog',d=>d.accept());
 const events=[];p.on('response',async r=>{const u=new URL(r.url());if(u.pathname==='/api/media/transcribe-source'||u.pathname.startsWith('/api/media/status/')){const data=await r.json().catch(()=>({}));events.push({path:u.pathname,status:r.status(),data});fs.writeFileSync(path.join(dir,'caption-service.private.json'),JSON.stringify(events),{mode:0o600});}});
 try{
  await p.goto('http://localhost:5008');await p.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
  const restore=p.getByLabel('Restore project backup',{exact:true});await restore.waitFor();await p.waitForFunction(()=>!document.querySelector('input[aria-label="Restore project backup"]')?.disabled);
  const draft=path.join(dir,'DRAFT-CAPTIONS.autopromote.json');
  const opening=applyLyrics&&fs.existsSync(draft)?draft:path.join(source,'FINAL-EDITABLE.autopromote.json');
  const opened=JSON.parse(fs.readFileSync(opening));await restore.setInputFiles(opening);
  await p.getByRole('button',{name:opened.name,exact:true}).first().click();
  await p.waitForFunction(name=>document.querySelector('input[aria-label="Project name"]')?.value===name,opened.name);await p.getByTestId('studio-pro-timeline').waitFor();await rail(p);
  if(opening!==draft){
   await p.locator('.studio-project-actions').getByRole('button',{name:'Duplicate',exact:true}).click();
   await p.waitForFunction(name=>document.querySelector('input[aria-label="Project name"]')?.value===name+' copy',opened.name);
   await p.getByLabel('Project name',{exact:true}).fill(delivery.name+(fiveLines?' — Corrected five-line lyrics · 31 October':twice?' — Lyrics repeated twice · 30 October':' — Captioned WhatsApp remix · 30 October'));
  }
  const before=await save(p,'BEFORE-SETUP');assert.notEqual(before.id,JSON.parse(fs.readFileSync(path.join(source,'FINAL-EDITABLE.autopromote.json'))).id);
  await clickStudioControl(p,p.getByRole('navigation',{name:'Creative tools'}).getByRole('button',{name:'Captions',exact:true}));
  if(applyLyrics){
   const expected=fs.readFileSync(path.join(collection,'owner-lyrics.txt'),'utf8').trim().split('\n');
   await p.locator('input[type=file][accept=".srt,.vtt,.txt"]').setInputFiles(path.join(collection,'owner-lyrics-source-timed.srt'));
   const fields=p.locator('textarea[aria-label^="Caption "][aria-label$=" text"]');await fields.first().waitFor();assert.equal(await fields.count(),cueCount);
   assert((await fields.evaluateAll(es=>es.map(e=>e.value))).every(text=>expected.includes(text)));
   await p.getByLabel('Bulk caption language',{exact:true}).selectOption('zu');await p.getByRole('button',{name:'Apply language to all captions',exact:true}).click();
   for(let i=1;i<=cueCount;i++)await p.getByLabel(`Caption ${i} speaker`,{exact:true}).selectOption('A');
   await p.getByRole('button',{name:'I checked every line — approve wording',exact:true}).click();
   if(fiveLines)await p.getByRole('button',{name:'Remove all caption reactions',exact:true}).click();
   await p.getByLabel('Caption coverage',{exact:true}).selectOption('selected');
   await p.getByRole('button',{name:'Minimal',exact:true}).click();
   await p.getByRole('group',{name:'Default caption placement',exact:true}).getByRole('button',{name:'Bottom centre',exact:true}).click();
   const pause=p.getByRole('button',{name:'Pause comparison',exact:true});if(await pause.isVisible())await pause.click();
   await p.screenshot({path:path.join(dir,'owner-lyrics-studio.png')});
   const backup=await save(p,'BEFORE-DELIVERY');assert(backup.snapshot.autoCaptions);assert.equal(backup.snapshot.captionStyle,'minimal');assert.equal(backup.snapshot.captionSegments.length,cueCount);assert(backup.snapshot.captionSegments.every(s=>expected.includes(s.text)&&!s.reviewRequired));assert.equal(backup.snapshot.audioRemix.preset,preset);
   await clickStudioControl(p,p.getByRole('navigation',{name:'Creative tools'}).getByRole('button',{name:'Export',exact:true}));
   assert(!fs.existsSync(path.join(dir,'SUBMITTED.json')),'Recover an existing submission instead of rendering twice');
   const submitted=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/media/process'&&r.request().method()==='POST',{timeout:120000});
   fs.writeFileSync(path.join(dir,'SUBMITTED.json'),JSON.stringify({at:new Date().toISOString(),state:'reconcile-before-retry'}));
   await p.getByRole('button',{name:/^(Render Final Clip|Render Again)$/}).click();const response=await submitted,data=await response.json();
   fs.writeFileSync(path.join(dir,'actual-submission-response.private.json'),JSON.stringify({status:response.status(),data}),{mode:0o600});
   fs.writeFileSync(path.join(collection,'account-session.private.json'),JSON.stringify(await context.storageState({indexedDB:true})),{mode:0o600});
   assert.equal(response.status(),200,data.message||data.error);assert(data.jobId);
   console.log(delivery.name+': '+cueCount+' owner-worded native captions saved; actual CPU export submitted');
   const finished=p.waitForResponse(async r=>new URL(r.url()).pathname==='/api/media/status/'+data.jobId&&r.ok()&&['completed','failed','cancelled'].includes((await r.json()).status),{timeout:650000});
   const completed=await(await finished).json();assert.equal(completed.status,'completed',completed.error||'The native export did not complete');assert(/^[a-f0-9]{64}$/.test(completed.result?.outputSha256));
   await p.getByTestId('rendered-output-ready').waitFor();const pending=p.waitForEvent('download',{timeout:120000});await p.getByRole('button',{name:'Download Rendered Clip',exact:true}).click();const name=delivery.name+(fiveLines?' — Corrected lyrics':twice?' — Lyrics repeated twice':' — Captioned'),file=path.join(dir,name+'.mp4');await(await pending).saveAs(file);
   const sha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');assert.equal(sha256,completed.result.outputSha256);
   const actual=await save(p,'FINAL-EDITABLE');assert.equal(actual.id,backup.id);assert.equal(actual.name,backup.name);
   fs.writeFileSync(path.join(collection,'account-session.private.json'),JSON.stringify(await context.storageState({indexedDB:true})),{mode:0o600});
   fs.writeFileSync(path.join(dir,'login.private.json'),JSON.stringify(await context.storageState({indexedDB:true})),{mode:0o600});
   fs.writeFileSync(path.join(dir,'delivery.json'),JSON.stringify({preset,name,projectTitle:actual.name,file:path.relative(collection,file),sha256,sourceSha256:delivery.sourceSha256,deliveredAt:new Date().toISOString(),nativeAuthoring:true,canonicalCpuRender:true,actualOwnerAccount:true,headlessMuted:true,captionLines:cueCount,ownerSuppliedWording:true,lyricRepeatCount:twice?2:null,repeatStructure:fiveLines?{sidla:2,zingaphi:2,ngconuxolise:1,yho:'first zingaphi'}:null,jobId:data.jobId,browserErrors:[]},null,2));
   const videos='/home/tibule12/Videos/AutoPromote Remix Collection 2026-10-30/Captioned';fs.mkdirSync(videos,{recursive:true});fs.copyFileSync(file,path.join(videos,name+'.mp4'));
   const editable=path.join(videos,'Editable Studio projects');fs.mkdirSync(editable,{recursive:true});const master=path.join(editable,name+'.autopromote.json');fs.copyFileSync(path.join(dir,'FINAL-EDITABLE.autopromote.json'),master);fs.chmodSync(master,0o600);
   console.log(delivery.name+': captioned native final delivered');return;
  }
  await p.getByLabel('Speech language',{exact:true}).selectOption('zu');
  await p.getByTestId('generate-live-transcript').click();
  console.log(delivery.name+': genuine Studio source transcription started');
  await p.waitForFunction(()=>{const e=document.querySelector('.caption-generation-status');return e&&/is-review|is-ready|is-failed/.test(e.className)},undefined,{timeout:600000});
  const message=await p.locator('.caption-generation-status').innerText();
  const backup=await save(p,'DRAFT-CAPTIONS');
  fs.writeFileSync(path.join(collection,'account-session.private.json'),JSON.stringify(await context.storageState({indexedDB:true})),{mode:0o600});
  await p.screenshot({path:path.join(dir,'caption-draft-studio.png')});
  const segments=backup.snapshot.captionSegments||[];
  fs.writeFileSync(path.join(dir,'caption-draft-review.json'),JSON.stringify({preset,name:delivery.name,projectId:backup.id,message,segments,wordingApproved:false,nativeStudio:true,actualOwnerAccount:true},null,2));
  console.log(JSON.stringify({preset,message,lines:segments.map(x=>({start:x.start,end:x.end,text:x.text,reviewRequired:x.reviewRequired}))}));
 }finally{await context.close();await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
