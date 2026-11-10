// Run the authored shot through ordinary mask, refinement and preview controls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
async function main(){
 const demo=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);const config=JSON.parse(fs.readFileSync(path.join(demo,'browser-private.json')));
 assert.match(config.origin,/^http:\/\/127\.0\.0\.1:/);
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost']});
 const context=await browser.newContext({viewport:{width:1600,height:1100},storageState:path.join(out,'native-state.json'),acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());const exceptions=[];page.on('pageerror',e=>exceptions.push(e.message));
 try{
  await page.goto(config.origin);
  const sign=page.getByRole('button',{name:'Sign In',exact:true});
  if(await sign.isVisible()){
   await sign.click();await page.locator('#login-email').fill(config.email);await page.locator('#login-password').fill(config.password);
   await page.locator('form input[type=checkbox]').check();await page.locator('form button[type=submit]').click();
  }
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();await page.getByRole('button',{name:'Podcast moving-edge repair - 4 November',exact:true}).click();await page.locator('.viral-studio-container').waitFor();
  await page.getByRole('button',{name:/Composite/}).first().click();const panel=page.locator('.studio-subject-vfx'),mask=panel.getByRole('group',{name:'Subject mask',exact:true});
  const save=async()=>{const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();await clickStudioControl(page,page.getByTestId('studio-save-project'));};
  const backup=async name=>{
   await save();const menu=page.locator('details.studio-project-rail__head');
   if(!await menu.evaluate(n=>n.open))await menu.locator(':scope > summary').click();
   const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),
    page.getByRole('button',{name:'Download project backup',exact:true}).click()]);
   const file=path.join(out,name+'.autopromote.json');await download.saveAs(file);return JSON.parse(fs.readFileSync(file));
  };
  const waitForMask=async phase=>{
   const end=Date.now()+1850000;
   for(let step=0;Date.now()<end;step++){
    const status=(await mask.getByRole('status').allTextContents()).join(' ');
    if(step%6===0){console.log('NATIVE_MODEL_STATUS',phase,status);fs.writeFileSync(path.join(out,'native-progress.json'),JSON.stringify({phase,status,at:new Date().toISOString(),visualPass:false}));}
    if(status.includes('saved mask is from an earlier edit')){await mask.getByRole('button',{name:'Use saved mask for this edit',exact:true}).click();continue;}
    if(status.startsWith('Subject mask saved.'))return;
    if(/failed|unavailable|MODEL_|OUTSIDE_|changed|does not match/i.test(status))throw Error(status);
    await page.waitForTimeout(5000);
   }
   throw Error('Native model exceeded its bounded review deadline');
  };
  const attached=mask.getByRole('button',{name:'Subject mask attached',exact:true});
  if(!await attached.count()){
   const resume=mask.getByRole('button',{name:'Resume subject mask',exact:true});
   await(await resume.count()?resume:mask.getByRole('button',{name:'Create subject mask',exact:true})).click();
   await page.waitForTimeout(2000);await save();await context.storageState({path:path.join(out,'native-state.json'),indexedDB:true});
   await waitForMask('segmentation');await backup('native-segmentation-project');
  }
  const before=await backup('before-refinement-project');
  const current=before.snapshot.subjectVfxScenes[0];
  const completedFile=path.join(out,'native-refined-project.autopromote.json');
  const alreadyRefined=fs.existsSync(completedFile)&&JSON.parse(fs.readFileSync(completedFile)).snapshot.subjectVfxScenes[0].modelArtifactRef?.artifactHash===current.modelArtifactRef?.artifactHash;
  const pendingRefinement=current.maskJob&&!current.maskJob.finished&&JSON.parse(current.maskJob.selectionJson).refinement;
  if(pendingRefinement){await mask.getByRole('button',{name:'Resume subject mask',exact:true}).click();await waitForMask('alpha-refinement');}
  else if(!alreadyRefined){
   if(process.argv.includes('--clean-fixed'))for(const number of [3,4,5])await mask.getByRole('checkbox',{name:`Clean fine edges of foreground object ${number}`,exact:true}).check();
   const only=process.argv.find(a=>a.startsWith('--clean-only='));
   if(only){const number=Number(only.split('=')[1]);assert([3,4,5].includes(number));for(const n of [3,4,5])await mask.getByRole('checkbox',{name:`Clean fine edges of foreground object ${n}`,exact:true}).setChecked(n===number);}
   await mask.getByRole('spinbutton',{name:'Edge refinement radius',exact:true}).fill('15');
   await mask.getByRole('button',{name:'Refine saved mask edges',exact:true}).click();
   await page.waitForTimeout(2000);await save();await context.storageState({path:path.join(out,'native-state.json'),indexedDB:true});
   await waitForMask('alpha-refinement');
  }
  const final=await backup('native-refined-project');assert(final.snapshot.subjectVfxScenes[0].modelArtifactRef);
  if(process.argv.includes('--clean-fixed')){
   const item=final.snapshot.subjectVfxScenes[0];
   assert.equal(item.maskRefinementRadius,15);
   assert.deepEqual([...item.maskColourComponentIds].sort(),item.maskComponents.filter(c=>c.propagate===false).map(c=>c.id).sort());
   const request=JSON.parse(item.maskJob.selectionJson).refinement;
   assert.equal(request.radius,item.maskRefinementRadius);
   assert.deepEqual([...request.colourComponentIds].sort(),[...item.maskColourComponentIds].sort());
  }
  if(process.argv.includes('--model-only')){console.log('ACTUAL_NATIVE_TRACKING_AND_ALPHA_COMPLETE');return;}
  await panel.getByRole('button',{name:/^(Render subject preview|Refresh rendered preview|Check saved render)$/}).click();
  const video=panel.getByLabel('Rendered subject effects with original audio',{exact:true});await video.waitFor({timeout:600000});
  const result=await context.request.get(await video.getAttribute('src'));assert(result.ok());const bytes=await result.body();
  fs.writeFileSync(path.join(out,'Native mask-backed preview.mp4'),bytes);await backup('native-preview-project');
  await video.evaluate(async v=>{v.muted=true;v.currentTime=0;await v.play();await new Promise((ok,no)=>{v.addEventListener('ended',ok,{once:true});setTimeout(()=>no(Error('Native preview did not finish')),12000);});});
  await page.screenshot({path:path.join(out,'native-rendered-preview.png')});
  fs.writeFileSync(path.join(out,'native-inference-preview.json'),JSON.stringify({normalStudioControls:true,flattenedInput:false,nativeMaskBackedPreview:true,previewSha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex'),browserExceptions:exceptions,creativeApproval:false,finalExport:false,paidCloud:false},null,2));
  console.log('ACTUAL_NATIVE_MOVING_MASK_AND_PREVIEW_COMPLETE');
 }catch(e){await page.screenshot({path:path.join(out,'processing-failure.png')});fs.writeFileSync(path.join(out,'processing-failure.txt'),await page.locator('body').innerText());throw e;}
 finally{await context.storageState({path:path.join(out,'native-state.json'),indexedDB:true});await context.close();await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
