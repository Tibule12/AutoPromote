#!/usr/bin/env node
// Normal signed-in Studio controls only. No graph, authentication or route writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),report=path.join(root,'reports/studio-restaurant-film-20261020'),folder=path.join(report,'proof');
Object.assign(process.env,{STUDIO_TEMPLATE_PROOF_DIR:folder,STUDIO_KINETIC_PROOF_DIR:folder,
 STUDIO_QA_EXPECTED_WIDTH:'1280',STUDIO_QA_EXPECTED_HEIGHT:'720',STUDIO_QA_EXPORT_FPS:'24',
 STUDIO_QA_NATIVE_DOWNLOAD_METHOD:'playwright',STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS:'1800000',STUDIO_QA_UPLOAD_BUDGET_MS:'300000',
 STUDIO_QA_TIMELINE_HEIGHT:'500',STUDIO_QA_HIDE_MEDIA:'1'});
const h=require('../creative-templates/studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {pause,seek,range}=require('./kinetic-type-proof'),{hash}=require('../../src/creativeTemplates/contract');
const items=JSON.parse(fs.readFileSync(path.join(root,'reports/studio-real-footage-20261018/sources.json'))).items;
const name='THE LAST TOUCH · restaurant picture edit · 20261020';
const statePath=path.join(folder,'progress.json'),state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath)):{};
const runtimeErrors=[];
const done=(k,v=true)=>{state[k]=v;fs.writeFileSync(statePath,JSON.stringify(state,null,2));};
const seconds=r=>r.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick/90000;
async function entry(page){await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click({timeout:180000});assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));const build=process.env.STUDIO_QA_APP_BUILD||'/dev/shm/autopromote-restaurant-20261020/build-r2';const bundle=fs.readdirSync(path.join(build,'static/js')).find(n=>/^main\..*\.js$/.test(n));assert((await page.locator('script[src*="/static/js/main."]').getAttribute('src')).endsWith(bundle),'The signed-in App must use this session’s actual strict build.');}
async function open(page,title=name){await page.getByRole('region',{name:'Saved Studio projects',exact:true}).getByRole('button',{name:title,exact:true}).click();await h.rail(page);await pause(page);}
async function source(page,id,action){
 await h.rail(page);await page.getByRole('tab',{name:'Media',exact:true}).click();
 const filename=path.basename(items.find(i=>i.assetId===id).path),card=page.getByTestId('project-media-library').locator('article').filter({has:page.getByRole('button',{name:`Preview ${filename}`,exact:true})});
 await card.getByRole('button',{name:`Preview ${filename}`,exact:true}).click();await card.getByRole('button',{name:action,exact:true}).click();await pause(page);
}
async function cutSeek(page,t,expected){await seek(page,t);if(expected!==undefined)await page.waitForFunction(t=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-t)<.09;},expected,{timeout:30000});}
async function motion(page,id){await q.tool(page,'Motion');await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();await page.getByLabel('Target layer',{exact:true}).selectOption(id);}
async function selectVisual(page,id){await q.tool(page,'Composite');await page.getByText('Composite target',{exact:true}).locator('..').locator('select').selectOption(id);}
async function forceNumber(input,value){const step=Number(await input.getAttribute('step'))||.1;if(Math.abs(Number(await input.inputValue())-value)<.00001)await input.fill(String(value===0?step:value-step));await input.fill(String(value));await input.blur();}
async function forceRange(input,value){if(Math.abs(Number(await input.inputValue())-value)<.00001)await range(input,value===0?.01:value-.01);await range(input,value);}
async function pose(page,values,easing='ease_in_out'){
 const [t,x,y,scale,rotation,opacity=1]=values;await seek(page,t);
 await page.getByRole('button',{name:/^◆ Add transform keyframe at/}).click();
 for(const [label,v]of [['X',x],['Y',y],['Scale',scale],['Rotate',rotation]])await forceNumber(page.getByRole('spinbutton',{name:label,exact:true}),v);
 await forceRange(page.getByRole('slider',{name:/^Opacity/}),opacity);
 const stamp=(await page.getByRole('button',{name:/^◆ Add transform keyframe at/}).innerText()).match(/at ([\d.]+)s/)[1];
 await page.getByLabel(`Transform pose at ${stamp} seconds easing`,{exact:true}).selectOption(easing);
}
async function cuts(page){
 assert(!fs.existsSync(path.join(folder,'native-edit.json')),'Preserve completed edit.');
 const projects=page.getByRole('region',{name:'Saved Studio projects',exact:true});await projects.waitFor();
 if(await projects.getByRole('button',{name,exact:true}).count())await open(page);
 else{await open(page,'Real footage · Kitchen · 20261018');await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));await page.getByLabel('Project name',{exact:true}).fill(name);await h.save(page,'new-project');}
 await q.tool(page,'Reframe');await page.getByTestId('reframe-aspect-16-9').click();await page.getByTestId('reframe-preserve-frame').click();
 await q.tool(page,'Color');const rounded=page.getByLabel('Rounded main footage',{exact:true});if(await rounded.count()&&await rounded.isChecked())await rounded.uncheck();
 await q.tool(page,'Sound');const repair=page.getByLabel('Use voice repair on export',{exact:true});if(await repair.isChecked())await repair.uncheck();
 if(!state.sourceInitialized){await source(page,'13261','Add to sequence');await q.tool(page,'Cut');await page.getByTestId('pro-video-clip-1').click();await page.getByTestId('inspector-cut-delete').click();await h.save(page,'initial-source');done('sourceInitialized');}
 await q.tool(page,'Cut');await page.getByRole('button',{name:'Clean Cut',exact:true}).click();
 const edl=JSON.parse(fs.readFileSync(path.join(report,'edit-decisions.json'))).shots;
 for(let i=state.cuts||0;i<edl.length;i++){
  const s=edl[i];let r=await h.save(page,`shot-${i}-before`);
  if(i>0&&r.snapshot.timeline.length===i)await source(page,s.assetId,'Add to sequence');
  await q.tool(page,'Cut');await page.getByTestId(`pro-video-clip-${i+1}`).click();r=await h.save(page,`shot-${i}-selected`);
  const a=Number(r.snapshot.timeline[i].startRequest||0);
  if(Math.abs(a-s.sourceIn)>.05){assert(a<s.sourceIn);await cutSeek(page,s.programmeIn+s.sourceIn-a,s.sourceIn);await page.getByTestId('inspector-cut-trim-start').click();}
  await cutSeek(page,s.programmeOut,s.sourceOut);await page.getByTestId('inspector-cut-trim-end').click();
  r=await h.save(page,`shot-${i}-complete`);const clip=r.snapshot.timeline[i];assert(Math.abs(Number(clip.startRequest||0)-s.sourceIn)<.05);assert(Math.abs(Number(clip.endRequest)-s.sourceOut)<.05);assert(Math.abs(seconds(r)-s.programmeOut)<.05);
  done('cuts',i+1);console.log(`Native kitchen cut ${i+1}/${edl.length}; ${seconds(r).toFixed(2)}s / ${s.label}.`);
 }
 const r=await h.save(page,'picture-cut');assert(Math.abs(seconds(r)-60)<1/24);assert.equal(r.snapshot.speedKeyframes.length,0);done('pictureCut',hash(r.snapshot.studioDocument));
}
async function finish(page){
 await open(page);const snap=page.getByTestId('studio-pro-timeline').getByRole('button',{name:'⌁ Snap',exact:true});if((await snap.getAttribute('class')||'').includes('is-on'))await snap.click();
 if(!state.graphics){await q.tool(page,'Graphics');const p=page.getByTestId('studio-graphics-import');if(!await p.evaluate(e=>e.open))await p.locator('summary').click();await page.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.join(report,'assets/restaurant.graphics.json'));await p.getByRole('status').waitFor();assert((await p.getByRole('status').innerText()).includes('imported.'),await p.innerText());await h.save(page,'graphics');done('graphics');}
 const photos=JSON.parse(fs.readFileSync(path.join(report,'photo-decisions.json')));
 for(let i=state.photos||0;i<photos.length;i++){
  const p=photos[i];let id=state.pendingPhoto?.index===i?state.pendingPhoto.id:null;
  if(!id){await seek(page,p.start);await q.tool(page,'B-roll');await page.getByTestId('visual-image-input').setInputFiles(path.join(report,'assets',p.file));const r=await h.save(page,`photo-${i}-added`);id=r.snapshot.overlays.at(-1).id;done('pendingPhoto',{index:i,id});}
  await q.tool(page,'B-roll');await page.getByRole('button',{name:p.fit==='cover'?'Fill frame':'Show all',exact:true}).click();await range(page.getByRole('slider',{name:'Frame corner curve',exact:true}),0);
  await motion(page,id);await page.getByLabel('Motion layer in point',{exact:true}).fill(String(p.start));await page.getByLabel('Motion layer duration',{exact:true}).fill(String(p.end-p.start));await page.getByLabel('Motion layer width',{exact:true}).fill(String(p.width));await page.getByLabel('Motion layer height',{exact:true}).fill(String(p.height));
  for(const values of p.poses)await pose(page,values);
  if(p.mask){await q.tool(page,'Composite');await page.getByText('Composite target',{exact:true}).locator('..').locator('select').selectOption(id);await page.getByRole('checkbox',{name:/Enable mask/}).check();await page.getByRole('button',{name:p.mask,exact:true}).click();}
  await seek(page,(p.start+p.end)/2);await q.tool(page,'Cut');await page.keyboard.press('Escape');await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`photo-${i}-review.png`)});
  await h.save(page,`photo-${i}-animated`);done('photos',i+1);done('pendingPhoto',null);console.log(`Native food photograph ${i+1}/${photos.length}.`);
 }
 if(!state.camera){
  await motion(page,'main-video');
  const poses=[[0,58,30,1.45,0],[2.46,57,31,1.42,0],[2.5,57,35,1.32,0],[4.96,55,38,1.26,0],
   [5,50,50,1,0],[8.96,50,50,1,0],[9,50,50,1.04,0],[11.96,50,49,1.08,0],
   [12,53,44,1.15,0],[14.96,52,43,1.18,0],[15,51,48,1.07,0],[17.46,50,47,1.1,0],
   [17.5,50,50,1,0],[27.46,50,50,1,0],[27.5,50,50,1,0],[29.96,50,49,1.04,0],
   [30,50,50,1,0],[32.96,53,44,1.15,0],[33,57,35,1.32,0],[35.96,55,37,1.28,0],
   [36,50,50,1,0],[42.96,50,50,1,0],[43,56,36,1.3,0],[45.96,55,38,1.26,0],
   [46,50,50,1,0],[48.46,50,50,1.03,0],[48.5,57,32,1.4,0],[50.96,56,34,1.36,0],
   [51,55,40,1.23,0],[53.46,55,39,1.25,0],[53.5,53,44,1.12,0],[55.96,52,45,1.1,0],
   [56,50,50,1,0],[59.98,50,50,1,0]];
  for(const p of poses)await pose(page,p,'linear');await h.save(page,'camera-animated');done('camera');console.log('Native camera framing saved.');
 }
 for(let i=state.dual||0;i<2;i++){
  let id=state.pendingDual?.index===i?state.pendingDual.id:null;
  if(!id){await seek(page,17.5);await source(page,i?'13258':'15875','Add as B-roll');const r=await h.save(page,`dual-${i}-added`);id=r.snapshot.overlays.at(-1).id;done('pendingDual',{index:i,id});}
  await q.tool(page,'B-roll');await page.getByRole('button',{name:'Picture-in-picture',exact:true}).click();await range(page.getByLabel('B-roll source start',{exact:true}),i?4:0);await range(page.getByRole('slider',{name:'Frame corner curve',exact:true}),0);
  await motion(page,id);await page.getByLabel('Motion layer in point',{exact:true}).fill('17.5');await page.getByLabel('Motion layer duration',{exact:true}).fill('5');await page.getByLabel('Motion layer width',{exact:true}).fill(i?'25':'61');await page.getByLabel('Motion layer height',{exact:true}).fill('64');
  const p=i?[[17.5,88,55,.7,0,0],[18.05,82,54,1,0,1],[21.9,82,54,1.03,0,1],[22.49,82,54,1,0,0]]:[[17.5,34,55,.92,0,1],[18,35,54,1,0,1],[21.9,35,54,1.02,0,1],[22.49,35,54,1,0,0]];
  for(const values of p)await pose(page,values);
  await h.save(page,`dual-${i}-animated`);done('dual',i+1);done('pendingDual',null);console.log(`Native moving kitchen panel ${i+1}/2.`);
 }
 if(!state.stroke){
  const r=await h.save(page,'before-draw-on');
  for(const layer of r.snapshot.overlays.filter(o=>o.vectorShape)){
   const a=layer.startTime;await motion(page,layer.id);
   for(const [t,v]of [[a,0],[a+.9,100],[a+3.8,100]]){
    await seek(page,t);const input=page.getByLabel('Stroke end',{exact:true});await input.fill(String(v));await input.blur();
    const add=page.getByRole('button',{name:'Add stroke end key at playhead',exact:true});if(await add.count())await add.click();
   }
  }
  await h.save(page,'plate-outlines-animated');done('stroke');console.log('Native plate-outline draw-on saved.');
 }
 if(!state.sound){
  const wav=path.join(report,'assets/Last-Touch-original-score.wav'),mp3=path.join(report,'assets/Last-Touch-original-score.mp3');
  if(!fs.existsSync(mp3))execFileSync('ffmpeg',['-v','error','-y','-i',wav,'-c:a','libmp3lame','-q:a','2',mp3]);
  await q.tool(page,'Sound');await page.getByTestId('background-sound-input').setInputFiles(mp3);
  for(const label of ['Keep original audio','Duck under speech','Loop for the full clip']){const e=page.getByLabel(label,{exact:false});if(await e.isChecked())await e.uncheck();}
  await range(page.locator('.inspector-range').filter({hasText:'Background volume'}).locator('input[type=range]'),60);await range(page.getByLabel('Music fade in',{exact:true}),0);await range(page.getByLabel('Music fade out',{exact:true}),1.4);
  await page.getByLabel('Automation source',{exact:true}).selectOption('music');
  for(const [t,v]of [[0,80],[4.9,80],[5.1,62],[8.8,62],[9,100],[22.4,100],[22.6,65],[27.3,65],[27.5,100],[35.8,100],[36.1,55],[39.7,55],[40,100],[55.8,100],[56.2,64],[59.98,64]]){
   await seek(page,t);const add=page.getByRole('button',{name:/^◆ Add volume keyframe at/}),stamp=(await add.innerText()).match(/at ([\d.]+)s/)[1];await add.click();await range(page.getByLabel(`music volume at ${stamp} seconds`,{exact:true}),v);
  }
  await h.save(page,'music-designed');done('sound');console.log('Original native score and gain automation saved.');
 }
 const cues=[['plate',.08,32],['slice',2.5,27],['paper',4.85,21],['plate',5.2,24],['slice',9.6,23],['slice',12.3,22],['pour',15.35,25],['paper',17.35,22],['plate',18.7,22],['paper',22.35,24],['paper',22.88,17],['slice',27.7,22],['plate',30.25,25],['pour',33.4,22],['paper',35.85,22],['paper',36.15,16],['paper',36.3,16],['paper',39.65,22],['plate',40.1,23],['slice',43.2,19],['plate',46.15,22],['pour',49.2,22],['slice',51.2,19],['plate',53.7,24],['paper',55.85,23],['plate',56.3,26]];
 await q.tool(page,'Sound');const present=await page.locator('.sound-effect-chip').count();
 for(let i=Math.min(state.cues||0,present);i<cues.length;i++){
  const [kind,t,v]=cues[i];await q.tool(page,'Sound');if(i<await page.locator('.sound-effect-chip').count())await page.locator('.sound-effect-chip').nth(i).click();else await page.getByTestId('sound-effect-input').setInputFiles(path.join(report,`assets/${kind}-original.wav`));
  await page.getByTestId('sound-effect-start').fill(String(t));await page.getByTestId('sound-effect-start').blur();await range(page.getByTestId('sound-effect-volume'),v);await range(page.getByTestId('sound-effect-fade-out'),.04);
  if(i%6===5||i===cues.length-1)await h.save(page,`cue-${i}`);done('cues',i+1);console.log(`Native kitchen sound ${i+1}/${cues.length}.`);
 }
 await q.tool(page,'Color');const rack=page.getByTestId('studio-finish-rack');await range(rack.getByLabel('Contrast',{exact:true}),1.045);await range(rack.getByLabel('Saturation',{exact:true}),.96);await range(rack.getByLabel('Vignette',{exact:true}),.05);
 const r=await h.save(page,'authored');await entry(page);await open(page);const re=await h.save(page,'reopened');assert.equal(hash(r.snapshot.studioDocument),hash(re.snapshot.studioDocument));assert.equal(re.snapshot.timeline.length,20);assert.equal(re.snapshot.overlays.filter(o=>o.vectorShape).length,2);
 fs.writeFileSync(path.join(folder,'native-edit.json'),JSON.stringify({projectId:r.id,projectName:name,canonicalHash:hash(r.snapshot.studioDocument),seconds:seconds(r),sources:3,nativeCuts:20,photoLayers:photos.length,dualVideoLayers:2,layers:r.snapshot.overlays.length,textAnimators:r.snapshot.overlays.filter(o=>o.textAnimator).length,editableVectors:2,motionKeys:r.snapshot.motionKeyframes.length,speedKeys:r.snapshot.speedKeyframes.length,soundCues:r.snapshot.soundEffects.length,exactColdReopen:true,nativeControlsOnly:true,graphInjection:false,authBypass:false},null,2));
 console.log('Restaurant film saved and exactly cold-reopened.');
}
async function review(page){
 await open(page);const doc=(await h.save(page,'review')).snapshot.studioDocument;
 const finished=page.getByRole('button',{name:'Show Live Edit',exact:true});if(await finished.isVisible())await finished.click();
 const observations=[];
 for(const t of [.5,3.5,5.2,6.5,8.5,9.5,13.5,16.5,18.7,21,23,24.7,27.2,28,31,34.5,36.1,36.8,38.8,39.7,41,44.5,47,49.5,52,54.5,56.2,57.3,59.3]){
  const tick=Math.round(t*90000),idx=doc.clipOccurrences.findIndex(c=>c.programmeRange.startTick<=tick&&c.programmeRange.endTick>tick),occ=doc.clipOccurrences[idx],asset=doc.assets.find(a=>a.assetId===occ.assetId),sourceTime=(occ.sourceRange.startTick+tick-occ.programmeRange.startTick)/90000;
  await q.tool(page,'Cut');await page.getByTestId(`pro-video-clip-${idx+1}`).click();await seek(page,t);
  await page.waitForFunction(({storagePath,time})=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-time)<.1&&decodeURIComponent(v.currentSrc).includes(storagePath);},{storagePath:asset.storagePath,time:sourceTime},{timeout:30000});
  await page.getByRole('heading',{name:'Preview',exact:true}).click();await page.keyboard.press('Escape');await page.waitForTimeout(400);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});observations.push({outputTime:t,sourceTime,sourceName:occ.parameters.name,sourceIdentityConfirmed:true});
 }
 const after=await h.save(page,'review-complete');assert.equal(hash(after.snapshot.studioDocument),hash(doc));fs.writeFileSync(path.join(folder,'source-review.json'),JSON.stringify({canonicalHash:hash(doc),observations,noGraphMutationDuringReview:true},null,2));console.log('All 29 live edited picture/source observations retained.');
}
async function polish(page){
 await open(page);const before=await h.save(page,'before-editorial-polish');
 if(!state.panelAspectPolished){
  for(const layer of before.snapshot.overlays.filter(o=>o.type==='video')){
   await motion(page,layer.id);await page.getByLabel('Motion layer height',{exact:true}).fill(String(layer.width));
  }
  await h.save(page,'panel-aspect-polished');done('panelAspectPolished');
 }
 if(!state.rulesPolished){
  for(const layer of before.snapshot.overlays.filter(o=>o.name==='Fine rule')){
   await seek(page,layer.startTime+.8);await selectVisual(page,layer.id);await q.tool(page,'B-roll');await page.getByRole('button',{name:'Stretch',exact:true}).click();
  }
  await h.save(page,'rules-polished');done('rulesPolished');
 }
 if(!state.labelsPolished||!state.labelsReadabilityVerified){
  for(const layer of before.snapshot.overlays.filter(o=>o.type==='text')){
   let scale,copy;
   if(layer.text==='A KITCHEN FILM STUDY')scale=.5;
   if(['PREPARATION / DETAIL / CARE','PREP · PLATE · CARE'].includes(layer.text)){scale=.5;copy='PREP · PLATE · CARE';}
   if(layer.text==='SERVICE')scale=.5;
   if(layer.text==='THE SMALL DETAILS')scale=.5;
   if(['STOCK FOOTAGE · ORIGINAL SCORE','STOCK FILM · DESIGNED SOUND'].includes(layer.text)){scale=.5;copy='STOCK FILM · DESIGNED SOUND';}
   if(!scale)continue;
   await seek(page,layer.startTime+.8);await selectVisual(page,layer.id);await q.tool(page,'Graphics');
   if(copy)await page.getByLabel('Title text',{exact:true}).fill(copy);
   const size=page.getByLabel('Title size',{exact:true});await range(size,.55);await range(size,scale);
  }
  await h.save(page,'labels-polished');done('labelsPolished');done('labelsReadabilityVerified');
 }
 const r=await h.save(page,'polished');await entry(page);await open(page);const re=await h.save(page,'polished-reopened');assert.equal(hash(r.snapshot.studioDocument),hash(re.snapshot.studioDocument));
 const target=path.join(folder,'native-edit.json');if(!fs.existsSync(path.join(folder,'native-edit-before-polish.json')))fs.copyFileSync(target,path.join(folder,'native-edit-before-polish.json'));
 const receipt=JSON.parse(fs.readFileSync(target));Object.assign(receipt,{canonicalHash:hash(re.snapshot.studioDocument),motionKeys:re.snapshot.motionKeyframes.length,editorialRulesAndLabelsPolished:true,exactColdReopen:true});fs.writeFileSync(target,JSON.stringify(receipt,null,2));done('polished');
 console.log('Fine rules, label readability and sound disclosure polished through native controls.');
}
async function mix(page){
 await open(page);
 const baselinePath=path.join(folder,'before-mix-polish-project.private.json');
 const before=fs.existsSync(baselinePath)?JSON.parse(fs.readFileSync(baselinePath)):await h.save(page,'before-mix-polish');
 const music=before.snapshot.audioKeyframes.music,cues=before.snapshot.soundEffects;
 await q.tool(page,'Sound');await page.getByLabel('Automation source',{exact:true}).selectOption('music');
 const inputs=page.locator('input[aria-label^="music volume at "]');assert.equal(await inputs.count(),music.length);
 for(let i=0;i<music.length;i++)await range(inputs.nth(i),Math.round(music[i].value*1.9));
 for(let i=0;i<cues.length;i++){
  await page.locator('.sound-effect-chip').nth(i).click();await range(page.getByTestId('sound-effect-volume'),Math.round(cues[i].volume*100*1.9));
  if(i%7===6)await h.save(page,`mix-cue-${i}`);
 }
 const after=await h.save(page,'mix-polished');
 for(let i=0;i<music.length;i++)assert.equal(after.snapshot.audioKeyframes.music[i].value,Math.round(music[i].value*1.9));
 for(let i=0;i<cues.length;i++)assert(Math.abs(after.snapshot.soundEffects[i].volume-Math.round(cues[i].volume*100*1.9)/100)<.00001);
 const clean=value=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!['url','src','file','previewUrl','signedUrl','blobUrl'].includes(k)).map(([k,v])=>[k,clean(v)])):value;
 const fields=['timeline','orderedClips','overlays','mainTransform','mainFrame','motionKeyframes','motionScenes','speedKeyframes','finishFx','finishKeyframes','reframeAspect','smartCrop','smartCropMode','reframeKeyframes','reframeModeCuts','videoFit','compoundClips','graphicLayerOrder','compositionOrder','adjustmentLayers','captionSegments','autoCaptions','captionStyle','captionPosition','captionScale','captionTextOverride','angleGroups','addHook','hookDarkOverlay','hookFreezeFrame','brandWatermark'];
 const visual=s=>Object.fromEntries(fields.filter(k=>k in s).map(k=>[k,clean(s[k])]));
 const beforePictureHash=hash(visual(before.snapshot)),afterPictureHash=hash(visual(after.snapshot));assert.equal(beforePictureHash,afterPictureHash);
 await seek(page,12);await page.getByRole('button',{name:'Play comparison',exact:true}).click({timeout:180000});await page.waitForTimeout(1500);await pause(page);
 const mediaVolume=await page.getByTestId('background-sound-preview').evaluate(e=>e.volume);
 assert(mediaVolume>=0&&mediaVolume<=1);
 assert(!runtimeErrors.some(e=>/IndexSizeError.*volume/.test(e)));
 await entry(page);await open(page);const reopened=await h.save(page,'mix-reopened');assert.equal(hash(reopened.snapshot.studioDocument),hash(after.snapshot.studioDocument));
 const receiptPath=path.join(folder,'native-edit.json'),native=JSON.parse(fs.readFileSync(receiptPath));Object.assign(native,{canonicalHash:hash(reopened.snapshot.studioDocument),exactColdReopen:true,mixGainCorrectedThroughNativeControls:true});fs.writeFileSync(receiptPath,JSON.stringify(native,null,2));
 fs.writeFileSync(path.join(report,'native-mix-polish.json'),JSON.stringify({beforeCanonicalHash:hash(before.snapshot.studioDocument),afterCanonicalHash:hash(reopened.snapshot.studioDocument),beforePictureHash,afterPictureHash,pictureDecisionsUnchanged:true,musicKeys:music.length,soundCues:cues.length,gainMultiplier:1.9,quantization:'Normal one-percent native volume controls',expectedMixLiftDb:20*Math.log10(1.9),exactColdReopen:true,nativeControlsOnly:true,htmlFallbackMediaVolume:mediaVolume,maximumMusicAutomationPercent:190,realPreviewPlaybackAtRaisedGain:true,musicVolumeLimitErrors:runtimeErrors.filter(e=>/IndexSizeError.*volume/.test(e)).length,webAudioGainSemanticsUnchanged:true},null,2));
 done('mixPolished');console.log('Native music and sound-cue gains raised together; picture decisions unchanged; exact cold reopen passes.');
}
async function nativeRender(page){
 assert(!fs.existsSync(path.join(report,'accepted-job-observation.json')),'An accepted render is recorded; recover the same job.');assert(!fs.existsSync(path.join(folder,'film/render-receipt.json')),'Do not resubmit completed film.');
 await q.tool(page,'Export');await page.waitForTimeout(5000);const recovery=page.getByTestId('viral-render-recovery'),dismiss=recovery.getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.press('Enter');
 page.on('response',async response=>{if(response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/media/process'&&response.ok()){try{const data=await response.json();fs.writeFileSync(path.join(report,'accepted-job-observation.json'),JSON.stringify({at:new Date().toISOString(),response:data},null,2),{mode:0o600});}catch{}}});
 await h.render(page,'film');
}
async function deliveryView(page){
 const t=page.getByTestId('studio-pro-timeline');await t.getByRole('button',{name:'Composition layers',exact:true}).click();const active=t.getByRole('button',{name:'At playhead',exact:true});if(await active.getAttribute('aria-pressed')!=='true')await active.click();await require('../creative-templates/materials-editing-proof').view(page,'film');await h.rail(page);await pause(page);const r=await h.save(page,'delivery'),receipt=JSON.parse(fs.readFileSync(path.join(folder,'film/render-receipt.json')));assert.equal(hash(r.snapshot.studioDocument),receipt.projectHash);const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();await(await dl).saveAs(path.join(folder,'THE-LAST-TOUCH.autopromote.json'));fs.chmodSync(path.join(folder,'THE-LAST-TOUCH.autopromote.json'),0o600);
}
async function main(){
 const action=process.argv[2]||'cuts',authIpv4=process.env.STUDIO_QA_AUTH_IPV4;
 if(authIpv4)assert.equal(require('node:net').isIP(authIpv4),4);
 const routes=['MAP localhost 127.0.0.3',...(authIpv4?[`MAP securetoken.googleapis.com ${authIpv4}`]:[])];
 const args=['--mute-audio','--disk-cache-size=16777216',`--host-resolver-rules=${routes.join(', ')}`,
  ...(process.env.STUDIO_QA_AUTH_HTTP1==='1'?['--no-proxy-server','--disable-quic','--disable-http2']:[])];let browser;
 const retainedAuth=path.join(folder,'current-session.private.json');
 const manualAuth=require('../creative-templates/studio-session').sessionPath;
 const authState=fs.existsSync(manualAuth)?manualAuth:fs.existsSync(retainedAuth)?retainedAuth:path.join(root,require('../../config/daily-studio.json').authState);
 const context=['restore','resume-mix-delivery'].includes(action)?await(browser=await chromium.launch({channel:'chromium',headless:true,args})).newContext({storageState:authState,viewport:{width:1920,height:1440},acceptDownloads:true}):await chromium.launchPersistentContext(path.join(root,'reports/studio-keyframe-selection-20261015/proof/browser-profile.private'),{channel:'chromium',headless:true,args,viewport:{width:1920,height:1440},acceptDownloads:true});
 const page=context.pages()[0]||await context.newPage();page.setDefaultTimeout(45000);let jobs=0;
 const authLog=entry=>fs.appendFileSync(path.join(folder,'auth-network.private.jsonl'),JSON.stringify({at:new Date().toISOString(),...entry})+'\n',{mode:0o600});
 page.on('requestfailed',r=>{const u=new URL(r.url());if(/^(securetoken|identitytoolkit)\.googleapis\.com$/.test(u.hostname))authLog({host:u.hostname,path:u.pathname,failed:r.failure()?.errorText});});
 page.on('response',async r=>{const u=new URL(r.url());if(/^(securetoken|identitytoolkit)\.googleapis\.com$/.test(u.hostname)){let error;if(r.status()>=400){const data=await r.json().catch(()=>({}));error=data.error?.message;}authLog({host:u.hostname,path:u.pathname,status:r.status(),error});}});
 page.on('request',r=>{if(r.method()==='POST'){const p=new URL(r.url()).pathname;if(p==='/api/media/process')jobs++;assert(!/studio-capabilities\/requests|studio-3d-preview|publisher\/schedule|platform\/post/.test(p));}});
 page.on('pageerror',e=>{runtimeErrors.push(`${e.name}: ${e.message}`);fs.appendFileSync(path.join(folder,'runtime-errors.private.log'),e.stack+'\n',{mode:0o600});});
 try{
  await entry(page);
  if(action==='cuts')await cuts(page);
  else if(action==='finish')await finish(page);
  else if(action==='review')await review(page);
  else if(action==='polish')await polish(page);
  else if(action==='mix')await mix(page);
  else if(action==='resume-mix-delivery'){
   await page.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,'first-export-quiet-mix/THE-LAST-TOUCH.autopromote.json'));
   await mix(page);
   const savedAuth=await context.storageState({indexedDB:true});
   for(const origin of savedAuth.origins||[])origin.indexedDB=(origin.indexedDB||[]).filter(db=>db.name==='firebaseLocalStorageDb');
   require('../creative-templates/studio-session').saveAuthenticatedState(savedAuth,retainedAuth);
   await nativeRender(page);execFileSync('python3',[path.join(report,'verify-delivery.py')],{stdio:'inherit'});await deliveryView(page);execFileSync('python3',[path.join(report,'verify-delivery.py')],{stdio:'inherit'});
  }
  else if(action==='restore'){
   await page.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,'THE-LAST-TOUCH.autopromote.json'));await open(page);const r=await h.save(page,'fresh-restored'),b=JSON.parse(fs.readFileSync(path.join(folder,'THE-LAST-TOUCH.autopromote.json')));assert.equal(hash(r.snapshot.studioDocument),hash(b.snapshot.studioDocument));fs.writeFileSync(path.join(folder,'fresh-restore.json'),JSON.stringify({projectId:r.id,canonicalHash:hash(r.snapshot.studioDocument),backupSha256:hash(fs.readFileSync(path.join(folder,'THE-LAST-TOUCH.autopromote.json'))),independentExactRestore:true,renderJobs:jobs},null,2));
  }else{
   await open(page);
   if(action==='render'){
    await nativeRender(page);
   }else if(action==='recover')await h.recover(page,'film');
   else if(action==='view'){
    await deliveryView(page);
   }else throw Error('Unknown action');
  }
  assert.equal(jobs,['render','resume-mix-delivery'].includes(action)?1:0);
 }catch(e){await page.screenshot({path:path.join(folder,`${action}-failure-${Date.now()}.png`)}).catch(()=>{});fs.writeFileSync(path.join(folder,'last-failure.private.txt'),(await page.locator('body').innerText()).slice(-14000),{mode:0o600});throw e;}
 finally{await context.close();if(browser)await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
