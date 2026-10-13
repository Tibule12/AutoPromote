#!/usr/bin/env node
// Existing authenticated Studio entry, actual recording import and controls.
// Recorded speech is a retained private source, not newly generated narration.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {hash}=require('../../src/creativeTemplates/contract');
const {saveAuthenticatedState}=require('./studio-session');
const h=require('./studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const folder=path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR),state=process.env.STUDIO_QA_STORAGE_STATE;
const name=process.env.STUDIO_QA_PROJECT_NAME || 'VELO — voice-over and ducking · 20261012';
const duckMode=process.env.STUDIO_QA_DUCK_MODE || 'constant';
const takeStart=Number(process.env.STUDIO_QA_VOICE_START || 2.5);
const takeDuration=Number(process.env.STUDIO_QA_VOICE_DURATION || 3.25);
assert(['constant','speech'].includes(duckMode));
assert(Number.isFinite(takeStart)&&takeStart>=0&&Number.isFinite(takeDuration)&&takeDuration>0);
async function range(input,value){await input.evaluate((el,v)=>{
 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(v));
 el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
},value);}
async function main(){
 fs.mkdirSync(folder,{recursive:true});
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio']});
 const context=await browser.newContext({storageState:state,viewport:{width:1600,height:1500},acceptDownloads:true});
 await context.addInitScript(()=>{
  const connect=AudioNode.prototype.connect,voices=[],songs=[];
  AudioNode.prototype.connect=function(target,...args){
   const result=connect.call(this,target,...args);
   if(this instanceof MediaElementAudioSourceNode&&target instanceof GainNode&&this.mediaElement.dataset.testid?.startsWith('voiceover-audio-'))
    voices.push({audio:this.mediaElement,gain:target});
   if(this instanceof AudioBufferSourceNode&&target instanceof GainNode&&this.buffer?.duration>20)songs.push({source:this,gain:target});
   return result;
  };
  window.__nativeVoiceGain=()=>({voices:voices.map(({audio,gain})=>({id:audio.dataset.testid,time:audio.currentTime,
   gain:gain.gain.value,volume:audio.volume,paused:audio.paused,ready:audio.readyState,preservesPitch:audio.preservesPitch})),
   songs:songs.map(({gain})=>({gain:gain.gain.value}))});
 });
 const page=await context.newPage();page.setDefaultTimeout(45000);
 try{
  await page.goto('http://localhost:5000/?studioTemplateSession=voiceover-ducking');
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name:'VELO — zero layer effects · 20261012',exact:true}).click();await h.rail(page);
  const original=await h.save(page,'original');
  await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name',{exact:true}).fill(name);
  const pause=page.getByRole('button',{name:'Pause comparison',exact:true});if(await pause.isVisible())await pause.click();
  await q.tool(page,'Export');const live=page.getByRole('button',{name:'Show Live Edit',exact:true});if(await live.isVisible())await live.click();
  await range(page.getByLabel('Edited output position',{exact:true}),0);await q.tool(page,'Sound');
  await page.getByTestId('voiceover-recording-input').setInputFiles(process.env.STUDIO_QA_VOICE_RECORDING);
  const sourceName=path.basename(process.env.STUDIO_QA_VOICE_RECORDING);
  await page.getByLabel(`Name for ${sourceName}`,{exact:true}).fill('Speech proof');
  await page.getByLabel('Start for Speech proof',{exact:true}).fill(String(takeStart));
  await page.getByLabel('Source in for Speech proof',{exact:true}).fill('1.25');
  await page.getByLabel('Length for Speech proof',{exact:true}).fill(String(takeDuration));
  await range(page.getByLabel('Volume for Speech proof',{exact:true}),.6);await page.waitForTimeout(600);
  await range(page.getByLabel('Volume for Speech proof',{exact:true}),.7);await page.waitForTimeout(600);
  await page.getByTestId('studio-undo-button').click();assert.equal(await page.getByLabel('Volume for Speech proof',{exact:true}).inputValue(),'0.6');
  await page.getByTestId('studio-redo-button').click();assert.equal(await page.getByLabel('Volume for Speech proof',{exact:true}).inputValue(),'0.7');
  await range(page.getByRole('slider',{name:/Background volume/}),20);
  await page.getByRole('checkbox',{name:/Duck under speech/}).check();
  await page.getByLabel('Music ducking mode',{exact:true}).selectOption(duckMode);
  await range(page.getByLabel('Speech ducking strength',{exact:true}),40);
  const before=await h.save(page,'edited');
  assert.equal(before.snapshot.voiceovers.length,1);
  assert.deepEqual(Object.fromEntries(['startTime','trimStart','duration','volume'].map(k=>[k,before.snapshot.voiceovers[0][k]])),
    {startTime:takeStart,trimStart:1.25,duration:takeDuration,volume:.7});
  const unmute=page.getByRole('button',{name:'Unmute preview audio',exact:true});if(await unmute.isVisible())await unmute.click();
  await range(page.getByLabel('Edited output position',{exact:true}),takeStart+.3);
  await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=3;});
  await page.getByRole('button',{name:'Play comparison',exact:true}).click();
  await page.waitForFunction(mode=>window.__nativeVoiceGain().voices.some(v=>!v.paused&&Math.abs(v.gain-.7)<.001)&&
   window.__nativeVoiceGain().songs.some(v=>mode==='constant' ? Math.abs(v.gain-.12)<.001 : v.gain>0&&v.gain<.195),duckMode);
  const observation=await page.evaluate(()=>window.__nativeVoiceGain());
  fs.writeFileSync(path.join(folder,'native-voice-and-duck-gain.json'),JSON.stringify({duckMode,takeStart,takeDuration,...observation},null,2)+'\n');
  if(await pause.isVisible())await pause.click();
  const edited=await h.save(page,'edited');
  await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();
  const reopened=await h.save(page,'reopened');assert.equal(hash(reopened.snapshot.studioDocument),hash(edited.snapshot.studioDocument));
  await h.render(page,'voiceover');
  const materialized=await h.save(page,'materialized'),take=materialized.snapshot.voiceovers[0];
  assert(take.ownerUid&&take.sourceStoragePath&&/^[a-f0-9]{64}$/.test(take.contentHash),'Missing recording provenance');
  assert.equal(take.contentHash,hash(fs.readFileSync(process.env.STUDIO_QA_VOICE_RECORDING)));
  await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();
  const final=await h.save(page,'final-reopened');assert.equal(hash(final.snapshot.studioDocument),hash(materialized.snapshot.studioDocument));
  await require('./materials-editing-proof').view(page,'voiceover');
  const frames=path.join(folder,'voiceover/studio-recording-frames'),files=fs.readdirSync(frames).filter(f=>f.endsWith('.jpg')).sort();
  for(const[index,label]of[[0,'start'],[Math.floor(files.length/2),'middle'],[files.length-1,'end']])fs.copyFileSync(path.join(frames,files[index]),path.join(folder,'voiceover',`studio-${label}.jpg`));
  const released=fs.readdirSync(frames).reduce((s,f)=>s+fs.statSync(path.join(frames,f)).blocks*512,0);fs.rmSync(frames,{recursive:true});
  const retained=(await h.records(page)).find(p=>p.id===original.id);assert.equal(hash(retained.snapshot.studioDocument),hash(original.snapshot.studioDocument));
  const receipt=JSON.parse(fs.readFileSync(path.join(folder,'voiceover/render-receipt.json')));
  fs.writeFileSync(path.join(folder,'native-voiceover-receipt.json'),JSON.stringify({projectId:materialized.id,
   canonicalHash:receipt.projectHash,outputHash:receipt.outputSha256,recordingContentHash:take.contentHash,
   nativeImportTrimGainUndoRedoSaveColdReopen:true,nativeDuckGain:{duckMode,takeStart,takeDuration,...observation},
   nativeOwnedUploadAndColdReopen:true,nativeCpuExportDownloadFullDecodeAndStudioTimeline:true,
   originalProjectPreserved:true,recordingScratchBytesReleased:released,newGpuJobs:0,
   scope:'Private actual recorded-source import, trim/gain and selected-duck native lifecycle. Full speech DSP, retimed VO PCM parity and creative/public review remain separate.'},null,2)+'\n');
  saveAuthenticatedState(await context.storageState({indexedDB:true}),state);
  console.log('Native recorded speech, trims, selected ducking, exact owned save/reopen/export/full timeline passed.');
 }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(folder,'failure.json'),JSON.stringify({error:error.message,qualified:false})+'\n');
  saveAuthenticatedState(await context.storageState({indexedDB:true}),state);throw error;}
 finally{await context.close();await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
