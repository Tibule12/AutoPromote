#!/usr/bin/env node
// Exercise existing layer-effect controls, editable graph and CPU export.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {hash}=require('../../src/creativeTemplates/contract');
const {saveAuthenticatedState}=require('./studio-session');
const h=require('./studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const folder=path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR),state=process.env.STUDIO_QA_STORAGE_STATE;
const name='VELO — zero layer effects · 20261012';
async function range(input,value){await input.evaluate((el,v)=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(v));
  el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
},value);}
async function main(){
 fs.mkdirSync(folder,{recursive:true});
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio']});
 const context=await browser.newContext({storageState:state,viewport:{width:1600,height:1400},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(45000);
 try{
  await page.goto('http://localhost:5000/?studioTemplateSession=zero-layer-effects');
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name:'VELO — owned audio · 20261012',exact:true}).click();
  await h.rail(page);const original=await h.save(page,'original');
  const image=original.snapshot.overlays.find(layer=>layer.type==='image');assert(image,'Missing retained image layer');
  await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name',{exact:true}).fill(name);
  const pause=page.getByRole('button',{name:'Pause comparison',exact:true});if(await pause.isVisible())await pause.click();
  await range(page.getByLabel('Edited output position',{exact:true}),17);
  await q.tool(page,'Motion');
  await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();
  await page.getByText('Target layer',{exact:true}).locator('..').locator('select').selectOption(image.id);
  await page.getByLabel('Enable layer glow',{exact:true}).check();
  await range(page.getByRole('slider',{name:/Glow radius/}),0);
  await page.getByLabel('Enable layer shadow',{exact:true}).check();
  await range(page.getByRole('slider',{name:/Shadow blur/}),0);
  await page.getByLabel('Layer shadow Y offset',{exact:true}).fill('10');await page.waitForTimeout(600);
  await page.getByLabel('Layer shadow Y offset',{exact:true}).fill('0');await page.waitForTimeout(600);
  await page.getByTestId('studio-undo-button').click();
  assert.equal(await page.getByLabel('Layer shadow Y offset',{exact:true}).inputValue(),'10');
  await page.getByTestId('studio-redo-button').click();
  assert.equal(await page.getByLabel('Layer shadow Y offset',{exact:true}).inputValue(),'0');
  for(const label of ['Enable layer glow','Enable layer shadow']){
    await page.getByLabel(label,{exact:true}).uncheck();await page.getByLabel(label,{exact:true}).check();
  }
  assert.equal(await page.getByRole('slider',{name:/Glow radius/}).inputValue(),'0');
  assert.equal(await page.getByRole('slider',{name:/Shadow blur/}).inputValue(),'0');
  const edited=await h.save(page,'edited');
  const layer=edited.snapshot.overlays.find(row=>row.id===image.id);
  assert.equal(layer.glow.radius,0);assert.equal(layer.layerShadow.blur,0);assert.equal(layer.layerShadow.y,0);
  // History restores its saved editing moment. Seek back to the actual image
  // occurrence before measuring its native filter; an absent layer is no test.
  await range(page.getByLabel('Edited output position',{exact:true}),17);
  await page.waitForFunction(()=>{
    const video=document.querySelector('[data-testid="studio-after-video"]');
    return video&&!video.seeking&&video.readyState>=3&&
      document.querySelector('.draggable-overlay.is-media-overlay');
  });
  const filters=await page.locator('.draggable-overlay.is-media-overlay').evaluateAll(items=>items.map(el=>({
    inline:el.style.filter,computed:getComputedStyle(el).filter,
  })));
  fs.writeFileSync(path.join(folder,'native-preview-filters.json'),JSON.stringify(filters,null,2)+'\n');
  // Chromium serializes the color before the lengths. Compare the computed
  // zero vector, not the JSX string ordering (no alignment/tolerance change).
  assert(filters.some(row=>{
    const lengths=[...row.computed.matchAll(/(-?[0-9.]+)px/g)].map(match=>Number(match[1]));
    return row.computed.split('drop-shadow(').length===3&&lengths.length>=4&&lengths.every(value=>value===0);
  }),'Native zero shadow/glow defaults changed');
  await page.screenshot({path:path.join(folder,'native-zero-effects.png')});
  console.log('Native zero layer controls/toggles/history and preview settings verified.');
  await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();
  const reopened=await h.save(page,'reopened');assert.equal(hash(reopened.snapshot.studioDocument),hash(edited.snapshot.studioDocument));
  await h.render(page,'zero-effects');
  const request=JSON.parse(fs.readFileSync(path.join(folder,'zero-effects-render-request.private.json')));
  const plan=request.options.viralData.composition_plan.layers.find(row=>row.id===image.id);
  assert.equal(plan.effects.glow.radius,0);assert.equal(plan.effects.shadow.blur,0);assert.equal(plan.effects.shadow.y,0);
  await require('./materials-editing-proof').view(page,'zero-effects');
  const frames=path.join(folder,'zero-effects/studio-recording-frames'),files=fs.readdirSync(frames).filter(f=>f.endsWith('.jpg')).sort();
  for(const [index,label]of[[0,'start'],[Math.floor(files.length/2),'middle'],[files.length-1,'end']])
    fs.copyFileSync(path.join(frames,files[index]),path.join(folder,`zero-effects/studio-${label}.jpg`));
  const released=fs.readdirSync(frames).reduce((sum,f)=>sum+fs.statSync(path.join(frames,f)).blocks*512,0);fs.rmSync(frames,{recursive:true});
  const receipt=JSON.parse(fs.readFileSync(path.join(folder,'zero-effects/render-receipt.json')));
  const retained=(await h.records(page)).find(p=>p.id===original.id);assert.equal(hash(retained.snapshot.studioDocument),hash(original.snapshot.studioDocument));
  fs.writeFileSync(path.join(folder,'native-zero-effects-receipt.json'),JSON.stringify({
    at:new Date().toISOString(),projectId:edited.id,canonicalHash:receipt.projectHash,outputHash:receipt.outputSha256,
    nativeEditToggleUndoRedo:true,nativeSaveColdReopen:true,exactZeroPreviewFilters:filters,
    compiledEffects:plan.effects,nativeCpuExportDownloadAndFullStudioTimeline:true,originalProjectPreserved:true,
    recordingScratchBytesReleased:released,newGpuJobs:0,
    scope:'Native saved zero glow radius/shadow blur/offset, toggles and history; exact canonical/control/render settings and real CPU film/timeline lifecycle. Exact retimed pixel raster/full effect/creative/public qualification remains open.',
  },null,2)+'\n');
  saveAuthenticatedState(await context.storageState({indexedDB:true}),state);
  console.log('Native zero layer effects/save/reopen/export/full movie plus timeline pass.');
 }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});
   fs.writeFileSync(path.join(folder,'failure.json'),JSON.stringify({error:error.message,noMocks:true,qualified:false},null,2)+'\n');throw error;}
 finally{await context.close();await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
