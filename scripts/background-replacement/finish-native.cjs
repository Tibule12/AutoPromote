// Continue through native controls; never import a flattened corrected film as
// a substitute for a mask-backed editable scene.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
async function main(){
 const directory=process.argv[2],plate=path.resolve(process.argv[3]),config=JSON.parse(fs.readFileSync(path.join(directory,'browser-private.json')));
 const browser=await chromium.launch({headless:true,args:['--mute-audio']});const context=await browser.newContext({viewport:{width:1600,height:1100},storageState:path.join(directory,'browser-state.json'),acceptDownloads:true,recordVideo:{dir:path.join(directory,'final-recordings')}});
 await context.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>console.log('BROWSER_ERROR',e.message));page.on('response',async r=>{if(r.url().includes('studio-subject')&&r.status()>=400)console.log('VFX_HTTP',r.status(),await r.text());});
 const open=async()=>{await page.goto(config.origin);await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().waitFor({timeout:90000});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();await page.getByRole('button',{name:'Credit lifecycle local project',exact:true}).click();await page.locator('.viral-studio-container').waitFor();const pause=page.getByRole('button',{name:'Pause edited preview',exact:true});if(await pause.isVisible())await pause.click();};
 const save=async()=>{const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();await clickStudioControl(page,page.getByTestId('studio-save-project'));};
 const backup=async name=>{const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();const download=page.waitForEvent('download');await clickStudioControl(page,page.getByRole('button',{name:'Download project backup',exact:true,includeHidden:true}));const file=path.join(directory,`${name}.autopromote.json`);await(await download).saveAs(file);return JSON.parse(fs.readFileSync(file));};
 try{
 await open();await page.getByRole('button',{name:/Composite/}).first().click();let panel=page.locator('.studio-subject-vfx');
 if(!process.argv.includes('--resume')){
 await panel.getByRole('button',{name:'Subject mask attached',exact:true}).waitFor();
 await panel.getByLabel('Upload background image',{exact:true}).setInputFiles(plate);await panel.getByText('Background saved. Create or reuse the subject mask, then render the replacement preview.').waitFor();
 const title=panel.getByRole('group',{name:'Text behind subject',exact:true});if(await title.count())await title.getByRole('button',{name:'Remove layer',exact:true}).click();
 // Preserve the actual front cabinet plane and its photographed plant/rig
 // shadows. This is an ordinary native four-corner foreground correction,
 // supplementary to the model tracks; it does not recreate the person/rig.
 await panel.getByRole('combobox',{name:'Subject effect type',exact:true}).selectOption('foreground_holdout');await panel.getByRole('button',{name:'Add layer',exact:true}).click();
 const cabinet=panel.getByRole('group',{name:'Foreground holdout',exact:true});
 const corners=[[.59,.74],[1,.74],[1,1],[.59,1]];
 for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)await cabinet.getByRole('spinbutton',{name:`Holdout corner ${corner+1} ${axis?'Y':'X'}`,exact:true}).fill(String(corners[corner][axis]));
 await cabinet.getByRole('spinbutton',{name:'feather',exact:true}).fill('.5');
 const effect=panel.getByRole('group',{name:'Replace background',exact:true});await effect.getByRole('spinbutton',{name:'exposure',exact:true}).fill('-.35');await effect.getByRole('spinbutton',{name:'saturation',exact:true}).fill('.8');
 await panel.getByRole('combobox',{name:'Subject effect type',exact:true}).selectOption('foreground_grade');await panel.getByRole('button',{name:'Add layer',exact:true}).click();const grade=panel.getByRole('group',{name:'Foreground light and colour',exact:true});await grade.getByRole('spinbutton',{name:'exposure',exact:true}).fill('-.08');await grade.getByRole('spinbutton',{name:'saturation',exact:true}).fill('.95');await grade.getByRole('spinbutton',{name:'contrast',exact:true}).fill('1.02');
 // Native deterministic colour rejection is a narrow TV-spill cleanup. It does
 // not provide a replacement for missing object segmentation or model alpha.
 await panel.getByRole('combobox',{name:'Subject effect type',exact:true}).selectOption('foreground_refine');await panel.getByRole('button',{name:'Add layer',exact:true}).click();
 const clean=panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).last();for(const [name,value] of [['choke',0],['feather',.3],['dark max',0],['reject hue',230],['reject tolerance',45],['reject saturation',.5],['reject value',.18]])await clean.getByRole('spinbutton',{name,exact:true}).fill(String(value));
 for(const [key,value] of Object.entries({left:.60,top:.05,right:1,bottom:.72}))await clean.getByRole('spinbutton',{name:`detail box ${key}`,exact:true}).fill(String(value));
 await clean.getByRole('checkbox',{name:'Clean protected object edges',exact:true}).check();
 await panel.getByRole('button',{name:'Add layer',exact:true}).click();const fringe=panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).last();
 for(const [name,value] of [['choke',0],['feather',.3],['dark max',0],['reject hue',15],['reject tolerance',20],['reject saturation',.72],['reject value',.83]])await fringe.getByRole('spinbutton',{name,exact:true}).fill(String(value));
 for(const [key,value] of Object.entries({left:.59,top:.40,right:1,bottom:.75}))await fringe.getByRole('spinbutton',{name:`detail box ${key}`,exact:true}).fill(String(value));
 await fringe.getByRole('checkbox',{name:'Clean protected object edges',exact:true}).check();

 await panel.getByRole('button',{name:'Clean background edges',exact:true}).click();await panel.getByRole('spinbutton',{name:'Background edge detail width',exact:true}).fill('0');await panel.getByRole('spinbutton',{name:'Remove old background colour',exact:true}).fill('.8');
 await save();
 await page.getByRole('button',{name:'Reframe',exact:true}).click();await page.getByTestId('reframe-aspect-16-9').click();await clickStudioControl(page,page.getByTestId('preview-fit-full'));await save();
 await page.getByRole('button',{name:/Composite/}).first().click();panel=page.locator('.studio-subject-vfx');
 }
 if(process.argv.includes('--source-colour')){
  await panel.getByRole('spinbutton',{name:'Remove old background colour',exact:true}).fill('1');
  await panel.getByRole('spinbutton',{name:'Background edge detail width',exact:true}).fill('3');
  for(const group of await panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).all()){
   const control=group.getByRole('checkbox',{name:'Limit colour cleanup to background edges',exact:true});
   const hue=Number(await group.getByRole('spinbutton',{name:'reject hue',exact:true}).inputValue());
   await control.setChecked(hue===230);
  }
  await save();
 }
 await panel.getByRole('button',{name:'Render subject preview',exact:true}).click();console.log('PREVIEW_REQUESTED');
 const movie=panel.getByLabel('Rendered subject effects with original audio',{exact:true});let lastStatus='';
 for(let check=0;check<600&&!await movie.isVisible();check++){
  const status=(await panel.getByRole('status').allTextContents()).join(' ');if(status!==lastStatus){console.log('PREVIEW_STATUS',status);lastStatus=status;}
  if(/unavailable|could not|changed|failed|invalid|MODEL_|admin_required/i.test(status))throw Error(status);
  await page.waitForTimeout(1000);
 }
 await movie.waitFor();
 const previewUrl=await movie.getAttribute('src');const response=await context.request.get(previewUrl);assert(response.ok());fs.writeFileSync(path.join(directory,'replacement-preview.mp4'),await response.body());
 // Play the actual native media through ended. Device is muted by Chromium.
 await movie.evaluate(async v=>{v.currentTime=0;await v.play();});await movie.evaluate(v=>new Promise((resolve,reject)=>{v.addEventListener('ended',resolve,{once:true});setTimeout(()=>reject(Error('Complete subject playback did not finish')),15000);}));
 const previewSha256=require('crypto').createHash('sha256').update(fs.readFileSync(path.join(directory,'replacement-preview.mp4'))).digest('hex');
 fs.writeFileSync(path.join(directory,'preview-review-required.json'),JSON.stringify({previewSha256,scope:'Actual moving-frame review required before native reviewed flag/export comparison; no founder creative approval implied'}));
 console.log('PREVIEW_READY_FOR_VISUAL_REVIEW',previewSha256);
 const gate=path.join(directory,'preview-visual-review.json');let reviewed;
 for(let attempt=0;attempt<1800;attempt++){
  if(fs.existsSync(gate)){reviewed=JSON.parse(fs.readFileSync(gate));if(reviewed.previewSha256===previewSha256&&reviewed.actualFramesReviewed===true)break;}
  await page.waitForTimeout(1000);
 }
 assert(reviewed?.previewSha256===previewSha256&&reviewed.actualFramesReviewed===true,'Actual visual review did not authorize this diagnostic export comparison');
 await panel.getByRole('checkbox',{name:'I reviewed the sound, subject edges and camera cuts',exact:true}).check();
 await save();const before=await backup('background-before-reopen');fs.writeFileSync(path.join(directory,'background-before-reopen-evidence.json'),JSON.stringify(before,null,2));
 await page.screenshot({path:path.join(directory,'replacement-in-studio.png')});
 await open();await page.getByRole('button',{name:/Composite/}).first().click();panel=page.locator('.studio-subject-vfx');await panel.getByRole('button',{name:'Subject mask attached',exact:true}).waitFor();await panel.getByLabel('Rendered subject effects with original audio',{exact:true}).waitFor();
 const after=await backup('background-after-reopen');fs.writeFileSync(path.join(directory,'background-after-reopen-evidence.json'),JSON.stringify(after,null,2));console.log('REOPENED_NATIVE_SCENE');
 await clickStudioControl(page,page.getByRole('button',{name:'Export',exact:true}));await page.getByRole('combobox',{name:'Export resolution',exact:true}).selectOption('1080p');await page.getByRole('combobox',{name:'Export frame rate',exact:true}).selectOption('24');
 const recovery=page.getByTestId('viral-render-recovery');await page.waitForTimeout(1500);
 if(await recovery.isVisible()){const dismiss=recovery.getByRole('button',{name:'Dismiss',exact:true});await dismiss.waitFor();await dismiss.click();await recovery.waitFor({state:'hidden'});}
 await page.getByRole('button',{name:/^(Render Final Clip|Render Again)$/}).click();const modal=page.getByRole('dialog',{name:'Studio export',exact:true});await modal.waitFor();await modal.getByRole('button',{name:/^Approve /}).click();
 await page.getByRole('button',{name:'Download Rendered Clip',exact:true}).waitFor({timeout:180000});const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download Rendered Clip',exact:true}).click();await(await download).saveAs(path.join(directory,'background-native-export.mp4'));console.log('EXPORTED_NATIVE_VIDEO');
 await page.waitForTimeout(4000);await page.screenshot({path:path.join(directory,'replacement-exported.png')});await save();await backup('background-final-project');
 }catch(e){await page.screenshot({path:path.join(directory,'finish-failure.png')});console.log('BODY',(await page.locator('body').innerText()).slice(-9000));throw e;}
 finally{await context.storageState({path:path.join(directory,'browser-state.json'),indexedDB:true});await context.close();await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
