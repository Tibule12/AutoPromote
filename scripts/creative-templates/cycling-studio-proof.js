#!/usr/bin/env node
// Operates the actual signed-in Studio controls. No project/auth/route injection.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const h = require('./studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const { hash } = require('../../src/creativeTemplates/contract');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const source = path.resolve(folder, '..');
const name = 'cycling';
const title = 'VELO — cycling rhythm · 20261010';
async function range(input, value) {
  await input.evaluate((el, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(next));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function pause(page) {
  const button = page.getByRole('button', { name: 'Pause comparison', exact: true });
  if (await button.isVisible()) await button.click();
  await page.locator('video,audio').evaluateAll(es => es.forEach(e => {e.muted=true;e.pause();}));
}
async function open(page, projectTitle = title) {
  await page.goto('http://localhost:5000/?studioTemplateSession=cycling');
  await page.getByRole('button', {name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name:projectTitle,exact:true}).click();
  await h.rail(page); await pause(page);
  assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
}
async function create(page) {
  await open(page, 'VELO — music and cinematic sound · 20261010');
  await page.getByRole('button', {name:'Duplicate',exact:true}).first().click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name',{exact:true}).fill(title);
  const panel = page.getByTestId('launch-template-panel');
  if (!await panel.evaluate(e => e.open)) await panel.locator(':scope > summary').click();
  await panel.getByLabel('Creative template',{exact:true}).selectOption('cycling_rhythm_v1@1.0.2');
  assert.equal(await panel.getByLabel('Template aspect ratio',{exact:true}).inputValue(),'9:16');
  for (const [label,value] of [['Launch headline','OWN\nYOUR PACE'],['Feature one','CHASE YOUR\nNEXT HORIZON.'],['Feature two','NO LIMITS.\nJUST YOU.'],['Launch CTA','Find your next ride'],['Launch colour','#baff38']])
    await panel.getByLabel(label,{exact:true}).fill(value);
  for (const [slot,file] of [['hookFootage','person-on-a-bicycle-starts-to-ride-on-a-cycling-40904.mp4'],['productFootage','silhouette-in-front-of-the-sun-of-a-cyclist-outdoors-40901.mp4'],['detailFootage','two-mountain-bikers-jumping-off-ramps-in-a-forest-44330.mp4'],['logo','velo-logo.png'],['music','materials-editing-20261010/materials/mixkit-music-369.mp3']]) {
    await panel.getByLabel(`Upload ${slot}`,{exact:true}).setInputFiles(path.join(source,file));
    await page.waitForFunction(() => !document.querySelector('[data-testid="launch-template-panel"] button').disabled,undefined,{timeout:90000});
    assert((await panel.getByRole('status').innerText()).endsWith(' saved.'));
    if (slot.endsWith('Footage')) await panel.getByLabel(`${slot} in-point`,{exact:true}).fill('0');
    console.log(`Native owned upload: ${slot}`);
  }
  await panel.getByRole('button',{name:'Apply launch template',exact:true}).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="launch-template-panel"] [role=status]')?.textContent.includes('applied'));
  await pause(page);
  let record = await h.save(page,name);
  assert.equal(record.snapshot.timeline.length,13);
  assert.equal(record.snapshot.reframeAspect,'9:16');
  assert.equal(record.snapshot.creativeTemplateInstance.templateRef.templateId,'cycling_rhythm_v1');
  // Add sampled accents through the same sound controls available to customers.
  await q.tool(page,'Sound');
  for (const [file,start,duration,volume] of [['2918.wav',1.8,.9,14],['788.mp3',14.5,1.25,14]]) {
    await page.getByTestId('sound-effect-input').setInputFiles(path.join(source,'materials-editing-20261010/materials',`mixkit-sfx-${file}`));
    await page.getByTestId('sound-effect-start').fill(String(start));
    await page.getByTestId('sound-effect-duration').fill(String(duration));
    await range(page.getByTestId('sound-effect-volume'),volume);
    await range(page.getByTestId('sound-effect-fade-out'),.12);
  }
  await page.getByTestId('sound-effect-preset-tape_stop').click();
  await page.getByTestId('sound-effect-start').fill('13.875');
  await page.getByTestId('sound-effect-duration').fill('.375');
  await range(page.getByTestId('sound-effect-volume'),12);
  await history(page);
}
async function revise(page) {
  await open(page);
  const panel=page.getByTestId('launch-template-panel');
  if(!await panel.evaluate(e=>e.open))await panel.locator(':scope > summary').click();
  await panel.getByLabel('Creative template',{exact:true}).selectOption('cycling_rhythm_v1@1.0.2');
  await panel.getByRole('button',{name:'Apply launch template',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid=launch-template-panel] [role=status]')?.textContent.includes('applied'));
  await pause(page);
  await q.tool(page,'Sound');
  for(const [file,start,duration,volume] of [['2918.wav',1.8,.9,14],['788.mp3',14.5,1.25,14]]) {
    await page.getByTestId('sound-effect-input').setInputFiles(path.join(source,'materials-editing-20261010/materials',`mixkit-sfx-${file}`));
    await page.getByTestId('sound-effect-start').fill(String(start));
    await page.getByTestId('sound-effect-duration').fill(String(duration));
    await range(page.getByTestId('sound-effect-volume'),volume);
    await range(page.getByTestId('sound-effect-fade-out'),.12);
  }
  await page.getByTestId('sound-effect-preset-tape_stop').click();
  await page.getByTestId('sound-effect-start').fill('13.875');
  await page.getByTestId('sound-effect-duration').fill('.375');
  await history(page);
}
async function history(page) {
  await q.tool(page,'Sound');
  await page.locator('.sound-effect-chip').last().click();
  await range(page.getByTestId('sound-effect-volume'),12);
  await page.waitForTimeout(600);
  // Native history restores/remakes the final meaningful gain edit.
  let record=await h.save(page,name);
  const decisions = document => { const { revision, journal, ...state } = document; return hash(state); };
  const gainHash=decisions(record.snapshot.studioDocument);
  await range(page.getByTestId('sound-effect-volume'),10);
  await page.waitForTimeout(600);
  await page.getByTestId('studio-undo-button').click();
  await page.waitForTimeout(600);
  assert.equal(decisions((await h.save(page,name)).snapshot.studioDocument),gainHash);
  await page.getByTestId('studio-redo-button').click();
  await page.waitForTimeout(600);
  assert.equal((await h.save(page,name)).snapshot.soundEffects.at(-1).volume,.1);
  record=await h.save(page,name);
  fs.writeFileSync(path.join(folder,'native-apply-history.json'),JSON.stringify({projectId:record.id,projectHash:hash(record.snapshot.studioDocument),templateRef:record.snapshot.creativeTemplateInstance.templateRef,clips:record.snapshot.timeline.length,graphics:record.snapshot.overlays.length,soundCues:record.snapshot.soundEffects.length,aspect:record.snapshot.reframeAspect,nativeOwnedUploads:true,nativeApply:true,nativeSoundControls:true,nativeUndoRedo:true,noMocks:true},null,2));
  console.log('13 native clips, editable typography/music/SFX and history saved.');
}
async function cold(page) {
  const before=await h.save(page,'cold-before'); await page.reload();
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name:title,exact:true}).click();
  await h.rail(page);await pause(page);
  const after=await h.save(page,name);
  assert.equal(after.id,before.id);assert.equal(hash(after.snapshot.studioDocument),hash(before.snapshot.studioDocument));
  fs.writeFileSync(path.join(folder,'native-cold-recovery.json'),JSON.stringify({projectId:after.id,canonicalHash:hash(after.snapshot.studioDocument),nativeColdReopen:true,noMocks:true},null,2));
  console.log('Native cold reopen recovered exact canonical edit.');
}
async function predictive(page) {
  await pause(page);
  const before=await h.save(page,name);
  assert(!await page.getByTestId('hook-preview-frame').evaluate(el=>el.classList.contains('has-rendered-output')),
    'Capture actual raw-source preview, not a retained completed movie');
  const out=path.join(folder,'predictive');fs.mkdirSync(out,{recursive:true});
  const frames=[];
  for(const time of [.625,1.25,2.75,4.625,6.25,7.75,9.5,11.25,12.25,12.75,13.375,15.875,18.875]) {
    await range(page.getByLabel('Edited output position',{exact:true}),time);
    await page.waitForTimeout(650);await pause(page);
    const canvas=page.getByTestId('studio-program-canvas');
    assert.notEqual(await canvas.getAttribute('data-programme-source'),'final','A finished file is not pre-final evidence');
    const bounds=await canvas.boundingBox();
    await canvas.click({position:{x:bounds.width*.95,y:bounds.height*.95}});
    const info=await canvas.evaluate(el=>{const v=document.querySelector('[data-testid=studio-after-video]');return {sourceTime:v.currentTime,sourcePath:new URL(v.currentSrc).pathname,canvas:{width:el.width,height:el.height},stageClass:el.parentElement.className}});
    await canvas.locator('..').screenshot({path:path.join(out,`frame-${time}.png`)});
    frames.push({programmeTime:time,...info});
  }
  await page.getByTestId('viral-studio-workspace').screenshot({path:path.join(out,'studio.png')});
  fs.writeFileSync(path.join(out,'receipt.private.json'),JSON.stringify({projectId:before.id,projectHash:hash(before.snapshot.studioDocument),templateRef:before.snapshot.creativeTemplateInstance.templateRef,frames,nativePreFinal:true,noMocks:true,fullParity:false},null,2),{mode:0o600});
  console.log('13 actual pre-final Studio frames retained at mapped programme times.');
}
async function predictivePlayback(page) {
  await pause(page);
  assert(!await page.getByTestId('hook-preview-frame').evaluate(el=>el.classList.contains('has-rendered-output')),
    'Predictive playback must use the editable raw-source project');
  await range(page.getByLabel('Edited output position',{exact:true}),0);
  await page.waitForTimeout(800);
  const output=page.getByTestId('studio-after-video');
  await output.evaluate(v=>{v.muted=true;const frames=[],events=[];let callback;
    const observe=()=>({wall:performance.now(),programmeTime:Number(document.querySelector('[aria-label="Edited output position"]').value),sourceTime:v.currentTime});
    const frame=(wall,info)=>{frames.push({...observe(),frameMediaTime:info.mediaTime});callback=v.requestVideoFrameCallback(frame)};
    callback=v.requestVideoFrameCallback(frame);
    const listener=e=>events.push({type:e.type,...observe()});
    for(const type of ['playing','waiting','stalled','loadedmetadata','ended'])v.addEventListener(type,listener);
    window.__cyclingPredictiveObservation=()=>{v.cancelVideoFrameCallback(callback);for(const type of ['playing','waiting','stalled','loadedmetadata','ended'])v.removeEventListener(type,listener);return {frames,events,ended:observe()}};
  });
  const start=await page.evaluate(()=>performance.now());
  await page.getByRole('button',{name:'Play comparison',exact:true}).click();
  let completed=false;
  const until=Date.now()+60000;
  while(Date.now()<until){const time=Number(await page.getByLabel('Edited output position',{exact:true}).inputValue());if(time>=19.5){completed=true;break}await page.waitForTimeout(100);}
  const result=await page.evaluate(()=>{const r=window.__cyclingPredictiveObservation();delete window.__cyclingPredictiveObservation;return r});
  await pause(page);
  const snapshot=await h.save(page,name);
  fs.writeFileSync(path.join(folder,'predictive-playback.json'),JSON.stringify({projectId:snapshot.id,projectHash:hash(snapshot.snapshot.studioDocument),start,completed,...result,noMocks:true,preFinal:true,screenCapture:false},null,2));
  assert(completed,'Predictive sequence did not reach its last half-second in 60 seconds');
  console.log(`Pre-final sequence advanced to ${result.ended.programmeTime}s in ${((result.ended.wall-start)/1000).toFixed(2)}s; ${result.frames.length} video frame callbacks.`);
}
async function main() {
  fs.mkdirSync(folder,{recursive:true});
  const ownedContext=process.env.STUDIO_QA_PROFILE ? await chromium.launchPersistentContext(process.env.STUDIO_QA_PROFILE, {
    headless:true,channel:'chrome',viewport:{width:1600,height:1000},args:['--mute-audio'],acceptDownloads:true,
  }) : null;
  const browser=ownedContext ? ownedContext.browser() : await chromium.connectOverCDP('http://127.0.0.1:9234');
  try {
    assert((await (await browser.newBrowserCDPSession()).send('Browser.getVersion')).userAgent.includes('HeadlessChrome'));
    let page=browser.contexts()[0].pages().find(p=>p.url().includes('studioTemplateSession=cycling'));
    if(!page)page=await browser.contexts()[0].newPage();
    page.setDefaultTimeout(90000);
    const action=process.argv[2];
    if(action==='deliver'){await revise(page);await cold(page);await predictive(page);await predictivePlayback(page);await h.render(page,name);await require('./materials-editing-proof').view(page,name);}
    else if(action==='create')await create(page);
    else if(action==='revise')await revise(page);
    else if(action==='history')await history(page);
    else if(action==='cold')await cold(page);
    else if(action==='open')await open(page);
    else if(action==='predictive')await predictive(page);
    else if(action==='predictive-play')await predictivePlayback(page);
    else if(action==='recover'){await open(page);await h.recover(page,name);await require('./materials-editing-proof').view(page,name);}
    else if(action==='render')await h.render(page,name);
    else if(action==='record'){await open(page);await require('./materials-editing-proof').view(page,name);}
    else throw new Error('Unknown action');
  }finally{if(ownedContext)await ownedContext.close();else await browser.close();}
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.stack);process.exit(1)});
