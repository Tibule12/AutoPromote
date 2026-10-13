#!/usr/bin/env node
// Actual authenticated native Studio controls and paused raw-source programme.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const h = require('./studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState, sessionPath } = require('./studio-session');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const projectName = process.env.STUDIO_QA_PROJECT_NAME || 'VELO — preview switching · 20261010';
async function pause(page) {
  const button = page.getByRole('button', { name: 'Pause comparison', exact: true });
  if (await button.isVisible()) await button.click();
  await page.locator('video,audio').evaluateAll(es => es.forEach(e => e.pause()));
}
async function seek(page, value) {
  await pause(page);
  await page.getByLabel('Edited output position', { exact: true }).evaluate((el, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(next));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await pause(page);
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="studio-after-video"]');
    return v && v.readyState >= 3 && !v.seeking;
  });
  await page.waitForTimeout(180);
  await pause(page);
}
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: process.env.STUDIO_QA_STORAGE_STATE || sessionPath,
    viewport: { width: 1600, height: 1000 } });
  await context.addInitScript(() => {
    const request = HTMLVideoElement.prototype.requestVideoFrameCallback;
    const observed = new WeakMap();
    if (!request) return;
    HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
      const video = this;
      return request.call(video, (now, metadata) => {
        observed.set(video, metadata.mediaTime);
        callback(now, metadata);
      });
    };
    window.__studioObservedMediaTime = video => observed.get(video);
  });
  if (process.env.STUDIO_QA_AUDIO === '1') await context.addInitScript(() => {
    const starts = [], media = [], sinks = new WeakMap();
    const clock = () => {
      const v=document.querySelector('[data-testid="studio-after-video"]');
      const clip=document.querySelector('.timeline-clip-thumb.active');
      return {displayTime:Number(document.querySelector('[aria-label="Edited output position"]')?.value||0),
        sourceTime:v?.currentTime,sourcePaused:v?.paused,sourceSeeking:v?.seeking,
        activeClipId:clip?.getAttribute('data-testid')?.replace('timeline-clip-','')};
    };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function(target, ...args) { sinks.set(this,target);return connect.call(this,target,...args); };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(when, offset, ...args) {
      starts.push({ ...clock(), duration:this.buffer?.duration, offset:offset||0,
        gain:sinks.get(this)?.gain?.value, scheduledDelay:when-this.context.currentTime });
      return start.call(this,when,offset,...args);
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) {
      if (this.tagName === 'AUDIO' && this.paused) media.push({...clock(),time:this.currentTime,volume:this.volume,muted:this.muted});
      return play.apply(this,args);
    };
    window.__readNativeAudioObservation = () => ({starts,media});
  });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  const sampling = [];
  const frames = [];
  let retainedBefore = null;
  page.on('response', async response => {
    if (!new URL(response.url()).pathname.endsWith('/studio-assets/source-frame')) return;
    try {
      const result = await response.json();
      sampling.push({ status: response.status(), sampler: result.sampler,
        sourceContentHash: result.sourceContentHash, sourceGeneration: result.sourceGeneration,
        start: result.start, end: result.end, fps: result.fps, frameIndex: result.frameIndex,
        imageContentHash: result.imageContentHash, code: result.code });
    } catch (_) {}
  });
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=cycling-parity');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    if (process.env.STUDIO_QA_RESTORE_FILE) {
      // setInputFiles can dispatch on a disabled input; real users cannot.
      await page.waitForFunction(() => {
        const input = document.querySelector('[aria-label="Restore project backup"]');
        return input && !input.disabled;
      });
      const start = Date.now();
      await page.getByLabel('Restore project backup', { exact: true }).setInputFiles(process.env.STUDIO_QA_RESTORE_FILE);
      await page.getByRole('button', { name: projectName, exact: true }).waitFor();
      fs.writeFileSync(path.join(folder, 'native-backup-restore.json'), JSON.stringify({
        durationMs: Date.now() - start, path: 'ordinary authenticated backup controls',
        noMocks: true, allSourceOwnershipChecksRequired: true,
      }, null, 2));
    }
    await page.getByRole('button', { name: projectName, exact: true }).click();
    await h.rail(page);
    await pause(page);
    if (process.env.STUDIO_QA_LIVE_EDIT === '1') {
      await q.tool(page,'Export');
      await page.getByRole('button',{name:'Show Live Edit',exact:true}).click();
    }
    if (process.env.STUDIO_QA_VIEW === '1') {
      await require('./materials-editing-proof').view(page,'cycling');
      return;
    }
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    assert(!await page.getByTestId('hook-preview-frame').evaluate(e => e.classList.contains('has-rendered-output')));
    const before = await h.save(page, 'before');
    retainedBefore = before;
    if (process.env.STUDIO_QA_RENDER === '1') {
      await h.render(page,'cycling');
      await require('./materials-editing-proof').view(page,'cycling');
      const state=await context.storageState({indexedDB:true});
      if (process.env.STUDIO_QA_RENDER_STATE_OUTPUT) saveAuthenticatedState(state, process.env.STUDIO_QA_RENDER_STATE_OUTPUT);
      console.log('Native corrected same-edit CPU render and download complete.');
      return;
    }
    if (process.env.STUDIO_QA_AUDIO === '1') {
      const unmute=page.getByRole('button',{name:'Unmute preview audio',exact:true});
      if (await unmute.isVisible()) await unmute.click();
      await seek(page,0);
      await page.getByRole('button',{name:'Play comparison',exact:true}).click();
      const last=before.snapshot.timeline.at(-1);
      await page.waitForFunction(({id,end})=>{
        const v=document.querySelector('[data-testid="studio-after-video"]');
        const clip=document.querySelector('.timeline-clip-thumb.active');
        return clip?.getAttribute('data-testid')===`timeline-clip-${id}` && v.currentTime>=end;
      },{id:last.id,end:last.endRequest-.5},{timeout:60000});
      await pause(page);
      const observation=await page.evaluate(()=>window.__readNativeAudioObservation());
      const after=await h.save(page,'after');
      assert.equal(hash(before.snapshot.studioDocument),hash(after.snapshot.studioDocument));
      fs.writeFileSync(path.join(folder,'native-audio-observation.json'),JSON.stringify({at:new Date().toISOString(),
        projectId:after.id,canonicalHash:hash(after.snapshot.studioDocument),observation,
        noMocks:true,mutedHeadlessOutput:true,scope:'Observed real preview node scheduling and media playback/gain; no human listening or recorded full preview mix.'},null,2));
      console.log(`Native sound starts observed: ${observation.starts.length}.`);
      return;
    }
    const times = process.env.STUDIO_QA_TIMES ? JSON.parse(process.env.STUDIO_QA_TIMES) : process.env.STUDIO_QA_SHORT === '1' ? [.65, 2.75, 6.25, 12.75, 18.9] :
      [.15,.3,.55,.65,.7,.75,.8,1.95,2,2.05,2.75,3.95,4,4.05,5.45,5.5,5.55,6.25,6.95,7,7.05,8.95,9,9.05,10.45,10.5,10.55,11.95,12,12.05,12.45,12.5,12.55,12.95,13,13.05,13.45,13.5,13.55,14.45,14.5,14.55,15.35,15.9,17.2,18.9,19.8];
    await page.evaluate(() => document.fonts.ready);
    for (const requestedTime of times) {
      await seek(page, requestedTime);
      const canvas = page.getByTestId('studio-program-canvas');
      assert.equal(await canvas.getAttribute('data-programme-source'), 'source');
      const bounds = await canvas.boundingBox();
      await canvas.click({ position: { x: bounds.width * .98, y: bounds.height * .5 } });
      await pause(page);
      await page.waitForTimeout(80);
      // Never compare a transient browser picture while the owned paused
      // frame is still loading. The visible preparation message is normal
      // product state, not evidence that the finished sampler has painted.
      await page.getByText('Preparing paused frame…', { exact: true })
        .waitFor({ state: 'hidden', timeout: 35000 });
      if (process.env.STUDIO_QA_ACCURATE_FRAMES === '1') {
        // Eligibility is owned by the production sampler. This deliberately
        // times out for unsupported fractional concat or cross-occurrence
        // boundaries instead of labelling native fallback as accurate.
        await page.waitForFunction(() => document.querySelector('[data-testid="studio-program-canvas"]')
          ?.dataset.sourceSampling === 'accurate-paused', undefined, { timeout: 45000 });
      }
      const info = await canvas.evaluate(c => {
        const v = document.querySelector('[data-testid="studio-after-video"]');
        const activeClip = document.querySelector('.timeline-clip-thumb.active');
        return { outputTime: Number(document.querySelector('[aria-label="Edited output position"]').value),
          activeClipId:activeClip?.getAttribute('data-testid')?.replace('timeline-clip-',''),
          sourceTime: v.currentTime, decodedMediaTime:window.__studioObservedMediaTime?.(v),
          canvasWidth:c.width, canvasHeight:c.height, sourceSampling:c.dataset.sourceSampling,
          transition: { mode:c.dataset.joinTransition, opacity:Number(c.dataset.joinOpacity || 0) },
          overlays: Array.from(c.parentElement.querySelectorAll('.draggable-overlay')).map(e => ({
            text:e.textContent, rectangle: (() => {const r=e.getBoundingClientRect(),p=c.getBoundingClientRect();return {x:(r.x-p.x)/p.width,y:(r.y-p.y)/p.height,width:r.width/p.width,height:r.height/p.height};})(),
            opacity:getComputedStyle(e).opacity,font:getComputedStyle(e).fontFamily,fontSize:getComputedStyle(e).fontSize,
            blendMode:getComputedStyle(e).mixBlendMode,
            stackingAncestors:(()=>{const parents=[];let p=e.parentElement;for(let i=0;p&&i<4;i++,p=p.parentElement){
              const s=getComputedStyle(p);parents.push({className:p.className,zIndex:s.zIndex,
                opacity:s.opacity,filter:s.filter,transform:s.transform,isolation:s.isolation,contain:s.contain});}
              return parents;})(),
          })), audio:Array.from(document.querySelectorAll('audio')).map(e=>({time:e.currentTime,volume:e.volume,muted:e.muted,paused:e.paused})),
        };
      });
      const activeIndex = before.snapshot.timeline.findIndex(clip => clip.id === info.activeClipId);
      assert(activeIndex >= 0, 'Native active source occurrence is missing');
      const clip = before.snapshot.timeline[activeIndex];
      info.programmeTime = before.snapshot.timeline.slice(0, activeIndex)
        .reduce((sum, row) => sum + row.endRequest - row.startRequest, 0)
        + Math.max(0, Math.min(clip.endRequest - clip.startRequest, info.sourceTime - clip.startRequest));
      // Canvas bounds are the film aperture. The parent's UI border/padding is
      // not exported; capture live DOM graphics inside this same aperture.
      await page.screenshot({ clip:await canvas.boundingBox(), path:path.join(folder, `preview-${requestedTime}.png`) });
      frames.push({requestedTime,...info});
      console.log(`Captured ${requestedTime}s raw programme.`);
    }
    const timeline=page.getByTestId('studio-pro-timeline');
    const resize = page.getByRole('separator', { name: 'Resize timeline' });
    await resize.focus();
    for (let i=0; i<12; i++) await resize.press('ArrowUp');
    await timeline.getByRole('button',{name:'Fit entire timeline',exact:true}).click();
    await timeline.screenshot({path:path.join(folder,'timeline.png')});
    await page.getByTestId('viral-studio-workspace').screenshot({path:path.join(folder,'studio.png')});
    const after=await h.save(page,'after');
    assert.equal(hash(before.snapshot.studioDocument),hash(after.snapshot.studioDocument));
    if (process.env.STUDIO_QA_CHECK_VIEW_SWITCH === '1') {
      assert.equal(process.env.STUDIO_QA_LIVE_EDIT, '1');
      await q.tool(page, 'Export');
      assert(await page.getByRole('button', {name:'Download Rendered Clip',exact:true}).isVisible());
      await page.getByRole('button', {name:'Show Finished Video',exact:true}).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="studio-program-canvas"]')
        ?.dataset.programmeSource === 'final');
      assert(await page.getByRole('button', {name:'Show Live Edit',exact:true}).isVisible());
      assert(await page.getByRole('button', {name:'Download Rendered Clip',exact:true}).isVisible());
      const restored = await h.save(page, 'finished-view');
      assert.equal(hash(before.snapshot.studioDocument),hash(restored.snapshot.studioDocument));
      fs.writeFileSync(path.join(folder,'native-view-switch.json'),JSON.stringify({
        projectId:after.id,canonicalHash:hash(after.snapshot.studioDocument),
        nativeLiveEdit:true,nativeFinishedView:true,finishedDownloadRetained:true,
        unchangedCanonicalProject:true,noMocks:true,
        scope:'Normal authenticated native view controls; no creative or whole-film parity qualification.'
      },null,2));
    }
    fs.writeFileSync(path.join(folder,'paired-source-capture.json'),JSON.stringify({at:new Date().toISOString(),
      browser:browser.version(),projectId:after.id,canonicalHash:hash(after.snapshot.studioDocument),
      frames,sampling,captureClock:'edited-output',preFinal:process.env.STUDIO_QA_LIVE_EDIT !== '1',
      liveEditProjection:true,afterCompletedExport:process.env.STUDIO_QA_LIVE_EDIT === '1',
      noMocks:true,unchangedEdit:true,fullParity:false},null,2));
  } catch(e) {
    await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});
    fs.writeFileSync(path.join(folder,'failed-capture.json'),JSON.stringify({
      at:new Date().toISOString(),error:e.message,projectId:retainedBefore?.id,
      canonicalHash:retainedBefore?.snapshot.studioDocument ? hash(retainedBefore.snapshot.studioDocument) : null,
      frames,sampling,noMocks:true,complete:false,fullParity:false,
    },null,2)+'\n');
    throw e;
  }
  finally {
    if (process.env.STUDIO_QA_RENDER_STATE_OUTPUT) {
      try {
        saveAuthenticatedState(await context.storageState({indexedDB:true}), process.env.STUDIO_QA_RENDER_STATE_OUTPUT);
      } catch (error) { console.warn(`Private recovery snapshot preserved: ${error.message}`); }
    }
    await context.close();await browser.close();
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
