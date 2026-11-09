// Native preview inspection gate, exact project recovery, and ordinary export.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
async function main(){
 const demo=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);const config=JSON.parse(fs.readFileSync(path.join(demo,'browser-private.json')));assert.match(config.origin,/^http:\/\/127\.0\.0\.1:/);
 if(process.argv.includes('--wait-refined')){
  const refined=path.join(out,'native-refined-project.autopromote.json'),state=path.join(out,'native-state.json');let ready=false;
  for(let i=0;i<1800;i++){if(fs.existsSync(refined)&&fs.statSync(state).mtimeMs>=fs.statSync(refined).mtimeMs){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,1000));}
  assert(ready,'Native refinement and saved browser state did not finish');
 }
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost']});const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true,storageState:path.join(out,'native-state.json'),recordVideo:{dir:path.join(out,'finish-recording')}});const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('response',async response=>{const pathname=new URL(response.url()).pathname;if(response.status()>=400&&pathname.startsWith('/api/media/')){const body=await response.json().catch(()=>({}));const diagnostic={path:pathname,status:response.status(),code:body.code||body.error,message:body.message};fs.appendFileSync(path.join(out,'native-http-errors.jsonl'),JSON.stringify(diagnostic)+'\n');console.log('NATIVE_HTTP_ERROR',JSON.stringify(diagnostic));}});
 const open=async()=>{await page.goto(config.origin);const sign=page.getByRole('button',{name:'Sign In',exact:true});if(await sign.isVisible()){await sign.click();await page.locator('#login-email').fill(config.email);await page.locator('#login-password').fill(config.password);await page.locator('form input[type=checkbox]').check();await page.locator('form button[type=submit]').click();}await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();await page.getByRole('button',{name:'Podcast moving-edge repair - 4 November',exact:true}).click();await page.locator('.viral-studio-container').waitFor();};
 const save=async()=>{const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();await clickStudioControl(page,page.getByTestId('studio-save-project'));};
 const backup=async name=>{
  await save();const menu=page.locator('details.studio-project-rail__head');
  if(!await menu.evaluate(n=>n.open))await menu.locator(':scope > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),
   page.getByRole('button',{name:'Download project backup',exact:true}).click()]);
  const file=path.join(out,name+'.autopromote.json');await download.saveAs(file);return JSON.parse(fs.readFileSync(file));
 };
 try{
  await open();await page.getByRole('button',{name:/Composite/}).first().click();const panel=page.locator('.studio-subject-vfx');
  const title=panel.getByRole('group',{name:'Text behind subject',exact:true});if(await title.count())await title.getByRole('button',{name:'Remove layer',exact:true}).click();
  const bg=panel.getByRole('group',{name:'Replace background',exact:true});await bg.getByRole('spinbutton',{name:'exposure',exact:true}).fill('-.35');await bg.getByRole('spinbutton',{name:'saturation',exact:true}).fill('.8');
  const edge=panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).first();
  // Actual source review found valid cloth/cable in this lower strip. Keep
  // the earlier setup reproducible, but allow its verified exclusion to be
  // removed through the real inspector; this does not invent missing alpha.
  const border=process.argv.includes('--preserve-source-bottom')?[['left','0'],['top','0'],['right','0'],['bottom','0']]:[['left','0'],['top','.992'],['right','1'],['bottom','1']];
  for(const [name,value] of border)await edge.getByRole('spinbutton',{name:`clear box ${name}`,exact:true}).fill(value);
  if(process.argv.includes('--protect-fixed-bolts')){
   let kept=panel.getByRole('group',{name:'Foreground holdout',exact:true});
   if(!await kept.count()){
    await panel.getByRole('combobox',{name:'Subject effect type',exact:true}).selectOption('foreground_holdout');await panel.getByRole('button',{name:'Add layer',exact:true}).click();
    // Small static detail correction, secondary to the tracked person/props.
    // These measured bolt cores lie inside the actual photographed joint.
    const ellipse=(x,y,rx,ry,count=12)=>Array.from({length:count},(_,i)=>[Math.max(0,(x+rx*Math.cos(i*2*Math.PI/count))/1430),Math.max(0,(y+ry*Math.sin(i*2*Math.PI/count))/1000)]);
    const diamond=ellipse(224,743,9,9,4);
    for(let c=0;c<4;c++)for(let axis=0;axis<2;axis++)await kept.getByRole('spinbutton',{name:`Holdout corner ${c+1} ${axis?'Y':'X'}`,exact:true}).fill(String(diamond[c][axis]));
    const paths=kept.getByRole('textbox',{name:'Additional holdout paths',exact:true});await paths.fill(JSON.stringify([ellipse(174,763,10,12),ellipse(208,815,10,12),ellipse(227,800,9,11)]));await paths.press('Tab');
    await kept.getByRole('checkbox',{name:'Keep thin detail through cleanup',exact:true}).check();await kept.getByRole('spinbutton',{name:'feather',exact:true}).fill('.25');
   }
  }
  if(process.argv.includes('--protect-solid-clothes')){
   // Actual source frames 224–226s show opaque jeans/cable (and, at the
   // end, the speaker's lowered hands) throughout this small interior patch.
   // The neural matte made it translucent next to the baked frame border.
   // This is an explicit secondary Studio correction for this reviewed shot,
   // not a replacement for tracking, nor permission to hold it in later shots.
   const kept=panel.getByRole('group',{name:'Foreground holdout',exact:true});
   assert.equal(await kept.count(),1,'Use the existing fixed-detail correction');
   const paths=kept.getByRole('textbox',{name:'Additional holdout paths',exact:true});
   const current=JSON.parse(await paths.inputValue()||'[]');
   const clothes=[[560/1430,.930],[1200/1430,.930],[1200/1430,.991],[560/1430,.991]];
   if(!current.some(p=>JSON.stringify(p)===JSON.stringify(clothes))){
    await paths.fill(JSON.stringify([...current,clothes]));await paths.press('Tab');
   }
  }
  if(process.argv.includes('--protect-reviewed-rail-cores')){
   // Actual source review r377 checks all48 current photographs. These small
   // interiors remain solid metal; this is secondary corrective authoring,
   // not a held subject silhouette or a claim for any other source interval.
   const kept=panel.getByRole('group',{name:'Foreground holdout',exact:true});assert.equal(await kept.count(),1);
   const paths=kept.getByRole('textbox',{name:'Additional holdout paths',exact:true});
   const current=JSON.parse(await paths.inputValue()||'[]');
   const rect=(x0,y0,x1,y1)=>[[x0/1430,y0/1000],[x1/1430,y0/1000],[x1/1430,y1/1000],[x0/1430,y1/1000]];
   const additions=[rect(240,798,785,804),rect(179,840,184,980)];
   await paths.fill(JSON.stringify([...current,...additions.filter(p=>!current.some(v=>JSON.stringify(v)===JSON.stringify(p)))]));await paths.press('Tab');
  }
  if(process.argv.includes('--remove-reviewed-screen-residue')){
   // All48 actual source overlays were reviewed: the narrow region keys the
   // exposed old orange screen, while the moving pale clothing stays intact.
   // Subtractive cleanup follows the photographed fixed-detail corrections.
   await panel.getByRole('combobox',{name:'Subject effect type',exact:true}).selectOption('foreground_refine');await panel.getByRole('button',{name:'Add layer',exact:true}).click();
   const clean=panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).last();
   for(const [name,value] of Object.entries({choke:0,feather:.2,edge_radius:0,decontaminate:0,dark_max:0,reject_hue:15,reject_tolerance:25,reject_saturation:.4,reject_value:.6})){
    const field=clean.getByRole('spinbutton',{name:name.replaceAll('_',' '),exact:true});await field.fill(String(value));await field.press('Tab');
   }
   for(const [name,value] of Object.entries({'detail box right':395/1430,'detail box bottom':.794,'detail box left':330/1430,'detail box top':.746}))await clean.getByRole('spinbutton',{name,exact:true}).fill(String(value));
   await clean.getByRole('checkbox',{name:'Clean protected object edges',exact:true}).check();
  }
  const extraArgument=process.argv.find(value=>value.startsWith('--extra-holdout-paths='));
  if(extraArgument){
   const proof=JSON.parse(fs.readFileSync(extraArgument.slice('--extra-holdout-paths='.length)));
   const refined=JSON.parse(fs.readFileSync(path.join(out,'native-refined-project.autopromote.json'))).snapshot.subjectVfxScenes[0];
   assert.equal(proof.sourceContentHash,refined.modelArtifactRef.sourceContentHash,'A photographed correction cannot cross source identities');
   assert.equal(proof.framesVerified,48);assert.equal(proof.visualReviewPending,false);
   const kept=panel.getByRole('group',{name:'Foreground holdout',exact:true});assert.equal(await kept.count(),1);
   const paths=kept.getByRole('textbox',{name:'Additional holdout paths',exact:true});const current=JSON.parse(await paths.inputValue()||'[]');
   for(const polygon of proof.paths)assert(polygon.length>=3&&polygon.length<=64&&polygon.every(p=>p.length===2&&p.every(v=>Number.isFinite(v)&&v>=0&&v<=1)));
   await paths.fill(JSON.stringify([...current,...proof.paths.filter(p=>!current.some(v=>JSON.stringify(v)===JSON.stringify(p)))]));await paths.press('Tab');
  }
  let grade=panel.getByRole('group',{name:'Foreground light and colour',exact:true});if(!await grade.count()){await panel.getByRole('combobox',{name:'Subject effect type',exact:true}).selectOption('foreground_grade');await panel.getByRole('button',{name:'Add layer',exact:true}).click();}
  for(const [name,value] of [['exposure','-.08'],['saturation','.95'],['contrast','1.02']])await grade.getByRole('spinbutton',{name,exact:true}).fill(value);
  await save();
  if(process.argv.includes('--remove-reviewed-screen-residue')){
   const checked=await backup('reviewed-foreground-corrections');
   const item=checked.snapshot.subjectVfxScenes[0];
   const cleanup=item.scene.effects.filter(e=>e.type==='foreground_refine'&&e.after_holdout).at(-1);
   assert.deepEqual(cleanup.detail_box,[330/1430,.746,395/1430,.794]);
   assert.equal(cleanup.choke,0);assert.equal(cleanup.decontaminate,0);assert.equal(cleanup.reject_saturation,.4);
   assert.equal(item.modelArtifactRef?.artifactHash,JSON.parse(fs.readFileSync(path.join(out,'native-refined-project.autopromote.json'))).snapshot.subjectVfxScenes[0].modelArtifactRef.artifactHash,'Secondary effects reuse the actual immutable refined model result');
  }
  let movie=panel.getByLabel('Rendered subject effects with original audio',{exact:true});
  if(!await movie.isVisible()){await panel.getByRole('button',{name:/^(Render subject preview|Refresh rendered preview|Check saved render)$/}).click();await movie.waitFor({timeout:600000});}
  const response=await context.request.get(await movie.getAttribute('src'));assert(response.ok());const bytes=await response.body();fs.writeFileSync(path.join(out,'preview.mp4'),bytes);const sha=hash(bytes);await backup('preview-model-project');fs.writeFileSync(path.join(out,'review-required.json'),JSON.stringify({previewSha256:sha,actualFramesReviewRequired:48},null,2));console.log('ACTUAL_NATIVE_PREVIEW_FOR_INSPECTION',sha);
  await movie.evaluate(async v=>{v.muted=true;v.currentTime=0;await v.play();await new Promise((resolve,reject)=>{v.addEventListener('ended',resolve,{once:true});setTimeout(()=>reject(Error('Native subject preview did not end')),15000)})});
  if(process.argv.includes('--preview-only')){
   // A rejected visual result can still expose a persistence defect. Keep
   // that engineering check separate from sound/creative approval and export.
   const before=await backup('before-preview-cold-reopen');await page.reload();await open();
   const reopened=await backup('after-preview-cold-reopen');
   assert.deepEqual(before.snapshot.studioDocument,reopened.snapshot.studioDocument);
   assert.deepEqual(before.snapshot.subjectVfxScenes,reopened.snapshot.subjectVfxScenes);
   await page.getByRole('button',{name:/Composite/}).first().click();
   if(process.argv.includes('--expect-refinement-preferences')){
    const controls=page.locator('.studio-subject-vfx').getByRole('group',{name:'Subject mask',exact:true});
    assert.equal(await controls.getByRole('spinbutton',{name:'Edge refinement radius',exact:true}).inputValue(),'15');
    for(const n of [3,4,5])assert(await controls.getByRole('checkbox',{name:`Clean fine edges of foreground object ${n}`,exact:true}).isChecked());
    fs.writeFileSync(path.join(out,'native-refinement-preferences-cold-reopen.json'),JSON.stringify({
     radius:15,fixedObjectNumbers:[3,4,5],normalUiSaveAndColdReopen:true,
     canonicalDocumentAndSubjectSceneExact:true,visualQualityQualified:false},null,2));
   }
   const restored=page.locator('.studio-subject-vfx').getByLabel('Rendered subject effects with original audio',{exact:true});
   await restored.waitFor();const restoredResponse=await context.request.get(await restored.getAttribute('src'));assert(restoredResponse.ok());
   assert.equal(hash(await restoredResponse.body()),sha);
   fs.writeFileSync(path.join(out,'native-preview-persistence.json'),JSON.stringify({actualMaskBackedScene:true,canonicalDocumentColdReopenExact:true,subjectSceneColdReopenExact:true,previewBytesAfterColdReopenExact:true,previewSha256:sha,browserExceptions:errors,finalExport:false,soundListeningReview:false,cleanShotVisualPass:false,fourMinuteProof:false,paidCloudInference:false},null,2));
   console.log('ACTUAL_NATIVE_PREVIEW_COLD_RECOVERY_COMPLETE');return;
  }
  let reviewed=false;for(let i=0;i<1800;i++){const f=path.join(out,'visual-review.json');if(fs.existsSync(f)){const v=JSON.parse(fs.readFileSync(f));assert.equal(v.previewSha256,sha);assert.equal(v.actualFramesReviewed,48);assert.equal(v.allowEngineeringExport,true);reviewed=true;break;}await page.waitForTimeout(1000);}assert(reviewed,'Actual moving-frame review is required');await panel.getByRole('checkbox',{name:'I reviewed the sound, subject edges and camera cuts',exact:true}).check();await save();
  await page.getByRole('button',{name:/Reframe/}).first().click();await page.getByTestId('reframe-aspect-16-9').click();
  for(const name of ['Pause comparison','Pause edited preview']){const pause=page.getByRole('button',{name,exact:true});if(await pause.isVisible())await pause.click();}
  const position=page.getByLabel('Edited output position',{exact:true});await page.waitForTimeout(250);await position.press('Home');assert.equal(Number(await position.inputValue()),0);await page.waitForTimeout(250);await position.press('Home');await clickStudioControl(page,page.getByTestId('preview-fit-full'));
  // Explicitly turn the whole-shot automatic crop off. A late source clock
  // event can record the Fit full cut a few milliseconds after zero; relying
  // on that cut alone would leave frame zero using the old global crop.
  await page.getByTestId('auto-reframe-toggle').check();await page.getByTestId('auto-reframe-toggle').uncheck();
  await page.getByRole('button',{name:/Sound/}).first().click();await page.getByRole('checkbox',{name:'Use voice repair on export',exact:true}).uncheck();
  await clickStudioControl(page,page.getByRole('button',{name:'Export',exact:true}));await page.getByRole('combobox',{name:'Export resolution',exact:true}).selectOption('1080p');await page.getByRole('combobox',{name:'Export frame rate',exact:true}).selectOption('24');await page.getByRole('combobox',{name:'Export quality',exact:true}).selectOption('master');
  const before=await backup('before-cold-reopen');assert(before.snapshot.smartCrop===false&&before.snapshot.reframeModeCuts.every(c=>c.mode==='off'),'The global crop and every framing interval must be off for the entire shot');await page.reload();await open();const reopened=await backup('after-cold-reopen');assert.deepEqual(before.snapshot.studioDocument,reopened.snapshot.studioDocument);assert.deepEqual(before.snapshot.subjectVfxScenes,reopened.snapshot.subjectVfxScenes);
  await clickStudioControl(page,page.getByRole('button',{name:'Export',exact:true}));const recovery=page.getByTestId('viral-render-recovery');if(await recovery.isVisible())await recovery.getByRole('button',{name:'Dismiss',exact:true}).click();await page.getByRole('button',{name:/^(Render Final Clip|Render Again)$/}).click();const consent=page.getByRole('dialog',{name:'Studio export',exact:true});await consent.waitFor();await consent.getByRole('button',{name:/^Approve /}).click();await page.getByRole('button',{name:'Download Rendered Clip',exact:true}).waitFor({timeout:240000});const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download Rendered Clip',exact:true}).click();const exportFile=path.join(out,'native-export.mp4');await(await event).saveAs(exportFile);const final=await backup('final-project');assert.deepEqual(reopened.snapshot.studioDocument,final.snapshot.studioDocument);assert.deepEqual(reopened.snapshot.subjectVfxScenes,final.snapshot.subjectVfxScenes);
  fs.writeFileSync(path.join(out,'native-persistence.json'),JSON.stringify({flattenedInput:false,actualMaskBackedScene:true,canonicalDocumentColdReopenExact:true,subjectSceneColdReopenExact:true,canonicalDocumentAfterExportExact:true,subjectSceneAfterExportExact:true,previewSha256:sha,exportSha256:hash(fs.readFileSync(exportFile)),browserExceptions:errors,creativeGate:false,paidCloudInference:false},null,2));console.log('ACTUAL_MASK_BACKED_NATIVE_EXPORT_COMPLETE');
 }catch(e){await page.screenshot({path:path.join(out,'finish-failure.png')});fs.writeFileSync(path.join(out,'finish-failure.txt'),await page.locator('body').innerText());throw e;}
 finally{await context.storageState({path:path.join(out,'native-state.json'),indexedDB:true});await context.close();await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
