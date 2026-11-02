#!/usr/bin/env node
// Real controls, owned CPU samples and an ordinary editable Studio export.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {hash}=require('../../src/creativeTemplates/contract');
const {saveAuthenticatedState}=require('./studio-session');
const h=require('./studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const folder=path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR),state=process.env.STUDIO_QA_STORAGE_STATE;
const name=process.env.STUDIO_QA_PROJECT_NAME || 'VELO — prepared speech edit · 20261012';
async function range(input,value){await input.evaluate((el,v)=>{
 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(v));
 el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
},value);}
async function main(){
 fs.mkdirSync(folder,{recursive:true});
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio']});
 const context=await browser.newContext({storageState:state,viewport:{width:1600,height:1500},acceptDownloads:true});
 await context.addInitScript(()=>{
  const starts=[],start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args){
   if(this.studioVoiceoverId==='prepared-voice-bus')starts.push({sampleRate:this.buffer.sampleRate,frames:this.buffer.length});
   return start.apply(this,args);
  };
  window.__readPreparedVoiceStarts=()=>starts;
 });
 const page=await context.newPage();page.setDefaultTimeout(45000);
 const processed=[];
 page.on('response',async response=>{
  if(new URL(response.url()).pathname!=='/api/media/studio-assets/voice-bus-preview'||!response.ok())return;
  const data=await response.json();const input=response.request().postDataJSON();
  const gain=input.voices[0].volume;
  const bytes=Buffer.from(data.voiceBase64,'base64');assert.equal(hash(bytes),data.voiceHash);
  fs.writeFileSync(path.join(folder,`processed-voice-${data.voiceHash}.wav`),bytes,{mode:0o600});
  processed.push({projectId:data.projectId,gain,parametersHash:data.parametersHash,runtimeHash:data.runtimeHash,
   voiceHash:data.voiceHash,duckHash:data.duckHash,sourceGenerations:data.sourceGenerations,runtimeSeconds:data.runtimeSeconds});
 });
 const ready=async(gain,after=0)=>{
  const deadline=Date.now()+45000;
  while(!processed.slice(after).some(p=>p.projectId===projectId&&p.gain===gain)){
   assert(Date.now()<deadline,'Missing actual owned processed speech response');await page.waitForTimeout(100);
  }
  // Use the ordinary Play control, which awaits the actual verified decode.
  // The inspector's status can be below the scroll fold or superseded by Save.
  const previous=await page.evaluate(()=>window.__readPreparedVoiceStarts().length);
  await page.getByRole('button',{name:'Play comparison',exact:true}).click();
  await page.waitForFunction(count=>window.__readPreparedVoiceStarts().length>count,previous);
  await page.getByRole('button',{name:'Pause comparison',exact:true}).click();
 };
 let projectId;
 try{
  await page.goto('http://localhost:5000/?studioTemplateSession=prepared-voice-edit');
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name:'VELO — retimed speech ducking · 20261012',exact:true}).click();
  await h.rail(page);const original=await h.save(page,'original');
  await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name',{exact:true}).fill(name);
  const duplicate=await h.save(page,'duplicate');projectId=duplicate.id;
  await q.tool(page,'Sound');await ready(.7);
  const slider=page.getByLabel('Volume for Speech proof',{exact:true});
  let responseStart=processed.length;
  await range(slider,.5);await ready(.5,responseStart);assert.equal(await slider.inputValue(),'0.5');
  responseStart=processed.length;
  await page.getByTestId('studio-undo-button').click();await ready(.7,responseStart);assert.equal(await slider.inputValue(),'0.7');
  responseStart=processed.length;
  await page.getByTestId('studio-redo-button').click();await ready(.5,responseStart);assert.equal(await slider.inputValue(),'0.5');
  const before=await h.save(page,'edited');
  assert.equal(before.snapshot.voiceovers[0].volume,.5);
  await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();
  const reopened=await h.save(page,'reopened');assert.equal(hash(reopened.snapshot.studioDocument),hash(before.snapshot.studioDocument));
  await ready(.5);
  const a=processed.find(p=>p.projectId===projectId&&p.gain===.7),b=processed.find(p=>p.projectId===projectId&&p.gain===.5);
  assert(a&&b&&a.voiceHash!==b.voiceHash&&a.duckHash!==b.duckHash,'Gain must change actual voice and compressor samples');
  const resize=page.getByRole('separator',{name:'Resize timeline'});await resize.focus();
  for(let i=0;i<17;i++)await resize.press('ArrowUp');
  await page.getByTestId('studio-pro-timeline').getByRole('button',{name:'Fit entire timeline',exact:true}).click();
  await page.getByTestId('studio-pro-timeline').screenshot({path:path.join(folder,'editable-timeline.png')});
  fs.writeFileSync(path.join(folder,'processed-responses.json'),JSON.stringify(processed,null,2));
  await h.render(page,'prepared-voice');
  const materialized=await h.save(page,'materialized');
  await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();
  const final=await h.save(page,'final-reopened');assert.equal(hash(final.snapshot.studioDocument),hash(materialized.snapshot.studioDocument));
  await require('./materials-editing-proof').view(page,'prepared-voice');
  const frames=path.join(folder,'prepared-voice/studio-recording-frames'),files=fs.readdirSync(frames).filter(f=>f.endsWith('.jpg')).sort();
  for(const[i,label]of[[0,'start'],[Math.floor(files.length/2),'middle'],[files.length-1,'end']])
   fs.copyFileSync(path.join(frames,files[i]),path.join(folder,'prepared-voice',`studio-${label}.jpg`));
  fs.rmSync(frames,{recursive:true});
  const retained=(await h.records(page)).find(p=>p.id===original.id);assert.equal(hash(retained.snapshot.studioDocument),hash(original.snapshot.studioDocument));
  const output=JSON.parse(fs.readFileSync(path.join(folder,'prepared-voice/render-receipt.json')));
  fs.writeFileSync(path.join(folder,'native-prepared-voice-edit-receipt.json'),JSON.stringify({projectId,
   canonicalHash:output.projectHash,outputHash:output.outputSha256,nativeGainUndoRedoSaveColdReopen:true,
   actualProcessedVoiceAndDuckHashesChanged:true,originalProjectPreserved:true,
   nativeCpuExportDownloadFullDecodeAndStudioTimeline:true,newGpuJobs:0,processed,
   scope:'Private normal authenticated prepared-voice editing/export evidence. Whole picture, broad audio/listening and creative/public qualification remain open.'},null,2));
  saveAuthenticatedState(await context.storageState({indexedDB:true}),state);
  console.log('Prepared voice gain/history/reopen and normal CPU export/full editable Studio timeline passed.');
 }catch(error){
  fs.writeFileSync(path.join(folder,'failure.json'),JSON.stringify({error:error.message,qualified:false}));
  await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});
  saveAuthenticatedState(await context.storageState({indexedDB:true}),state);throw error;
 }finally{await context.close();await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
