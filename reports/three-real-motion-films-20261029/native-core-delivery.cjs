// Canonical Blender source enters actual signed-in Studio through normal upload.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const id=process.argv[2],root=path.join('/dev/shm/autopromote-three-films',id),folder=path.join(root,'core-export');fs.mkdirSync(folder,{recursive:true,mode:0o700});
Object.assign(process.env,{STUDIO_TEMPLATE_PROOF_DIR:folder,STUDIO_KINETIC_PROOF_DIR:folder,STUDIO_QA_CAPTURE_FPS:'5',STUDIO_QA_EXPECTED_WIDTH:'1280',STUDIO_QA_EXPECTED_HEIGHT:'720',STUDIO_QA_EXPORT_FPS:'24',STUDIO_QA_EXPORT_RESOLUTION:'720p',STUDIO_QA_NATIVE_DOWNLOAD_METHOD:'playwright',STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS:'1800000',STUDIO_QA_UPLOAD_BUDGET_MS:'600000'});
const {recording,pause,seek,range}=require('../../scripts/studio-professional/kinetic-type-proof');
const h=require('../../scripts/creative-templates/studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const write=(n,v)=>fs.writeFileSync(path.join(folder,n),JSON.stringify(v,null,2)+'\n',{mode:0o600});
(async()=>{
 assert(!fs.existsSync(path.join(folder,'accepted.json')),'Recover accepted job; do not resubmit');
 execFileSync('ffmpeg',['-v','error','-y','-i',path.join(root,'episode/original-score.mp3'),'-t','8','-c:a','pcm_s16le',path.join(folder,'score.wav')]);
 const original=JSON.parse(fs.readFileSync('/dev/shm/autopromote-three-films/lesson-session.private.json'));
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.36','--no-proxy-server','--disk-cache-size=16777216']});
 const context=await browser.newContext({storageState:{...original,origins:original.origins.map(o=>({...o,indexedDB:(o.indexedDB||[]).filter(d=>d.name!=='autopromote-viral-studio')}))},viewport:{width:1600,height:1000},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('dialog',d=>void d.accept());let stop;
 page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/media/process'&&r.ok()){const j=await r.json();write('accepted.json',{jobId:j.jobId||j.job_id,resubmissionAllowed:false});}});
 try{
  await page.goto('http://localhost:5000/');await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).waitFor({timeout:90000});await page.waitForTimeout(2000);await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.locator('.viral-studio-entry-panel input[type=file][accept="video/*"]').setInputFiles(path.join(root,'canonical-final/preview.mp4'));
  await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click();await h.rail(page);await pause(page);
  await page.getByLabel('Project name',{exact:true}).fill(id.toUpperCase()+' / Blender finish / 20261029');
  stop=await recording(page);const origin=Date.now();
  await q.tool(page,'Reframe');await page.getByTestId('reframe-aspect-16-9').click();const auto=page.getByTestId('auto-reframe-toggle');if(await auto.isChecked())await auto.uncheck();
  await q.tool(page,'Color');const rounded=page.getByLabel('Rounded main footage',{exact:true});if(await rounded.isChecked())await rounded.uncheck();
  await q.tool(page,'Sound');await page.getByTestId('background-sound-input').setInputFiles(path.join(folder,'score.wav'));
  await range(page.locator('label.inspector-range').filter({hasText:'Background volume'}).locator('input'),55);
  const duck=page.getByRole('checkbox',{name:/Duck under speech/});if(await duck.isChecked())await duck.uncheck();
  const repair=page.getByLabel('Use voice repair on export',{exact:true});if(await repair.isChecked())await repair.uncheck();
  await h.save(page,'prepared');await h.render(page,'final');
  const start=(Date.now()-origin)/1000;await seek(page,0);await page.getByRole('button',{name:'Play comparison',exact:true}).click();await page.waitForTimeout(8500);await pause(page);
  await q.tool(page,'Export');await page.getByRole('button',{name:'Download Rendered Clip',exact:true}).hover();await page.waitForTimeout(3500);
  write('export-observation.json',{start,end:(Date.now()-origin)/1000,renderWaitRemovedFromLesson:true,actualNativeControls:true});
  await h.save(page,'completed');const d=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();await(await d).saveAs(path.join(folder,'DELIVERY.autopromote.json'));
  fs.copyFileSync(path.join(folder,'final/final.mp4'),path.join(root,'native-core-final.mp4'));
 }catch(error){write('failure-'+Date.now()+'.json',{error:error.message});await page.screenshot({path:path.join(folder,'failure-'+Date.now()+'.png')}).catch(()=>{});throw error;}
 finally{if(stop)await stop();await context.close();await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
