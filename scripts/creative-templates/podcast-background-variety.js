#!/usr/bin/env node
// Background variants use the existing authenticated Studio and canonical renderer.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const h=require('./studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {selectScene,compose,pause,retainSession}=require('./podcast-native1080');
const {cold,view}=require('./materials-editing-proof');
const {hash}=require('../../src/creativeTemplates/contract');
const root=path.resolve(__dirname,'../..'),folder=path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const stateFile=process.env.STUDIO_QA_STORAGE_STATE;
const baseId='viral-project-22f0e2ba-14fd-4309-a097-f1adef3b0abd';
const sourceNames=['unmuted-host-native1080.mp4','unmuted-guest-native1080.mp4'];
const [action='inspect',theme='daylight-loft']=process.argv.slice(2);
assert(['daylight-loft','midnight-studio','warm-library'].includes(theme));
const restoring=['rerecord','restore-theme','restore'].includes(action);
async function fullTimelineView(page){
 await view(page,theme);
 const rows=await page.locator('[data-testid^="pro-track-row-"]').evaluateAll(es=>es.map(e=>({id:e.dataset.testid,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom})));
 const sfx=rows.find(row=>row.id==='pro-track-row-sfx');
 assert(sfx&&sfx.bottom<=1200-24,'Complete SFX lane must be visible in the actual Studio recording');
 assert.equal(rows.length,7,'Retain all seven populated timeline lanes');
 fs.writeFileSync(path.join(folder,theme,'seven-lane-recording-check.json'),JSON.stringify({viewport:[1600,1200],rows,allSevenVisible:rows.every(row=>row.top>0&&row.bottom<=1176)},null,2));
}
async function main(){
 require('./proof-storage').requireProofSpace(folder);fs.mkdirSync(folder,{recursive:true});
 if(action==='compose'){
  const until=Date.now()+10*60000;
  while(fs.existsSync(path.join(folder,'hold-new-render'))){
   if(Date.now()>until)throw Error('Renderer review gate remains held; no new job submitted');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
 }
 const state=JSON.parse(fs.readFileSync(stateFile)),scoped=structuredClone(state);
 // Scope only this disposable browser copy. Native backup import requires an
 // empty list; retainSession merges the reviewed target with all saved records.
 for(const o of scoped.origins||[])for(const d of o.indexedDB||[])if(d.name==='autopromote-viral-studio')for(const s of d.stores||[])if(s.name==='projects')s.records=restoring?[]:s.records.filter(r=>r.value.id===baseId);
 const browser=await chromium.launch({headless:true,channel:'chromium',args:['--mute-audio','--host-resolver-rules=MAP localhost [::1]','--disk-cache-size=1048576','--media-cache-size=1048576']});
 const context=await browser.newContext({storageState:scoped,viewport:{width:1600,height:1200},acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(45000);
 let completed=false;
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  const record=state.origins.flatMap(o=>o.indexedDB||[]).filter(d=>d.name==='autopromote-viral-studio').flatMap(d=>d.stores).filter(s=>s.name==='projects').flatMap(s=>s.records).find(r=>r.value.id===baseId).value;
  if(!restoring){await page.getByRole('button',{name:record.name,exact:true}).click();await h.rail(page);await pause(page);}
  if(action==='guides'){
   const baseline=await h.save(page,'before-editing-guides');
   const requests=[];
   page.on('request',request=>{if(request.method()==='POST'&&/subject-vfx|model-runtime|render-viral/.test(request.url()))requests.push(new URL(request.url()).pathname);});
   await selectScene(page,0);
   await page.getByRole('button',{name:'Help: Background replacement',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Ask AutoPromote',exact:true});
   await dialog.getByText('Replace a background · PARTIAL',{exact:true}).waitFor();
   await dialog.getByText('Replace a background · PARTIAL',{exact:true}).click();
   await dialog.getByText(/If model execution is unavailable/).waitFor();
   await page.screenshot({path:path.join(folder,'background-help-native.png')});
   await dialog.getByRole('button',{name:'Close product help',exact:true}).click();
   await page.getByRole('button',{name:'Help: Edit in your own style',exact:true}).click();
   await dialog.getByText('Edit a video in your own style · PARTIAL',{exact:true}).waitFor();
   await dialog.getByText('Edit a video in your own style · PARTIAL',{exact:true}).click();
   await dialog.getByText(/Templates author normal editable/).waitFor();
   await page.screenshot({path:path.join(folder,'own-style-help-native.png')});
   await dialog.getByRole('button',{name:'Close product help',exact:true}).click();
   const after=await h.save(page,'after-editing-guides');
   assert.deepEqual(after.snapshot.studioDocument,baseline.snapshot.studioDocument,'Read-only guidance changed the project');
   assert.deepEqual(requests,[],'Help must not run a model or render');
   fs.writeFileSync(path.join(folder,'native-editing-guides-review.json'),JSON.stringify({at:new Date().toISOString(),realSignedInStudio:true,backgroundGuide:true,ownStyleGuide:true,projectUnchanged:true,modelOrRenderSubmissions:requests.length,canonicalHash:hash(after.snapshot.studioDocument)},null,2));
   await retainSession(page);
  }else if(action==='repair-interiors'){
   const panel=await selectScene(page,0),before=await h.save(page,'before-interior-repair-'+theme);
   const source=before.snapshot.projectMedia.find(a=>a.name===sourceNames[0]);
   const item=before.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===source.id),expected=structuredClone(item.scene.effects);
   const colour=expected.find(e=>e.id==='subject-layer-16e19da1-f179-4771-b0ee-3b64a20c72f9');
   const paths=[[[630,490],[815,490],[815,785],[630,785]],[[811,695],[932,668],[932,688],[812,712]]].map(points=>points.map(([x,y])=>[x/1920,y/1080]));
   for(const points of paths)if(!colour.paths.some(existing=>hash(existing)===hash(points)))colour.paths.push(points);
   const index=item.scene.effects.filter(e=>e.type==='foreground_holdout').findIndex(e=>e.id===colour.id);
   const control=panel.getByRole('group',{name:'Foreground holdout',exact:true}).nth(index).getByLabel('Additional holdout paths',{exact:true});
   await control.fill(JSON.stringify(colour.paths));await control.press('Tab');
   const after=await h.save(page,'interior-repaired-'+theme),current=after.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===source.id);
   assert.deepEqual(current.scene.effects,expected);assert.deepEqual(current.modelArtifactRef,item.modelArtifactRef);
   assert.deepEqual(after.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId!==source.id),before.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId!==source.id));
   await cold(page,'interior-repaired-'+theme);await retainSession(page);
   console.log('Native microphone/body interior and forearm-gap protection saved; masks and guest unchanged.');
  }else if(action==='polish'){
   // These bounded source-camera corrections are authored only through the
   // normal editable fields. The file is a reviewable recipe, not a project
   // injection or an alternative compositor.
   const patches=JSON.parse(fs.readFileSync(path.join(folder,'polish-recipe.json')));
   const baseline=await h.save(page,'before-polish-'+theme);
   for(const [index,patch] of patches.entries()){
    const panel=await selectScene(page,index);
    let saved=await h.save(page,'polish-working-'+theme);
    let item=saved.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===patch.sourceId);
    assert(item&&item.modelArtifactRef,'Retain the exact source-bound mask');
    for(const id of patch.remove){
     const effect=item.scene.effects.find(e=>e.id===id);if(!effect)continue;
     const siblings=item.scene.effects.filter(e=>e.type===effect.type);
     await panel.getByRole('group',{name:effect.type==='foreground_holdout'?'Foreground holdout':'Foreground matte refinement',exact:true}).nth(siblings.findIndex(e=>e.id===id)).getByRole('button',{name:'Remove layer',exact:true}).click();
     saved=await h.save(page,'polish-working-'+theme);item=saved.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===patch.sourceId);
    }
    for(const update of patch.updates){
     for(const [field,value] of Object.entries(update.fields)){
      const effect=item.scene.effects.find(e=>e.id===update.id);assert(effect);
      if(hash(effect[field])===hash(value))continue;
      const group=panel.getByRole('group',{name:effect.type==='foreground_holdout'?'Foreground holdout':'Foreground matte refinement',exact:true}).nth(item.scene.effects.filter(e=>e.type===effect.type).findIndex(e=>e.id===effect.id));
      if(field==='corners'){
       for(let corner=0;corner<4;corner++)for(let axis=0;axis<2;axis++){
        const control=group.getByLabel(`Holdout corner ${corner+1} ${axis?'Y':'X'}`,{exact:true});
        await control.fill(String(value[corner][axis]));await control.press('Tab');
       }
       saved=await h.save(page,'polish-working-'+theme);item=saved.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===patch.sourceId);
       assert.deepEqual(item.scene.effects.find(e=>e.id===effect.id)[field],value,'Native corner did not save');continue;
      }
      const label=field==='paths'?'Additional holdout paths':field==='clear_paths'?'Remove background fragments':field==='after_refine'?(effect.type==='foreground_holdout'?'Keep thin detail through cleanup':'Apply colour cleanup after matting'):field.replaceAll('_',' ');
      const control=group.getByLabel(label,{exact:true});
      if(typeof value==='boolean')await control.setChecked(value);
      else{await control.fill(Array.isArray(value)?JSON.stringify(value):String(value));await control.press('Tab');}
      saved=await h.save(page,'polish-working-'+theme);item=saved.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===patch.sourceId);
      assert.deepEqual(item.scene.effects.find(e=>e.id===effect.id)[field],value,'Native field did not save');
     }
    }
    const preservedBackground=baseline.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===patch.sourceId).scene.effects.find(e=>e.type==='background_replace');
    assert.deepEqual(item.scene.effects,patch.expectedEffects.map(e=>e.type==='background_replace'?preservedBackground:e),'Foreground corrections must preserve the current native background');
    assert.deepEqual(item.modelArtifactRef,baseline.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===patch.sourceId).modelArtifactRef);
   }
   await h.save(page,'polished-'+theme);await cold(page,'polished-'+theme);await retainSession(page);
   console.log('Native spring/rig edge and obsolete plant protection corrections saved; masks preserved.');
  }else if(action==='inspect-graphics'){
   await q.tool(page,'Graphics');await page.locator('.title-layer-list button').first().click();
   console.log(await page.getByTestId('title-editor').innerText());
   console.log(await page.getByTestId('title-editor').locator('select,input,textarea').evaluateAll(es=>es.map(e=>({tag:e.tagName,label:e.getAttribute('aria-label'),text:e.closest('label')?.innerText,options:e.tagName==='SELECT'?[...e.options].map(o=>o.value):undefined}))));
  }else if(action==='repair-host'){
   const panel=await selectScene(page,0),before=await h.save(page,'before-shirt-repair');
   const source=before.snapshot.projectMedia.find(a=>a.name===sourceNames[0]);
   const item=before.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===source.id);
   const expected=structuredClone(item.scene.effects);
   const metal=expected.find(e=>e.id==='subject-layer-77f8fff8-ab62-4384-b6b6-ecca90522dae');
   const colour=expected.find(e=>e.id==='subject-layer-16e19da1-f179-4771-b0ee-3b64a20c72f9');
   assert(metal&&colour&&metal.saturation===0&&colour.saturation===1);
   if(metal.paths.length===15){
    // The body and cable overlap real patterned clothing. Preserve their source
    // colour, while the separate metal rods retain their existing spill cleanup.
    colour.paths.push(...metal.paths.splice(13));
    colour.paths.push([[727,735],[800,735],[810,930],[725,930]].map(([x,y])=>[x/1920,y/1080]));
    const holds=item.scene.effects.filter(e=>e.type==='foreground_holdout');
    for(const effect of [metal,colour]){
     const group=panel.getByRole('group',{name:'Foreground holdout',exact:true}).nth(holds.findIndex(e=>e.id===effect.id));
     const control=group.getByLabel('Additional holdout paths',{exact:true});
     await control.fill(JSON.stringify(effect.paths));await control.press('Tab');
    }
   }else assert.equal(metal.paths.length,13,'Unexpected hardware recipe; inspect before editing');
   const after=await h.save(page,'shirt-repaired-'+theme),current=after.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===source.id);
   assert.deepEqual(current.scene.effects,expected,'Only the authored hardware/cloth paths may change');
   assert.deepEqual(current.modelArtifactRef,item.modelArtifactRef);
   assert.deepEqual(after.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId!==source.id),before.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId!==source.id));
   await cold(page,'shirt-repaired-'+theme);await retainSession(page);
   console.log('Native shirt/microphone protection saved; immutable mask and guest unchanged.');
  }else if(action==='prepare'){
   const baseline=await h.save(page,'before-'+theme);
   for(const index of [0,1]){
    const panel=await selectScene(page,index),letter=index?'b':'a',refined=path.join(folder,theme+'-'+letter+'-v2.png');
    const file=fs.existsSync(refined)?refined:path.join(folder,theme+'-'+letter+'.png');
    assert(fs.existsSync(file),'Missing generated background '+file);
    const before=await h.save(page,'before-'+theme+'-'+letter),source=before.snapshot.projectMedia.find(a=>a.name===sourceNames[index]);
    const original=before.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===source.id);
    assert(original.modelArtifactRef,'Retained source-bound mask missing');
    const assetHash=hash(fs.readFileSync(file)),owned=before.snapshot.projectMedia.find(asset=>asset.contentHash===assetHash);
    if(original.scene.effects.find(e=>e.type==='background_replace')?.asset_sha256!==assetHash){
     if(owned)await panel.getByLabel('Background choice',{exact:true}).selectOption(owned.id);
     else{
      await panel.getByLabel('Upload background image',{exact:true}).setInputFiles(file);
      await panel.getByText('Background saved. Create or reuse the subject mask, then render the replacement preview.',{exact:true}).waitFor({timeout:150000});
     }
    }
    if(process.env.STUDIO_QA_REFRESH_FOREGROUND_IMPLEMENTATION==='1'){
     // Rebuild through the ordinary controls after an inspected renderer repair.
     // Restore the exact authored value; retain the old job/movie separately.
     const width=panel.getByLabel('Background edge detail width',{exact:true}),value=await width.inputValue();
     await width.fill(Number(value)===8?'7':String(Number(value)+1));await width.fill(value);
    }
    const saved=await h.save(page,theme),current=saved.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===source.id);
    const withoutBackground=effects=>effects.filter(e=>e.type!=='background_replace');
    assert.deepEqual(withoutBackground(current.scene.effects),withoutBackground(original.scene.effects),'Foreground correction changed');
    assert.deepEqual(current.modelArtifactRef,original.modelArtifactRef,'Source-bound mask changed');
    assert.equal(current.scene.effects.find(e=>e.type==='background_replace').asset_sha256,hash(fs.readFileSync(file)));
    console.log('Native background imported; people/couch/rig correction unchanged:',theme,letter);
   }
   const after=await h.save(page,theme);
   const cuts=timeline=>timeline.map(({url,...clip})=>clip);
   assert.deepEqual(cuts(after.snapshot.timeline),cuts(baseline.snapshot.timeline),'Story cuts changed');
   // Keep the native saved edit and refreshed login before testing reload;
   // a transient signed-out page must not strand the just-imported plates.
   await retainSession(page);await cold(page,theme);await retainSession(page);
  }else if(action==='review-existing'){
   const index=process.argv[4]==='b'?1:0,letter=index?'b':'a';
   const panel=await selectScene(page,index),record=await h.save(page,'before-existing-review-'+theme);
   const item=record.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===record.snapshot.projectMedia.find(a=>a.name===sourceNames[index]).id);
   assert(item.preview?.jobId&&item.preview.revision&&hash(JSON.parse(item.preview.revision))===hash(item.scene),'Review only the completed exact saved composition');
   let submissions=0;page.on('request',request=>{if(request.method()==='POST'&&/subject-vfx.*(?:render|jobs)/.test(new URL(request.url()).pathname))submissions++;});
   const player=panel.getByLabel('Rendered subject effects with original audio',{exact:true});await player.waitFor();await player.scrollIntoViewIfNeeded();
   const observed=await player.evaluate(async video=>{
    const events=[];const add=event=>events.push({event:event.type,time:video.currentTime,readyState:video.readyState,paused:video.paused});
    const types=['loadstart','emptied','abort','playing','pause','waiting','stalled','ended','error'];
    for(const type of types)video.addEventListener(type,add);
    video.muted=true;
    let sampling;
    try{
     // Owned access can renew after the initial element mounts. Wait for that
     // actual link/data to settle before starting a full, uninterrupted replay.
     const deadline=Date.now()+120000;let previous='',stableSince=Date.now();
     while(Date.now()<deadline){
      if(video.src!==previous){previous=video.src;stableSince=Date.now();}
      if(video.readyState>=2&&Number.isFinite(video.duration)&&video.duration>0&&Date.now()-stableSince>2000)break;
      await new Promise(resolve=>setTimeout(resolve,200));
     }
     if(video.readyState<2)throw Error('Existing owned preview has not loaded');
     sampling=setInterval(()=>events.push({event:'sample',time:video.currentTime,readyState:video.readyState,paused:video.paused}),1000);
     video.currentTime=0;await video.play();
     await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Existing preview playback remains incomplete')),30000);video.addEventListener('ended',()=>{clearTimeout(timer);resolve();},{once:true});});
     return {ended:video.ended,time:video.currentTime,duration:video.duration,events};
    }catch(error){return {ended:video.ended,time:video.currentTime,duration:video.duration,error:error.message,events};}
    finally{clearInterval(sampling);for(const type of types)video.removeEventListener(type,add);}
   });
   fs.writeFileSync(path.join(folder,theme+'-'+letter+'-preview-review-observation.json'),JSON.stringify(observed,null,2));
   assert(observed.ended&&Math.abs(observed.time-observed.duration)<.1);
   await panel.getByLabel(/I reviewed the sound/).check();
   const saved=await h.save(page,theme);await retainSession(page);
   const current=saved.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===item.scene.sourceId);assert.equal(current.preview.jobId,item.preview.jobId);assert(current.preview.reviewed);assert.equal(submissions,0);
   const response=await context.request.get(await player.getAttribute('src'),{timeout:120000});assert(response.ok());const bytes=await response.body();assert.equal(hash(bytes),current.preview.receipt.output_sha256);
   fs.writeFileSync(path.join(folder,theme+'-'+letter+'.mp4'),bytes);fs.writeFileSync(path.join(folder,theme+'-'+letter+'-receipt.json'),JSON.stringify(current.preview.receipt,null,2));
   fs.writeFileSync(path.join(folder,theme+'-'+letter+'-existing-preview-playback.json'),JSON.stringify({...observed,jobId:item.preview.jobId,newSubmissions:submissions,scope:'Muted native full playback; technical acknowledgement only.'},null,2));
   console.log('Existing exact composition played completely and retained; no new submission.');
  }else if(action==='compose'||action==='collect'){
   const index=process.argv[4]==='b'?1:0;
   if(action==='compose')await compose(page,index);
   else{
    const existing=await h.save(page,theme),source=existing.snapshot.projectMedia.find(asset=>asset.name===sourceNames[index]);
    const item=existing.snapshot.subjectVfxScenes.find(scene=>scene.scene.sourceId===source.id);
    assert(item.preview?.reviewed&&item.preview.revision&&hash(JSON.parse(item.preview.revision))===hash(item.scene),'Collect only the exact reviewed saved render; never resubmit');
   }
   await retainSession(page);
   const rec=await h.save(page,theme),source=rec.snapshot.projectMedia.find(a=>a.name===sourceNames[index]);
   const item=rec.snapshot.subjectVfxScenes.find(s=>s.scene.sourceId===source.id);
   assert.equal(item.preview.receipt.gpuCount,0);
   const panel=await selectScene(page,index),player=panel.getByLabel('Rendered subject effects with original audio',{exact:true});
   const url=await player.getAttribute('src');assert(url&&!url.startsWith('blob:'),'Owned preview URL unavailable');
   const response=await context.request.get(url,{timeout:120000});assert(response.ok());const bytes=await response.body();
   assert.equal(hash(bytes),item.preview.receipt.output_sha256);
   const letter=index?'b':'a';fs.writeFileSync(path.join(folder,theme+'-'+letter+'.mp4'),bytes);
   fs.writeFileSync(path.join(folder,theme+'-'+letter+'-receipt.json'),JSON.stringify(item.preview.receipt,null,2));
   console.log(JSON.stringify({theme,camera:letter,jobId:item.preview.jobId,pixelSha256:item.preview.receipt.pixel_sha256,frames:item.preview.receipt.frames}));
  }else if(action==='deliver'){
   let record=await h.save(page,theme);
   assert(record.snapshot.subjectVfxScenes.every(s=>s.preview?.reviewed&&s.preview.revision&&hash(JSON.parse(s.preview.revision))===hash(s.scene)),'Both exact compositions must be reviewed');
   // Busy shelves and bright windows need the existing native title shadow.
   // Keep title wording, colour, geometry and timing; only contrast changes.
   const titles=record.snapshot.overlays.filter(overlay=>overlay.type==='text'&&!overlay.isCaption);
   if(titles.some(title=>title.shadow!=='strong')){
    await q.tool(page,'Graphics');
    for(let index=0;index<titles.length;index++){
     await page.locator('.title-layer-list button').nth(index).click();
     await page.getByTestId('title-editor').locator('label').filter({has:page.locator('span',{hasText:/^Shadow$/i})}).locator('select').selectOption('strong');
    }
    const updated=await h.save(page,theme);
    for(const original of titles){
     const title=updated.snapshot.overlays.find(overlay=>overlay.id===original.id);assert.equal(title.shadow,'strong');
     for(const key of ['text','color','x','y','width','startTime','duration'])assert.deepEqual(title[key],original[key]);
    }
    record=updated;
   }
   await page.getByLabel('Edited output position',{exact:true}).evaluate(element=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,'0');
    element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await pause(page);
   await q.tool(page,'Export');const dismiss=page.locator('.viral-render-recovery').getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.click();
   await h.render(page,theme);await cold(page,theme);await fullTimelineView(page);await retainSession(page);
  }else if(action==='rerecord'||action==='restore-theme'){
   const expected=JSON.parse(fs.readFileSync(path.join(folder,theme+'-project.private.json')));
   await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
   await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,theme+'-project.private.json'));
   await page.getByRole('button',{name:record.name,exact:true}).click();await h.rail(page);await pause(page);
   const restored=await h.save(page,'restored-'+theme);
   assert.equal(hash(restored.snapshot.studioDocument),hash(expected.snapshot.studioDocument));
   if(action==='rerecord'){
    const receipt=JSON.parse(fs.readFileSync(path.join(folder,theme,'render-receipt.json')));
    assert.equal(hash(restored.snapshot.studioDocument),receipt.projectHash,'Re-record only the exact existing export; do not resubmit');
    await q.tool(page,'Export');
    if(!await page.getByTestId('rendered-output-ready').isVisible())await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.join(folder,theme,'render-receipt.json'));
    await fullTimelineView(page);
   }
   await retainSession(page);
  }else if(action==='restore'){
   await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
   await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,'original-project.private.json'));
   await page.getByRole('button',{name:record.name,exact:true}).click();await h.rail(page);await pause(page);
   const restored=await h.save(page,'restored-original');
   assert.equal(hash(restored.snapshot.studioDocument),hash(JSON.parse(fs.readFileSync(path.join(folder,'original-project.private.json'))).snapshot.studioDocument));await retainSession(page);
  }else if(action==='inspect'){
   const rec=await h.save(page,'current');console.log(JSON.stringify({project:rec.id,canonical:hash(rec.snapshot.studioDocument),scenes:rec.snapshot.subjectVfxScenes.map(s=>({id:s.scene.id,pending:s.pending?.jobId,preview:s.preview?.jobId,effects:s.scene.effects.length}))}));
   await page.screenshot({path:path.join(folder,'current-studio.png')});
  }else throw Error('Unknown action');
  completed=true;
 }catch(error){await page.screenshot({path:path.join(folder,'failure-'+theme+'.png')}).catch(()=>{});throw error;}
 finally{if(!completed&&await page.getByTestId('studio-pro-timeline').isVisible().catch(()=>false))await retainSession(page);await browser.close();}
}
main().catch(error=>{console.error(String(error.stack||error).replace(/https?:\/\/[^\s"<>]+/g,'[URL]'));process.exitCode=1;});
