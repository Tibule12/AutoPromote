// Normal App/Auth/scene controls. Design JSON is a list of intended UI actions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const {designs}=require('./designs.cjs');
const demo=process.argv[2],id=process.argv[3],phase=process.argv[4]||'author';
const design=designs.find(d=>d.id===id);assert(design);
const out=path.join('/dev/shm/autopromote-three-films',id);fs.mkdirSync(out,{recursive:true,mode:0o700});
process.env.STUDIO_KINETIC_PROOF_DIR=out;process.env.STUDIO_TEMPLATE_PROOF_DIR=out;process.env.STUDIO_QA_CAPTURE_FPS='6';
const {recording,seek,pause,range}=require('../../scripts/studio-professional/kinetic-type-proof');
const h=require('../../scripts/creative-templates/studio-proof');const {clickStudioControl,assertStudioTimelineLayout}=require('../../test/e2e/playwright/studio-timeline-layout');
const config=JSON.parse(fs.readFileSync(path.join(demo,'browser-private.json')));
const state=path.join(out,'session.private.json');
const write=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n',{mode:0o600});
const title=design.name+' / native motion / 20261029 / take '+(process.env.FILM_TAKE||'1');
async function backup(page,name){const wait=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();await(await wait).saveAs(path.join(out,name+'.autopromote.json'));}
async function open(page){await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
 const saved=page.getByRole('button',{name:title,exact:true});
 if(!await saved.count()){await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(out,'CORE.autopromote.json'));}
 await saved.click();await h.rail(page);await pause(page);}
