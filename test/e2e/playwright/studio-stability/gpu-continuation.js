#!/usr/bin/env node
// Real UI only. The caller must supply a currently authorized, running worker.
// This command never starts an instance or approves new transcript wording.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const q=require('./run'),f=require('./flows');
const base=process.env.STUDIO_QA_GPU_SOURCE||'Studio QA 20261008 captions';
const subject=process.env.STUDIO_QA_GPU_SUBJECT||'Studio QA 20261008 GPU subject final';
const captions=process.env.STUDIO_QA_GPU_CAPTIONS||'Studio QA 20261008 NVIDIA captions';
(async()=>{const {browser,page}=await q.connect();try{
 if(!await page.getByRole('navigation',{name:'Creative tools'}).count()){
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('region',{name:'Saved Studio projects'}).getByRole('button',{name:base,exact:true}).click();
  await page.getByRole('navigation',{name:'Creative tools'}).waitFor();
 }
 const phase=process.argv[2],events=[];
 page.on('response',async response=>{
  const route=new URL(response.url()).pathname;
  if(!/studio-subject-vfx|transcribe|\/media\/status\//.test(route))return;
  const body=await response.json().catch(()=>({}));
  events.push({path:route,status:response.status(),jobId:body.jobId,jobStatus:body.status,
   error:body.message,engine:body.result?.engine||body.engine});
 });
 if(phase==='subject'){
  await f.prepareSubject(page,base,subject);
  for(const type of ['background_grade','tracked_callout','depth']){
   await page.getByLabel('Subject effect type',{exact:true}).selectOption(type);
   await page.getByRole('button',{name:'Add layer',exact:true}).click();
  }
  await page.getByTestId('studio-save-project').click();
  await page.getByRole('button',{name:'Render subject preview',exact:true}).click();
  await page.getByLabel('Rendered subject effects with original audio',{exact:true}).waitFor({timeout:240000});
  await q.inspect(page,'gpu-subject-result');
  const src=await page.getByLabel('Rendered subject effects with original audio',{exact:true}).getAttribute('src');
  const response=await page.context().request.get(src);assert(response.ok());
  const folder=path.join(q.report,'subject');fs.mkdirSync(folder,{recursive:true});
  const file=path.join(folder,'preview.mp4');
  assert(!fs.existsSync(file),'Archive the previous preview before running a new attempt');
  fs.writeFileSync(file,await response.body());q.verifyMedia(file,{duration:3,width:1280,height:720,audio:true});
  fs.writeFileSync(path.join(q.report,'gpu-subject-api.json'),JSON.stringify({at:new Date().toISOString(),events,noMocks:true},null,2));
  console.log('Subject preview produced. Inspect edges/occlusion/tracking and verify audio before reviewing it.');
 }else if(phase==='subject-recover'){
  await f.open(page,subject);await q.tool(page,'Composite');
  const check=page.getByRole('button',{name:'Check saved render',exact:true});
  if(await check.isVisible())await check.click();
  const video=page.getByLabel('Rendered subject effects with original audio',{exact:true});
  await video.waitFor({timeout:60000});
  await page.getByTestId('studio-save-project').click();
  const response=await page.context().request.get(await video.getAttribute('src'));assert(response.ok());
  const folder=path.join(q.report,'subject');fs.mkdirSync(folder,{recursive:true});
  const file=path.join(folder,'preview.mp4');assert(!fs.existsSync(file),'Preserve the previous preview');
  fs.writeFileSync(file,await response.body());
  const technical=q.verifyMedia(file,{duration:3,width:1280,height:720,audio:true});
  await q.inspect(page,'gpu-subject-recovered');
  fs.writeFileSync(path.join(folder,'recovery.json'),JSON.stringify({at:new Date().toISOString(),events,technical,
   realAuth:true,noMocks:true,newGpuJobsStarted:0,reviewed:false},null,2));
  console.log('Same owned subject job recovered, saved and decoded; review still required.');
 }else if(phase==='subject-export'){
  await f.open(page,subject);await q.tool(page,'Composite');
  assert(await page.getByLabel('I reviewed the sound, subject edges and camera cuts',{exact:true}).isChecked(),
   'Review the real played preview before exporting');
  await q.render(page,'vfx',{duration:12,width:1280,height:720,audio:true});
 }else if(phase==='captions'){
  await f.open(page,base);await f.duplicate(page,captions);await q.tool(page,'Captions');
  await page.getByTestId('generate-live-transcript').click();
  await page.waitForFunction(()=>{
   const e=document.querySelector('.caption-generation-status');
   return e&&/is-review|is-ready|is-failed/.test(e.className);
  },undefined,{timeout:240000});
  const msg=await page.locator('.caption-generation-status').innerText();
  assert.equal(await page.locator('.caption-generation-status.is-failed').count(),0,msg);
  const draft=await page.locator('textarea[aria-label^="Caption "]').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),text:e.value})));
  await page.getByTestId('studio-save-project').click();await q.inspect(page,'gpu-caption-transcript');
  fs.writeFileSync(path.join(q.report,'gpu-caption-transcript.json'),JSON.stringify({at:new Date().toISOString(),events,captions:draft,msg,wordingApproved:false,realAuth:true,noMocks:true},null,2));
  // Select a wide finishing canvas through Studio. Caption wording remains
  // unapproved and the renderer must mark this as a draft review copy.
  await q.tool(page,'Reframe');await page.getByTestId('reframe-aspect-16-9').click();
  await page.getByTestId('studio-save-project').click();
  await q.render(page,'captions',{duration:12,width:1280,height:720,audio:true});
 }else throw Error('Use subject, subject-export or captions');
}finally{await browser.close()}})().catch(error=>{console.error(error.message);process.exitCode=1});
