// Native main sequence, chapter text and separate narration/score in actual Studio.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const id=process.argv[2],phase=process.argv[3]||'prepare';
const folder=path.join('/dev/shm/autopromote-three-films',id,'episode');
const plan=JSON.parse(fs.readFileSync(path.join(folder,'lesson-plan.json')));
Object.assign(process.env,{STUDIO_TEMPLATE_PROOF_DIR:folder,STUDIO_KINETIC_PROOF_DIR:folder,STUDIO_QA_CAPTURE_FPS:'5',
STUDIO_QA_EXPORT_FPS:'24',STUDIO_QA_EXPORT_RESOLUTION:'source',STUDIO_QA_EXPECTED_WIDTH:'1600',STUDIO_QA_EXPECTED_HEIGHT:'1000',
STUDIO_QA_NATIVE_DOWNLOAD_METHOD:'playwright',STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS:'1800000',STUDIO_QA_UPLOAD_BUDGET_MS:'600000',STUDIO_QA_HIDE_MEDIA:'0'});
const {recording,pause,seek,range}=require('../../scripts/studio-professional/kinetic-type-proof');
Object.assign(process.env,{STUDIO_TEMPLATE_PROOF_DIR:folder,STUDIO_QA_EXPECTED_WIDTH:'1600',STUDIO_QA_EXPECTED_HEIGHT:'1000'});
const h=require('../../scripts/creative-templates/studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {hash}=require('../../src/creativeTemplates/contract');const write=(n,v)=>fs.writeFileSync(path.join(folder,n),JSON.stringify(v,null,2)+'\n',{mode:0o600});
const backupFile=path.join(folder,'EPISODE.autopromote.json');
async function backup(page){const include=page.getByLabel('Include saved versions in backup',{exact:true});if(await include.isChecked())await include.uncheck();const d=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();await(await d).saveAs(backupFile);}
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
   const add=preview.locator('xpath=ancestor::article').getByRole('button',{name:'Add to sequence',exact:true});await add.waitFor();await add.click();console.log(id,'native sequence',row.id);
  }
  await page.getByRole('searchbox',{name:'Search project media',exact:true}).fill('');
  await q.tool(page,'Graphics');const importer=page.getByTestId('studio-graphics-import');if(!await importer.evaluate(e=>e.open))await importer.locator('summary').click();
  await page.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.join(folder,'labels.graphics.json'));await importer.getByRole('status').filter({hasText:'imported.'}).waitFor();
  await q.tool(page,'Sound');await page.getByTestId('voiceover-recording-input').setInputFiles(path.join(folder,'narration.mp3'));
  await page.getByLabel('Start for narration.mp3',{exact:true}).fill('0');await page.getByLabel('Start for narration.mp3',{exact:true}).blur();
  const repair=page.getByLabel('Use voice repair on export',{exact:true});if(await repair.isChecked())await repair.uncheck();
  const original=page.getByRole('checkbox',{name:/^Keep original audio/});if(await original.isChecked())await original.uncheck();
  await page.getByTestId('background-sound-input').setInputFiles(path.join(folder,'original-score.mp3'));
  await range(page.locator('label.inspector-range').filter({hasText:'Background volume'}).locator('input'),32);
  await range(page.getByLabel('Music fade in',{exact:true}),.15);await range(page.getByLabel('Music fade out',{exact:true}),1);
  const duck=page.getByRole('checkbox',{name:/Duck under speech/});if(await duck.isChecked())await duck.uncheck();
  await q.tool(page,'Export');await page.getByLabel('Export frame rate',{exact:true}).selectOption('24');
 }finally{await stop();}
 const saved=await h.save(page,'prepared');await backup(page);assert.equal(saved.snapshot.timeline.length,plan.rows.length);
 write('native-edit.json',{projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),duration:plan.duration,wholeWorkspace:true,nativeMainSequence:true,graphInjection:false,ownerApproved:false,scheduled:false});
 for(const row of plan.rows){await seek(page,row.start+Math.min(2,row.duration/2));await page.waitForTimeout(700);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'native-'+row.id+'.png')});}
}
(async()=>{
 const original=JSON.parse(fs.readFileSync('/dev/shm/autopromote-three-films/lesson-session.private.json'));
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--disk-cache-size=16777216','--host-resolver-rules=MAP localhost 127.0.0.36','--no-proxy-server','--disable-quic','--disable-http2']});
 const context=await browser.newContext({storageState:{...original,origins:original.origins.map(o=>({...o,indexedDB:(o.indexedDB||[]).filter(d=>d.name!=='autopromote-viral-studio')}))},viewport:{width:1600,height:1000},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('dialog',d=>void d.accept());let submissions=0;
 page.on('request',r=>{if(new URL(r.url()).pathname==='/api/media/process'&&r.method()==='POST')submissions++;});
 page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/media/process'&&r.ok()){const j=await r.json();write('accepted.json',{jobId:j.jobId||j.job_id,resubmissionAllowed:false});write('accepted-session.private.json',await context.storageState({indexedDB:true}));}});
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).waitFor({timeout:90000});await page.waitForTimeout(3000);
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
  if(phase==='prepare')await prepare(page);
  else{await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(backupFile);await page.getByRole('region',{name:'Saved Studio projects',exact:true}).getByRole('button',{name:plan.name,exact:true}).click();await h.rail(page);await pause(page);}
  if(phase==='render'){
   assert(!fs.existsSync(path.join(folder,'accepted.json')),'Recover the accepted job; do not resubmit.');
   const current=await h.save(page,'review-before-export'),review=JSON.parse(fs.readFileSync(path.join(folder,'agent-picture-review.json')));
   assert.equal(review.canonicalHash,hash(current.snapshot.studioDocument),'Review the actual prepared edit before export');
   await h.render(page,'final');await backup(page);
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