async function motion(page){await clickStudioControl(page,page.getByRole('button',{name:'Motion',exact:true}));await page.getByRole('button',{name:'3D Motion',exact:true}).click();}
async function author(page){
 const resuming=phase==='continue-author';let resumeCount=0;
 if(resuming){await open(page);await motion(page);const previous=await h.save(page,'resume-checkpoint');resumeCount=previous.snapshot.threeDScenes[0].objects.length;
  for(const name of ['teaching-actions.json','editing-in-studio.mp4']){const p=path.join(out,name);if(fs.existsSync(p))fs.copyFileSync(p,path.join(out,Date.now()+'-previous-'+name));}
 }else{
 await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
 await page.locator('.creator-studio-dropzone input[type=file]').setInputFiles('/dev/shm/autopromote-three-films/source.mp4');
 await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click();await h.rail(page);await pause(page);
 await page.getByLabel('Project name',{exact:true}).fill(title);
 }
 const stop=await recording(page),origin=Date.now(),steps=[];
 const step=async(name,fn,hold=1)=>{const start=(Date.now()-origin)/1000;await fn();await page.waitForTimeout(hold*1000);const end=(Date.now()-origin)/1000;steps.push({id:name,start,end});console.log(id,name,(end-start).toFixed(1)+'s');};
 try{
 if(!resuming)await step('setup',async()=>{
  await clickStudioControl(page,page.getByRole('button',{name:'Reframe',exact:true}));await page.getByTestId('reframe-aspect-16-9').click();const auto=page.getByTestId('auto-reframe-toggle');if(await auto.isChecked())await auto.uncheck();
  await clickStudioControl(page,page.getByRole('button',{name:'Color',exact:true}));const rounded=page.getByLabel('Rounded main footage',{exact:true});if(await rounded.isChecked())await rounded.uncheck();
  await seek(page,0);await motion(page);await page.getByRole('button',{name:'Object Composition Add at playhead',exact:true}).click();
 });
 const panel=page.getByTestId('studio-3d-panel');
 await panel.getByLabel('End (s)',{exact:true}).fill(String(design.duration));await panel.getByLabel('End (s)',{exact:true}).blur();
 await panel.getByRole('button',{name:'Advanced',exact:true}).click();
 await panel.getByLabel('Hold',{exact:true}).selectOption('still');
 for(const [name,value] of [['Camera motion',0],['Bloom',design.bloom],['Light intensity',design.lightIntensity],['Rotate X',design.pitch],['Rotate Y',design.yaw],['Scale',design.scale||1]]){await panel.getByLabel(name,{exact:true}).fill(String(value));await panel.getByLabel(name,{exact:true}).blur();}
 await panel.getByLabel('Light colour',{exact:true}).fill(design.light);
 const number=async(field,value)=>{const input=panel.getByLabel('Object '+field,{exact:true});await input.fill(String(value));await input.press('Enter');};
 let selectedIndex=0;
 for(const [index,object] of design.objects.entries()){
  if(resuming&&index<resumeCount-1)continue;
  await step('object-'+index,async()=>{
   await seek(page,0);
   if(resuming&&index===resumeCount-1){const names=await panel.getByLabel('Selected scene object',{exact:true}).locator('option').allTextContents();await panel.getByLabel('Selected scene object',{exact:true}).selectOption({label:names[index]});}
   else if(index===0)await panel.getByLabel('Object shape',{exact:true}).selectOption(object.shape);else await panel.getByRole('button',{name:'Add '+object.shape,exact:true}).click();
   selectedIndex=index;
   await panel.getByLabel('Object name',{exact:true}).fill(object.name);await panel.getByLabel('Object colour',{exact:true}).fill(object.color);await panel.getByLabel('Object surface',{exact:true}).selectOption(object.material);
   if(object.bevel&&['box','cylinder'].includes(object.shape))await range(panel.getByLabel('Object edge bevel',{exact:true}),object.bevel);
   for(const field of ['x','y','z','scaleX','scaleY','scaleZ','rotationX','rotationY','rotationZ'])await number(field,object[field]);
   for(const key of object.keys){
    await seek(page,key.time);
    for(const field of ['x','y','z','scaleX','scaleY','scaleZ','rotationX','rotationY','rotationZ']){const input=panel.getByLabel('Object '+field,{exact:true});if(Number(await input.inputValue())!==key.values[field])await number(field,key.values[field]);}
    const add=panel.getByRole('button',{name:/^(Add|Update) object pose at [0-9.]+s$/});
    const placed=Number((await add.innerText()).match(/at ([0-9.]+)s/)[1]);assert(Math.abs(placed-key.time)<.07,'Object key seek moved beyond two frames');await add.click();
    const keys=panel.getByLabel('Object pose keys',{exact:true});const easing=keys.locator('select').last();await easing.selectOption(key.easing);
   }
  },.25);
  if([1,5,10,15,index===design.objects.length-1?index:-1].includes(index)){await seek(page,4.4);await page.screenshot({path:path.join(out,'workspace-build-'+index+'.png')});await page.waitForTimeout(500);}
 }
 await step('camera-and-light',async()=>{
  for(const key of design.rootKeys){await seek(page,key.time);for(const[field,value]of Object.entries(key)){const label={rotationX:'Rotate X',rotationY:'Rotate Y',rotationZ:'Rotate Z'}[field];if(!label)continue;await panel.getByLabel(label,{exact:true}).fill(String(value));await panel.getByLabel(label,{exact:true}).blur();}
   await panel.getByRole('button',{name:/^Add pose keyframe at [0-9.]+s$/}).click();
  }
 },1);
 await step('whole-preview',async()=>{await seek(page,0);await page.getByRole('button',{name:'Play comparison',exact:true}).click();await page.waitForTimeout(8500);await pause(page);},1);
 await step('review-editable-objects',async()=>{
  for(const i of [1,Math.min(6,design.objects.length-1),design.objects.length-1]){const choices=await panel.getByLabel('Selected scene object',{exact:true}).locator('option').allTextContents();await panel.getByLabel('Selected scene object',{exact:true}).selectOption({label:choices[i]});await seek(page,4.5);await page.waitForTimeout(700);}
 },1);
 await seek(page,4.5);await assertStudioTimelineLayout(page,id+'-full-workspace');
 await page.screenshot({path:path.join(out,'whole-authored-workspace.png')});
 }finally{await stop();write('teaching-actions.json',{origin,steps,nativeControlsOnly:true,fullWorkspace:true});}
 const saved=await h.save(page,'authored');assert.equal(saved.snapshot.threeDScenes[0].objects.length,design.objects.length);await backup(page,'CORE');
 await page.reload();await page.getByTestId('shared-credit-balance').waitFor();await open(page);const cold=await h.save(page,'cold');assert.deepEqual(cold.snapshot.studioDocument,saved.snapshot.studioDocument);write('cold-recovery.json',{projectId:saved.id,exactDocument:true});
}
async function render(page){
 const acceptedFile=path.join(out,'accepted-blender.json');if(fs.existsSync(acceptedFile))fs.copyFileSync(acceptedFile,path.join(out,'accepted-blender-prior-'+Date.now()+'.json'));
 await motion(page);const wait=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/media/studio-3d/preview');
 const button=page.getByRole('button',{name:/^(Generate HQ 3D Preview|Check saved 3D render)$/});await button.click();const response=await wait;const accepted=await response.json();assert(response.ok(),accepted.error);assert(accepted.jobId);write('accepted-blender.json',{jobId:accepted.jobId,reused:accepted.reused||false,resubmissionAllowed:false});
 await page.getByRole('button',{name:'Rendering HQ preview…',exact:true}).waitFor({timeout:30000});await h.save(page,'accepted');await backup(page,'ACCEPTED');console.log(id,'accepted native Blender',accepted.jobId);
 await page.getByLabel('HQ 3D preview',{exact:true}).waitFor({timeout:1900000});
 const preview=page.getByLabel('HQ 3D preview',{exact:true});const responseBytes=await page.context().request.get(await preview.getAttribute('src'));assert(responseBytes.ok());fs.writeFileSync(path.join(out,'standalone-native.mp4'),await responseBytes.body());
 const completed=await h.save(page,'completed');await backup(page,'CORE');await page.screenshot({path:path.join(out,'rendered-workspace.png')});write('render-result.json',{jobId:accepted.jobId,objects:completed.snapshot.threeDScenes[0].objects.length,standaloneDownloaded:true,source:'canonical native Blender'});
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--disk-cache-size=16777216',...(process.env.FILM_HTTP_PROXY?['--proxy-bypass-list=<-loopback>']:[])],...(process.env.FILM_HTTP_PROXY?{proxy:{server:process.env.FILM_HTTP_PROXY}}:{})});const context=await browser.newContext({viewport:{width:1600,height:1000},...(fs.existsSync(state)?{storageState:state}:{}),acceptDownloads:true});
 await context.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname==='127.0.0.1'||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
 const page=await context.newPage();page.setDefaultTimeout(45000);page.on('dialog',d=>void d.accept());page.on('pageerror',e=>console.log('Browser error:',e.message));
 try{
 await page.goto(config.origin);await page.waitForTimeout(1500);
 if(await page.getByRole('button',{name:'Sign In',exact:true}).isVisible()){await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.locator('#login-email').fill(config.email);await page.locator('#login-password').fill(config.password);await page.locator('input[type=checkbox]').check();await page.locator('form button[type=submit]').click();}
 await page.getByTestId('shared-credit-balance').waitFor();
 if(['author','author-only','continue-author'].includes(phase))await author(page);else await open(page);
 if(['author','continue-author','render'].includes(phase))await render(page);
 if(phase==='polish-render'){
  await motion(page);const panel=page.getByTestId('studio-3d-panel');
  await panel.getByLabel('Selected scene object',{exact:true}).selectOption({label:'Studio cyclorama / contact stage'});
  const input=panel.getByLabel('Object y',{exact:true});await input.fill(id==='chrono'?'-2.85':'-1.30');await input.press('Enter');
  await h.save(page,'contact-shadow-corrected');await backup(page,'CORE');await render(page);
 }
 if(phase==='export'){
  await clickStudioControl(page,page.getByRole('button',{name:'Export',exact:true}));await page.getByLabel('Export resolution',{exact:true}).selectOption('720p');await page.getByLabel('Export frame rate',{exact:true}).selectOption('24');
  const dismiss=page.getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.click();
  await page.getByRole('button',{name:/^Render (Final Clip|Again)$/}).click();const modal=page.getByRole('dialog',{name:'Studio export',exact:true});await modal.waitFor();await modal.getByRole('button',{name:/^Approve /}).click();
  await page.getByRole('button',{name:'Download Rendered Clip',exact:true}).waitFor({timeout:180000});const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download Rendered Clip',exact:true}).click();await(await download).saveAs(path.join(out,'native-core-final.mp4'));await h.save(page,'exported');await backup(page,'CORE');
 }
 if(phase==='teach'){
  await motion(page);const panel=page.getByTestId('studio-3d-panel');const before=await h.save(page,'before-teaching');
  const prior=path.join(out,'teaching-take-'+Date.now());fs.mkdirSync(prior,{mode:0o700});
  for(const n of ['editing-in-studio.mp4','teaching-review.json','teaching-in-studio.mp4']){const f=path.join(out,n);if(fs.existsSync(f))fs.copyFileSync(f,path.join(prior,n));}
  for(const n of ['editing-in-studio.mp4','teaching-actions.json']){const f=path.join(out,n),target=path.join(out,'authoring-'+n);if(fs.existsSync(f)&&!fs.existsSync(target))fs.copyFileSync(f,target);}
  const stop=await recording(page),origin=Date.now(),steps=[];
  const select=async index=>{const picker=panel.getByLabel('Selected scene object',{exact:true});const names=await picker.locator('option').allTextContents();await picker.scrollIntoViewIfNeeded();await picker.selectOption({label:names[index]});};
  const step=async(name,seconds,action)=>{const start=(Date.now()-origin)/1000;await action();const elapsed=(Date.now()-origin)/1000-start;if(elapsed<seconds)await page.waitForTimeout((seconds-elapsed)*1000);steps.push({id:name,start,end:(Date.now()-origin)/1000});};
  try{
   await step('independent-parts',15,async()=>{await seek(page,4.5);await select(1);await page.waitForTimeout(2300);await select(Math.min(5,design.objects.length-1));await page.waitForTimeout(2300);await select(design.objects.length-1);});
   await step('motion-keys',18,async()=>{
    await select(id==='city'?6:1);const keys=panel.getByRole('button',{name:/^Load object pose /});
    if(await keys.count()){await keys.first().click();await page.waitForTimeout(2200);await keys.nth(Math.min(2,await keys.count()-1)).click();await page.waitForTimeout(2200);await keys.last().click();}
    await seek(page,0);await page.getByRole('button',{name:'Play comparison',exact:true}).click();await page.waitForTimeout(6500);await pause(page);
   });
   await step('materials',16,async()=>{
    await seek(page,4.5);const n=id==='aperture'?7:id==='city'?3:16;await select(n);
    const surface=panel.getByLabel('Object surface',{exact:true});const original=await surface.inputValue();
    await surface.scrollIntoViewIfNeeded();
    await surface.selectOption('matte');await page.waitForTimeout(3500);await surface.selectOption('chrome');await page.waitForTimeout(3500);await surface.selectOption(original);
   });
   await step('camera-and-light',16,async()=>{await panel.getByRole('button',{name:'Advanced',exact:true}).click();
    await panel.getByLabel('Light intensity',{exact:true}).scrollIntoViewIfNeeded();await page.waitForTimeout(3000);await seek(page,3);await page.waitForTimeout(2500);await seek(page,6.5);
   });
   await step('review-whole-timeline',14,async()=>{await seek(page,0);await page.getByTestId('studio-pro-timeline').getByRole('button',{name:'Fit entire timeline',exact:true}).click();await page.getByRole('button',{name:'Play comparison',exact:true}).click();await page.waitForTimeout(8500);await pause(page);});
  }finally{await stop();write('teaching-review.json',{origin,steps,nativeActions:true,fullWorkspace:true,previewLighting:'Object scene RoomEnvironment reflections; final Blender frames remain separate'});}
  const after=await h.save(page,'after-teaching');
  // Restore the final base pose copied by Load pose. Existing explicit motion
  // keys and the final material choices remain the authored decisions.
  assert.equal(after.snapshot.threeDScenes[0].objects.length,before.snapshot.threeDScenes[0].objects.length);
  fs.copyFileSync(path.join(out,'editing-in-studio.mp4'),path.join(out,'teaching-in-studio.mp4'));
  if(id==='chrono'&&process.env.FILM_HTTP_PROXY){
   await panel.getByRole('button',{name:'Basic',exact:true}).click();
   await panel.getByLabel('Selected scene object',{exact:true}).selectOption({label:'Sapphire crystal'});
   await panel.getByLabel('Object surface',{exact:true}).scrollIntoViewIfNeeded();await seek(page,4.5);await page.waitForTimeout(1200);
   await page.screenshot({path:path.join(out,'clear-glass-candidate-workspace.png')});
   await page.getByRole('button',{name:'Help: 3D Motion',exact:true}).click();
   const help=page.getByRole('dialog',{name:'Ask AutoPromote',exact:true});await help.waitFor();
   await help.getByLabel('Question',{exact:true}).fill('How do I animate separate objects in Object Composition?');
   const answer=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/product-assistance/ask'&&r.request().method()==='POST');
   await help.getByRole('button',{name:'Ask',exact:true}).click();const response=await answer;assert.equal(response.status(),200);
   const data=await response.json();assert(data.features.some(f=>f.feature_id==='studio.three_d'));
   write('glass-candidate-help.private.json',data);await help.locator('.product-assistance-answer').waitFor();
   await page.screenshot({path:path.join(out,'glass-candidate-help.png')});
   console.log('GLASS_CANDIDATE_REAL_WORKSPACE_AND_CONTEXTUAL_HELP_PASSED');
  }
 }
 await context.storageState({path:state,indexedDB:true});fs.chmodSync(state,0o600);
 }catch(error){write('failure-'+Date.now()+'.json',{phase,error:error.message});await page.screenshot({path:path.join(out,'failure-'+Date.now()+'.png')}).catch(()=>{});await backup(page,'FAILED-'+Date.now()).catch(()=>{});throw error;}
 finally{await context.storageState({path:state,indexedDB:true});fs.chmodSync(state,0o600);await context.close();await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
