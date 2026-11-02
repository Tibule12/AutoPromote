#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const h=require('./studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {hash}=require('../../src/creativeTemplates/contract');
const {saveAuthenticatedState}=require('./studio-session');
const folder=path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR),state=process.env.STUDIO_QA_STORAGE_STATE;
const titleMode=process.env.STUDIO_QA_MASK_TARGET==='title';
const name=titleMode?'Studio — feathered inverted title · 20261013':'Studio — feathered and inverted masks · 20261013';
async function range(input,value){await input.evaluate((el,v)=>{
 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(v));
 el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
},value);}
async function pause(page){const b=page.getByRole('button',{name:'Pause comparison',exact:true});if(await b.isVisible())await b.click();}
async function main(){
 fs.mkdirSync(folder,{recursive:true});
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--disk-cache-size=1048576','--media-cache-size=1048576']});
 const context=await browser.newContext({storageState:state,viewport:{width:1600,height:1400},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(45000);
 try{
  await page.goto('http://localhost:5000/?studioTemplateSession=soft-mask');
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  const retained=(await h.records(page)).find(p=>p.name===name);
  await page.getByRole('button',{name:retained?name:titleMode?'Studio — title mask alignment · 20261013':'Studio — geometric masks and animated crop · 20261013',exact:true}).click();
  await h.rail(page);await pause(page);
  const original=await h.save(page,'original');
  if(!retained){
   await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
   await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
   await page.getByLabel('Project name',{exact:true}).fill(name);
  }
  await q.tool(page,'Export');const live=page.getByRole('button',{name:'Show Live Edit',exact:true});if(await live.isVisible())await live.click();
  await range(page.getByLabel('Edited output position',{exact:true}),1);
  const base=await h.save(page,'before'),images=base.snapshot.overlays.filter(o=>o.type===(titleMode?'text':'image'));assert.equal(images.length,titleMode?1:3);
  if(process.env.STUDIO_QA_CAPTURE!=='1'){
  await q.tool(page,'Composite');
  for(const[index,image]of images.entries()){
   await page.getByText('Composite target',{exact:true}).locator('..').locator('select').selectOption(image.id);
   await page.getByRole('checkbox',{name:/Enable mask/}).check();
   await range(page.getByRole('slider',{name:/^Feather/}),titleMode?18:[18,20,12][index]);
   const inverse=page.getByRole('checkbox',{name:'Invert mask',exact:true});
   if((index===1||titleMode)&&await inverse.isChecked())await inverse.uncheck();
   if(index===0&&!titleMode)await inverse.uncheck();else await inverse.check();
   if(index===1||titleMode){
    await page.waitForTimeout(600);await page.getByTestId('studio-undo-button').click();assert.equal(await inverse.isChecked(),false);
    await page.getByTestId('studio-redo-button').click();assert.equal(await inverse.isChecked(),true);
   }
  }
  }
  const edited=await h.save(page,'edited');
  assert.deepEqual(edited.snapshot.overlays.map(o=>Number(o.mask.feather)),titleMode?[18]:[18,20,12]);
  assert.deepEqual(edited.snapshot.overlays.map(o=>!!o.mask.inverted),titleMode?[true]:[false,true,true]);
  await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);
  const reopened=await h.save(page,'reopened');assert.equal(hash(reopened.snapshot.studioDocument),hash(edited.snapshot.studioDocument));
  await q.tool(page,'Export');const showLive=page.getByRole('button',{name:'Show Live Edit',exact:true});if(await showLive.isVisible())await showLive.click();
  // Native keyboard deselection removes editor handles/selection shadows from
  // the programme comparison without changing the authored project.
  await page.getByRole('separator',{name:'Resize timeline',exact:true}).focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.draggable-overlay.active').count(),0);
  const samples=[];
  for(const[index,time]of[.5,1,1.5].entries()){
   await range(page.getByLabel('Edited output position',{exact:true}),time);
   await page.waitForFunction(t=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=3&&Math.abs(v.currentTime-t)<.001;},time);
   await page.waitForTimeout(200);
   assert.equal(await page.getByTestId('studio-program-canvas').getAttribute('data-programme-source'),'source');
   const stage=page.getByTestId('hook-preview-frame');
   const properties=await stage.evaluate(el=>[...el.querySelectorAll('.draggable-overlay')].map(n=>({
    clip:getComputedStyle(n).clipPath,mask:getComputedStyle(n).maskImage,feather:n.dataset.maskFeather,inverted:n.dataset.maskInverted,
    x:n.style.left,y:n.style.top,width:n.style.width,height:n.style.height
   })));
   assert(properties.every(p=>p.mask.startsWith('url(')&&p.clip==='none'));
   const background=await page.getByTestId('studio-program-canvas').evaluate(c=>c.toDataURL('image/png'));
   fs.writeFileSync(path.join(folder,`background-${index}.png`),Buffer.from(background.split(',')[1],'base64'));
   await stage.screenshot({path:path.join(folder,`native-${index}.png`)});
   samples.push({time,properties});
  }
  fs.writeFileSync(path.join(folder,'native-masks.json'),JSON.stringify(samples,null,2));
  console.log('Native feather/invert, history, save/cold reopen and actual alpha-mask preview passed.');
  if(process.env.STUDIO_QA_CAPTURE==='1'){
   const after=await h.save(page,'captured');assert.equal(hash(after.snapshot.studioDocument),hash(edited.snapshot.studioDocument));
   console.log('Repaired native mask pixels captured; edit unchanged and no render resubmission.');return;
  }
  await h.render(page,'soft-masks');
  await require('./materials-editing-proof').view(page,'soft-masks');
  const frames=path.join(folder,'soft-masks/studio-recording-frames'),files=fs.readdirSync(frames).filter(f=>f.endsWith('.jpg')).sort();
  for(const[index,label]of[[0,'start'],[Math.floor(files.length/2),'middle'],[files.length-1,'end']])fs.copyFileSync(path.join(frames,files[index]),path.join(folder,'soft-masks',`studio-${label}.jpg`));
  fs.rmSync(frames,{recursive:true});
  const after=await h.save(page,'after');assert.equal(hash(after.snapshot.studioDocument),hash(edited.snapshot.studioDocument));
  const receipt=JSON.parse(fs.readFileSync(path.join(folder,'soft-masks/render-receipt.json')));
  fs.writeFileSync(path.join(folder,'native-soft-mask-lifecycle.json'),JSON.stringify({
   projectId:after.id,canonicalHash:receipt.projectHash,outputHash:receipt.outputSha256,
   nativeFeatherInvertUndoRedoSaveColdReopenPreviewExportDownloadFullTimeline:true,newGpuJobs:0,
   scope:`Ordinary ${titleMode?'title':'image'} geometric masks; alpha comparison separate. No AI/creative/public readiness claim.`
  },null,2));
  console.log('Native soft/inverted mask film and editable Studio timeline passed.');
 }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(folder,'failure.json'),JSON.stringify({error:error.message,qualified:false}));throw error;}
 finally{saveAuthenticatedState(await context.storageState({indexedDB:true}),state);await context.close();await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
