// Native fitted delivery copy from an already completed canonical movie.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const story=process.argv[2],phase=process.argv[3]||'all';assert(['product','logo','transition'].includes(story));
const base=path.join(__dirname,'proof',story,'visible-controls/tutorial');
const artifactRecovery=process.env.STUDIO_RECOVER_COMPLETED_ARTIFACT==='1';
assert(!artifactRecovery||story==='transition');
const recovered=path.join(base,'native-recovered-portrait');
const source=story==='product'?base:story==='transition'&&!artifactRecovery&&fs.existsSync(path.join(recovered,'final/render-receipt.json'))?recovered:path.join(base,'camera-r3');
const folder=artifactRecovery?recovered:path.join(base,'feed-4-5'),aspect=artifactRecovery?'9:16':'4:5';fs.mkdirSync(folder,{recursive:true});
Object.assign(process.env,{STUDIO_TEMPLATE_PROOF_DIR:folder,STUDIO_KINETIC_PROOF_DIR:folder,STUDIO_QA_NATIVE_DOWNLOAD_METHOD:'playwright',
 STUDIO_QA_EXPORT_FPS:'24',STUDIO_QA_EXPORT_RESOLUTION:'source',STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS:'1800000',
 STUDIO_QA_UPLOAD_BUDGET_MS:'600000',STUDIO_QA_CAPTURE_FPS:'6'});
