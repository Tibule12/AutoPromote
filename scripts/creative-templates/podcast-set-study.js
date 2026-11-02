#!/usr/bin/env node
// Bounded real Studio UI adaptation. No project injection, auth bypass, model
// choice, fake mask or alternate renderer. Mask actions request runtime work;
// execution device, authorization and cost controls stay on the server.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const h=require('./studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {saveAuthenticatedState}=require('./studio-session');
const {hash}=require('../../src/creativeTemplates/contract');
const {view}=require('./materials-editing-proof');
const stateFile=process.env.STUDIO_QA_STORAGE_STATE,folder=path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const title='UNMUTED — cinematic set study',baseId='viral-project-2626fbb1-01e4-4daf-b730-14e14c0a002d';
const sourceFile=path.resolve('reports/model-capability-runtime-v1-20261009/proof/launch-template/materials-variety-20261014/unmuted-raw-speech-window.mp4');
const outputName=process.env.STUDIO_QA_STUDY_OUTPUT || 'set-study';
const secondSpeaker=process.env.STUDIO_QA_SECOND_SPEAKER==='true';
const secondFile='unmuted-speaker-two-raw-2s.mp4';
async function project(page,id){return page.evaluate(id=>new Promise((resolve,reject)=>{const r=indexedDB.open('autopromote-viral-studio',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,s=db.transaction('projects','readonly').objectStore('projects');const q=id?s.get(id):s.getAll();q.onsuccess=()=>{db.close();resolve(q.result);};};}),id);}
async function pause(page){const button=page.getByRole('button',{name:'Pause comparison',exact:true});if(await button.isVisible())await button.click();await page.locator('video,audio').evaluateAll(elements=>elements.forEach(element=>{element.muted=true;element.pause();}));}
async function range(input,value){await input.evaluate((element,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,String(value));element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));},value);}
async function composeSubject(page){
 await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');
 await panel.getByRole('button',{name:/^(Render subject preview|Check saved render|Refresh rendered preview)$/}).click();
 await page.waitForFunction(()=>document.querySelector('.studio-subject-vfx [data-state=error]')||
  (document.querySelector('[aria-label="Rendered subject effects with original audio"]')&&
   [...document.querySelectorAll('.studio-subject-vfx button')].some(button=>button.textContent==='Refresh rendered preview'&&!button.disabled)),undefined,{timeout:660000});
 const error=panel.locator('[data-state=error]');if(await error.count())throw Error(await error.innerText());
 const approval=panel.getByLabel(/I reviewed the sound/);await approval.waitFor({timeout:180000});
 const video=panel.getByLabel('Rendered subject effects with original audio',{exact:true});
 await video.evaluate(video=>{video.muted=true;video.currentTime=0;return video.play();});
 await page.waitForFunction(()=>document.querySelector('[aria-label="Rendered subject effects with original audio"]')?.ended,undefined,{timeout:30000});
 // Native technical review acknowledgement; never public/creative approval.
 await approval.check();console.log('Complete subject composition played through native controls.');
}
async function main(){
 fs.mkdirSync(folder,{recursive:true});require('./proof-storage').requireProofSpace(folder);
 const saved=JSON.parse(fs.readFileSync(stateFile)),scoped=structuredClone(saved);
 for(const o of scoped.origins||[])for(const d of o.indexedDB||[])if(d.name==='autopromote-viral-studio')for(const s of d.stores||[])if(s.name==='projects')s.records=s.records.filter(r=>r.value.id===baseId||r.value.name===title);
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost [::1]','--disk-cache-size=1048576','--media-cache-size=1048576']});
 const context=await browser.newContext({storageState:scoped,viewport:{width:1600,height:1080},acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('response',async response=>{
  if(response.url().endsWith('/projects/revisions')&&response.status()>=400){
   const data=await response.json().catch(()=>({}));console.log('Project revision rejected:',response.status(),String(data.error||data.message||'No detail').slice(0,250));
  }
  if(new URL(response.url()).hostname==='storage.googleapis.com'&&response.status()>=400){
   const text=await response.text().catch(()=>'');
   console.log('Storage transfer rejected:',response.status(),text.replace(/https?:\/\/[^\s"<>]+/g,'[storage URL]').replace(/upload_id=[^\s&"<>]+/g,'upload_id=[redacted]').slice(0,700));
  }
 });
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  const rows=await project(page),base=rows.find(row=>row.id===baseId),retained=rows.find(row=>row.name===title)||rows.find(row=>row.id==='viral-project-3c6baaa6-0547-4e0c-8c75-28aab2e3b743');assert(base,'Retained original grade study is missing');
  const baseline=hash(base.snapshot.studioDocument);
  await page.getByRole('button',{name:retained?retained.name:base.name,exact:true}).click();await h.rail(page);await pause(page);console.log('Signed-in native study opened.');
  if(!retained)await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
  await page.getByLabel('Project name',{exact:true}).fill(title);await h.save(page,outputName);
  const action=process.argv[2]||'prepare';
  if(action==='prepare-second'){
   await page.getByRole('tab',{name:'Media',exact:true}).click();
   let card=page.locator('.studio-media-card').filter({has:page.locator('strong',{hasText:secondFile})}).last();
   if(!await card.count()){
    await page.getByTestId('project-media-import-input').setInputFiles(path.join(folder,secondFile));
    await page.waitForFunction(name=>[...document.querySelectorAll('.studio-media-card')].filter(e=>e.querySelector('strong')?.textContent===name).at(-1)?.className.match(/is-(ready|failed)/),secondFile,{timeout:120000});
   }
   if(await card.locator('.studio-media-card__error').count())throw Error(await card.locator('.studio-media-card__error').innerText());
   await card.getByRole('button',{name:'Preview '+secondFile,exact:true}).click();
   const before=await h.save(page,outputName);
   if(!before.snapshot.timeline.some(clip=>clip.name===secondFile))await card.getByRole('button',{name:'Add to sequence',exact:true}).click();
   else if(before.snapshot.studioDocument.assets.some(asset=>asset.sourceId===before.snapshot.projectMedia.find(asset=>asset.name===secondFile)?.id&&!asset.contentHash)){
    await page.getByTestId('pro-video-clip-'+before.snapshot.timeline.length).click();
    await page.getByRole('tab',{name:'Media',exact:true}).click();
    await card.getByRole('button',{name:'Preview '+secondFile,exact:true}).click();
    await card.getByRole('button',{name:'Replace selected clip',exact:true}).click();
   }
   await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');
   if(!before.snapshot.subjectVfxScenes.some(item=>item.scene.sourceId===before.snapshot.projectMedia.find(asset=>asset.name===secondFile)?.id)){
    const option=panel.getByLabel('Subject effect source clip').locator('option').filter({hasText:secondFile}).last();
    await panel.getByLabel('Subject effect source clip').selectOption(await option.getAttribute('value'));
   }
   const selected=panel.getByLabel('Subject effect scene');
   await selected.selectOption({label:secondFile});
   while(await panel.getByRole('button',{name:'Remove layer',exact:true}).count())await panel.getByRole('button',{name:'Remove layer',exact:true}).last().click();
   await panel.getByLabel('Subject effect type',{exact:true}).selectOption('background_replace');
   await panel.getByRole('button',{name:'Add layer',exact:true}).click();
   await panel.locator('fieldset').filter({has:page.locator('legend',{hasText:'Replace background'})}).locator('select').selectOption({label:'charcoal-walnut-studio-plate-v1.png'});
   console.log('Separate continuous second camera ingested and added through native Studio controls.');
  }else if(action==='reveal'||action==='dialogue'){
   const before=await h.save(page,'pre-reveal');
   const source=before.snapshot.projectMedia.find(a=>a.id===before.snapshot.subjectVfxScenes[0].scene.sourceId);
   const background=before.snapshot.projectMedia.find(a=>a.id===before.snapshot.subjectVfxScenes[0].scene.effects.find(e=>e.type==='background_replace').asset_id);
   assert(source&&background,'Saved source and room required; no new model request is permitted.');
   const panel=page.getByTestId('launch-template-panel');
   if(!await panel.evaluate(element=>element.open))await panel.locator(':scope > summary').click();
   await panel.getByLabel('Creative template',{exact:true}).selectOption(action==='dialogue'?'podcast_set_dialogue_v1@1.0.0':'podcast_set_reveal_v1@1.0.0');
   for(const [label,value]of Object.entries({'Launch headline':'UNMUTED\nTHE PODCAST','Feature one':'CULTURE. REAL TALK.','Feature two':'YOUR VOICE. REIMAGINED.','Launch CTA':'Made with AutoPromote.','Launch colour':'#c8a7ff'}))
    await panel.getByLabel(label,{exact:true}).fill(value);
   await panel.getByLabel('Template aspect ratio',{exact:true}).selectOption('16:9');
   await panel.getByLabel('Select hookFootage',{exact:true}).selectOption(source.id);
   await panel.getByLabel('Select background',{exact:true}).selectOption(background.id);
   if(action==='dialogue'){
    const response=before.snapshot.projectMedia.find(asset=>asset.name===secondFile);assert(response,'Second camera must be saved and masked first.');
    await panel.getByLabel('Select responseFootage',{exact:true}).selectOption(response.id);
   }
   const music=before.snapshot.projectMedia.find(a=>a.name==='mixkit-music-1147.mp3');assert(music);
   await panel.getByLabel('Select music',{exact:true}).selectOption(music.id);
   for(const [slot,file]of [['revealSound','mixkit-sfx-1492.wav'],['impactSound','mixkit-sfx-1143.mp3']]){
    const select=panel.getByLabel('Select '+slot,{exact:true}),existing=await select.locator('option').filter({hasText:file}).count();
    if(existing)await select.selectOption({label:file});
    else {await panel.getByLabel('Upload '+slot,{exact:true}).setInputFiles(path.resolve('reports/model-capability-runtime-v1-20261009/proof/launch-template/materials-editing-20261010/materials',file));
     await panel.getByText(file+' saved.',{exact:true}).waitFor({timeout:90000});}
   }
   await panel.getByRole('button',{name:'Director: select launch edit',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('[data-testid="launch-template-panel"] button')?.disabled);
   assert((await panel.getByRole('status').innerText()).includes('Director selected'),await panel.getByRole('status').innerText());
   const proposal=panel.getByRole('region',{name:'Director launch selection',exact:true});
   await proposal.waitFor();await proposal.getByRole('button',{name:'Apply Director launch',exact:true}).click();
   await panel.getByText('Director launch edit applied. All clips, titles, keys and sound remain editable.',{exact:true}).waitFor();
   const after=await h.save(page,'reveal');
   assert.equal(after.snapshot.creativeTemplateInstance.templateRef.templateId,action==='dialogue'?'podcast_set_dialogue_v1':'podcast_set_reveal_v1');
   assert.equal(after.snapshot.subjectVfxScenes[0].modelArtifactRef.artifactHash,before.snapshot.subjectVfxScenes[0].modelArtifactRef.artifactHash);
   assert.equal(after.snapshot.reframeAspect,'16:9');
   assert(after.snapshot.soundEffects.length===3&&after.snapshot.overlays.length===(action==='dialogue'?2:3));
   fs.writeFileSync(path.join(folder,'reveal-native-application.json'),JSON.stringify({createdAt:new Date().toISOString(),projectId:after.id,
    beforeHash:hash(before.snapshot.studioDocument),afterHash:hash(after.snapshot.studioDocument),templateRef:after.snapshot.creativeTemplateInstance.templateRef,
    instantiatedBy:after.snapshot.creativeTemplateInstance.instantiatedBy,paidJobsStarted:0,maskReused:true,sourceReuploaded:false},null,2));
  }else if(action==='prepare'){
   await page.getByTestId('pro-video-clip-1').click();
   await page.getByRole('tab',{name:'Media',exact:true}).click();
   await page.getByTestId('project-media-import-input').setInputFiles(sourceFile);
   console.log('Original raw source selected in the native Media library.');
   const card=page.locator('.studio-media-card').filter({has:page.locator('strong',{hasText:path.basename(sourceFile)})}).last();
   await page.waitForFunction(()=>[...document.querySelectorAll('.studio-media-card')].filter(e=>e.querySelector('strong')?.textContent==='unmuted-raw-speech-window.mp4').at(-1)?.className.match(/is-(ready|failed)/),undefined,{timeout:120000});
   if(await card.locator('.studio-media-card__error').count())throw Error(await card.locator('.studio-media-card__error').innerText());
   console.log('Raw source saved through durable Studio ingestion.');
   await card.getByRole('button',{name:`Preview ${path.basename(sourceFile)}`,exact:true}).click();
   await card.getByRole('button',{name:'Replace selected clip',exact:true}).click();
   await q.tool(page,'Composite');
   const panel=page.locator('.studio-subject-vfx'),source=await panel.getByLabel('Subject effect source clip').locator('option').last().getAttribute('value');
   await panel.getByLabel('Subject effect source clip').selectOption(source);
   await panel.getByRole('button',{name:'Remove layer',exact:true}).click();
   await panel.getByLabel('Upload background image').setInputFiles(path.join(folder,'charcoal-walnut-studio-plate-v1.png'));
   await panel.getByText('Background saved. Create or reuse the subject mask, then render the replacement preview.',{exact:true}).waitFor({timeout:90000});
   for(const [x,y] of [[.34,.24],[.31,.57],[.12,.78],[.38,.56],[.50,.82],[.53,.61]]){
    await panel.getByLabel('Subject point X',{exact:true}).fill(String(x));await panel.getByLabel('Subject point Y',{exact:true}).fill(String(y));
    await panel.getByRole('button',{name:'Add first-frame point',exact:true}).click();
   }
   await panel.getByRole('button',{name:'Background point',exact:true}).click();
   for(const [x,y] of [[.50,.30],[.10,.15],[.68,.80]]){
    await panel.getByLabel('Subject point X',{exact:true}).fill(String(x));await panel.getByLabel('Subject point Y',{exact:true}).fill(String(y));
    await panel.getByRole('button',{name:'Add first-frame point',exact:true}).click();
   }
   for(const [label,value] of [['left',.10],['top',.15],['right',.64],['bottom',1]])await panel.getByLabel(`Subject box ${label}`,{exact:true}).fill(String(value));
   // Persist the chosen box by starting only in the explicit `mask` action;
   // the preparation record stores no invented runtime result.
   fs.writeFileSync(path.join(folder,'mask-selection.json'),JSON.stringify({box:[.10,.15,.64,1]},null,2));
  }else if(action==='mask'){
   await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');
   const selection=JSON.parse(fs.readFileSync(path.join(folder,'mask-selection.json')));
   const maskBoxLabels=['left','top','right','bottom'];
   for(let i=0;i<4;i++){const input=panel.getByLabel(`Subject box ${maskBoxLabels[i]}`,{exact:true});if(await input.isEnabled())await input.fill(String(selection.box[i]));}
   const button=panel.getByRole('button',{name:/^(Create|Resume|Check saved) subject mask$/});await button.click();
   await page.waitForFunction(()=>document.querySelector('.studio-subject-vfx')?.textContent.includes('Subject mask saved.')||
    [...document.querySelectorAll('.studio-subject-vfx fieldset [role=status]')].some(e=>!e.textContent.includes('Creating the saved subject mask')),
    undefined,{timeout:13*60000});
   assert((await panel.innerText()).includes('Subject mask saved.'),await panel.locator('fieldset [role=status]').innerText());
  }else if(action==='component-mask'){
   await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');
   if(secondSpeaker)await panel.getByLabel('Subject effect scene').selectOption({label:secondFile});
   const cancel=panel.getByRole('button',{name:'Cancel mask request',exact:true});
   if(await cancel.isVisible()){
    await cancel.click();
    if(await cancel.isVisible()){
     const resume=panel.getByRole('button',{name:'Resume subject mask',exact:true});
     if(await resume.isEnabled())await resume.click();
     await page.waitForFunction(()=>document.querySelector('.studio-subject-vfx')?.textContent.includes('Subject mask cancelled.')||
      document.querySelector('.studio-subject-vfx')?.textContent.includes('Subject mask failed.'),undefined,{timeout:30000}).catch(()=>{});
     if(await cancel.isVisible())await cancel.click();
    }
    await page.waitForFunction(()=>![...document.querySelectorAll('.studio-subject-vfx button')].some(e=>e.textContent==='Cancel mask request'),undefined,{timeout:30000});
   }
   const reset=panel.getByRole('button',{name:'Refine foreground selection',exact:true});
   if(await reset.isVisible())await reset.click();
   await panel.getByRole('button',{name:'Clear points',exact:true}).click();
   for(const [index,label]of ['left','top','right','bottom'].entries())
    await panel.getByLabel('Subject box '+label,{exact:true}).fill(String((secondSpeaker?[.42,.05,.99,1]:[.16,.15,.54,1])[index]));
   for(const [x,y]of (secondSpeaker?[[.69,.17],[.74,.57],[.9,.75]]:[[.34,.24],[.34,.55],[.33,.9]])){
    await panel.getByLabel('Subject point X',{exact:true}).fill(String(x));await panel.getByLabel('Subject point Y',{exact:true}).fill(String(y));
    await panel.getByRole('button',{name:'Add first-frame point',exact:true}).click();
   }
   const details=panel.locator('details').filter({has:page.locator('summary',{hasText:'Keep additional foreground objects'})});
   if(!await details.evaluate(e=>e.open))await details.locator('summary').click();
   while(await details.getByRole('button',{name:/^Remove component \d+$/}).count())await details.getByRole('button',{name:/^Remove component \d+$/}).last().click();
   const selections=secondSpeaker?[
    {box:[365,475,925,720],points:[[400,530,1],[650,520,1],[800,535,1],[410,650,1]]},
    {box:[800,335,935,570],points:[[875,385,1],[880,470,1],[890,520,1]]},
   ]:[
    {box:[125,410,690,720],points:[[145,600,1],[640,550,1],[155,495,1]]},
    {box:[515,385,825,720],points:[[800,550,1],[650,430,1],[700,450,1],[800,410,1]]},
    {box:[710,350,1040,720],points:[[900,500,1],[850,600,1],[760,550,1],[930,405,1],[690,460,0],[1050,500,0],[690,600,0]]},
    {box:[585,585,845,720],points:[[620,630,1],[770,650,1],[670,690,1],[687,710,1],[840,650,0]]},
    {box:[420,335,555,520],points:[[480,409,1],[490,465,1],[440,365,1]]},
   ];
   for(const selection of selections){
    await details.getByLabel('Object stays fixed in this shot',{exact:true}).check();
    for(const [index,label]of ['left','top','right','bottom'].entries())await details.getByLabel('Component box '+label,{exact:true}).fill(String(selection.box[index]/(index%2?720:1280)));
    for(const [x,y,label]of selection.points){
     await details.getByLabel('Component point X',{exact:true}).fill(String(x/1280));await details.getByLabel('Component point Y',{exact:true}).fill(String(y/720));
     await details.getByLabel('Keep component point',{exact:true}).setChecked(!!label);
     await details.getByRole('button',{name:'Add component point',exact:true}).click();
    }
    await details.getByRole('button',{name:'Add foreground component',exact:true}).click();
   }
   await h.save(page,outputName);
   await panel.getByRole('button',{name:'Create subject mask',exact:true}).click();
   await page.waitForFunction(()=>{
    const field=[...document.querySelectorAll('.studio-subject-vfx fieldset')].find(e=>e.querySelector('legend')?.textContent==='Subject mask');
    const button=field&&[...field.querySelectorAll('button')].find(e=>/^(Create subject mask|Resume subject mask|Subject mask attached)$/.test(e.textContent));
    return field?.textContent.includes('Subject mask saved.') || (button&&!button.disabled&&field.querySelector('[role=status]'));
   },undefined,{timeout:16*60000});
   assert((await panel.innerText()).includes('Subject mask saved.'),await panel.locator('fieldset [role=status]').innerText());
  }else if(action==='adopt-edges'){
   await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');
   if(secondSpeaker)await panel.getByLabel('Subject effect scene').selectOption({label:secondFile});
   await panel.getByRole('button',{name:'Resume subject mask',exact:true}).click();
   await panel.getByRole('button',{name:'Use saved mask for this edit',exact:true}).waitFor({timeout:90000});
   await panel.getByRole('button',{name:'Use saved mask for this edit',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.studio-subject-vfx')?.textContent.includes('Subject mask saved.'),undefined,{timeout:60000});
  }else if(action==='matte-edges'||action==='resume-edges'){
   await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');
   if(secondSpeaker)await panel.getByLabel('Subject effect scene').selectOption({label:secondFile});
   if(action==='resume-edges')await panel.getByRole('button',{name:'Resume subject mask',exact:true}).click();
   else{
    await panel.getByLabel('Edge refinement radius',{exact:true}).fill('10');
    await panel.getByRole('button',{name:'Refine saved mask edges',exact:true}).click();
   }
   const deadline=Date.now()+16*60000;
   while(Date.now()<deadline){
    const text=await panel.innerText();
    if(text.includes('Subject mask saved.')||text.includes('Subject mask failed.')||text.includes('saved mask is from an earlier edit'))break;
    // A UI polling window can expire before this bounded CPU job finishes.
    // Resume the exact retained request; never allocate a replacement job.
    const resume=panel.getByRole('button',{name:'Resume subject mask',exact:true});
    if(text.includes('Resume this saved request')&&await resume.isEnabled())await resume.click();
    await page.waitForTimeout(2000);
   }
   assert((await panel.innerText()).includes('Subject mask saved.'),await panel.locator('fieldset [role=status]').innerText());
  }else if(action==='use-alpha'){
   await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx'),select=panel.getByLabel('Subject effect scene');
   for(const value of await select.locator('option').evaluateAll(options=>options.map(o=>o.value))){
    await select.selectOption(value);
    // The saved refined artifact already contains the source holdouts. Preserve
    // its subpixel alpha; remove only photographed edge colour here.
    while(await panel.getByRole('group',{name:'Foreground holdout',exact:true}).count())await panel.getByRole('group',{name:'Foreground holdout',exact:true}).last().getByRole('button',{name:'Remove layer',exact:true}).click();
    const layers=panel.getByRole('group',{name:'Foreground matte refinement',exact:true});
    for(let index=0;index<await layers.count();index++){
     await layers.nth(index).getByLabel('choke',{exact:true}).fill('0');await layers.nth(index).getByLabel('edge radius',{exact:true}).fill('0');
    }
    await layers.last().getByLabel('decontaminate',{exact:true}).fill('1');
   }
  }else if(action==='frame'){
   const before=await h.save(page,outputName),timeline=page.getByTestId('studio-pro-timeline');
   const show=timeline.getByRole('button',{name:'Show motion keyframes',exact:true});if(await show.isVisible())await show.click();
   const expand=timeline.getByRole('button',{name:'Expand Source video keyframes',exact:true});if(await expand.isVisible())await expand.click();
   for(const key of before.snapshot.motionKeyframes.filter(key=>key.targetId==='main-video'&&key.property==='x'&&[0,4].includes(key.time))){
    await page.getByTestId('motion-timeline-key-'+key.id).click();
    await page.getByLabel('Selected motion key value',{exact:true}).fill('67.6');
   }
   const hide=timeline.getByRole('button',{name:'Hide motion keyframes',exact:true});if(await hide.isVisible())await hide.click();
  }else if(action==='clean-fragments'){
   await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');
   const refinements=panel.getByRole('group',{name:'Foreground matte refinement',exact:true});
   for(const [layer,box]of [[refinements.first(),[.07,.55,.145,.665]],[refinements.last(),[.65,0,1,1]]])
    for(const [index,edge]of ['left','top','right','bottom'].entries())await layer.getByLabel('clear box '+edge,{exact:true}).fill(String(box[index]));
   await h.save(page,outputName);await composeSubject(page);
  }else if(action==='second-torso'){
   await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');
   await panel.getByLabel('Subject effect scene').selectOption({label:secondFile});
   const holdout=panel.getByRole('group',{name:'Foreground holdout',exact:true}).last(),corners=[[.58,.50],[.82,.50],[.82,.95],[.58,.95]];
   for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)await holdout.getByLabel(`Holdout corner ${corner+1} ${axis===0?'X':'Y'}`,{exact:true}).fill(String(corners[corner][axis]));
   await h.save(page,outputName);await composeSubject(page);
  }else if(action==='clean'||action==='spill'||action==='compose-all'){
   await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');
   const select=panel.getByLabel('Subject effect scene'),values=await select.locator('option').evaluateAll(options=>options.map(o=>o.value));
   for(const value of values){
    await select.selectOption(value);
    if(action==='compose-all'){await composeSubject(page);await h.save(page,outputName);continue;}
    const refinements=panel.getByRole('group',{name:'Foreground matte refinement',exact:true});
    while(await refinements.count())await refinements.last().getByRole('button',{name:'Remove layer',exact:true}).click();
    const isSecond=(await select.locator('option:checked').innerText())===secondFile;
    if(action==='spill'){
     const filters=[{detail_box:isSecond?[.25,.55,.75,1]:[.50,.48,.85,.78],reject_hue:15,reject_tolerance:38,reject_saturation:.52,reject_value:.58,
       ...(isSecond?{}:{recover_box:[.10,.60,.54,1],recover_hue:210,hue_tolerance:30,saturation_min:.2})},
      {detail_box:isSecond?[.25,.55,.75,1]:[.50,.48,.85,.78],reject_hue:220,reject_tolerance:35,reject_saturation:.5,reject_value:.55}];
     for(const filter of filters){
      await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_refine');await panel.getByRole('button',{name:'Add layer',exact:true}).click();
      const layer=refinements.last();
      for(const[key,amount]of Object.entries({choke:0,feather:0,dark_max:0,...filter})){
       const label=key.replaceAll('_',' ');
       if(Array.isArray(amount))for(const[index,edge]of ['left','top','right','bottom'].entries())await layer.getByLabel(label+' '+edge,{exact:true}).fill(String(amount[index]));
       else await layer.getByLabel(label,{exact:true}).fill(String(amount));
      }
     }
    }
    await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_refine');
    await panel.getByRole('button',{name:'Add layer',exact:true}).click();
    for(const[label,amount]of Object.entries({choke:1,feather:0,'edge radius':4,decontaminate:1}))
     await refinements.last().getByLabel(label,{exact:true}).fill(String(amount));
    if(isSecond){
     if(!await panel.getByRole('group',{name:'Foreground holdout',exact:true}).count()){
      await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_holdout');
      await panel.getByRole('button',{name:'Add layer',exact:true}).click();
     }
     const holdout=panel.getByRole('group',{name:'Foreground holdout',exact:true}).last();
     const corners=[[.58,.50],[.82,.50],[.82,.95],[.58,.95]];
     for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)await holdout.getByLabel(`Holdout corner ${corner+1} ${axis===0?'X':'Y'}`,{exact:true}).fill(String(corners[corner][axis]));
     await holdout.getByLabel('feather',{exact:true}).fill('0');
    }
   }
  }else if(action==='edge'){
   await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');
   const refinements=panel.getByRole('group',{name:'Foreground matte refinement',exact:true});
   for(let index=0;index<await refinements.count();index++){
    await refinements.nth(index).getByLabel('choke',{exact:true}).fill('0');
    await refinements.nth(index).getByLabel('feather',{exact:true}).fill('0');
   }
   await refinements.first().getByLabel('clear box left',{exact:true}).fill('.54');
   await refinements.last().getByLabel('edge radius',{exact:true}).fill('4');
   await refinements.last().getByLabel('decontaminate',{exact:true}).fill('1');
   if(await panel.getByRole('group',{name:'Foreground holdout',exact:true}).count()<3){
    await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_holdout');
    await panel.getByRole('button',{name:'Add layer',exact:true}).click();
   }
   const torso=panel.getByRole('group',{name:'Foreground holdout',exact:true}).nth(2);
   const corners=[[.30,.55],[.51,.55],[.51,.78],[.30,.78]];
   for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)
    await torso.getByLabel(`Holdout corner ${corner+1} ${axis===0?'X':'Y'}`,{exact:true}).fill(String(corners[corner][axis]));
   await torso.getByLabel('feather',{exact:true}).fill('0');
   await h.save(page,outputName);
   await composeSubject(page);
  }else if(action==='detail'||action==='finish'){
   await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');
   const polygons=[[[.418,.626],[.614,.552],[.618,.566],[.419,.641]],
    [[.420,.682],[.615,.587],[.618,.603],[.420,.698]]];
   for(let i=0;i<polygons.length;i++){
    if(await panel.getByRole('group',{name:'Foreground holdout',exact:true}).count()<=i){
     await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_holdout');
     await panel.getByRole('button',{name:'Add layer',exact:true}).click();
    }
    const effect=panel.getByRole('group',{name:'Foreground holdout',exact:true}).nth(i);
    for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)
     await effect.getByLabel(`Holdout corner ${corner+1} ${axis===0?'X':'Y'}`,{exact:true}).fill(String(polygons[i][corner][axis]));
    await effect.getByLabel('feather',{exact:true}).fill('.25');
   }
   const refine=panel.getByRole('group',{name:'Foreground matte refinement',exact:true});
   await refine.first().getByLabel('dark max',{exact:true}).fill('.42');
   await refine.first().getByLabel('detail box bottom',{exact:true}).fill('.65');
   await refine.last().getByLabel('dark max',{exact:true}).fill('.38');
   console.log('Two microphone holdouts authored through native source-frame controls.');
   if(action==='finish'){
    await composeSubject(page);await h.save(page,outputName);
    await q.tool(page,'Sound');await page.getByLabel('Keep original audio',{exact:false}).check();
    await h.render(page,outputName);await view(page,outputName);
   }
  }else if(action==='refine'){
   await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');
   const corrections=JSON.parse(fs.readFileSync(path.join(folder,'authored-matte-corrections.json'))).effects;
   while(await panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).count()>corrections.length)
    await panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).last().getByRole('button',{name:'Remove layer',exact:true}).click();
   for(let index=0;index<corrections.length;index++){
    if(await panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).count()<=index){
     await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_refine');
     await panel.getByRole('button',{name:'Add layer',exact:true}).click();
    }
    const effect=panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).nth(index);
    for(const [key,value]of Object.entries(corrections[index]).filter(([key])=>!['id','type','start','end'].includes(key))){
     const label=key.replaceAll('_',' ');
     if(Array.isArray(value))for(let i=0;i<4;i++)await effect.getByLabel(label+' '+['left','top','right','bottom'][i],{exact:true}).fill(String(value[i]));
     else await effect.getByLabel(label,{exact:true}).fill(String(value));
    }
   }
  }else if(action==='compose'){
   await composeSubject(page);
  }else if(action==='inspect'){
   await page.waitForTimeout(4000);
   console.log(JSON.stringify(await page.locator('video').evaluateAll(videos=>videos.map(video=>({label:video.getAttribute('aria-label'),testid:video.dataset.testid,
    ready:video.readyState,error:video.error?.code,time:video.currentTime,host:video.currentSrc?new URL(video.currentSrc).hostname:null,paused:video.paused}))),null,2));
   console.log(JSON.stringify(await page.getByTestId('studio-after-video').evaluate(async video=>{
    try{const r=await fetch(video.currentSrc,{headers:{Range:'bytes=0-1023'}});return{sourceStatus:r.status,type:r.headers.get('content-type'),
     detail:r.ok?null:(await r.text()).replace(/https?:\/\/[^\s"<>]+/g,'[URL]').replace(/Signature=[^&\s<>]+/g,'Signature=[redacted]').slice(0,600)};}
    catch(e){return{sourceFetchError:e.message};}
   }),null,2));
   await page.screenshot({path:path.join(folder,'native-inspection.png')});
  }else if(action==='grade'){
   await q.tool(page,'Color');const rack=page.getByTestId('studio-finish-rack');
   await page.waitForFunction(()=>document.querySelector('[data-testid="studio-after-video"]')?.readyState>=2,undefined,{timeout:30000});
   await range(page.getByLabel('Edited output position',{exact:true}),2.5);
   const cdp=await context.newCDPSession(page),frames=[];let captureBytes=0;
   cdp.on('Page.screencastFrame',event=>{const data=Buffer.from(event.data,'base64');captureBytes+=data.length;
    if(captureBytes<=32*1024**2){const filename=path.join(folder,'grade-operation-'+String(frames.length).padStart(5,'0')+'.jpg');fs.writeFileSync(filename,data);frames.push({filename,at:Date.now()/1000});}
    void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId});});
   await cdp.send('Page.startScreencast',{format:'jpeg',quality:75,maxWidth:1600,maxHeight:1080,everyNthFrame:1});
   await rack.getByLabel('Precision RGB grade',{exact:true}).check();
   for(const [label,value]of Object.entries({Contrast:1.025,Saturation:.96,Warmth:-.14,Clarity:.06,Vignette:.025,
    'Exposure stops':.04,Lift:.002,Gamma:1.015,Gain:.985,Tint:0})){
      const control=rack.getByLabel(label,{exact:true});await control.scrollIntoViewIfNeeded();await control.hover();await range(control,value);await page.waitForTimeout(300);
    }
   await page.locator('.lut-import-button input[type=file]').setInputFiles(path.join(folder,'unmuted-charcoal-study-v1.cube'));
   await page.getByRole('button',{name:'Remove LUT',exact:true}).waitFor();
   await range(page.locator('label.inspector-range').filter({hasText:'LUT mix'}).locator('input'),75);
   await range(page.getByLabel('Edited output position',{exact:true}),2.5);
   await page.waitForTimeout(1000);
   const picture=await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'graded-native-candidate.png')});
   assert(picture.length>20000,'The grading preview has no usable picture; do not deliver this recording.');
   const stopped=Date.now()/1000;await cdp.send('Page.stopScreencast');assert(frames.length>2);
   const concat=path.join(folder,'grade-operations.ffconcat');fs.writeFileSync(concat,'ffconcat version 1.0\n'+frames.map((f,i)=>`file '${path.basename(f.filename)}'\nduration ${Math.max(.04,(frames[i+1]?.at||stopped)-f.at).toFixed(6)}\n`).join('')+`file '${path.basename(frames.at(-1).filename)}'\n`);
   execFileSync('ffmpeg',['-nostdin','-v','error','-safe','0','-i',concat,'-vf','fps=24','-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart','-y',path.join(folder,'grading-controls-in-studio.mp4')]);
   for(const frame of frames)fs.unlinkSync(frame.filename);fs.unlinkSync(concat);
  }else if(action==='sound'||action==='render'){
   await q.tool(page,'Sound');await page.getByLabel('Keep original audio',{exact:false}).check();
   // This private transformation study keeps the actual speech. No promotional
   // package or public permission is inferred from that local sound decision.
   if(outputName==='set-study'){
    const remove=page.getByRole('button',{name:'Remove Sound',exact:true});
    if(await remove.isVisible())await remove.click();
    else {const music=page.locator('label.inspector-range').filter({hasText:'Background volume'}).locator('input');
     if(await music.isVisible())await range(music,0);}
   }
   if(action==='render'){await h.render(page,outputName);await view(page,outputName);}
  }else if(action==='view'){
   await h.recover(page,outputName);await view(page,outputName);
  }else throw new Error('Unknown bounded Studio study action');
  const record=await h.save(page,outputName);assert.equal(hash((await project(page,baseId)).snapshot.studioDocument),baseline,'Original grade project changed');
  fs.writeFileSync(path.join(folder,'current-project.json'),JSON.stringify({projectId:record.id,projectHash:hash(record.snapshot.studioDocument),action,updatedAt:new Date().toISOString()},null,2));
  console.log(JSON.stringify({action,projectId:record.id,subjectScenes:record.snapshot.subjectVfxScenes.length,hasRealMask:!!record.snapshot.subjectVfxScenes[0]?.modelArtifactRef}));
 }catch(error){
  if(await page.getByTestId('studio-pro-timeline').isVisible().catch(()=>false))await h.save(page,outputName).catch(()=>{});
  await page.screenshot({path:path.join(folder,'native-failure.png')}).catch(()=>{});throw error;}
 finally{
  try{
  const current=await context.storageState({indexedDB:true}),latest=JSON.parse(fs.readFileSync(stateFile));
  const liveProjects=JSON.parse(JSON.stringify(await project(page)));
  for(const o of current.origins||[])for(const d of o.indexedDB||[])if(d.name==='autopromote-viral-studio')for(const s of d.stores||[])if(s.name==='projects'){
   const retained=latest.origins.find(x=>x.origin===o.origin)?.indexedDB?.find(x=>x.name===d.name)?.stores?.find(x=>x.name===s.name);
   const rows=new Map((retained?.records||[]).map(r=>[r.value.id,r]));
   // Undefined optional fields make Playwright use valueEncoded. Read the
   // actual saved JSON project values rather than assuming plain encoding.
   for(const value of liveProjects)rows.set(value.id,{value});s.records=[...rows.values()];
  }
  saveAuthenticatedState(current,stateFile);
  }finally{await browser.close();}
 }
}
main().catch(error=>{console.error(String(error.stack||error.name+': '+error.message).replace(/https?:\/\/[^\s"<>]+/g,'[URL]'));process.exitCode=1;});
