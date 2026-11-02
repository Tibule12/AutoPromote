#!/usr/bin/env node
// Actual owned Studio UI; resize its existing dock, without CSS overrides,
// project/auth injection, a render submission or simulated audio/video.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const h = require('./studio-proof');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const state = process.env.STUDIO_QA_STORAGE_STATE;
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: state, viewport: { width: 1600, height: 1400 } });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  let renderJobs = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/process') renderJobs++; });
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=full-sound-timeline');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: process.env.STUDIO_QA_PROJECT_NAME, exact: true }).click();
    await h.rail(page);
    const before = await h.save(page, 'full-timeline-before');
    const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
    if (await pause.isVisible()) await pause.click();
    await page.getByRole('button', { name: 'After', exact: true }).click();
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-testid="studio-after-video"]');
      const canvas = document.querySelector('[data-testid="studio-program-canvas"]');
      return video && !video.seeking && video.readyState >= 3 &&
        canvas?.dataset.sourceSampling === 'accurate-paused';
    });
    const resize = page.getByRole('separator', { name: 'Resize timeline' });
    await resize.focus();
    for (let i=0; i<26; i++) await resize.press('ArrowUp');
    await page.getByTestId('studio-pro-timeline').getByRole('button', { name: 'Fit entire timeline', exact: true }).click();
    const lanes = await page.evaluate(() => {
      const bounds = document.querySelector('.pro-timeline-scroll').getBoundingClientRect();
      return ['video','graphics','motion','broll','originalAudio','music','sfx'].map(track => {
        const row = document.querySelector(`[data-testid="pro-track-row-${track}"]`);
        const r = row?.getBoundingClientRect();
        return { track, present: Boolean(row), fullyVisible: Boolean(r && r.top >= bounds.top && r.bottom <= bounds.bottom),
          top: r?.top, bottom: r?.bottom, scrollBottom: bounds.bottom };
      });
    });
    fs.writeFileSync(path.join(folder, 'lane-geometry.json'), JSON.stringify({ lanes,
      timelineHeight: await resize.getAttribute('aria-valuenow'),
      maximum: await resize.getAttribute('aria-valuemax'),
    }, null, 2)+'\n');
    await page.screenshot({ path: path.join(folder, 'native-resize-observation.png') });
    assert(lanes.every(lane => lane.present && lane.fullyVisible), 'Edited lanes are still clipped');
    assert(Number(await resize.getAttribute('aria-valuenow')) > 480);
    await page.screenshot({ path: path.join(folder, 'studio-all-sound-lanes.png') });
    await page.getByTestId('studio-pro-timeline').screenshot({ path: path.join(folder, 'full-timeline.png') });
    const after = await h.save(page, 'full-timeline-after');
    assert.equal(hash(before.snapshot.studioDocument), hash(after.snapshot.studioDocument));
    assert.equal(renderJobs, 0);
    fs.writeFileSync(path.join(folder, 'full-timeline-receipt.json'), JSON.stringify({
      at: new Date().toISOString(), projectId: after.id, canonicalHash: hash(after.snapshot.studioDocument),
      unchangedCanonicalDocument: true, existingNativeResizeControl: true, lanes,
      pausedPicture: await page.getByTestId('studio-program-canvas').getAttribute('data-source-sampling'),
      timelineHeight: Number(await resize.getAttribute('aria-valuenow')),
      maximumTimelineHeight: Number(await resize.getAttribute('aria-valuemax')),
      newRenderJobs: renderJobs, newGpuJobs: 0, noCssOverrides: true, noMocks: true,
      scope: 'Normal authenticated live editor; all seven populated editable lanes visible together. Paused UI evidence, not moving-film or audio approval.',
    }, null, 2)+'\n');
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), state);
    console.log('Native video/graphics/motion/B-roll/original-audio/music/SFX lanes all visible; canonical edit unchanged.');
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
