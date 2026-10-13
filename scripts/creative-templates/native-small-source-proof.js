#!/usr/bin/env node
// Real uploaded source, ordinary title controls, history/save/reopen/export.
// The short footage derivative is a composition diagnostic, not a showcase.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const h=require('./studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {hash}=require('../../src/creativeTemplates/contract');
const {saveAuthenticatedState}=require('./studio-session');
const folder=path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR),state=process.env.STUDIO_QA_STORAGE_STATE;
const name=process.env.STUDIO_QA_PROJECT_NAME || 'VELO — small source composition · 20261012';
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
  await page.goto('http://localhost:5000/?studioTemplateSession=small-source-composition');
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.locator('.creator-studio-dropzone input[type=file]').setInputFiles(process.env.STUDIO_QA_SOURCE_VIDEO);
  const open=page.getByRole('button',{name:'Open Creator Studio',exact:true});
  await open.waitFor({timeout:90000});await open.click();await h.rail(page);
  await page.getByLabel('Project name',{exact:true}).fill(name);
  const pause=page.getByRole('button',{name:'Pause comparison',exact:true});if(await pause.isVisible())await pause.click();
  // Disable reframe for the whole source at its exact first frame. Import
  // autoplay can otherwise leave this edit at a fractional cut boundary.
  await range(page.getByLabel('Edited output position',{exact:true}),0);
  await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=3&&Math.abs(v.currentTime)<.001;});
  await q.tool(page,'Reframe');await page.getByTestId('auto-reframe-toggle').uncheck();
  await q.tool(page,'Graphics');
  await page.getByRole('button',{name:/Headline.*Bold hook copy/}).click();
  await page.getByLabel('Title text',{exact:true}).fill('FRAME CHECK');
  await page.getByLabel('Title background color',{exact:true}).fill('#00ff00');
  await page.getByLabel('Title text color',{exact:true}).fill('#00ff00');
  await page.getByLabel('Title start time',{exact:true}).fill('0');
  await page.getByLabel('Title duration',{exact:true}).fill('2');
  await q.tool(page,'Motion');await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();
  const inspector=page.getByRole('tabpanel').filter({has:page.getByRole('heading',{name:'Animate transform, crop and opacity',exact:true})});
  const titleProject=await h.save(page,'before-position');
  const title=titleProject.snapshot.overlays.find(item=>item.type==='text');assert(title,'Missing edited title');
  await inspector.getByText('Target layer',{exact:true}).locator('..').locator('select').selectOption(title.id);
  // The headline preset has authored poses. Remove them through its real
  // controls before testing a static base position; keys otherwise override it.
  const remove=inspector.getByRole('button',{name:/Remove transform pose at/});
  while(await remove.count())await remove.first().click();
  await inspector.getByLabel('X',{exact:true}).fill('50');
  await inspector.getByLabel('Y',{exact:true}).fill('40');await page.waitForTimeout(600);
  await inspector.getByLabel('Y',{exact:true}).fill('50');await page.waitForTimeout(600);
  await page.getByTestId('studio-undo-button').click();assert.equal(await inspector.getByLabel('Y',{exact:true}).inputValue(),'40.0');
  await page.getByTestId('studio-redo-button').click();assert.equal(await inspector.getByLabel('Y',{exact:true}).inputValue(),'50.0');
  if(process.env.STUDIO_QA_TITLE_MASK){
    await q.tool(page,'Composite');
    await page.getByText('Composite target',{exact:true}).locator('..').locator('select').selectOption(title.id);
    await page.getByRole('checkbox',{name:/Enable mask/}).check();
    await page.getByRole('button',{name:process.env.STUDIO_QA_TITLE_MASK,exact:true}).click();
  }
  await q.tool(page,'Sound');
  await page.getByTestId('background-sound-input').setInputFiles(process.env.STUDIO_QA_SOURCE_MUSIC);
  await range(page.getByRole('slider',{name:/Background volume/}),15);
  const duck=page.getByRole('checkbox',{name:/Duck under speech/});if(await duck.isChecked())await duck.uncheck();
  const edited=await h.save(page,'edited');
  assert.equal(edited.snapshot.smartCrop,false);
  const positioned=edited.snapshot.overlays.find(item=>item.id===title.id);
  assert.equal(positioned.x,50);assert.equal(positioned.y,50);
  await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();await h.rail(page);
  const reopened=await h.save(page,'reopened');assert.equal(hash(reopened.snapshot.studioDocument),hash(edited.snapshot.studioDocument));
  await range(page.getByLabel('Edited output position',{exact:true}),1);
  await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=3;});
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);
  const frame=page.getByTestId('hook-preview-frame');
  const geometry=await frame.evaluate(el=>{
   const stage=el.getBoundingClientRect(),title=el.querySelector('.draggable-overlay');
   const box=title?.getBoundingClientRect();return {stage:{width:stage.width,height:stage.height},
    title:box?{left:(box.left-stage.left)/stage.width,top:(box.top-stage.top)/stage.height,width:box.width/stage.width,height:box.height/stage.height}:null};
  });
  fs.writeFileSync(path.join(folder,'native-title-geometry.json'),JSON.stringify(geometry,null,2)+'\n');
  await frame.screenshot({path:path.join(folder,'native-title-frame.png')});
  await h.render(page,'small-source');await require('./materials-editing-proof').view(page,'small-source');
  const frames=path.join(folder,'small-source/studio-recording-frames'),files=fs.readdirSync(frames).filter(f=>f.endsWith('.jpg')).sort();
  for(const[index,label]of[[0,'start'],[Math.floor(files.length/2),'middle'],[files.length-1,'end']])fs.copyFileSync(path.join(frames,files[index]),path.join(folder,'small-source',`studio-${label}.jpg`));
  const released=fs.readdirSync(frames).reduce((s,f)=>s+fs.statSync(path.join(frames,f)).blocks*512,0);fs.rmSync(frames,{recursive:true});
  fs.writeFileSync(path.join(folder,'native-small-source-receipt.json'),JSON.stringify({projectId:edited.id,
   nativeUploadTitleEditHistorySaveColdReopen:true,nativeRenderDownloadFullDecodeAndTimeline:true,
   sourceExpectedDimensions:{width:320,height:240},recordingScratchBytesReleased:released,newGpuJobs:0,
   scope:'Small-source native lifecycle and declared output dimensions. Picture comparison is separate; not creative/public qualification.'},null,2)+'\n');
  saveAuthenticatedState(await context.storageState({indexedDB:true}),state);
  console.log('Native small-source title/history/reopen/export/full movie with timeline passed.');
 }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(folder,'failure.json'),JSON.stringify({error:error.message,qualified:false})+'\n');
  saveAuthenticatedState(await context.storageState({indexedDB:true}),state);throw error;}
 finally{await context.close();await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
