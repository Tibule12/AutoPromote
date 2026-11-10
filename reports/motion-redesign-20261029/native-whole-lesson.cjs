// A complete-workspace tutorial assembled with the actual Studio main sequence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const folder=path.join(__dirname,'proof',process.env.STUDIO_LESSON_TAKE||'lesson-r2'),phase=process.argv[2]||'prepare';
const plan=JSON.parse(fs.readFileSync(path.join(folder,'lesson-plan.json')));
const ram=fs.mkdtempSync('/dev/shm/studio-whole-lesson-');
Object.assign(process.env,{STUDIO_TEMPLATE_PROOF_DIR:folder,STUDIO_KINETIC_PROOF_DIR:ram,
 STUDIO_QA_EXPORT_FPS:'24',STUDIO_QA_EXPORT_RESOLUTION:'source',STUDIO_QA_EXPECTED_WIDTH:'1600',STUDIO_QA_EXPECTED_HEIGHT:'900',
 STUDIO_QA_NATIVE_DOWNLOAD_METHOD:'playwright',STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS:'1800000',STUDIO_QA_UPLOAD_BUDGET_MS:'600000',
 STUDIO_QA_TIMELINE_HEIGHT:'320',STUDIO_QA_HIDE_MEDIA:'0'});
const {pause,seek,range,recording}=require('../../scripts/studio-professional/kinetic-type-proof');
Object.assign(process.env,{STUDIO_QA_EXPECTED_WIDTH:'1600',STUDIO_QA_EXPECTED_HEIGHT:'900'});
const h=require('../../scripts/creative-templates/studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {hash}=require('../../src/creativeTemplates/contract');
const write=(name,value)=>fs.writeFileSync(path.join(folder,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const backupFile=path.join(folder,'WHOLE-STUDIO-LESSON.autopromote.json');
async function backup(page){const v=page.getByLabel('Include saved versions in backup',{exact:true});if(await v.isChecked())await v.uncheck();
 const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();await(await waiting).saveAs(backupFile);}
async function prepare(page){
 assert(!fs.existsSync(path.join(folder,'native-edit.json')),'Preserve the prepared lesson.');
 await page.locator('.viral-studio-entry-panel input[type=file][accept="video/*"]').setInputFiles(plan.rows[0].file);
 await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:120000});await h.rail(page);await pause(page);
 console.log('Opened the real Studio for the full-workspace lesson.');
 await page.getByLabel('Project name',{exact:true}).fill(plan.name);
 const stop=await recording(page);
 try{
  await q.tool(page,'Reframe');await page.getByTestId('reframe-aspect-16-9').click();
  const auto=page.getByTestId('auto-reframe-toggle');if(await auto.isChecked())await auto.uncheck();
  await q.tool(page,'Color');const rounded=page.getByLabel('Rounded main footage',{exact:true});if(await rounded.isChecked())await rounded.uncheck();
  await page.getByTestId('project-media-import-input').setInputFiles(plan.rows.slice(1).map(row=>row.file));
  for(const row of plan.rows.slice(1)){
   await page.locator('#studio-library-tab-media').click();
   await page.getByRole('searchbox',{name:'Search project media',exact:true}).fill(path.basename(row.file));
   const preview=page.getByRole('button',{name:'Preview '+path.basename(row.file),exact:true});
   await preview.waitFor({timeout:300000});await preview.click();
   const card=preview.locator('xpath=ancestor::article');
   const add=card.getByRole('button',{name:'Add to sequence',exact:true});await add.waitFor();
   await page.waitForFunction(name=>{const el=[...document.querySelectorAll('.studio-media-card')].find(e=>e.querySelector('strong')?.textContent===name);return el&&[...el.querySelectorAll('button')].some(b=>b.textContent.trim()==='Add to sequence'&&!b.disabled);},path.basename(row.file),{timeout:300000});
   await add.click();console.log('Whole-workspace scene added: '+row.id);
  }
  await page.getByRole('searchbox',{name:'Search project media',exact:true}).fill('');
  await q.tool(page,'Graphics');const importer=page.getByTestId('studio-graphics-import');if(!await importer.evaluate(e=>e.open))await importer.locator('summary').click();
  await page.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.join(folder,'lesson-labels.graphics.json'));
  await importer.getByRole('status').filter({hasText:'imported.'}).waitFor();
  await q.tool(page,'Sound');await page.getByTestId('voiceover-recording-input').setInputFiles(path.join(folder,'narration.mp3'));
  const start=page.getByLabel('Start for narration.mp3',{exact:true});await start.fill('0');await start.blur();
  const repair=page.getByLabel('Use voice repair on export',{exact:true});if(await repair.isChecked())await repair.uncheck();
  const original=page.getByRole('checkbox',{name:/^Keep original audio/});if(await original.isChecked())await original.uncheck();
  await q.tool(page,'Export');await page.getByLabel('Export frame rate',{exact:true}).selectOption('24');
 }finally{await stop()}
 const saved=await h.save(page,'prepared');await backup(page);
 assert.equal(saved.snapshot.timeline.length,plan.rows.length,'Every source must be a real native sequence occurrence.');
 assert(!saved.snapshot.overlays.some(l=>l.type==='video'),'Whole workspace must not be replaced by an inspector camera.');
 write('native-edit.json',{projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),duration:plan.duration,
  wholeWorkspace:true,nativeMainSequence:true,sourceScreenCropping:false,graphInjection:false,ownerApproved:false,scheduled:false});
 for(const row of plan.rows){await seek(page,row.start+Math.min(2,row.duration/2));await page.waitForTimeout(500);
  await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'native-'+row.id+'.png')});}
}
(async()=>{
 const original=JSON.parse(fs.readFileSync(path.join(__dirname,'fresh-session.private.json')));
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--disk-cache-size=16777216','--host-resolver-rules=MAP localhost 127.0.0.36','--no-proxy-server','--disable-quic','--disable-http2']});
 const context=await browser.newContext({storageState:{...original,origins:original.origins.map(o=>({...o,indexedDB:(o.indexedDB||[]).filter(d=>d.name!=='autopromote-viral-studio')}))},viewport:{width:1600,height:1000},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('dialog',d=>d.accept());let submissions=0;
 page.on('request',r=>{if(new URL(r.url()).pathname==='/api/media/process'&&r.method()==='POST')submissions++});
 page.on('response',async response=>{if(new URL(response.url()).pathname==='/api/media/process'&&response.ok()){const job=await response.json();write('accepted.json',{jobId:job.jobId||job.job_id,resubmissionAllowed:false});write('accepted-session.private.json',await context.storageState({indexedDB:true}));}});
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).waitFor({timeout:90000});await page.waitForTimeout(12000);
  await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/users/profile'&&r.ok(),{timeout:30000}),page.reload({waitUntil:'domcontentloaded'})]);
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
  if(phase==='prepare')await prepare(page);
  else{
   await page.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);
   await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(backupFile);
   await page.getByRole('region',{name:'Saved Studio projects',exact:true}).getByRole('button',{name:JSON.parse(fs.readFileSync(backupFile)).name,exact:true}).click();await h.rail(page);await pause(page);
  }
  if(phase==='polish'){
   fs.copyFileSync(backupFile,path.join(folder,'PRE-TYPOGRAPHY.autopromote.json'));
   const stop=await recording(page);
   try{
    await q.tool(page,'Graphics');
    for(const row of plan.rows){
     await seek(page,row.start+1);
     const selectText=async(text,size)=>{await page.locator('.title-layer-list button').filter({has:page.locator('strong',{hasText:text})}).first().click();await range(page.getByLabel('Title size',{exact:true}),size);};
     await selectText(row.heading,row.kind==='result'?1.7:.60);
     if(row.caption)await selectText(row.caption,.5);
    }
   }finally{await stop()}
   const current=await h.save(page,'polished');await backup(page);write('polished.json',{canonicalHash:hash(current.snapshot.studioDocument),nativeTypographyControls:true,ownerApproved:false});
   await q.tool(page,'Export');
   for(const id of ['hook','can','type','final']){const row=plan.rows.find(x=>x.id===id);await seek(page,row.start+2);await page.waitForFunction(()=>!document.querySelector('[data-testid="hook-preview-frame"]')?.textContent.includes('Loading edited preview'),undefined,{timeout:90000});await page.waitForTimeout(1500);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'polished-'+id+'.png')});}
  }
  if(phase==='render'){
   assert(!fs.existsSync(path.join(folder,'accepted.json')),'Recover the accepted job; do not resubmit.');
   const current=await h.save(page,'review-before-export');const review=JSON.parse(fs.readFileSync(path.join(folder,'agent-picture-review.json')));assert.equal(review.canonicalHash,hash(current.snapshot.studioDocument));
   await h.render(page,'final');await backup(page);
  }
  if(phase==='view'){
   await q.tool(page,'Export');await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.join(folder,'final/render-receipt.json'));
   process.env.STUDIO_TEMPLATE_PROOF_DIR=folder;
   await require('../../scripts/creative-templates/materials-editing-proof').view(page,'final');
  }
  if(phase==='restore'){
   const current=await h.save(page,'independently-restored'),receipt=JSON.parse(fs.readFileSync(path.join(folder,'final/render-receipt.json')));assert.equal(hash(current.snapshot.studioDocument),receipt.projectHash);
   await q.tool(page,'Export');await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.join(folder,'final/render-receipt.json'));
   const ready=page.getByTestId('rendered-output-ready');await ready.waitFor({timeout:90000});const waiting=page.waitForEvent('download');await ready.getByRole('button',{name:/Download/}).click();const file=path.join(folder,'cold-restored.mp4');await(await waiting).saveAs(file);assert.equal(hash(fs.readFileSync(file)),receipt.outputSha256);assert.equal(submissions,0);
   write('independent-restore.json',{canonicalHash:receipt.projectHash,outputSha256:receipt.outputSha256,freshBrowser:true,submissions:0});
  }
  write(phase+'-observation.json',{submissions,realAuth:true,ownerApproved:false,scheduled:false});console.log('Whole Studio lesson phase complete: '+phase);
 }catch(error){write('failure-'+Date.now()+'.json',{phase,message:error.message,submissions});await page.screenshot({path:path.join(folder,'failure-'+Date.now()+'.png')}).catch(()=>{});await backup(page).catch(()=>{});throw error;}
 finally{await context.close();await browser.close();for(const name of fs.readdirSync(ram))fs.cpSync(path.join(ram,name),path.join(folder,name),{recursive:true});fs.rmSync(ram,{recursive:true});}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
