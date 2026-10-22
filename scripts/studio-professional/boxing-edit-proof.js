#!/usr/bin/env node
// Normal real signed-in Studio controls; source/frame assets only, no graph writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),report=path.join(root,'reports/studio-boxing-edit-20261019'),folder=path.join(report,'proof');
Object.assign(process.env,{STUDIO_TEMPLATE_PROOF_DIR:folder,STUDIO_KINETIC_PROOF_DIR:folder,STUDIO_QA_EXPECTED_WIDTH:'1280',STUDIO_QA_EXPECTED_HEIGHT:'720',STUDIO_QA_EXPORT_FPS:'24',STUDIO_QA_NATIVE_DOWNLOAD_METHOD:'playwright',STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS:'1800000',STUDIO_QA_TIMELINE_HEIGHT:'500',STUDIO_QA_HIDE_MEDIA:'1'});
const h=require('../creative-templates/studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {pause,seek,range}=require('./kinetic-type-proof'),{hash}=require('../../src/creativeTemplates/contract');
const items=JSON.parse(fs.readFileSync(path.join(root,'reports/studio-real-footage-20261018/sources.json'))).items;
const name='IN THE POCKET · boxing picture edit · 20261019';
const statePath=path.join(folder,'progress.json'),state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath)):{};
const done=(k,v=true)=>{state[k]=v;fs.writeFileSync(statePath,JSON.stringify(state,null,2));};
const seconds=r=>r.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick/90000;
let document;
function programme(t){if(!document)return t;const tick=Math.round(t*90000),s=document.outputTimeMap.find(s=>s.outputRange.startTick<=tick&&s.outputRange.endTick>=tick);assert(s);return Math.round(s.programmeRange.startTick+(tick-s.outputRange.startTick)*(s.programmeRange.endTick-s.programmeRange.startTick)/(s.outputRange.endTick-s.outputRange.startTick))/90000;}
async function entry(page){await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));}
async function open(page,title=name){await page.getByRole('region',{name:'Saved Studio projects',exact:true}).getByRole('button',{name:title,exact:true}).click();await h.rail(page);await pause(page);}
async function source(page,id,action){await h.rail(page);await page.getByRole('tab',{name:'Media',exact:true}).click();const filename=path.basename(items.find(i=>i.assetId===id).path),card=page.getByTestId('project-media-library').locator('article').filter({has:page.getByRole('button',{name:`Preview ${filename}`,exact:true})});await card.getByRole('button',{name:`Preview ${filename}`,exact:true}).click();await card.getByRole('button',{name:action,exact:true}).click();await pause(page);}
async function cutSeek(page,t,expected){await seek(page,t);if(expected!==undefined)await page.waitForFunction(t=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-t)<.09;},expected,{timeout:30000});}
async function motion(page,id){await q.tool(page,'Motion');await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();await page.getByLabel('Target layer',{exact:true}).selectOption(id);}
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
 else{await open(page,'Real footage · Boxing · 20261018');await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));await page.getByLabel('Project name',{exact:true}).fill(name);await h.save(page,'new-project');}
 await q.tool(page,'Reframe');await page.getByTestId('reframe-aspect-16-9').click();await page.getByTestId('reframe-preserve-frame').click();
 await q.tool(page,'Color');const rounded=page.getByLabel('Rounded main footage',{exact:true});if(await rounded.isChecked())await rounded.uncheck();
 await q.tool(page,'Sound');const repair=page.getByLabel('Use voice repair on export',{exact:true});if(await repair.isChecked())await repair.uncheck();
 const edl=JSON.parse(fs.readFileSync(path.join(report,'edit-decisions.json'))).shots;
 if(!state.cuts){await source(page,'40967','Add to sequence');await q.tool(page,'Cut');await page.getByTestId('pro-video-clip-1').click();await page.getByTestId('inspector-cut-delete').click();}
 await q.tool(page,'Cut');await page.getByRole('button',{name:'Clean Cut',exact:true}).click();
 for(let i=state.cuts||0;i<edl.length;i++){
  const s=edl[i];let r=await h.save(page,`shot-${i}-before`);
  if(i>0&&r.snapshot.timeline.length===i)await source(page,s.assetId,'Add to sequence');
  await q.tool(page,'Cut');await page.getByTestId(`pro-video-clip-${i+1}`).click();r=await h.save(page,`shot-${i}-selected`);
  const a=Number(r.snapshot.timeline[i].startRequest||0);
  if(Math.abs(a-s.sourceIn)>.05){assert(a<s.sourceIn);await cutSeek(page,s.programmeIn+s.sourceIn-a,s.sourceIn);await page.getByTestId('inspector-cut-trim-start').click();}
  await cutSeek(page,s.programmeOut,s.sourceOut);await page.getByTestId('inspector-cut-trim-end').click();
  r=await h.save(page,`shot-${i}-complete`);const clip=r.snapshot.timeline[i];assert(Math.abs(Number(clip.startRequest||0)-s.sourceIn)<.05);assert(Math.abs(Number(clip.endRequest)-s.sourceOut)<.05);assert(Math.abs(seconds(r)-s.programmeOut)<.05);
  done('cuts',i+1);console.log(`Native boxing cut ${i+1}/${edl.length}; ${seconds(r).toFixed(2)}s.`);
 }
 let r=await h.save(page,'before-speed');if(!r.snapshot.speedKeyframes.length){await seek(page,27);await q.tool(page,'Creator FX');await page.getByTestId('creator-section-effects').click();await page.getByRole('button',{name:'Apply smooth speed ramp',exact:true}).click();}
 r=await h.save(page,'after-speed');if(seconds(r)>60+1/90000){await cutSeek(page,60);await q.tool(page,'Cut');await page.getByTestId('inspector-cut-trim-end').click();}
 r=await h.save(page,'picture-cut');assert(Math.abs(seconds(r)-60)<1/24);done('pictureCut',hash(r.snapshot.studioDocument));
}
async function finish(page){
 await open(page);document=(await h.save(page,'before-picture-design')).snapshot.studioDocument;
 const snap=page.getByTestId('studio-pro-timeline').getByRole('button',{name:'⌁ Snap',exact:true});if((await snap.getAttribute('class')||'').includes('is-on'))await snap.click();
 execFileSync('python3',[path.join(__dirname,'author-boxing-edit.py')],{stdio:'inherit'});
 if(!state.graphics){await q.tool(page,'Graphics');const p=page.getByTestId('studio-graphics-import');if(!await p.evaluate(e=>e.open))await p.locator('summary').click();await page.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.join(report,'assets/picture.graphics.json'));await p.getByRole('status').waitFor();assert((await p.getByRole('status').innerText()).includes('imported.'),await p.innerText());await h.save(page,'graphics');done('graphics');}
 const photos=JSON.parse(fs.readFileSync(path.join(report,'photo-decisions.json')));
 if(!state.opacityRepaired){
  for(let i=0;i<(state.photos||0);i++){
   const r=JSON.parse(fs.readFileSync(path.join(folder,`photo-${i}-animated-project.private.json`))),id=r.snapshot.overlays.at(-1).id;
   await motion(page,id);
   for(const p of photos[i].poses)await pose(page,p);
   await h.save(page,`photo-${i}-opacity-repaired`);
   console.log(`Corrected evaluated photo pose ${i+1}/${state.photos}.`);
  }
  done('opacityRepaired');
 }
 for(let i=state.photos||0;i<photos.length;i++){
  const p=photos[i];let id=state.pendingPhoto?.index===i?state.pendingPhoto.id:null;
  if(!id){await seek(page,p.start);await q.tool(page,'B-roll');await page.getByTestId('visual-image-input').setInputFiles(path.join(report,'assets',p.file));let r=await h.save(page,`photo-${i}-added`);id=r.snapshot.overlays.at(-1).id;done('pendingPhoto',{index:i,id});}
  await q.tool(page,'B-roll');await page.getByRole('button',{name:'Show all',exact:true}).click();await range(page.getByRole('slider',{name:'Frame corner curve',exact:true}),12);
  await motion(page,id);await page.getByLabel('Motion layer in point',{exact:true}).fill(String(programme(p.start)));await page.getByLabel('Motion layer duration',{exact:true}).fill(String(programme(p.end)-programme(p.start)));await page.getByLabel('Motion layer width',{exact:true}).fill(String(p.width));await page.getByLabel('Motion layer height',{exact:true}).fill(String(p.height));
  for(const values of p.poses)await pose(page,values);
  if(p.mask){await q.tool(page,'Composite');await page.getByText('Composite target',{exact:true}).locator('..').locator('select').selectOption(id);await page.getByRole('checkbox',{name:/Enable mask/}).check();await page.getByRole('button',{name:'polygon',exact:true}).click();const f=page.getByLabel('Mask polygon path',{exact:true});await f.fill(p.mask);await f.press('Enter');}
  await seek(page,(p.start+p.end)/2);await q.tool(page,'Cut');
  await page.keyboard.press('Escape');await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`photo-${i}-review.png`)});
  await h.save(page,`photo-${i}-animated`);done('photos',i+1);done('pendingPhoto',null);console.log(`Native photo choreography ${i+1}/${photos.length}.`);
 }
 if(!state.camera){
  await motion(page,'main-video');
  const poses=[[0,50,50,1.12,0],[1.8,49,50,1.2,0],[2,50,50,1,0],[3.96,50,50,1,0],[4,50,50,1.10,0],[7.96,48,50,1.21,0],[8,50,50,1,0],[10.96,50,50,1,0],[11,50,50,1.04,0],[16.96,49,50,1.12,0],[17,50,50,1,0],[18.96,50,50,1,0],[19,50,50,1.10,0],[24.96,49,50,1.22,0],[25,50,50,1.08,0],[27.4,47,50,1.3,0],[30.96,50,50,1.12,0],[31,50,50,1,0],[42.96,50,50,1,0],[43,50,50,1,0],[45.96,50,50,1,0],[46,50,50,1.07,0],[48.96,49,50,1.16,0],[49,50,50,1.14,0],[55.96,50,50,1.08,0],[56,50,50,1,0],[59.98,50,50,1,0]];
  for(const p of poses)await pose(page,p,'linear');await h.save(page,'camera-animated');done('camera');console.log('Main-footage camera poses saved.');
 }
 for(let i=state.dual||0;i<2;i++){
  let id=state.pendingDual?.index===i?state.pendingDual.id:null;
  if(!id){await seek(page,37);await source(page,i?'40954':'40967','Add as B-roll');const r=await h.save(page,`dual-${i}-added`);id=r.snapshot.overlays.at(-1).id;done('pendingDual',{index:i,id});}
  await q.tool(page,'B-roll');await page.getByRole('button',{name:'Picture-in-picture',exact:true}).click();await range(page.getByLabel('B-roll source start',{exact:true}),i?.6:3);await range(page.getByRole('slider',{name:'Frame corner curve',exact:true}),12);
  await motion(page,id);await page.getByLabel('Motion layer in point',{exact:true}).fill(String(programme(37)));await page.getByLabel('Motion layer duration',{exact:true}).fill(String(programme(43)-programme(37)));await page.getByLabel('Motion layer width',{exact:true}).fill('47');await page.getByLabel('Motion layer height',{exact:true}).fill('47');
  const poses=i?[[37,100,50,.85,0,0],[37.28,75,50,1,0,1],[39.7,75,50,1,0,1],[40.3,90,50,.8,0,0],[42.99,90,50,.8,0,0]]:[[37,0,50,.85,0,0],[37.28,25,50,1,0,1],[39.7,25,50,1,0,1],[40.35,50,50,2.13,0,1],[42.65,50,50,2.13,0,1],[42.99,50,50,1.9,0,0]];
  for(const p of poses)await pose(page,p);
  await h.save(page,`dual-${i}-animated`);done('dual',i+1);done('pendingDual',null);
 }
 if(!state.sound){
  await q.tool(page,'Sound');await page.getByTestId('background-sound-input').setInputFiles(path.join(root,'reports/studio-real-footage-edit-20261018/assets/Deep-Urban.mp3'));
  for(const label of ['Keep original audio','Duck under speech','Loop for the full clip']){const e=page.getByLabel(label,{exact:false});if(await e.isChecked())await e.uncheck();}
  await range(page.locator('.inspector-range').filter({hasText:'Background volume'}).locator('input[type=range]'),53);await range(page.getByLabel('Music fade in',{exact:true}),.06);await range(page.getByLabel('Music fade out',{exact:true}),1.5);
  await page.getByLabel('Automation source',{exact:true}).selectOption('music');
  for(const [t,v] of [[0,80],[1.8,80],[2,15],[3.7,15],[4,100],[16.8,100],[17,22],[18.8,22],[19,100],[30.8,100],[31,25],[34.5,25],[36.6,65],[37,100],[55.8,100],[56.3,55],[59.98,55]]){
   await seek(page,t);const add=page.getByRole('button',{name:/^◆ Add volume keyframe at/}),stamp=(await add.innerText()).match(/at ([\d.]+)s/)[1];await add.click();await range(page.getByLabel(`music volume at ${stamp} seconds`,{exact:true}),v);
  }
  done('sound',true);await h.save(page,'music-design');
 }
 const cues=[['glove',.48,48],['glove',1.15,40],['shutter',2,48],['shutter',2.18,32],['shutter',2.36,32],['sweep',3.78,32],['body',5.35,44],['glove',6.2,46],['sweep',10.8,26],['glove',11.55,42],['body',13.45,48],['glove',15.9,46],['shutter',17,46],['sweep',18.78,32],['body',19.5,48],['glove',21.1,45],['body',23.2,48],['glove',24.5,45],['sweep',26.8,32],['body',28.15,40],['shutter',31,46],['shutter',31.18,34],['shutter',31.36,34],['sweep',36.7,32],['glove',38.3,38],['body',40.1,40],['sweep',42.7,30],['body',47.2,44],['glove',49.3,46],['glove',50.75,46],['body',52.4,46],['glove',53.75,46],['glove',55.4,44],['body',56,48]];
 await q.tool(page,'Sound');const present=await page.locator('.sound-effect-chip').count();
 for(let i=Math.min(state.cues||0,present);i<cues.length;i++){
  const [kind,t,v]=cues[i];await q.tool(page,'Sound');
  if(i<await page.locator('.sound-effect-chip').count())await page.locator('.sound-effect-chip').nth(i).click();
  else await page.getByTestId('sound-effect-input').setInputFiles(path.join(report,`assets/${kind}-original.wav`));
  await page.getByTestId('sound-effect-start').fill(String(programme(t)));await page.getByTestId('sound-effect-start').blur();await range(page.getByTestId('sound-effect-volume'),v);await range(page.getByTestId('sound-effect-fade-out'),.04);
  if(i%4===3||i===cues.length-1)await h.save(page,`cue-${i}`);done('cues',i+1);console.log(`Native sound cue ${i+1}/${cues.length}.`);
 }
 await q.tool(page,'Color');const rack=page.getByTestId('studio-finish-rack');await range(rack.getByLabel('Contrast',{exact:true}),1.10);await range(rack.getByLabel('Saturation',{exact:true}),.88);await range(rack.getByLabel('Vignette',{exact:true}),.12);
 const r=await h.save(page,'authored');await entry(page);await open(page);const re=await h.save(page,'reopened');assert.equal(hash(r.snapshot.studioDocument),hash(re.snapshot.studioDocument));assert.equal(re.snapshot.timeline.length,21);assert.equal(re.snapshot.overlays.filter(o=>o.type==='text').length,4);
 fs.writeFileSync(path.join(folder,'native-edit.json'),JSON.stringify({projectId:r.id,projectName:name,canonicalHash:hash(r.snapshot.studioDocument),seconds:seconds(r),sources:3,nativeCuts:21,photoLayers:photos.length,dualVideoLayers:2,layers:r.snapshot.overlays.length,motionKeys:r.snapshot.motionKeyframes.length,speedKeys:r.snapshot.speedKeyframes.length,soundCues:r.snapshot.soundEffects.length,exactColdReopen:true,nativeControlsOnly:true,graphInjection:false,authBypass:false},null,2));
 console.log('Boxing picture edit saved and exactly cold-reopened.');
}
async function review(page){
 await open(page);document=(await h.save(page,'review-document')).snapshot.studioDocument;
 const finished=page.getByRole('button',{name:'Show Live Edit',exact:true});if(await finished.isVisible())await finished.click();
 const observations=[];
 for(const t of [.6,2.05,2.6,3.7,5.5,9.5,12.5,17.5,20.5,27.5,31.1,32.4,35.8,38,41.5,44,50,54,57.5,59.4]){
  const tick=Math.round(programme(t)*90000),idx=document.clipOccurrences.findIndex(c=>c.programmeRange.startTick<=tick&&c.programmeRange.endTick>tick),occ=document.clipOccurrences[idx],asset=document.assets.find(a=>a.assetId===occ.assetId),source=(occ.sourceRange.startTick+tick-occ.programmeRange.startTick)/90000;
  await q.tool(page,'Cut');await page.getByTestId(`pro-video-clip-${idx+1}`).click();await seek(page,t);
  await page.waitForFunction(({storagePath,time})=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-time)<.1&&decodeURIComponent(v.currentSrc).includes(storagePath);},{storagePath:asset.storagePath,time:source},{timeout:30000});
  await page.getByRole('heading',{name:'Preview',exact:true}).click();await page.keyboard.press('Escape');await page.waitForTimeout(450);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});observations.push({outputTime:t,sourceTime:source,sourceName:occ.parameters.name,sourceIdentityConfirmed:true});
 }
 fs.writeFileSync(path.join(folder,'source-review.json'),JSON.stringify({canonicalHash:hash(document),observations},null,2));
 const first=JSON.parse(fs.readFileSync(path.join(folder,'photo-0-animated-project.private.json'))).snapshot.overlays.at(-1).id;
 await motion(page,first);const controls=[];
 for(const [t,x,opacity]of [[2,50,0],[2+8/24,18,1],[3,18,1]]){
  await seek(page,t);const shownX=Number(await page.getByRole('spinbutton',{name:'X',exact:true}).inputValue()),shownOpacity=Number(await page.getByRole('slider',{name:/^Opacity/}).inputValue());assert.equal(shownX,x);assert.equal(shownOpacity,opacity);controls.push({outputTime:t,x:shownX,opacity:shownOpacity});
 }
 const after=await h.save(page,'native-control-review');assert.equal(hash(after.snapshot.studioDocument),hash(document));fs.writeFileSync(path.join(folder,'native-control-review.json'),JSON.stringify({canonicalHash:hash(document),observations:controls,evaluatedPoseShown:true,noGraphMutationDuringReview:true},null,2));
}
async function polish(page){
 await open(page);document=(await h.save(page,'before-picture-polish')).snapshot.studioDocument;
 execFileSync('python3',[path.join(__dirname,'author-boxing-edit.py')],{stdio:'inherit'});
 const photos=JSON.parse(fs.readFileSync(path.join(report,'photo-decisions.json')));
 for(const i of [5,6]){
  const r=JSON.parse(fs.readFileSync(path.join(folder,`photo-${i}-animated-project.private.json`)));
  await motion(page,r.snapshot.overlays.at(-1).id);for(const p of photos[i].poses)await pose(page,p);
 }
 await motion(page,'main-video');for(const p of [[11,35,50,1.35,0,1],[13.4,40,50,1.25,0,1],[15.2,47,50,1.12,0,1]])await pose(page,p,'linear');
 // Contacts follow the actual source programme; picture-stage sweeps and
 // the two timed overlay views follow their authored final-output clock.
 const original=(await h.save(page,'before-contact-timing')).snapshot.soundEffects;
 const corrections={1:1.9,6:5.8,9:12,11:16,15:21.7,19:29.5,25:40.5,27:47.5,29:51,30:52.5,32:55.05};
 const cues=original.map((effect,index)=>{
  const p=effect.startTime;let output;
  const tick=p*90000,s=document.outputTimeMap.find(s=>s.programmeRange.startTick<=tick&&s.programmeRange.endTick>=tick);assert(s);
  output=(s.outputRange.startTick+(tick-s.programmeRange.startTick)*(s.outputRange.endTick-s.outputRange.startTick)/(s.programmeRange.endTick-s.programmeRange.startTick))/90000;
  const intended=corrections[index]??Math.round(output*100)/100;
  const pictureClock=/shutter|sweep/.test(effect.name)||index===24||index===25||index===33;
  return {index,id:effect.id,name:effect.name,time:pictureClock?programme(intended):intended,clock:pictureClock?'output':'source programme',intended};
 });
 await q.tool(page,'Sound');for(const cue of cues){await page.locator('.sound-effect-chip').nth(cue.index).click();await page.getByTestId('sound-effect-start').fill(String(cue.time));await page.getByTestId('sound-effect-start').blur();}
 fs.writeFileSync(path.join(report,'sound-decisions.json'),JSON.stringify(cues,null,2));
 const r=await h.save(page,'picture-polished');await entry(page);await open(page);const re=await h.save(page,'polished-reopened');assert.equal(hash(r.snapshot.studioDocument),hash(re.snapshot.studioDocument));
 const target=path.join(folder,'native-edit.json');fs.copyFileSync(target,path.join(folder,'native-edit-before-polish.json'));const receipt=JSON.parse(fs.readFileSync(target));Object.assign(receipt,{canonicalHash:hash(re.snapshot.studioDocument),motionKeys:re.snapshot.motionKeyframes.length,sourceFramingPolished:true,exactColdReopen:true});fs.writeFileSync(target,JSON.stringify(receipt,null,2));done('picturePolish');
 console.log('Source framing and split-frame focus polished through native picture keys.');
}
async function cleanup(page){
 await open(page);const before=await h.save(page,fs.existsSync(path.join(folder,'before-cutout-rejection-document.json'))?'before-cutout-rejection-resume':'before-cutout-rejection');
 const id=JSON.parse(fs.readFileSync(path.join(folder,'photo-10-animated-project.private.json'))).snapshot.overlays.at(-1).id;
 assert(before.snapshot.overlays.some(o=>o.id===id));
 await q.tool(page,'Composite');await page.getByText('Composite target',{exact:true}).locator('..').locator('select').selectOption(id);await page.getByRole('checkbox',{name:/Enable mask/}).uncheck();
 document=before.snapshot.studioDocument;await motion(page,id);await pose(page,[36,50,50,.7,0,1]);
 const timeline=page.getByTestId('studio-pro-timeline');await timeline.getByRole('button',{name:'Composition layers',exact:true}).click();
 await timeline.getByTestId(`timeline-layer-${id}`).locator('.pro-layer-name').click();
 await seek(page,36);
 await page.getByRole('heading',{name:'Preview',exact:true}).click();await page.keyboard.press('Delete');
 const saved=await h.save(page,'clean-picture');assert.equal(saved.snapshot.timeline.length,before.snapshot.timeline.length);assert.equal(saved.snapshot.overlays.length,before.snapshot.overlays.length-1);assert(!saved.snapshot.overlays.some(o=>o.id===id));assert(!saved.snapshot.motionKeyframes.some(k=>k.targetId===id));
 await entry(page);await open(page);const re=await h.save(page,'clean-picture-reopened');assert.equal(hash(re.snapshot.studioDocument),hash(saved.snapshot.studioDocument));
 const target=path.join(folder,'native-edit.json');fs.copyFileSync(target,path.join(folder,'native-edit-with-rejected-cutout.json'));const receipt=JSON.parse(fs.readFileSync(target));Object.assign(receipt,{canonicalHash:hash(re.snapshot.studioDocument),motionKeys:re.snapshot.motionKeyframes.length,photoLayers:11,layers:29,rejectedCutoutRemoved:true,exactColdReopen:true});fs.writeFileSync(target,JSON.stringify(receipt,null,2));done('cutoutRejected');
 fs.writeFileSync(path.join(folder,'cutout-rejection.json'),JSON.stringify({id,reason:'Rough manual mask edges and duplicate subject contours; excluded from delivered picture.',retainedBeforeProject:'before-cutout-rejection-project.private.json',retainedReview:'photo-10-review.png',nativeDeletion:true,sourceCutsPreserved:21,exactColdReopen:true},null,2));
}
async function main(){
 const action=process.argv[2]||'cuts',args=['--mute-audio','--disk-cache-size=16777216','--host-resolver-rules=MAP localhost 127.0.0.2'];let browser;
 const context=action==='restore'?await(browser=await chromium.launch({channel:'chromium',headless:true,args})).newContext({storageState:path.join(root,require('../../config/daily-studio.json').authState),viewport:{width:1920,height:1440},acceptDownloads:true}):await chromium.launchPersistentContext(path.join(root,'reports/studio-keyframe-selection-20261015/proof/browser-profile.private'),{channel:'chromium',headless:true,args,viewport:{width:1920,height:1440},acceptDownloads:true});
 const page=context.pages()[0]||await context.newPage();page.setDefaultTimeout(45000);let jobs=0;
 page.on('request',r=>{if(r.method()==='POST'){const p=new URL(r.url()).pathname;if(p==='/api/media/process')jobs++;assert(!/studio-capabilities\/requests|studio-3d-preview|publisher\/schedule|platform\/post/.test(p));}});
 page.on('pageerror',e=>fs.appendFileSync(path.join(folder,'runtime-errors.private.log'),e.stack+'\n',{mode:0o600}));
 try{
  await entry(page);
  if(action==='cuts')await cuts(page);
  else if(action==='finish')await finish(page);
  else if(action==='review')await review(page);
  else if(action==='polish')await polish(page);
  else if(action==='cleanup')await cleanup(page);
  else if(action==='restore'){
   await page.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,'IN-THE-POCKET.autopromote.json'));await open(page);const r=await h.save(page,'fresh-restored'),b=JSON.parse(fs.readFileSync(path.join(folder,'IN-THE-POCKET.autopromote.json')));assert.equal(hash(r.snapshot.studioDocument),hash(b.snapshot.studioDocument));fs.writeFileSync(path.join(folder,'fresh-restore.json'),JSON.stringify({projectId:r.id,canonicalHash:hash(r.snapshot.studioDocument),backupSha256:hash(fs.readFileSync(path.join(folder,'IN-THE-POCKET.autopromote.json'))),independentExactRestore:true,renderJobs:jobs},null,2));
  }else{
   await open(page);
   if(action==='render'){
    assert(!fs.existsSync(path.join(report,'accepted-job-observation.json')),'An accepted render is recorded; recover the same job.');assert(!fs.existsSync(path.join(folder,'film/render-receipt.json')),'Do not resubmit completed film.');
    if(fs.existsSync(path.join(folder,'second-export-rejected-framing'))){
     await q.tool(page,'Export');await page.waitForTimeout(5000);
     const recovery=page.getByTestId('viral-render-recovery'),dismiss=recovery.getByRole('button',{name:'Dismiss',exact:true});
     await page.waitForFunction(()=>{const p=document.querySelector('[data-testid="viral-render-recovery"]');return (p&&[...p.querySelectorAll('button')].some(b=>b.textContent.trim()==='Dismiss'))||!!document.querySelector('[data-testid="rendered-output-ready"]');},undefined,{timeout:90000});
     if(await dismiss.isVisible())await dismiss.press('Enter');
    }else{const dismiss=page.getByTestId('viral-render-recovery').getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.press('Enter');}
    await h.render(page,'film');
   }
   else if(action==='recover')await h.recover(page,'film');
   else if(action==='view'){
    const t=page.getByTestId('studio-pro-timeline');await t.getByRole('button',{name:'Composition layers',exact:true}).click();const active=t.getByRole('button',{name:'At playhead',exact:true});if(await active.getAttribute('aria-pressed')!=='true')await active.click();await require('../creative-templates/materials-editing-proof').view(page,'film');await h.rail(page);await pause(page);const r=await h.save(page,'delivery'),receipt=JSON.parse(fs.readFileSync(path.join(folder,'film/render-receipt.json')));assert.equal(hash(r.snapshot.studioDocument),receipt.projectHash);const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();await(await dl).saveAs(path.join(folder,'IN-THE-POCKET.autopromote.json'));fs.chmodSync(path.join(folder,'IN-THE-POCKET.autopromote.json'),0o600);
   }else throw Error('Unknown action');
  }
  assert.equal(jobs,action==='render'?1:0);
 }catch(e){await page.screenshot({path:path.join(folder,`${action}-failure-${Date.now()}.png`)}).catch(()=>{});fs.writeFileSync(path.join(folder,'last-failure.private.txt'),(await page.locator('body').innerText()).slice(-14000),{mode:0o600});throw e;}
 finally{await context.close();if(browser)await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
