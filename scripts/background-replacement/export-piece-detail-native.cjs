// Preserve model soft boundaries using existing native controls; review both moving angles.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
async function main(){
 const directory=path.resolve(process.argv[2]);
 const out=path.resolve('reports/background-replacement-20261101/private/piece-review-r6/final-detail-pass/native-final');
 fs.mkdirSync(out,{recursive:true});
 const config=JSON.parse(fs.readFileSync(path.join(directory,'browser-private.json')));
 assert.match(config.origin,/^http:\/\/127\.0\.0\.1:\d+$/);
 const browser=await chromium.launch({headless:true,args:['--mute-audio']});
 const context=await browser.newContext({viewport:{width:1600,height:1100},storageState:path.join(directory,'browser-state.json'),acceptDownloads:true});
 await context.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>console.log('BROWSER_ERROR',e.message));
 page.on('response',async r=>{if(r.url().includes('studio-subject')&&r.status()>=400)console.log('SUBJECT_HTTP',r.status(),await r.text());});
 const pause=async()=>{const p=page.getByRole('button',{name:/^Pause (comparison|edited preview)$/});if(await p.count())await p.first().click();};
 const open=async()=>{await page.goto(config.origin);await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().waitFor({timeout:90000});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();await page.getByRole('button',{name:'Credit lifecycle local project',exact:true}).click();await page.locator('.viral-studio-container').waitFor();await pause();};
 const save=async()=>{const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();await clickStudioControl(page,page.getByTestId('studio-save-project'));};
 const backup=async name=>{await save();const event=page.waitForEvent('download');await clickStudioControl(page,page.getByRole('button',{name:'Download project backup',exact:true,includeHidden:true}));const f=path.join(out,`${name}.autopromote.json`);await(await event).saveAs(f);return JSON.parse(fs.readFileSync(f));};
 try{
  await open();await page.getByRole('button',{name:/Composite/}).first().click();let panel=page.locator('.studio-subject-vfx');
  assert.equal(await panel.getByRole('combobox',{name:'Subject effect scene',exact:true}).locator('option').count(),2);
  const chosen=process.argv.includes('--export-only')?[]:process.argv.includes('--only-first')?[0]:process.argv.includes('--only-second')?[1]:[0,1];
  for(const angle of chosen){
   await panel.getByRole('combobox',{name:'Subject effect scene',exact:true}).selectOption({index:angle});
   if(angle===1&&process.argv.includes('--model-only')){
    // Optional diagnostic without the source-specific TV boxes.
    // Keep the new model's person/object silhouette; no cloth-colour recovery.
    for(const group of (await panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).all()).reverse()){
      const left=Number(await group.getByRole('spinbutton',{name:'clear box left',exact:true}).inputValue());
      if(left>0)await group.getByRole('button',{name:'Remove layer',exact:true}).click();
    }
   }
   // Radius zero keeps the source-conditioned model alpha. The multilevel
   // foreground colour recovery remains enabled; source motion is unchanged.
   await panel.getByRole('spinbutton',{name:'Background edge detail width',exact:true}).fill('0');
   await panel.getByRole('spinbutton',{name:'Remove old background colour',exact:true}).fill('1');
   await save();
   await panel.getByRole('button',{name:/^(Render subject preview|Refresh rendered preview|Check saved render)$/}).click();console.log('ANGLE_PREVIEW_REQUESTED',angle+1);
   const movie=panel.getByLabel('Rendered subject effects with original audio',{exact:true});let previous='';
   for(let i=0;i<900&&!await movie.isVisible();i++){
    const status=(await panel.getByRole('status').allTextContents()).join(' ');if(status!==previous){console.log('ANGLE_STATUS',angle+1,status);previous=status;}
    if(/failed|unavailable|MODEL_|OUTSIDE_|invalid/i.test(status))throw Error(status);await page.waitForTimeout(1000);
   }
   await movie.waitFor();const response=await context.request.get(await movie.getAttribute('src'));assert(response.ok());const bytes=await response.body();fs.writeFileSync(path.join(out,`angle-${angle+1}-preview.mp4`),bytes);
   await movie.evaluate(async v=>{v.currentTime=0;await v.play();await new Promise((resolve,reject)=>{v.addEventListener('ended',resolve,{once:true});setTimeout(()=>reject(Error('Subject preview did not end')),15000);});});
   const sha=hash(bytes);fs.writeFileSync(path.join(out,`angle-${angle+1}-review-required.json`),JSON.stringify({previewSha256:sha,angle:angle+1,scope:'Actual source/alpha/moving-frame review required; not professional approval'}));console.log('ANGLE_READY_FOR_REVIEW',angle+1,sha);
   let accepted=false;
   for(let i=0;i<3600;i++){
    const gate=path.join(out,`angle-${angle+1}-visual-review.json`);
    if(fs.existsSync(gate)){const v=JSON.parse(fs.readFileSync(gate));if(!v||v.decision==='reject')throw Error('Actual preview rejected; preserve it and correct the current native scene before export');if(v.previewSha256===sha&&v.actualFramesReviewed===true){accepted=true;break;}}
    await page.waitForTimeout(1000);
   }
   assert(accepted,'Exact moving preview needs actual review');await panel.getByRole('checkbox',{name:'I reviewed the sound, subject edges and camera cuts',exact:true}).check();await save();
  }
  if(process.argv.includes('--only-first')||process.argv.includes('--only-second')){await backup('reviewed-angle-project');console.log('ANGLE_REVIEW_SAVED');return;}
  await clickStudioControl(page,page.getByRole('button',{name:'Export',exact:true}));await page.getByRole('combobox',{name:'Export quality',exact:true}).selectOption('master');await save();
  const before=await backup('two-speaker-before-reopen');await open();const after=await backup('two-speaker-after-reopen');
  assert.deepEqual(before.snapshot.studioDocument,after.snapshot.studioDocument);assert.deepEqual(before.snapshot.subjectVfxScenes,after.snapshot.subjectVfxScenes);console.log('TWO_SCENES_REOPEN_EXACT');
  await clickStudioControl(page,page.getByRole('button',{name:'Export',exact:true}));await page.getByRole('combobox',{name:'Export resolution',exact:true}).selectOption('1080p');await page.getByRole('combobox',{name:'Export frame rate',exact:true}).selectOption('24');await page.getByRole('combobox',{name:'Export quality',exact:true}).selectOption('master');await save();
  const recovery=page.getByTestId('viral-render-recovery');await page.waitForTimeout(1500);if(await recovery.isVisible()){await recovery.getByRole('button',{name:'Dismiss',exact:true}).click();await recovery.waitFor({state:'hidden'});}
  await page.getByRole('button',{name:/^(Render Final Clip|Render Again)$/}).click();const modal=page.getByRole('dialog',{name:'Studio export',exact:true});await modal.waitFor();await modal.getByRole('button',{name:/^Approve /}).click();
  await page.getByRole('button',{name:'Download Rendered Clip',exact:true}).waitFor({timeout:240000});const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download Rendered Clip',exact:true}).click();await(await event).saveAs(path.join(directory,'background-native-export.mp4'));fs.copyFileSync(path.join(directory,'background-native-export.mp4'),path.join(out,'two-speaker-native-export.mp4'));
  await page.waitForTimeout(3000);const final=await backup('two-speaker-final-project');assert.deepEqual(after.snapshot.subjectVfxScenes,final.snapshot.subjectVfxScenes);assert.deepEqual(after.snapshot.studioDocument,final.snapshot.studioDocument);
  fs.writeFileSync(path.join(out,'native-persistence.json'),JSON.stringify({canonicalDocumentColdReopenExact:true,subjectScenesColdReopenExact:true,canonicalDocumentAfterExportExact:true,subjectScenesAfterExportExact:true,sceneCount:final.snapshot.subjectVfxScenes.length,canonicalDocumentSha256:hash(JSON.stringify(final.snapshot.studioDocument)),exportSha256:hash(fs.readFileSync(path.join(out,'two-speaker-native-export.mp4')))},null,2));console.log('TWO_SPEAKER_NATIVE_EXPORT_SAVED');
 }catch(e){await page.screenshot({path:path.join(out,'finish-two-speaker-failure.png')});console.log('BODY',(await page.locator('body').innerText()).slice(-7000));throw e;}
 finally{await context.storageState({path:path.join(directory,'browser-state.json'),indexedDB:true});await context.close();await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
