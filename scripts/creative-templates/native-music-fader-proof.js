#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const h = require('./studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const state = process.env.STUDIO_QA_STORAGE_STATE;
const name = 'VELO — quiet music · 20261012';
async function range(input, value) {
  await input.evaluate((el, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(next));
    el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
  },value);
}
async function main() {
  fs.mkdirSync(folder,{recursive:true});
  const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio']});
  const context=await browser.newContext({storageState:state,viewport:{width:1600,height:1400},acceptDownloads:true});
  // Transparent observation of the actual native selected-music output gain.
  await context.addInitScript(()=>{
    const sinks=new WeakMap(); const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(target,...args){sinks.set(this,target);return connect.call(this,target,...args);};
    let musicGain,context,startCount=0;const start=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){
      if(this.buffer?.duration>20){musicGain=sinks.get(this);context=this.context;startCount++;}
      return start.apply(this,args);
    };
    window.__readMusicFader=()=>({gain:musicGain?.gain.value,contextTime:context?.currentTime,startCount});
  });
  const page=await context.newPage();page.setDefaultTimeout(45000);
  const observations={};
  try{
    await page.goto('http://localhost:5000/?studioTemplateSession=music-fader');
    await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
    await page.getByRole('button',{name:'VELO — owned audio · 20261012',exact:true}).click();
    await h.rail(page);const original=await h.save(page,'original');
    await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
    await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
    await page.getByLabel('Project name',{exact:true}).fill(name);
    await q.tool(page,'Sound');
    const fader=page.getByRole('slider',{name:/Background volume/});
    await range(fader,1);await page.waitForTimeout(600);
    const unmute=page.getByRole('button',{name:'Unmute preview audio',exact:true});
    if(await unmute.isVisible())await unmute.click();
    const pause=page.getByRole('button',{name:'Pause comparison',exact:true});
    if(await pause.isVisible())await pause.click();
    // Keep this fader audition inside one long source occurrence, away from
    // cut handoffs and the music's tail fade. Boundary resync is measured in
    // its separate native clock proof, not attributed to a fader change.
    await range(page.getByLabel('Edited output position',{exact:true}),15);
    await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');
      return v&&v.paused&&!v.seeking&&v.readyState>=3;});
    console.log('Native quiet-music project ready inside the long final source.');
    await page.getByRole('button',{name:'Play comparison',exact:true}).click();
    await page.waitForFunction(()=>window.__readMusicFader().startCount===1&&
      Math.abs(window.__readMusicFader().gain-.01)<1e-6,undefined,{timeout:30000});
    const one=await page.evaluate(()=>window.__readMusicFader());
    observations.one=one;
    await range(fader,0);
    await page.waitForFunction(()=>window.__readMusicFader().gain===0);
    const zero=await page.evaluate(()=>window.__readMusicFader());
    observations.zero=zero;
    await range(fader,1);await page.waitForTimeout(600);
    await page.waitForFunction(()=>Math.abs(window.__readMusicFader().gain-.01)<1e-6);
    const restored=await page.evaluate(()=>window.__readMusicFader());
    observations.restored=restored;
    assert.equal(zero.startCount,one.startCount);assert.equal(restored.startCount,one.startCount);
    console.log('Actual native1%/zero/1% gains verified without restarting music.');
    await page.getByRole('button',{name:'Pause comparison',exact:true}).click();
    await page.getByTestId('studio-undo-button').click();
    assert.equal(await fader.inputValue(),'0');
    await page.getByTestId('studio-redo-button').click();
    assert.equal(await fader.inputValue(),'1');
    const edited=await h.save(page,'edited');assert.equal(edited.snapshot.musicTrack.volume,.01);
    await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
    await page.getByRole('button',{name,exact:true}).click();
    const reopened=await h.save(page,'reopened');
    assert.equal(hash(reopened.snapshot.studioDocument),hash(edited.snapshot.studioDocument));
    await h.render(page,'quiet-music');
    await require('./materials-editing-proof').view(page,'quiet-music');
    const frames=path.join(folder,'quiet-music/studio-recording-frames');
    const files=fs.readdirSync(frames).filter(f=>f.endsWith('.jpg')).sort();
    for(const [index,label]of[[0,'start'],[Math.floor(files.length/2),'middle'],[files.length-1,'end']])
      fs.copyFileSync(path.join(frames,files[index]),path.join(folder,`quiet-music/studio-${label}.jpg`));
    const released=fs.readdirSync(frames).reduce((s,f)=>s+fs.statSync(path.join(frames,f)).blocks*512,0);
    fs.rmSync(frames,{recursive:true});
    const receipt=JSON.parse(fs.readFileSync(path.join(folder,'quiet-music/render-receipt.json')));
    const retained=(await h.records(page)).find(p=>p.id===original.id);
    assert.equal(hash(retained.snapshot.studioDocument),hash(original.snapshot.studioDocument));
    fs.writeFileSync(path.join(folder,'native-fader-receipt.json'),JSON.stringify({
      at:new Date().toISOString(),projectId:edited.id,canonicalHash:receipt.projectHash,outputHash:receipt.outputSha256,
      nativeGainObservations:{one,zero,restored},faderDoesNotRestartMusic:true,
      nativeUndoRedo:true,nativeSaveColdReopen:true,nativeCpuRenderDownloadAndFullTimeline:true,
      originalProjectPreserved:true,recordingScratchBytesReleased:released,newGpuJobs:0,
      scope:'Real signed-in Studio fader1%/0%/1% observation on the running native song, native history/save/reopen and actual deterministic CPU render/download/full movie plus editable timeline. No human listening, full speech/ducking/trim, creative or public qualification.',
    },null,2)+'\n');
    saveAuthenticatedState(await context.storageState({indexedDB:true}),state);
    console.log('Native1%/zero fader and continuous music, history/reopen/export/full Studio timeline pass.');
  }catch(error){
    await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});
    fs.writeFileSync(path.join(folder,'failed-fader-observation.json'),JSON.stringify({
      at:new Date().toISOString(),error:error.message,observations,noMocks:true,qualified:false,
    },null,2)+'\n');
    throw error;
  }
  finally{await context.close();await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