const {pause,seek}=require('../../scripts/studio-professional/kinetic-type-proof');
Object.assign(process.env,{STUDIO_QA_EXPECTED_WIDTH:'720',STUDIO_QA_EXPECTED_HEIGHT:artifactRecovery?'1280':'900'});
const h=require('../../scripts/creative-templates/studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run'),{hash}=require('../../src/creativeTemplates/contract');
const write=(file,data)=>fs.writeFileSync(path.join(folder,file),JSON.stringify(data,null,2)+'\n',{mode:0o600});
const backupFile=path.join(folder,'FINAL-TUTORIAL.autopromote.json');
async function backup(page){const versions=page.getByLabel('Include saved versions in backup',{exact:true});if(await versions.isChecked())await versions.uncheck();
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();await(await dl).saveAs(backupFile);}
(async()=>{
 const receipt=JSON.parse(fs.readFileSync(path.join(source,artifactRecovery?'worker-artifact-recovery.json':'final/render-receipt.json')));
 const movie=path.join(source,artifactRecovery?'completed-worker-artifact/final.mp4':'final/final.mp4');
 assert.equal(hash(fs.readFileSync(movie)),artifactRecovery?receipt.sha256:receipt.outputSha256);
 const original=JSON.parse(fs.readFileSync('/home/tibule12/.local/share/autopromote-qa/session/studio-session.private.json'));
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--disk-cache-size=16777216','--host-resolver-rules=MAP localhost 127.0.0.36','--no-proxy-server','--disable-quic','--disable-http2']});
 const context=await browser.newContext({storageState:{...original,origins:original.origins.map(o=>({...o,indexedDB:(o.indexedDB||[]).filter(d=>d.name!=='autopromote-viral-studio')}))},viewport:{width:1600,height:1100},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('dialog',d=>d.accept());let submissions=0;
 page.on('request',r=>{if(new URL(r.url()).pathname==='/api/media/process'&&r.method()==='POST')submissions++});
 page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/media/process'&&r.ok()){const d=await r.json();write('accepted.json',{jobId:d.jobId||d.job_id,resubmissionAllowed:false});write('accepted-session.private.json',await context.storageState({indexedDB:true}))}});
 try{
  await page.goto('http://localhost:5000/');await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click({timeout:90000});assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
  if(phase==='all'){
   assert(!fs.existsSync(path.join(folder,'accepted.json')),'Recover the existing accepted job.');
   await page.locator('.viral-studio-entry-panel input[type=file][accept="video/*"]').setInputFiles(movie);
   await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:120000});await h.rail(page);await pause(page);
   const name=({product:'Product reveal',logo:'Logo assembly',transition:'Connected wipe'})[story]+(artifactRecovery?' / completed film delivery / 20261029':' / fitted 4:5 feed / 20261029');
   await page.getByLabel('Project name',{exact:true}).fill(name);
   await q.tool(page,'Reframe');await page.getByTestId('reframe-aspect-'+aspect.replace(':','-')).click();
   const auto=page.getByTestId('auto-reframe-toggle');if(await auto.isChecked())await auto.uncheck();
   const fit=page.getByTestId('preview-fit-full');if(!await fit.isVisible())await page.locator('.studio-view-options summary').click();
   await fit.click();
   await q.tool(page,'Color');const round=page.getByLabel('Rounded main footage',{exact:true});if(await round.isChecked())await round.uncheck();
   await q.tool(page,'Sound');const repair=page.getByLabel('Use voice repair on export',{exact:true});if(await repair.isChecked())await repair.uncheck();
   const keep=page.getByRole('checkbox',{name:/^Keep original audio/});if(!await keep.isChecked())await keep.check();
   await q.tool(page,'Export');await page.getByLabel('Export frame rate',{exact:true}).selectOption('24');
   const current=await h.save(page,'prepared');assert.equal(current.snapshot.overlays.length,0);
   assert.equal(current.snapshot.videoFit,'contain');assert.equal(current.snapshot.safeFaceFraming,true);
   await backup(page);await seek(page,2.5);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'native-fitted-hook.png')});
   for(const file of ['narration.wav','narration.mp3'])if(!fs.existsSync(path.join(folder,file)))fs.linkSync(path.join(source,file),path.join(folder,file));
   const plan=JSON.parse(fs.readFileSync(path.join(source,'lesson-plan.json')));plan.name=name;plan.expectedDimensions=[720,artifactRecovery?1280:900];plan.sourceMovieSha256=artifactRecovery?receipt.sha256:receipt.outputSha256;
   if(artifactRecovery){delete plan.fitScenarios;plan.deliveryLimit='Normal native import of completed worker film. Original layered assembly and failed HTTP job remain separate and unchanged.';}
   else plan.fitScenarios=[['feed-4-5-fill',400,500,'cover'],['feed-4-5-contain',400,500,'contain'],['phone-contain',390,844,'contain']];write('lesson-plan.json',plan);
   const gate=path.join(folder,'agent-picture-review.json');write('ready-for-render-review.json',{canonicalHash:hash(current.snapshot.studioDocument),ownerApproved:false});
   while(!fs.existsSync(gate))await page.waitForTimeout(1000);
   assert.equal(JSON.parse(fs.readFileSync(gate)).canonicalHash,hash((await h.save(page,'picture-reviewed')).snapshot.studioDocument));
   await h.render(page,'final');await backup(page);
  }else{
   await page.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);
   await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(backupFile);
   await page.getByRole('region',{name:'Saved Studio projects',exact:true}).getByRole('button',{name:JSON.parse(fs.readFileSync(backupFile)).name,exact:true}).click();await h.rail(page);await pause(page);
   const r=JSON.parse(fs.readFileSync(path.join(folder,'final/render-receipt.json'))),current=await h.save(page,'independently-restored');assert.equal(hash(current.snapshot.studioDocument),r.projectHash);
   await q.tool(page,'Export');await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.join(folder,'final/render-receipt.json'));
   await page.getByTestId('rendered-output-ready').waitFor({timeout:90000});
   if(phase==='view')await require('../../scripts/creative-templates/materials-editing-proof').view(page,'final');
   else{const dl=page.waitForEvent('download');await page.getByTestId('rendered-output-ready').getByRole('button',{name:/Download/}).click();const f=path.join(folder,'cold-restored.mp4');await(await dl).saveAs(f);assert.equal(hash(fs.readFileSync(f)),r.outputSha256);assert.equal(submissions,0);write('independent-restore.json',{nativeBackupRestored:true,exactCanonicalHash:r.projectHash,nativeOwnedDownloadSha256:r.outputSha256,freshBrowserContext:true,submissions:0});}
  }
  write(phase+'-observation.json',{submissions,ownerApproved:false,scheduled:false,realAuth:true});console.log(story+': fitted feed phase complete — '+phase);
 }catch(error){write('failure-'+Date.now()+'.json',{message:error.message,phase,submissions});await page.screenshot({path:path.join(folder,'failure-'+Date.now()+'.png')}).catch(()=>{});await backup(page).catch(()=>{});throw error}
 finally{await context.close();await browser.close()}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
