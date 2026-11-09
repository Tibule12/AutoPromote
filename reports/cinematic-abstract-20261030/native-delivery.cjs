// Native main sequence, chapter text and separate narration/score in actual Studio.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const id=process.argv[2],kind=process.argv[3]||'episode',phase=process.argv[4]||'prepare';
const folder=path.join('/dev/shm/autopromote-abstract-20261030',id,kind);
const plan=JSON.parse(fs.readFileSync(path.join(folder,'lesson-plan.json')));
Object.assign(process.env,{STUDIO_TEMPLATE_PROOF_DIR:folder,STUDIO_KINETIC_PROOF_DIR:folder,STUDIO_QA_CAPTURE_FPS:'5',
STUDIO_QA_EXPORT_FPS:'24',STUDIO_QA_EXPORT_RESOLUTION:plan.width===1280?'720p':'source',STUDIO_QA_EXPECTED_WIDTH:String(plan.width),STUDIO_QA_EXPECTED_HEIGHT:String(plan.height),
STUDIO_QA_NATIVE_DOWNLOAD_METHOD:'playwright',STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS:'1800000',STUDIO_QA_UPLOAD_BUDGET_MS:'600000',STUDIO_QA_HIDE_MEDIA:'0'});
process.env.STUDIO_QA_RESTORE_AFTER_TIMELINE='1';
const {recording,pause,seek,range}=require('../../scripts/studio-professional/kinetic-type-proof');
Object.assign(process.env,{STUDIO_TEMPLATE_PROOF_DIR:folder,STUDIO_QA_EXPECTED_WIDTH:String(plan.width),STUDIO_QA_EXPECTED_HEIGHT:String(plan.height)});
const h=require('../../scripts/creative-templates/studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {hash}=require('../../src/creativeTemplates/contract');const write=(n,v)=>fs.writeFileSync(path.join(folder,n),JSON.stringify(v,null,2)+'\n',{mode:0o600});
const backupFile=path.join(folder,'EPISODE.autopromote.json');
let actualOwnerAuthorization;
async function reconcileOwnedCompletion(page){
 assert(actualOwnerAuthorization,'Observe ordinary signed-in API authorization before output reconciliation');
 const accepted=JSON.parse(fs.readFileSync(path.join(folder,'accepted.json')));
 let completed;const deadline=Date.now()+90000;
 do{
  const response=await page.context().request.get('http://127.0.0.1:5148/api/media/status/'+accepted.jobId,{headers:{Authorization:actualOwnerAuthorization}});
  assert(response.ok());completed=await response.json();assert.equal(completed.jobId,accepted.jobId);assert.notEqual(completed.status,'failed');
  if(completed.status==='completed'&&/^[a-f0-9]{64}$/.test(completed.result?.outputSha256||''))break;
  assert(Date.now()<deadline,'Actual current API must finish verifying the retained canonical bytes; never resubmit from this observer');await page.waitForTimeout(2000);
 }while(true);
 write('owner-completion-reconciliation.private.json',completed);return completed;
}
async function backup(page){const include=page.getByLabel('Include saved versions in backup',{exact:true});if(await include.isChecked())await include.uncheck();const d=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();await(await d).saveAs(backupFile);}
async function finishExport(page){
 try{await h.render(page,'final');}
 catch(error){
  const metaFile=path.join(folder,'final/native-render-completed.json'),movie=path.join(folder,'final/final.mp4');
  if(!error.message.includes('Downloaded bytes differ')||!fs.existsSync(metaFile)||!fs.existsSync(movie))throw error;
  const meta=JSON.parse(fs.readFileSync(metaFile));if(meta.serverOutputSha256)throw error;
  await reconcileOwnedCompletion(page);
  write('initial-completion-observation.json',{error:error.message,acceptedJob:meta.submittedJobId,newWorkerSubmission:false});
  await backup(page);write('recovery-identity.json',{projectId:meta.projectId,projectHash:meta.projectHash,outputSha256:hash(fs.readFileSync(movie)),submittedJobId:meta.submittedJobId});
  await q.tool(page,'Export');await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.join(folder,'recovery-identity.json'));
  await page.getByTestId('rendered-output-ready').waitFor({timeout:60000});await h.recover(page,'final');
 }
 await backup(page);
}
async function prepare(page){
 assert(!fs.existsSync(path.join(folder,'native-edit.json')),'Preserve the existing native edit');
 await page.locator('.viral-studio-entry-panel input[type=file][accept="video/*"]').setInputFiles(plan.rows[0].file);
 await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:120000});await h.rail(page);await pause(page);
 await page.getByLabel('Project name',{exact:true}).fill(plan.name);const stop=await recording(page);
 try{
  await q.tool(page,'Reframe');await page.getByTestId('reframe-aspect-16-9').click();const auto=page.getByTestId('auto-reframe-toggle');if(await auto.isChecked())await auto.uncheck();
  await q.tool(page,'Color');const rounded=page.getByLabel('Rounded main footage',{exact:true});if(await rounded.isChecked())await rounded.uncheck();
  await page.getByTestId('project-media-import-input').setInputFiles(plan.rows.slice(1).map(r=>r.file));
  for(const row of plan.rows.slice(1)){
   await page.locator('#studio-library-tab-media').click();await page.getByRole('searchbox',{name:'Search project media',exact:true}).fill(path.basename(row.file));
   const preview=page.getByRole('button',{name:'Preview '+path.basename(row.file),exact:true});await preview.waitFor({timeout:300000});await preview.click();
   const card=preview.locator('xpath=ancestor::article'),add=card.getByRole('button',{name:'Add to sequence',exact:true});await add.waitFor();
   let retries=0;const deadline=Date.now()+300000;
   while(!await add.isEnabled()){
    const retry=card.getByRole('button',{name:'Retry upload',exact:true});
    if(await retry.isVisible()&&await retry.isEnabled()&&retries<3){await retry.click();retries++;}
    assert(Date.now()<deadline,'Native media save did not complete; retain the failed take');await page.waitForTimeout(1500);
   }
   await add.click();console.log(id,'native sequence',row.id);await h.save(page,'sequence-checkpoint');
  }
  await page.getByRole('searchbox',{name:'Search project media',exact:true}).fill('');
  if(plan.labels!==false){await q.tool(page,'Graphics');const importer=page.getByTestId('studio-graphics-import');if(!await importer.evaluate(e=>e.open))await importer.locator('summary').click();
  await page.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.join(folder,'labels.graphics.json'));await importer.getByRole('status').filter({hasText:'imported.'}).waitFor();}
  await q.tool(page,'Sound');if(plan.narration!==false){await page.getByTestId('voiceover-recording-input').setInputFiles(path.join(folder,'narration.mp3'));
  await page.getByLabel('Start for narration.mp3',{exact:true}).fill('0');await page.getByLabel('Start for narration.mp3',{exact:true}).blur();}
  const repair=page.getByLabel('Use voice repair on export',{exact:true});if(await repair.isChecked())await repair.uncheck();
  const original=page.getByRole('checkbox',{name:/^Keep original audio/});if(await original.isChecked())await original.uncheck();
  await page.getByTestId('background-sound-input').setInputFiles(path.join(folder,'original-score.mp3'));
  await range(page.locator('label.inspector-range').filter({hasText:'Background volume'}).locator('input'),plan.musicVolume||14);
  await range(page.getByLabel('Music fade in',{exact:true}),.15);await range(page.getByLabel('Music fade out',{exact:true}),1);
  const duck=page.getByRole('checkbox',{name:/Duck under speech/});if(await duck.isChecked())await duck.uncheck();
  await q.tool(page,'Export');await page.getByLabel('Export frame rate',{exact:true}).selectOption('24');
 }finally{await stop();}
 const saved=await h.save(page,'prepared');await backup(page);assert.equal(saved.snapshot.timeline.length,plan.rows.length);
 write('native-edit.json',{projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),duration:plan.duration,wholeWorkspace:true,nativeMainSequence:true,graphInjection:false,ownerApproved:false,scheduled:false});
 for(const row of plan.rows){await seek(page,row.start+Math.min(2,row.duration/2));await page.waitForTimeout(700);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'native-'+row.id+'.png')});}
}
(async()=>{
 const original=JSON.parse(fs.readFileSync(phase==='recover-accepted'?path.join(folder,'accepted-session.private.json'):'/dev/shm/autopromote-three-films/lesson-session.private.json'));
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--disk-cache-size=16777216','--host-resolver-rules=MAP localhost 127.0.0.36','--no-proxy-server','--disable-quic','--disable-http2']});
 const context=await browser.newContext({storageState:{...original,origins:original.origins.map(o=>({...o,indexedDB:(o.indexedDB||[]).filter(d=>phase==='recover-accepted'||d.name!=='autopromote-viral-studio')}))},viewport:{width:1600,height:1000},acceptDownloads:true});
 // Transport override to the declared task-owned current API. Real requests,
 // Auth and responses are untouched; no service result is fabricated.
 await context.route('**/api/**',route=>{const u=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(u.hostname)&&u.port==='5128'){u.hostname='127.0.0.1';u.port='5148';return route.continue({url:u.href});}return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('dialog',d=>void d.accept());let submissions=0;
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/')&&r.headers().authorization)actualOwnerAuthorization=r.headers().authorization;if(new URL(r.url()).pathname==='/api/media/process'&&r.method()==='POST')submissions++;});
 page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/media/process'&&r.ok()){const j=await r.json();write('accepted.json',{jobId:j.jobId||j.job_id,resubmissionAllowed:false});write('accepted-session.private.json',await context.storageState({indexedDB:true}));}});
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).waitFor({timeout:90000});await page.waitForTimeout(3000);
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
  if(phase==='prepare')await prepare(page);
  else{if(phase!=='recover-accepted')await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(backupFile);await page.getByRole('region',{name:'Saved Studio projects',exact:true}).getByRole('button',{name:plan.name,exact:true}).click();await h.rail(page);await pause(page);}
  if(phase==='revise-mix'){
   const old=JSON.parse(fs.readFileSync(path.join(folder,'accepted.json'))),completed=JSON.parse(fs.readFileSync(path.join(folder,'final/native-render-completed.json')));
   assert.equal(old.jobId,completed.submittedJobId);assert(!completed.serverOutputSha256,'This revision addresses the earlier API output contract and narration mix.');
   const archive=path.join(folder,'completed-unbound-'+old.jobId);fs.mkdirSync(archive,{mode:0o700});
   for(const n of fs.readdirSync(folder).filter(n=>n.startsWith('accepted')||n.startsWith('final-')||n==='EPISODE.autopromote.json'))fs.copyFileSync(path.join(folder,n),path.join(archive,n));
   fs.renameSync(path.join(folder,'final'),path.join(archive,'final'));fs.unlinkSync(path.join(folder,'accepted.json'));
   await q.tool(page,'Sound');await range(page.locator('label.inspector-range').filter({hasText:'Background volume'}).locator('input'),15);
   plan.musicVolume=15;write('lesson-plan.json',plan);
   const current=await h.save(page,'revised-mix'),review=JSON.parse(fs.readFileSync(path.join(folder,'agent-picture-review.json')));
   review.previousCanonicalHash=review.canonicalHash;review.canonicalHash=hash(current.snapshot.studioDocument);review.revision='Revised native background mix 14 to 15 percent; current task-owned API preserves worker output integrity.';write('agent-picture-review.json',review);await backup(page);
   await finishExport(page);
  }
  if(phase==='retry-terminal'){
   const old=JSON.parse(fs.readFileSync(path.join(folder,'accepted.json'))),terminal=JSON.parse(fs.readFileSync(path.join(folder,'terminal-failed-job.private.json')));
   assert.equal(terminal.status,'failed');assert.equal(terminal.jobId,old.jobId);
   const archive=path.join(folder,'terminated-'+old.jobId);fs.mkdirSync(archive,{mode:0o700});
   for(const n of fs.readdirSync(folder).filter(n=>n.startsWith('accepted')||n.startsWith('final-')||n==='EPISODE.autopromote.json'))fs.copyFileSync(path.join(folder,n),path.join(archive,n));
   fs.unlinkSync(path.join(folder,'accepted.json'));
   const current=await h.save(page,'review-before-terminal-retry'),review=JSON.parse(fs.readFileSync(path.join(folder,'agent-picture-review.json')));
   review.previousCanonicalHash=review.canonicalHash;review.canonicalHash=hash(current.snapshot.studioDocument);review.retryReason=terminal.error;write('agent-picture-review.json',review);
   await finishExport(page);
  }
  if(phase==='render'){
   assert(!fs.existsSync(path.join(folder,'accepted.json')),'Recover the accepted job; do not resubmit.');
   const current=await h.save(page,'review-before-export'),review=JSON.parse(fs.readFileSync(path.join(folder,'agent-picture-review.json')));
   assert.equal(review.canonicalHash,hash(current.snapshot.studioDocument),'Review the actual prepared edit before export');
   await finishExport(page);
  }
  if(phase==='recover-receipt'){
   const meta=JSON.parse(fs.readFileSync(path.join(folder,'final/native-render-completed.json')));
   await reconcileOwnedCompletion(page);
   const identity={projectId:meta.projectId,projectHash:meta.projectHash,outputSha256:meta.serverOutputSha256||hash(fs.readFileSync(path.join(folder,'final/final.mp4'))),submittedJobId:meta.submittedJobId};
   write('recovery-identity.json',identity);await q.tool(page,'Export');
   await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.join(folder,'recovery-identity.json'));
   await page.getByTestId('rendered-output-ready').waitFor({timeout:60000});
   await h.recover(page,'final');await backup(page);assert.equal(submissions,0);
  }
  if(['recover','recover-accepted'].includes(phase)){
   assert(fs.existsSync(path.join(folder,'accepted.json')),'Only recover an actually accepted job');
   await reconcileOwnedCompletion(page);
   await h.recover(page,'final');await backup(page);assert.equal(submissions,0,'Recovery must not submit another render');
  }
  if(phase==='view'){
   await q.tool(page,'Export');await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.join(folder,'final/render-receipt.json'));
   await require('../../scripts/creative-templates/materials-editing-proof').view(page,'final');
  }
  if(phase==='restore'){
   const saved=await h.save(page,'independently-restored'),receipt=JSON.parse(fs.readFileSync(path.join(folder,'final/render-receipt.json')));assert.equal(hash(saved.snapshot.studioDocument),receipt.projectHash);
   await q.tool(page,'Export');await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.join(folder,'final/render-receipt.json'));
   const ready=page.getByTestId('rendered-output-ready');await ready.waitFor({timeout:90000});const wait=page.waitForEvent('download');await ready.getByRole('button',{name:/Download/}).click();const file=path.join(folder,'restored-final.mp4');await(await wait).saveAs(file);assert.equal(hash(fs.readFileSync(file)),receipt.outputSha256);assert.equal(submissions,0);write('independent-restore.json',{projectHash:receipt.projectHash,outputSha256:receipt.outputSha256,newBrowser:true,noResubmission:true});
  }
  write(phase+'-observation.json',{submissions,realAuth:true,scheduled:false});console.log(id,'episode',phase,'complete');
 }catch(error){write('failure-'+Date.now()+'.json',{phase,error:error.message,submissions});await page.screenshot({path:path.join(folder,'failure-'+Date.now()+'.png')}).catch(()=>{});await backup(page).catch(()=>{});throw error;}
 finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
