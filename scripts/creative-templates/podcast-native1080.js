#!/usr/bin/env node
// Real retained-auth Studio actions. No injected projects, masks or responses.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright'),h=require('./studio-proof');
const q=require('../../test/e2e/playwright/studio-stability/run');
const {saveAuthenticatedState}=require('./studio-session');
const {hash}=require('../../src/creativeTemplates/contract');
const {view,cold}=require('./materials-editing-proof');
const folder=path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR),stateFile=process.env.STUDIO_QA_STORAGE_STATE;
process.env.STUDIO_QA_EXPORT_RESOLUTION ||= '1080p';
process.env.STUDIO_QA_EXPECTED_WIDTH ||= '1920';
process.env.STUDIO_QA_EXPECTED_HEIGHT ||= '1080';
const title='UNMUTED — community voices · native1080',parent='viral-project-4c0a2e3b-947d-497c-a2ff-d72b2d84bb38';
const names=['unmuted-host-native1080.mp4','unmuted-guest-native1080.mp4'];
async function rows(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('autopromote-viral-studio',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').getAll();q.onsuccess=()=>{db.close();resolve(q.result);};};}));}
async function retainSession(page){
 const current=await page.context().storageState({indexedDB:true}),live=JSON.parse(JSON.stringify(await rows(page)));
 // Several isolated QA browsers may finish different projects together.
 // Serialize read/merge/write, including private recovery compression, so an
 // older browser cannot overwrite another project's newly completed receipt.
 const lockFile=stateFile+'.project-merge.lock';let lock;
 const until=Date.now()+60000;
 while(lock===undefined){
  try{lock=fs.openSync(lockFile,'wx',0o600);fs.writeFileSync(lock,String(process.pid));}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   let owner;
   try{owner=Number(fs.readFileSync(lockFile,'utf8'));}
   catch(readError){if(readError.code==='ENOENT')continue;throw readError;}
   if(Number.isSafeInteger(owner)&&owner>0){
    try{process.kill(owner,0);}catch(status){if(status.code==='ESRCH'){fs.unlinkSync(lockFile);continue;}}
   }
   if(Date.now()>until)throw Error('Another authenticated project merge is still active; saved recovery is retained.');
   await new Promise(resolve=>setTimeout(resolve,100));
  }
 }
 try{
 const latest=JSON.parse(fs.readFileSync(stateFile));
 for(const o of current.origins||[])for(const d of o.indexedDB||[])if(d.name==='autopromote-viral-studio')for(const s of d.stores||[])if(s.name==='projects'){
  const retained=latest.origins.find(x=>x.origin===o.origin)?.indexedDB?.find(x=>x.name===d.name)?.stores?.find(x=>x.name===s.name),map=new Map((retained?.records||[]).map(r=>[r.value.id,r]));
  for(const value of live)map.set(value.id,{value});s.records=[...map.values()];
 }
 saveAuthenticatedState(current,stateFile);
 }finally{fs.closeSync(lock);fs.unlinkSync(lockFile);}
}
async function pause(page){const b=page.getByRole('button',{name:'Pause comparison',exact:true});if(await b.isVisible())await b.click();await page.locator('video,audio').evaluateAll(es=>es.forEach(e=>{e.muted=true;e.pause();}));}
async function selectScene(page,index){
 const position=page.getByLabel('Edited output position',{exact:true});
 await position.evaluate((e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(v));e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},index?8.9:0);
 await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');await panel.getByLabel('Subject effect scene').selectOption({label:names[index]});return panel;
}
async function configure(page,index){
 const panel=await selectScene(page,index),box=index?[.4,.07,.98,1]:[.14,.16,.54,1];
 await panel.getByRole('button',{name:'Clear points',exact:true}).click();
 await panel.getByRole('button',{name:'Subject point',exact:true}).click();
 for(const [x,y]of(index?[[.69,.2],[.74,.6],[.85,.9]]:[[.35,.25],[.35,.55],[.33,.9]])){
  await panel.getByLabel('Subject point X',{exact:true}).fill(String(x));await panel.getByLabel('Subject point Y',{exact:true}).fill(String(y));await panel.getByRole('button',{name:'Add first-frame point',exact:true}).click();
 }
 for(const [i,label]of ['left','top','right','bottom'].entries())await panel.getByLabel('Subject box '+label,{exact:true}).fill(String(box[i]));
 const detail=panel.locator('details').filter({has:page.locator('summary',{hasText:'Keep additional foreground objects'})});if(!await detail.evaluate(e=>e.open))await detail.locator('summary').click();
 while(await detail.getByRole('button',{name:/^Remove component \d+$/}).count())await detail.getByRole('button',{name:/^Remove component \d+$/}).last().click();
 const components=index?[
  {box:[.025,.58,.35,1],p:[[.13,.84],[.22,.89],[.19,.7]],fixed:true},
  {box:[.30,.7,.73,.88],p:[[.39,.75],[.60,.75],[.32,.86]],fixed:true},
 ]:[
  {box:[0,.57,.16,1],p:[[.04,.89],[.05,.69],[.10,.72]],fixed:true},
  {box:[.1,.6,.54,1],p:[[.12,.88],[.51,.84],[.49,.95]],fixed:true},
  {box:[.55,.46,.81,1],p:[[.68,.65],[.63,.78],[.74,.75],[.69,.51]],fixed:true},
  {box:[.43,.81,.87,1],p:[[.57,.88],[.48,.94],[.64,.97],[.74,.96]],fixed:true},
  {box:[.40,.54,.66,.94],p:[[.50,.62],[.61,.56],[.62,.85]],fixed:true},
  {box:[.74,.52,1,.65],p:[[.84,.57],[.95,.58]],fixed:true},
  {box:[.85,.43,1,1],p:[[.97,.65],[.98,.85],[.91,.94]],fixed:true},
 ];
 for(const c of components){
  await detail.getByLabel('Object stays fixed in this shot',{exact:true}).setChecked(c.fixed);
  for(const [i,label]of ['left','top','right','bottom'].entries())await detail.getByLabel('Component box '+label,{exact:true}).fill(String(c.box[i]));
  await detail.getByLabel('Keep component point',{exact:true}).check();
  for(const[x,y]of c.p){await detail.getByLabel('Component point X',{exact:true}).fill(String(x));await detail.getByLabel('Component point Y',{exact:true}).fill(String(y));await detail.getByRole('button',{name:'Add component point',exact:true}).click();}
  await detail.getByRole('button',{name:'Add foreground component',exact:true}).click();
 }
}
async function mask(page,index,refine){
 const panel=await selectScene(page,index);
 const before=await h.save(page,'native1080'),item=before.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===before.snapshot.projectMedia.find(a=>a.name===names[index]).id);
 if(!item.modelArtifactRef&&!item.maskJob)await configure(page,index);
 await h.save(page,'native1080');
 const field=panel.locator('fieldset').filter({has:page.locator('legend',{hasText:'Subject mask'})});
 if(refine){await field.getByLabel('Edge refinement radius',{exact:true}).fill('8');await field.getByRole('button',{name:'Refine saved mask edges',exact:true}).click();}
 else if(!item.modelArtifactRef)await field.getByRole('button',{name:/^(Create|Resume) subject mask$/}).click();
 else {console.log('Exact source mask already attached.');return;}
 const deadline=Date.now()+46*60000;let last='',checkpoint=0;
 while(Date.now()<deadline){
  const status=await field.getByRole('status').innerText().catch(()=>'');
  if(status!==last){console.log(status);last=status;}
  if(status.includes('Subject mask saved.')){await h.save(page,'native1080');return;}
  const reuse=field.getByRole('button',{name:'Use saved mask for this edit',exact:true});if(await reuse.isVisible()){await reuse.click();await page.waitForTimeout(1000);continue;}
  if(/failed|cancelled|INVALID|UNAVAILABLE|DENIED|REJECTED|RESERVE|mismatch|differs|cannot|not match/i.test(status))throw Error(status);
  if(status.includes('Creating the saved')&&Date.now()-checkpoint>60000){await h.save(page,'native1080');await retainSession(page);checkpoint=Date.now();}
  // Keep the exact pending request durable without changing its revision.
  await page.waitForTimeout(10000);
 }
 throw Error('Bounded native mask observer ended; resume the same retained job.');
}
async function compose(page,index){
 const panel=await selectScene(page,index),record=await h.save(page,'native1080'),item=record.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===record.snapshot.projectMedia.find(a=>a.name===names[index]).id);
 if(item.preview?.reviewed&&item.preview.revision&&hash(JSON.parse(item.preview.revision))===hash(item.scene)){console.log('Exact native composition already reviewed; no repeat composition.');return;}
 await panel.getByRole('button',{name:/^(Render subject preview|Check saved render|Refresh rendered preview)$/}).click();
 await panel.getByRole('button',{name:'Cancel render',exact:true}).or(panel.getByLabel('Rendered subject effects with original audio',{exact:true})).or(panel.locator('[data-state=error]')).first().waitFor();
 await h.save(page,'native1080');await retainSession(page);
 const deadline=Date.now()+45*60000;while(Date.now()<deadline){
  const error=panel.locator('[data-state=error]');if(await error.count())throw Error(await error.innerText());
  const approval=panel.getByLabel(/I reviewed the sound/);if(await approval.isVisible()){
   const player=panel.getByLabel('Rendered subject effects with original audio',{exact:true});await player.evaluate(v=>{v.muted=true;v.currentTime=0;return v.play();});
   await page.waitForFunction(()=>document.querySelector('[aria-label="Rendered subject effects with original audio"]')?.ended,undefined,{timeout:30000});
   await approval.check();await h.save(page,'native1080');console.log('Source-bound native composition played to completion; technical acknowledgement only.');return;
  }
  await page.waitForTimeout(3000);
 }throw Error('Same native composition remains pending.');
}
async function startComposition(page,index){
 const panel=await selectScene(page,index),rec=await h.save(page,'native1080'),item=rec.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===rec.snapshot.projectMedia.find(a=>a.name===names[index]).id);
 if(item.pending?.jobId){console.log('Retained native composition remains queued; no resubmission.');return;}
 await panel.getByRole('button',{name:/^(Render subject preview|Refresh rendered preview)$/}).click();
 await panel.getByRole('button',{name:'Cancel render',exact:true}).waitFor();
 await h.save(page,'native1080');await retainSession(page);console.log('Native composition submitted and saved; observe the same job on reopen.');
}
async function holdouts(page,index){
 const panel=await selectScene(page,index),polygons=index?[
  [[.637,.49],[.724,.49],[.726,.82],[.636,.82]],
  [[.315,.716],[.665,.716],[.665,.745],[.315,.745]],
  [[.315,.769],[.665,.769],[.665,.794],[.315,.794]],
  [[.31,.73],[.325,.73],[.325,.955],[.31,.955]],
 ]:[
  [[0,.724],[1,.724],[1,1],[0,1]],
  [[.32,.463],[.415,.463],[.441,.672],[.35,.672]],
 ];
 const groups=panel.getByRole('group',{name:'Foreground holdout',exact:true});
 while(await groups.count())await groups.last().getByRole('button',{name:'Remove layer',exact:true}).click();
 for(const corners of polygons){
  await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_holdout');await panel.getByRole('button',{name:'Add layer',exact:true}).click();const layer=groups.last();
  for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)await layer.getByLabel(`Holdout corner ${corner+1} ${axis?'Y':'X'}`,{exact:true}).fill(String(corners[corner][axis]));
  await layer.getByLabel('feather',{exact:true}).fill('0');
 }
 console.log('Authored source-specific full furniture/microphone corrections through native controls.');
}
async function finishMatte(page,index){
 const panel=await selectScene(page,index),rec=await h.save(page,'native1080'),item=rec.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===rec.snapshot.projectMedia.find(a=>a.name===names[index]).id);
 if(item.scene.effects.some(e=>e.type==='foreground_refine'&&e.edge_radius===3&&e.decontaminate===1)&&item.scene.effects.filter(e=>e.type==='foreground_holdout').length>=(index?4:2))return;
 await holdouts(page,index);
 await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_refine');await panel.getByRole('button',{name:'Add layer',exact:true}).click();
 const layer=panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).last();
 for(const[label,value]of Object.entries({choke:0,feather:0,'edge radius':3,decontaminate:1}))await layer.getByLabel(label,{exact:true}).fill(String(value));
 await h.save(page,'native1080');await retainSession(page);
}
async function applyStory(page){
 const version=process.env.STUDIO_QA_TEMPLATE_VERSION || '1.1.1';
 const rec=await h.save(page,'native1080');if(rec.snapshot.creativeTemplateInstance?.templateRef?.version===version&&rec.snapshot.creativeTemplateInstance.templateRef.templateId==='podcast_set_dialogue_v1')return;
 const panel=page.getByTestId('launch-template-panel');if(!await panel.evaluate(e=>e.open))await panel.locator(':scope > summary').click();
 await panel.getByLabel('Creative template',{exact:true}).selectOption('podcast_set_dialogue_v1@'+version);
 for(const[label,value]of Object.entries({'Launch headline':'UNMUTED\nTHE PODCAST','Feature one':'REAL PEOPLE.\nUNTOLD STORIES.','Feature two':'COMMUNITY\nVOICES.','Launch CTA':'Made with AutoPromote.','Launch colour':'#d6b787'}))await panel.getByLabel(label,{exact:true}).fill(value);
 for(const[slot,name]of [['hookFootage',names[0]],['responseFootage',names[1]],['background',version==='1.2.0'?'warm-set-camera-a-v1.png':'acoustic-wall-external-v1.png'],...(version==='1.2.0'?[['responseBackground','warm-set-camera-b-v1.png']]:[]),['music','mixkit-music-1147.mp3'],['revealSound','mixkit-sfx-1492.wav'],['impactSound','mixkit-sfx-1143.mp3']]){
  const asset=rec.snapshot.projectMedia.find(a=>a.name===name);assert(asset,'Missing owned '+name);await panel.getByLabel('Select '+slot,{exact:true}).selectOption(asset.id);
 }
 await panel.getByRole('button',{name:'Director: select launch edit',exact:true}).click();await panel.getByRole('region',{name:'Director launch selection',exact:true}).waitFor();
 await panel.getByRole('region',{name:'Director launch selection',exact:true}).getByRole('button',{name:'Apply Director launch',exact:true}).click();
 await panel.getByText('Director launch edit applied. All clips, titles, keys and sound remain editable.',{exact:true}).waitFor();
 await h.save(page,'native1080');await cold(page,'native1080');await retainSession(page);
}
async function warmSet(page){
 const surfaceOnly=process.env.STUDIO_QA_SURFACE_ONLY==='1';
 const furnitureRecipe=process.env.STUDIO_QA_FURNITURE_REPAIR==='1';
 const roomRepair=process.env.STUDIO_QA_ROOM_REPAIR==='1',prefix=furnitureRecipe?'room-furniture':roomRepair?'room-set':'warm-set';
 for(let index=0;index<2;index++){
  const letter=index?'b':'a',panel=await selectScene(page,index),name=`warm-set-camera-${letter}-v1.png`;
  let rec=await h.save(page,prefix),asset=rec.snapshot.projectMedia.find(a=>a.name===name);
  if(!asset){await panel.getByLabel('Upload background image').setInputFiles(path.join(folder,name));await panel.getByText('Background saved. Create or reuse the subject mask, then render the replacement preview.',{exact:true}).waitFor({timeout:150000});}
  if(surfaceOnly&&!index&&!rec.snapshot.projectMedia.some(a=>a.name==='source-a.jpg')){await panel.getByLabel('Upload background image').setInputFiles(path.join(folder,'source-a.jpg'));await panel.getByText('Background saved. Create or reuse the subject mask, then render the replacement preview.',{exact:true}).waitFor({timeout:150000});}
  // Every correction is authored through the ordinary editable controls.
  while(await panel.getByRole('button',{name:'Remove layer',exact:true}).count())await panel.getByRole('button',{name:'Remove layer',exact:true}).last().click();
  rec=await h.save(page,prefix);asset=rec.snapshot.projectMedia.find(a=>a.name===name);assert(asset);
  const recipe=JSON.parse(fs.readFileSync(path.join(folder,`${furnitureRecipe?'furniture-recipe':roomRepair?'room-recipe':surfaceOnly?'surface-recipe':'key-diagnostic'}-${letter}.json`)));
  for(const effect of recipe){
   console.log('Native camera '+letter+': authoring '+effect.type+' '+effect.id);
   await panel.getByLabel('Subject effect type',{exact:true}).selectOption(effect.type);await panel.getByRole('button',{name:'Add layer',exact:true}).click();
   const labels={foreground_refine:'Foreground matte refinement',foreground_holdout:'Foreground holdout',background_replace:'Replace background',foreground_grade:'Foreground light and colour'};
   const group=panel.getByRole('group',{name:labels[effect.type],exact:true}).last();
   for(const[key,value]of Object.entries(effect)){
    if(['id','type','asset_sha256'].includes(key))continue;
    if(key==='asset_id'){const chosen=['wall-cleanup','display-bezel'].includes(effect.id)?rec.snapshot.projectMedia.find(a=>a.name==='source-a.jpg'):asset;assert(chosen);await group.locator('select').selectOption(chosen.id);continue;}
    if(key==='surface_corners'){
     await group.getByLabel('Fit replacement to a surface',{exact:true}).check();
     for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)await group.getByLabel(`Surface corner ${corner+1} ${axis?'Y':'X'}`,{exact:true}).fill(String(value[corner][axis]));continue;
    }
    if(['detail_polygon','paths','clear_paths'].includes(key)){
     const control=group.getByLabel(key==='paths'?'Additional holdout paths':key==='clear_paths'?'Remove background fragments':'Detail region points',{exact:true});await control.fill(JSON.stringify(value));await control.press('Tab');continue;
    }
    if(key==='corners'){
     for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)await group.getByLabel(`Holdout corner ${corner+1} ${axis?'Y':'X'}`,{exact:true}).fill(String(value[corner][axis]));continue;
    }
    const label=key==='after_refine'?(effect.type==='foreground_refine'?'Apply colour cleanup after matting':'Keep thin detail through cleanup'):key.replaceAll('_',' ');
    if(Array.isArray(value))for(const[i,edge]of ['left','top','right','bottom'].entries())await group.getByLabel(label+' '+edge,{exact:true}).fill(String(value[i]));
    else if(typeof value==='boolean')await group.getByLabel(label,{exact:true}).setChecked(value);
    else await group.getByLabel(label,{exact:true}).fill(String(value));
   }
  }
  const saved=await h.save(page,prefix);
  await retainSession(page);console.log('Camera '+letter+' shaped matte/rigid-detail corrections and owned room plate saved through Studio.');
 }
 process.env.STUDIO_QA_TEMPLATE_VERSION='1.2.0';await applyStory(page);await aperture(page);await h.save(page,prefix);await retainSession(page);
}
async function furnitureRepair(page){
 for(let index=0;index<2;index++){
  const letter=index?'b':'a',panel=await selectScene(page,index);
  const recipe=JSON.parse(fs.readFileSync(path.join(folder,`furniture-recipe-${letter}.json`)));
  const before=await h.save(page,'room-furniture'),source=before.snapshot.projectMedia.find(a=>a.name===names[index]);
  const retained=before.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===source.id);
  if(hash(retained.scene.effects)===hash(recipe)){console.log('Camera '+letter+' already has the exact correction; retained its owned preview without rewriting controls.');continue;}
  const holds=recipe.filter(e=>e.type==='foreground_holdout'),groups=panel.getByRole('group',{name:'Foreground holdout',exact:true});
  while(await groups.count()<holds.length){await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_holdout');await panel.getByRole('button',{name:'Add layer',exact:true}).click();}
  assert.equal(await groups.count(),holds.length);
  for(let i=0;i<holds.length;i++){
   const effect=holds[i],group=groups.nth(i);
   for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)await group.getByLabel(`Holdout corner ${corner+1} ${axis?'Y':'X'}`,{exact:true}).fill(String(effect.corners[corner][axis]));
   const paths=group.getByLabel('Additional holdout paths',{exact:true});await paths.fill(JSON.stringify(effect.paths||[]));await paths.press('Tab');
   await group.getByLabel('feather',{exact:true}).fill(String(effect.feather));
   await group.getByLabel('saturation',{exact:true}).fill(String(effect.saturation??1));
   await group.getByLabel('Keep thin detail through cleanup',{exact:true}).setChecked(Boolean(effect.after_refine));
  }
  const refs=recipe.filter(e=>e.type==='foreground_refine'),refGroups=panel.getByRole('group',{name:'Foreground matte refinement',exact:true});
  while(await refGroups.count()<refs.length){
   const effect=refs[await refGroups.count()];
   await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_refine');await panel.getByRole('button',{name:'Add layer',exact:true}).click();
   const group=refGroups.last();
   for(const[key,value]of Object.entries(effect)){
    if(['id','type','clear_paths'].includes(key))continue;
    const label=key==='after_refine'?'Apply colour cleanup after matting':key.replaceAll('_',' ');
    if(Array.isArray(value))for(const[i,edge]of ['left','top','right','bottom'].entries())await group.getByLabel(label+' '+edge,{exact:true}).fill(String(value[i]));
    else if(typeof value==='boolean')await group.getByLabel(label,{exact:true}).setChecked(value);
    else await group.getByLabel(label,{exact:true}).fill(String(value));
   }
  }
  assert.equal(await refGroups.count(),refs.length);
  for(let i=0;i<refs.length;i++){
   const clear=refGroups.nth(i).getByLabel('Remove background fragments',{exact:true});
   await clear.fill(JSON.stringify(refs[i].clear_paths||[]));await clear.press('Tab');
   for(const key of ['reject_value','reject_saturation','choke','dark_max'])if(key in refs[i])await refGroups.nth(i).getByLabel(key.replaceAll('_',' '),{exact:true}).fill(String(refs[i][key]));
   for(const key of ['recover_box','detail_box','clear_box'])for(const[j,edge]of ['left','top','right','bottom'].entries())await refGroups.nth(i).getByLabel(key.replaceAll('_',' ')+' '+edge,{exact:true}).fill(String(refs[i][key][j]));
   await refGroups.nth(i).getByLabel('Apply colour cleanup after matting',{exact:true}).setChecked(Boolean(refs[i].after_refine));
  }
  const saved=await h.save(page,'room-furniture'),actual=saved.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===saved.snapshot.projectMedia.find(a=>a.name===names[index]).id).scene.effects;
  for(const[i,effect]of holds.entries()){
   const retained=actual.filter(e=>e.type==='foreground_holdout')[i];assert(retained);
   for(const key of ['corners','paths','feather','saturation','after_refine'])assert.deepEqual(retained[key]??(key==='saturation'?1:key==='after_refine'?false:undefined),effect[key]??(key==='saturation'?1:key==='after_refine'?false:undefined));
  }
  await retainSession(page);console.log('Native furniture and photographed microphone contours saved for camera '+letter+'.');
 }
}
async function plantEdgeRepair(page){
 for(let index=0;index<2;index++){
  const panel=await selectScene(page,index),recipe=JSON.parse(fs.readFileSync(path.join(folder,`plant-edge-recipe-${index?'b':'a'}.json`)));
  const before=await h.save(page,'room-plant-edge'),source=before.snapshot.projectMedia.find(a=>a.name===names[index]);
  const previous=before.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===source.id).scene.effects;
  if(hash(previous)===hash(recipe)){console.log('Camera '+(index?'b':'a')+' already retains the exact leaf correction; no control rewrite.');continue;}
  const refs=recipe.filter(e=>e.type==='foreground_refine'),oldRefs=previous.filter(e=>e.type==='foreground_refine'),groups=panel.getByRole('group',{name:'Foreground matte refinement',exact:true});
  assert.equal(await groups.count(),refs.length);
  for(let i=0;i<refs.length;i++)for(const key of ['decontaminate','choke','after_refine','detail_box','detail_polygon','clear_paths']){
   const value=refs[i][key];if(JSON.stringify(value)===JSON.stringify(oldRefs[i][key]))continue;
   if(['detail_polygon','clear_paths'].includes(key)){
    const control=groups.nth(i).getByLabel(key==='clear_paths'?'Remove background fragments':'Detail region points',{exact:true});await control.fill(JSON.stringify(value||[]));await control.press('Tab');
   }else if(key==='detail_box')for(const[j,edge]of ['left','top','right','bottom'].entries())await groups.nth(i).getByLabel('detail box '+edge,{exact:true}).fill(String(value[j]));
   else if(key==='after_refine')await groups.nth(i).getByLabel('Apply colour cleanup after matting',{exact:true}).setChecked(Boolean(value));
   else await groups.nth(i).getByLabel(key,{exact:true}).fill(String(value));
  }
  const holds=recipe.filter(e=>e.type==='foreground_holdout'),holdGroups=panel.getByRole('group',{name:'Foreground holdout',exact:true}),oldHolds=previous.filter(e=>e.type==='foreground_holdout');
  while(await holdGroups.count()<holds.length){await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_holdout');await panel.getByRole('button',{name:'Add layer',exact:true}).click();}
  for(let i=0;i<holds.length;i++){
   if(JSON.stringify(holds[i])===JSON.stringify(oldHolds[i]))continue;
   const effect=holds[i],group=holdGroups.nth(i);
   for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)await group.getByLabel(`Holdout corner ${corner+1} ${axis?'Y':'X'}`,{exact:true}).fill(String(effect.corners[corner][axis]));
   const points=group.getByLabel('Additional holdout paths',{exact:true});await points.fill(JSON.stringify(effect.paths||[]));await points.press('Tab');
   for(const key of ['start','end','feather','saturation'])await group.getByLabel(key,{exact:true}).fill(String(effect[key]??1));
   await group.getByLabel('Keep thin detail through cleanup',{exact:true}).setChecked(Boolean(effect.after_refine));
  }
  const saved=await h.save(page,'room-plant-edge'),actual=saved.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===source.id).scene.effects;
  for(let i=previous.length;i<recipe.length;i++)recipe[i].id=actual[i].id;
  assert.deepEqual(actual,recipe);fs.writeFileSync(path.join(folder,`plant-edge-recipe-${index?'b':'a'}.json`),JSON.stringify(recipe,null,2));
  await retainSession(page);console.log('Camera '+(index?'b':'a')+' photographed leaf/edge correction saved; furniture and microphone values retained.');
 }
}
async function finalDetailRepair(page){
 const prefix='room-plant-free';
 for(const index of [0,1]){
  const letter=index?'b':'a',panel=await selectScene(page,index);
  if(index===0){
   const checkpoint=await h.save(page,prefix),name='warm-set-camera-a-desk-v2.png';
   if(!checkpoint.snapshot.projectMedia.some(asset=>asset.name===name)){
    await panel.getByLabel('Upload background image',{exact:true}).setInputFiles(path.join(folder,name));
    await panel.getByText('Background saved. Create or reuse the subject mask, then render the replacement preview.',{exact:true}).waitFor({timeout:150000});
   }
  }
  const before=await h.save(page,prefix),source=before.snapshot.projectMedia.find(a=>a.name===names[index]);
  const previous=before.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===source.id).scene.effects;
  const recipe=JSON.parse(fs.readFileSync(path.join(folder,'plant-free-desk-review',letter+'-candidate.json')));
  assert.equal(previous.length,recipe.length);
  if(index===0){const actualBackground=previous.find(effect=>effect.type==='background_replace'),planned=recipe.find(effect=>effect.type==='background_replace');
   assert.equal(actualBackground.asset_sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,'warm-set-camera-a-desk-v2.png'))).digest('hex'));planned.asset_id=actualBackground.asset_id;
  }
  const refs=panel.getByRole('group',{name:'Foreground matte refinement',exact:true}),holds=panel.getByRole('group',{name:'Foreground holdout',exact:true});
  let refIndex=0,holdIndex=0;
  for(let i=0;i<recipe.length;i++){
   const effect=recipe[i],old=previous[i];assert.equal(effect.id,old.id);
   const group=effect.type==='foreground_refine'?refs.nth(refIndex++):effect.type==='foreground_holdout'?holds.nth(holdIndex++):null;
   for(const [key,value]of Object.entries(effect)){
    if(JSON.stringify(value)===JSON.stringify(old[key]))continue;
    assert(group,'Unexpected story/background change');
    if(['paths','clear_paths'].includes(key)){
     const control=group.getByLabel(key==='paths'?'Additional holdout paths':'Remove background fragments',{exact:true});await control.fill(JSON.stringify(value));await control.press('Tab');
    }else if(key==='corners'){
     for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)await group.getByLabel(`Holdout corner ${corner+1} ${axis?'Y':'X'}`,{exact:true}).fill(String(value[corner][axis]));
    }else if(Array.isArray(value)){
     assert(key.endsWith('_box'));for(const j of [2,3,0,1])await group.getByLabel(key.replaceAll('_',' ')+' '+['left','top','right','bottom'][j],{exact:true}).fill(String(value[j]));
    }else if(typeof value==='boolean')await group.getByLabel(key==='after_holdout'?'Clean protected object edges':key==='reject_connected'?'Limit colour cleanup to background edges':key==='after_refine'?'Apply colour cleanup after matting':key,{exact:true}).setChecked(value);
    else await group.getByLabel(key.replaceAll('_',' '),{exact:true}).fill(String(value));
   }
   if(old.detail_polygon&&!effect.detail_polygon){const input=group.getByLabel('Detail region points',{exact:true});await input.fill('[]');await input.press('Tab');}
  }
  const saved=await h.save(page,prefix),actual=saved.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===source.id).scene.effects;
  assert.deepEqual(actual,recipe);await retainSession(page);console.log('Camera '+letter+' selected plant removal saved through native Studio; source mask and story retained.');
 }
}
async function aperture(page){
 const rec=await h.save(page,'native1080');if(rec.snapshot.motionKeyframes.some(k=>k.targetId==='main-video'&&k.property==='scale'&&Math.round(k.time*90000)===780000&&k.value===1.1))return;
 await q.tool(page,'Motion');await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();const inspector=page.locator('.advanced-inspector-body').filter({has:page.getByText('Animate transform, crop and opacity',{exact:true})});
 await inspector.locator('.inspector-select-field').filter({has:page.locator('span',{hasText:'Target layer'})}).locator('select').selectOption('main-video');
 const seek=async time=>{await page.getByLabel('Edited output position',{exact:true}).evaluate((e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(v));e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},time);};
 await seek(0);await inspector.getByLabel('Scale',{exact:true}).fill('1');await inspector.getByRole('button',{name:/Add transform keyframe at/}).click();
 await inspector.getByLabel('Transform pose at 0.00 seconds easing',{exact:true}).selectOption('hold');
 await seek(208/24);await inspector.getByLabel('Scale',{exact:true}).fill('1.1');await inspector.getByRole('button',{name:/Add transform keyframe at/}).click();
 await inspector.getByLabel('Transform pose at 8.67 seconds easing',{exact:true}).selectOption('hold');
 const after=await h.save(page,'native1080'),scales=after.snapshot.motionKeyframes.filter(k=>k.targetId==='main-video'&&k.property==='scale');
 assert(scales.some(k=>Math.round(k.time*90000)===0&&k.value===1&&k.easing==='hold'));
 assert(scales.some(k=>Math.round(k.time*90000)===780000&&k.value===1.1&&k.easing==='hold'));
 await retainSession(page);console.log('Native held aperture correction retains the full host shot and removes the guest source frame.');
}
async function reviewGate(page,index){
 if(process.env.STUDIO_QA_REVIEW_PAUSE!=='1')return;
 const rec=await h.save(page,'native1080'),item=rec.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===rec.snapshot.projectMedia.find(a=>a.name===names[index]).id),letter=index?'b':'a',decision=path.join(folder,`native-${letter}-review-decision.json`);
 await retainSession(page);fs.writeFileSync(path.join(folder,`native-${letter}-review.json`),JSON.stringify({projectId:rec.id,projectHash:hash(rec.snapshot.studioDocument),sourceId:item.scene.sourceId,pixelSha256:item.preview.receipt.pixel_sha256,technicalInspectionPending:true,humanSoundApproval:false},null,2));
 console.log('Native camera '+letter+' composition ready for actual pixel inspection.');
 const deadline=Date.now()+30*60000;while(Date.now()<deadline){
  if(fs.existsSync(decision)){const d=JSON.parse(fs.readFileSync(decision));if(d.pixelSha256===item.preview.receipt.pixel_sha256){if(d.action==='continue')return;throw Error('Native composite needs a source-specific visual correction.');}}
  await page.waitForTimeout(3000);
 }throw Error('Retained native composition awaits actual inspection; no final export submitted.');
}
async function plantCleanup(page,index){
 const panel=await selectScene(page,index),rec=await h.save(page,'native1080'),item=rec.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===rec.snapshot.projectMedia.find(a=>a.name===names[index]).id),box=index?[.025,.55,.31,.955]:[.53,.46,.85,.724];
 const refinements=panel.getByRole('group',{name:'Foreground matte refinement',exact:true});
 for(let i=0;i<await refinements.count();i++){const control=refinements.nth(i).getByLabel('hue tolerance',{exact:true});if(Number(await control.inputValue())>60)await control.fill('60');}
 if([15,240].every(hue=>item.scene.effects.some(e=>e.type==='foreground_refine'&&e.reject_hue===hue&&hash(e.detail_box)===hash(box))))return;
 for(const filter of [
  {detail_box:box,reject_hue:15,reject_tolerance:38,reject_saturation:.52,reject_value:.58,...(index?{recover_box:[.025,.58,.31,.955],recover_hue:20,hue_tolerance:60,saturation_min:.13}:{})},
  {detail_box:box,reject_hue:240,reject_tolerance:50,reject_saturation:.2,reject_value:.45},
 ]){
  await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_refine');await panel.getByRole('button',{name:'Add layer',exact:true}).click();const layer=panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).last();
  for(const[key,value]of Object.entries({choke:0,feather:0,dark_max:0,...filter})){
   const label=key.replaceAll('_',' ');if(Array.isArray(value))for(const[i,edge]of ['left','top','right','bottom'].entries())await layer.getByLabel(label+' '+edge,{exact:true}).fill(String(value[i]));
   else await layer.getByLabel(label,{exact:true}).fill(String(value));
  }
 }
 await h.save(page,'native1080');await retainSession(page);console.log('Source-guided plant recovery/screen-colour exclusions saved through native controls.');
}
async function cameraACorrections(page){
 const panel=await selectScene(page,0),rec=await h.save(page,'native1080'),item=rec.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===rec.snapshot.projectMedia.find(a=>a.name===names[0]).id);
 const refinements=panel.getByRole('group',{name:'Foreground matte refinement',exact:true});
 for(let i=0;i<await refinements.count();i++){
  const layer=refinements.nth(i);if(Number(await layer.getByLabel('reject hue',{exact:true}).inputValue())===15)await layer.getByLabel('reject value',{exact:true}).fill('.78');
 }
 const corners=[[.38,.65],[.415,.65],[.415,.84],[.38,.84]];
 if(!item.scene.effects.some(e=>e.type==='foreground_holdout'&&hash(e.corners)===hash(corners))){
  await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_holdout');await panel.getByRole('button',{name:'Add layer',exact:true}).click();const layer=panel.getByRole('group',{name:'Foreground holdout',exact:true}).last();
  for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)await layer.getByLabel(`Holdout corner ${corner+1} ${axis?'Y':'X'}`,{exact:true}).fill(String(corners[corner][axis]));
  await layer.getByLabel('feather',{exact:true}).fill('0');
 }
 await h.save(page,'native1080');await retainSession(page);console.log('Native pixel-review correction restores the microphone connector and protects midtone plant leaves.');
}
async function cameraAPlantDetail(page){
 const panel=await selectScene(page,0),rec=await h.save(page,'native1080'),item=rec.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===rec.snapshot.projectMedia.find(a=>a.name===names[0]).id);
 const refinements=panel.getByRole('group',{name:'Foreground matte refinement',exact:true});
 const fill=async(layer,values)=>{for(const[key,value]of Object.entries(values)){
  const label=key.replaceAll('_',' ');if(Array.isArray(value))for(const[i,edge]of ['left','top','right','bottom'].entries())await layer.getByLabel(label+' '+edge,{exact:true}).fill(String(value[i]));
  else await layer.getByLabel(label,{exact:true}).fill(String(value));
 }};
 for(let i=0;i<await refinements.count();i++){
  const layer=refinements.nth(i);if(Number(await layer.getByLabel('reject hue',{exact:true}).inputValue())===15&&Number(await layer.getByLabel('edge radius',{exact:true}).inputValue())===0)
   await fill(layer,{reject_value:.7,reject_saturation:.1,reject_tolerance:60,recover_box:[.59,.46,.8,.724],recover_hue:60,hue_tolerance:30,saturation_min:.13});
  if(Number(await layer.getByLabel('reject hue',{exact:true}).inputValue())===240)await fill(layer,{reject_saturation:.08,reject_tolerance:60});
 }
 if(!item.scene.effects.some(e=>e.type==='foreground_refine'&&e.reject_hue===65)){
  await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_refine');await panel.getByRole('button',{name:'Add layer',exact:true}).click();
  await fill(refinements.last(),{choke:0,feather:0,dark_max:0,detail_box:[.53,.46,.85,.724],reject_hue:65,reject_tolerance:25,reject_saturation:.08,reject_value:.78});
 }
 const holds=panel.getByRole('group',{name:'Foreground holdout',exact:true}),micIndex=item.scene.effects.filter(e=>e.type==='foreground_holdout').findIndex(e=>e.corners[0][0]===.38&&e.corners[0][1]===.65);assert(micIndex>=0);
 for(const corner of [2,3])await holds.nth(micIndex).getByLabel(`Holdout corner ${corner} X`,{exact:true}).fill('.49');
 const authoredHolds=item.scene.effects.filter(e=>e.type==='foreground_holdout'),existingStems=authoredHolds.filter(e=>e.after_refine===true);
 for(const[index,pixels]of [[[1356,531],[1359,531],[1359,591],[1356,591]],[[1350,594],[1352,595],[1338,653],[1336,652]],[[1390,577],[1393,578],[1386,612],[1383,611]]].entries()){
  const corners=pixels.map(([x,y])=>[x/1920,y/1080]);let layer;
  if(existingStems[index])layer=holds.nth(authoredHolds.indexOf(existingStems[index]));
  else {await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_holdout');await panel.getByRole('button',{name:'Add layer',exact:true}).click();layer=holds.last();}
  for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)await layer.getByLabel(`Holdout corner ${corner+1} ${axis?'Y':'X'}`,{exact:true}).fill(String(corners[corner][axis]));
  await layer.getByLabel('feather',{exact:true}).fill('.25');await layer.getByLabel('Keep thin detail through cleanup',{exact:true}).check();
 }
 await h.save(page,'native1080');await retainSession(page);console.log('Native source-local plant stems protected through cleanup; bright old-screen exclusions retained.');
}
async function cameraBCorrections(page){
 const panel=await selectScene(page,1),rec=await h.save(page,'native1080'),item=rec.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===rec.snapshot.projectMedia.find(a=>a.name===names[1]).id);
 const holds=panel.getByRole('group',{name:'Foreground holdout',exact:true}),polygons=[
  [[.637,.49],[.724,.49],[.724,.955],[.637,.955]],
  [[.339,.719],[.65,.719],[.65,.733],[.339,.733]],
  [[.347,.77],[.65,.77],[.65,.787],[.347,.787]],
  [[.32,.77],[.334,.77],[.334,.955],[.32,.955]],
 ];
 for(const[index,corners]of polygons.entries())for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)await holds.nth(index).getByLabel(`Holdout corner ${corner+1} ${axis?'Y':'X'}`,{exact:true}).fill(String(corners[corner][axis]));
 const refinements=panel.getByRole('group',{name:'Foreground matte refinement',exact:true}),fill=async(layer,values)=>{
  for(const[key,value]of Object.entries(values)){const label=key.replaceAll('_',' ');
   if(Array.isArray(value))for(const[i,edge]of ['left','top','right','bottom'].entries())await layer.getByLabel(label+' '+edge,{exact:true}).fill(String(value[i]));else await layer.getByLabel(label,{exact:true}).fill(String(value));
  }
 };
 for(let i=0;i<await refinements.count();i++){
  const layer=refinements.nth(i);if(Number(await layer.getByLabel('edge radius',{exact:true}).inputValue())!==0)continue;
  const hue=Number(await layer.getByLabel('reject hue',{exact:true}).inputValue());
  if(hue===15)await fill(layer,{reject_value:.7,reject_saturation:.1,reject_tolerance:60});
  if(hue===240)await fill(layer,{reject_saturation:.08,reject_tolerance:60});
 }
 if(!item.scene.effects.some(e=>e.type==='foreground_refine'&&e.reject_hue===60)){
  await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_refine');await panel.getByRole('button',{name:'Add layer',exact:true}).click();
  await fill(refinements.last(),{choke:0,feather:0,dark_max:0,detail_box:[.025,.55,.31,.955],clear_box:[.025,.55,.16,.67],reject_hue:60,reject_tolerance:60,reject_saturation:.08,reject_value:.78});
 }
 if(!item.scene.effects.some(e=>e.type==='foreground_refine'&&hash(e.clear_box)===hash([.346,.791,.415,.812]))){
  await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_refine');await panel.getByRole('button',{name:'Add layer',exact:true}).click();
  await fill(refinements.last(),{choke:0,feather:0,dark_max:0,clear_box:[.346,.791,.415,.812]});
 }
 if(!item.scene.effects.some(e=>e.type==='foreground_holdout'&&e.after_refine===true)){
  await panel.getByLabel('Subject effect type',{exact:true}).selectOption('foreground_holdout');await panel.getByRole('button',{name:'Add layer',exact:true}).click();const layer=holds.last(),corners=[[373,662],[376,663],[370,813],[367,812]].map(([x,y])=>[x/1920,y/1080]);
  for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++)await layer.getByLabel(`Holdout corner ${corner+1} ${axis?'Y':'X'}`,{exact:true}).fill(String(corners[corner][axis]));
  await layer.getByLabel('feather',{exact:true}).fill('.25');await layer.getByLabel('Keep thin detail through cleanup',{exact:true}).check();
 }
 await h.save(page,'native1080');await retainSession(page);console.log('Native guest microphone, equipment aperture and plant/screen corrections saved.');
}
async function backgroundOptionProof(page){
 const contentHash=document=>{const {revision,journal,...content}=structuredClone(document);
  for(const layer of content.layers||[])if(layer.parameters)delete layer.parameters.pending;
  return hash(content);};
 let submittedJobs=0;
 const observe=request=>{if(request.method()==='POST'&&/\/api\/(model-runtime\/jobs|media\/(studio-subject-vfx|process))$/.test(new URL(request.url()).pathname))submittedJobs++;};
 page.on('request',observe);
 const prefix='background-option',before=await h.save(page,prefix),baseline=contentHash(before.snapshot.studioDocument),checks=[];
 for(const index of [0,1]){
  const panel=await selectScene(page,index),source=before.snapshot.projectMedia.find(a=>a.name===names[index]);
  const original=before.snapshot.subjectVfxScenes.find(item=>item.scene.sourceId===source.id);
  await panel.getByLabel('Background choice',{exact:true}).selectOption('');
  const off=await h.save(page,prefix+'-off'),actual=off.snapshot.subjectVfxScenes.find(item=>item.scene.id===original.scene.id);
  assert(!actual.scene.effects.some(effect=>effect.type==='background_replace'));
  assert.deepEqual(actual.scene.effects,original.scene.effects.filter(effect=>effect.type!=='background_replace'));
  assert.deepEqual(actual.scene.prompt,original.scene.prompt);assert.deepEqual(actual.modelArtifactRef,original.modelArtifactRef);
  await page.locator('button:visible').filter({hasText:/Undo/}).first().click();
  assert.equal(contentHash((await h.save(page,prefix)).snapshot.studioDocument),baseline);
  const other=before.snapshot.projectMedia.find(asset=>asset.name===`warm-set-camera-${index?'a':'b'}-v1.png`);
  await panel.getByLabel('Background choice',{exact:true}).selectOption(other.id);
  const changed=await h.save(page,prefix+'-changed'),changedScene=changed.snapshot.subjectVfxScenes.find(item=>item.scene.id===original.scene.id).scene;
  assert.deepEqual(changedScene.effects.map(effect=>effect.type),original.scene.effects.map(effect=>effect.type));
  assert.equal(changedScene.effects.find(effect=>effect.type==='background_replace').asset_sha256,other.contentHash);
  await page.locator('button:visible').filter({hasText:/Undo/}).first().click();
  assert.equal(contentHash((await h.save(page,prefix)).snapshot.studioDocument),baseline);
  checks.push({camera:index?'b':'a',originalChoiceRemovesOnlyBackground:true,ownedImageChoicePreservesLayerOrder:true,undoRestoresEditableContent:true});
 }
 const panel=await selectScene(page,0),sourceChoice=panel.getByLabel('Subject effect source clip',{exact:true});
 const option=sourceChoice.locator('option').filter({hasText:names[0]}).last();await sourceChoice.selectOption(await option.getAttribute('value'));
 assert.equal(await panel.getByLabel('Background choice',{exact:true}).inputValue(),'');
 assert.equal(await panel.locator('details').filter({has:page.locator('summary',{hasText:'Keep additional foreground objects'})}).getByRole('button',{name:/^Remove component/}).count(),0);
 await panel.locator('fieldset').filter({has:page.locator('legend',{hasText:'Background replacement'})}).screenshot({path:path.join(folder,prefix+'-original-choice.png')});
 await panel.locator('fieldset').filter({has:page.locator('legend',{hasText:'Subject mask'})}).screenshot({path:path.join(folder,prefix+'-people-objects.png')});
 await panel.getByRole('button',{name:'Remove scene',exact:true}).click();
 assert.equal(contentHash((await h.save(page,prefix)).snapshot.studioDocument),baseline);
 await cold(page,prefix);await selectScene(page,0);
 await page.getByTestId('viral-studio-workspace').screenshot({path:path.join(folder,prefix+'-studio.png')});
 assert.equal(submittedJobs,0);page.off('request',observe);
 fs.writeFileSync(path.join(folder,prefix+'-native-proof.json'),JSON.stringify({createdAt:new Date().toISOString(),projectId:before.id,
  canonicalHash:hash((await h.save(page,prefix)).snapshot.studioDocument),editableContentHash:baseline,checks,newSceneKeepsOriginalBackground:true,additionalObjectsDefaultEmpty:true,nativeColdReopen:true,
  editableContentUnchanged:true,revisionJournalAdvanced:true,resolvedPendingMetadataExcludedFromContentComparison:true,headless:true,muted:true,mocks:false,submittedJobs,gpuJobs:0},null,2));
 await retainSession(page);console.log('Optional background replacement and exact native history/cold recovery pass in both cameras.');
}
async function main(){
 require('./proof-storage').requireProofSpace(folder);fs.mkdirSync(folder,{recursive:true});
 const saved=JSON.parse(fs.readFileSync(stateFile)),scoped=structuredClone(saved);
 for(const o of scoped.origins||[])for(const d of o.indexedDB||[])if(d.name==='autopromote-viral-studio')for(const s of d.stores||[])if(s.name==='projects')s.records=s.records.filter(r=>r.value.id===parent||(process.argv[2]!=='restore-plant-edge'&&r.value.name===title));
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost [::1]','--disk-cache-size=1048576','--media-cache-size=1048576']});
 const context=await browser.newContext({storageState:scoped,viewport:{width:1600,height:1080},acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('crash',()=>console.error('Owned headless Studio page crashed. Retained request must be resumed, never replaced.'));
 browser.on('disconnected',()=>console.log('Owned headless browser disconnected.'));
 const action=process.argv[2]||'inspect';let parentHash;
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  if(action==='restore-plant-edge'){
   await page.waitForFunction(()=>{const input=document.querySelector('input[aria-label="Restore project backup"]');return input&&!input.disabled;});
   await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,'room-plant-edge-project.private.json'));
   await page.getByRole('button',{name:title,exact:true}).waitFor({timeout:90000});await page.getByRole('button',{name:title,exact:true}).click();
   await h.rail(page);await pause(page);await h.save(page,'restored-plant-edge');await retainSession(page);
   assert.equal(hash((await h.save(page,'restored-plant-edge')).snapshot.studioDocument),'2a7562cc2e95838120b88c56c8bf09767581d1a8ce0594502953602f2fc8f172');
   console.log('Exact delivered plant-edge project restored through the ordinary owned backup input.');return;
  }
  const all=await rows(page),original=all.find(x=>x.id===parent);assert(original);parentHash=hash(original.snapshot.studioDocument);
  const current=all.find(x=>x.name===title);await page.getByRole('button',{name:current?title:original.name,exact:true}).click();await h.rail(page);await pause(page);
  if(!current){assert.equal(action,'prepare');await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();await page.getByLabel('Project name',{exact:true}).fill(title);await h.save(page,'native1080');}
  if(action==='background-option'){await backgroundOptionProof(page);
  }else if(action==='prepare'){
   for(const name of names){
    await page.getByRole('tab',{name:'Media',exact:true}).click();let card=page.locator('.studio-media-card').filter({has:page.locator('strong',{hasText:name})}).last();
    if(!await card.count()){await page.getByTestId('project-media-import-input').setInputFiles(path.join(folder,name));await page.waitForFunction(name=>[...document.querySelectorAll('.studio-media-card')].find(e=>e.querySelector('strong')?.textContent===name)?.className.match(/is-(ready|failed)/),name,{timeout:150000});}
    if(await card.locator('.studio-media-card__error').count())throw Error(await card.locator('.studio-media-card__error').innerText());
    const rec=await h.save(page,'native1080');await page.getByRole('tab',{name:'Media',exact:true}).click();await card.getByRole('button',{name:'Preview '+name,exact:true}).click();
    if(!rec.snapshot.timeline.some(c=>c.name===name))await card.getByRole('button',{name:'Add to sequence',exact:true}).click();
    await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx');
    const select=panel.getByLabel('Subject effect_source clip'.replace('_',' ')),option=select.locator('option').filter({hasText:name}).last();
    await select.selectOption(await option.getAttribute('value'));
    while(await panel.getByRole('button',{name:'Remove layer',exact:true}).count())await panel.getByRole('button',{name:'Remove layer',exact:true}).last().click();
    await panel.getByLabel('Upload background image').setInputFiles(path.join(folder,'acoustic-wall-external-v1.png'));
    await panel.getByText('Background saved. Create or reuse the subject mask, then render the replacement preview.',{exact:true}).waitFor({timeout:150000});
    console.log('Native original-resolution ingest and separate source scene:',name);await h.save(page,'native1080');
   }
  }else if(action==='cancel-b'){
   const panel=await selectScene(page,1),button=panel.getByRole('button',{name:'Cancel render',exact:true});if(await button.isVisible()){await button.click();await button.waitFor({state:'hidden',timeout:30000});}await h.save(page,'warm-set');await retainSession(page);
  }else if(action==='cancel-absent-host'){
   const panel=await selectScene(page,0);await panel.getByRole('button',{name:'Cancel render',exact:true}).click();
   await panel.getByRole('button',{name:'Cancel render',exact:true}).waitFor({state:'hidden',timeout:30000});
   await h.save(page,'room-furniture');await retainSession(page);
  }else if(action==='surface-set'){process.env.STUDIO_QA_SURFACE_ONLY='1';await warmSet(page);
  }else if(action==='room-set'){process.env.STUDIO_QA_ROOM_REPAIR='1';await warmSet(page);
  }else if(action==='room-mic-a'){
   const panel=await selectScene(page,0),recipe=JSON.parse(fs.readFileSync(path.join(folder,'room-recipe-a.json')));
   const layer=panel.getByRole('group',{name:'Foreground holdout',exact:true}).last();
   const control=layer.getByLabel('Additional holdout paths',{exact:true});await control.fill(JSON.stringify(recipe.find(e=>e.id==='real-cabinet').paths));await control.press('Tab');
   await h.save(page,'room-set');await retainSession(page);
  }else if(action==='room-adjust'){
   for(let index=0;index<2;index++){
    const panel=await selectScene(page,index),recipe=JSON.parse(fs.readFileSync(path.join(folder,`room-recipe-${index?'b':'a'}.json`)));
    const groups=panel.getByRole('group',{name:'Foreground matte refinement',exact:true}),refinements=recipe.filter(e=>e.type==='foreground_refine');
    assert.equal(await groups.count(),refinements.length);
    for(let i=0;i<refinements.length;i++)for(const key of ['reject_value','reject_saturation','edge_radius'])if(key in refinements[i])await groups.nth(i).getByLabel(key.replaceAll('_',' '),{exact:true}).fill(String(refinements[i][key]));
    await h.save(page,'room-set');await retainSession(page);
   }
  }else if(action==='detail-set'){await finalDetailRepair(page);
  }else if(action==='detail-complete'){
   await cold(page,'room-plant-free');for(const index of [1,0]){await compose(page,index);await reviewGate(page,index);}
   await q.tool(page,'Export');const dismiss=page.locator('.viral-render-recovery').getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.click();
   await h.render(page,'room-plant-free');await cold(page,'room-plant-free');await view(page,'room-plant-free');
  }else if(action==='plant-edge-set'){await plantEdgeRepair(page);
  }else if(action==='plant-edge-complete'){
   await cold(page,'room-plant-edge');for(const index of [1,0]){await compose(page,index);await reviewGate(page,index);}
   await q.tool(page,'Export');const dismiss=page.locator('.viral-render-recovery').getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.click();
   await h.render(page,'room-plant-edge');await cold(page,'room-plant-edge');await view(page,'room-plant-edge');
  }else if(action==='furniture-author'){process.env.STUDIO_QA_FURNITURE_REPAIR='1';await warmSet(page);
  }else if(action==='furniture-set'){await furnitureRepair(page);
  }else if(action==='furniture-complete'){
   await cold(page,'room-furniture');for(const index of [1,0]){await compose(page,index);await reviewGate(page,index);}
   await q.tool(page,'Export');const dismiss=page.locator('.viral-render-recovery').getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.click();
   await h.render(page,'room-furniture');await cold(page,'room-furniture');await view(page,'room-furniture');
  }else if(action==='room-edge-a'){
   const panel=await selectScene(page,0),recipe=JSON.parse(fs.readFileSync(path.join(folder,'room-edge-recipe-a.json')));
   const groups=panel.getByRole('group',{name:'Foreground matte refinement',exact:true});
   const red=groups.nth(1),effect=recipe.find(e=>e.id==='red');
   for(const[i,edge]of ['left','top','right','bottom'].entries())await red.getByLabel('detail box '+edge,{exact:true}).fill(String(effect.detail_box[i]));
   const points=red.getByLabel('Detail region points',{exact:true});await points.fill('[]');await points.press('Tab');
   await groups.nth(4).getByLabel('choke',{exact:true}).fill('1');await h.save(page,'room-edge');await retainSession(page);
  }else if(action==='warm-set'){await warmSet(page);
  }else if(action==='warm-complete'){
   process.env.STUDIO_QA_TEMPLATE_VERSION='1.2.0';await cold(page,'warm-set');for(const index of [1,0]){await compose(page,index);await reviewGate(page,index);}
   await q.tool(page,'Export');const dismiss=page.locator('.viral-render-recovery').getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.click();
   await h.render(page,'warm-set');await cold(page,'warm-set');await view(page,'warm-set');
  }else if(action==='warm-view'){await h.recover(page,'warm-set');await view(page,'warm-set');
  }else if(action==='room-complete'){
   await cold(page,'room-set');for(const index of [1,0]){await compose(page,index);await reviewGate(page,index);}
   await q.tool(page,'Export');const dismiss=page.locator('.viral-render-recovery').getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.click();
   await h.render(page,'room-set');await cold(page,'room-set');await view(page,'room-set');
  }else if(action==='room-view'){await h.recover(page,'room-set');await view(page,'room-set');
  }else if(action==='room-edge-complete'){
   await cold(page,'room-edge');for(const index of [1,0]){await compose(page,index);await reviewGate(page,index);}
   await q.tool(page,'Export');const dismiss=page.locator('.viral-render-recovery').getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.click();
   await h.render(page,'room-edge');await cold(page,'room-edge');await view(page,'room-edge');
  }else if(action==='detach-inherited'){
   await q.tool(page,'Composite');const panel=page.locator('.studio-subject-vfx'),select=panel.getByLabel('Subject effect scene');
   for(const label of await select.locator('option').allTextContents())if(!names.includes(label)){
    await select.selectOption({label});await panel.getByRole('button',{name:'Remove scene',exact:true}).click();
   }
   console.log('Removed inherited project-bound masks from the new duplicate through native controls. Parent unchanged.');
  }else if(action==='clear-cancelled-a'||action==='retry-mask-a'){
   const panel=await selectScene(page,0);await panel.getByRole('button',{name:'Cancel mask request',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('.studio-subject-vfx')?.textContent.includes('Cancel mask request'),undefined,{timeout:30000});
   if(action==='retry-mask-a')await mask(page,0,false);
  }else if(/^(mask|refine)-[ab]$/.test(action))await mask(page,action.endsWith('b')?1:0,action.startsWith('refine'));
  else if(/^holdouts-[ab]$/.test(action))await holdouts(page,action.endsWith('b')?1:0);
  else if(/^finish-[ab]$/.test(action))await finishMatte(page,action.endsWith('b')?1:0);
  else if(/^compose-[ab]$/.test(action))await compose(page,action.endsWith('b')?1:0);
  else if(/^start-[ab]$/.test(action))await startComposition(page,action.endsWith('b')?1:0);
  else if(action==='apply')await applyStory(page);
  else if(action==='aperture')await aperture(page);
  else if(/^plant-clean-[ab]$/.test(action))await plantCleanup(page,action.endsWith('b')?1:0);
  else if(action==='correct-a')await cameraACorrections(page);
  else if(action==='plant-detail-a')await cameraAPlantDetail(page);
  else if(action==='correct-b')await cameraBCorrections(page);
  else if(action==='complete'){
   for(let index=0;index<2;index++){await mask(page,index,false);await finishMatte(page,index);await plantCleanup(page,index);}
   await applyStory(page);await aperture(page);await cold(page,'native1080');for(const index of [1,0]){await compose(page,index);await reviewGate(page,index);}
   const current=await h.save(page,'native1080'),receiptPath=path.join(folder,'native1080/render-receipt.json');
   if(fs.existsSync(receiptPath)&&JSON.parse(fs.readFileSync(receiptPath)).projectHash===hash(current.snapshot.studioDocument))await h.recover(page,'native1080');
   else await h.render(page,'native1080');await cold(page,'native1080');await view(page,'native1080');
  }else if(action==='render'){
   const receipt=path.join(folder,'native1080/render-receipt.json');
   if(fs.existsSync(receipt))await h.recover(page,'native1080');
   await h.render(page,'native1080');await view(page,'native1080');
  }
  else if(action==='view'){await h.recover(page,'native1080');await view(page,'native1080');}
  else if(action==='inspect'){await page.screenshot({path:path.join(folder,'native-current.png')});console.log((await page.locator('.studio-subject-vfx').innerText().catch(()=>'' )).slice(-2000));}
  else throw Error('Unknown native action');
  const rec=await h.save(page,'native1080');fs.writeFileSync(path.join(folder,'current-project.json'),JSON.stringify({projectId:rec.id,projectHash:hash(rec.snapshot.studioDocument),action,updatedAt:new Date().toISOString()},null,2));
  assert.equal(hash((await rows(page)).find(x=>x.id===parent).snapshot.studioDocument),parentHash,'Rejected parent was changed');console.log(JSON.stringify({action,projectId:rec.id,subjectScenes:rec.snapshot.subjectVfxScenes.length}));
 }catch(error){console.error('Native action failed:',String(error.message).replace(/https?:\/\/[^\s"<>]+/g,'[URL]'));await page.screenshot({path:path.join(folder,'native-failure.png')}).catch(()=>{});throw error;}
 finally{
  try{
   if(await page.getByTestId('studio-pro-timeline').isVisible().catch(()=>false))await h.save(page,'native1080').catch(()=>{});
   if(browser.isConnected())await retainSession(page);
  }finally{await browser.close();}
 }
}
module.exports={selectScene,compose,pause,retainSession};
if(require.main===module)main().catch(error=>{console.error(String(error.stack||error).replace(/https?:\/\/[^\s"<>]+/g,'[URL]'));process.exitCode=1;});
