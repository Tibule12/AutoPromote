#!/usr/bin/env node
// Real signed-in native controls and audio transport; no account/API mocks,
// generated soundtrack, GPU request or final-render substitution.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const h = require('./studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const state = '/home/tibule12/.local/share/autopromote-qa/session/studio-cycling-source.private.json';
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: state, viewport: { width: 1600, height: 1000 } });
  await context.addInitScript(() => {
    const active = new Set(), starts = [];
    const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function(when, offset, ...args) {
      const video = document.querySelector('[data-testid="studio-after-video"]');
      starts.push({ wall: performance.now(), duration: this.buffer?.duration, offset: offset || 0,
        sourceTime: video?.currentTime, clipId: document.querySelector('.timeline-clip-thumb.active')?.dataset.testid });
      active.add(this); this.addEventListener('ended', () => active.delete(this), { once: true });
      return start.call(this, when, offset, ...args);
    };
    AudioBufferSourceNode.prototype.stop = function(...args) { active.delete(this); return stop.apply(this, args); };
    window.__studioNativeAudio = () => ({ starts, activeBuffers: active.size,
      playingMedia: [...document.querySelectorAll('audio')].filter(a => !a.paused).length });
  });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  let submissions = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/media/process') submissions++; });
  const seek = async time => page.getByLabel('Edited output position', { exact: true }).evaluate((el, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(value));
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, time);
  const pause = async () => {
    const button = page.getByRole('button', { name: 'Pause comparison', exact: true });
    if (await button.isVisible()) await button.click();
  };
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=audio-controls');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: 'VELO — preview switching · 20261010', exact: true }).click();
    await h.rail(page); await pause(page);
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    assert(!await page.getByTestId('hook-preview-frame').evaluate(e => e.classList.contains('has-rendered-output')));
    const before = await h.save(page, 'controls-before');
    await q.tool(page, 'Sound');
    await seek(5.5);
    await page.waitForFunction(() => { const v = document.querySelector('[data-testid="studio-after-video"]'); return v?.readyState >= 3 && !v.seeking; });
    const unmute = page.getByRole('button', { name: 'Unmute preview audio', exact: true });
    if (await unmute.isVisible()) await unmute.click();
    const initialCount = await page.evaluate(() => window.__studioNativeAudio().starts.length);
    await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
    await page.waitForFunction(n => window.__studioNativeAudio().starts.length > n, initialCount);
    await page.getByRole('button', { name: 'Stop sound', exact: true }).click();
    const stoppedSongCount = await page.evaluate(() => window.__studioNativeAudio().starts.filter(x => x.duration > 20).length);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__studioNativeAudio().starts.filter(x => x.duration > 20).length), stoppedSongCount);
    const isolatedStopPreservedProgramme = await page.getByTestId('studio-after-video').evaluate(v => !v.paused);
    assert(isolatedStopPreservedProgramme, 'Stop sound unexpectedly paused the video');
    await pause(page);
    const stopped = await page.evaluate(() => window.__studioNativeAudio());
    await page.waitForTimeout(250);
    const quiet = await page.evaluate(() => window.__studioNativeAudio());
    assert.equal(quiet.activeBuffers, 0); assert.equal(quiet.playingMedia, 0);
    assert.equal(quiet.starts.length, stopped.starts.length, 'Audio restarted after Pause');
    await seek(13.95);
    await page.waitForFunction(() => { const v = document.querySelector('[data-testid="studio-after-video"]'); return v?.readyState >= 3 && !v.seeking; });
    const resumeCount = quiet.starts.length;
    await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
    await page.waitForFunction(n => window.__studioNativeAudio().starts.slice(n).some(x => Math.abs(x.duration - .375) < .001), resumeCount);
    const resumed = await page.evaluate(() => window.__studioNativeAudio().starts);
    await pause(page);
    const song = resumed.slice(resumeCount).find(x => x.duration > 20);
    const cue = resumed.slice(resumeCount).find(x => Math.abs(x.duration - .375) < .001);
    assert(song && Math.abs(song.offset - 13.95) < .1, 'Music resumed at the wrong edit position');
    assert(cue && cue.offset > 0 && cue.offset < .2, 'Cue did not resume inside its configured window');
    const resize = page.getByRole('separator', { name: 'Resize timeline' }); await resize.focus();
    for (let i = 0; i < 12; i++) await resize.press('ArrowUp');
    await page.getByTestId('studio-pro-timeline').getByRole('button', { name: 'Fit entire timeline', exact: true }).click();
    await seek(5);
    await page.waitForFunction(() => document.querySelector('canvas[data-source-sampling="accurate-paused"]'), undefined, { timeout: 45000 });
    await page.screenshot({ path: path.join(folder, 'studio-edit-and-timeline.png') });
    await page.getByTestId('studio-pro-timeline').screenshot({ path: path.join(folder, 'timeline.png') });
    const after = await h.save(page, 'controls-after');
    assert.equal(hash(before.snapshot.studioDocument), hash(after.snapshot.studioDocument)); assert.equal(submissions, 0);
    fs.writeFileSync(path.join(folder, 'controls-proof.json'), JSON.stringify({ projectId: after.id,
      canonicalHash: hash(after.snapshot.studioDocument), noMocks: true, preFinal: true,
      pause: { activeBuffers: quiet.activeBuffers, playingMedia: quiet.playingMedia, lateStarts: quiet.starts.length - stopped.starts.length },
      stopSound: { lateMusicStarts: 0, programmeContinues: isolatedStopPreservedProgramme },
      resumeMusicOffset: song.offset, resumeCueOffset: cue.offset, nativeStarts: resumed,
      timeline: 'timeline.png', studio: 'studio-edit-and-timeline.png', newRenderJobs: submissions, newGpuJobs: 0,
      scope: 'Normal native Play/Pause/seek/resume; actual active buffers/media observed. This is not full mix, retiming, raster or human creative qualification.' }, null, 2));
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), state);
    console.log('Native Pause/seek/resume and editable Studio timeline verified.');
  } catch (error) {
    await page.screenshot({ path: path.join(folder, 'controls-failure.png') }).catch(() => {}); throw error;
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
