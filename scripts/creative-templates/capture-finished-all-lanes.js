#!/usr/bin/env node
// Reopen the owned finished job in the real editor. No render submission,
// media/project injection, UI overrides or generation. Retain a moving review
// copy with the exact export's soundtrack and all native editable lanes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { saveAuthenticatedState } = require('./studio-session');
const h = require('./studio-proof');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const state = process.env.STUDIO_QA_STORAGE_STATE;
const source = path.resolve(process.env.STUDIO_QA_EXISTING_DELIVERY);
const label = process.env.STUDIO_QA_DELIVERY_LABEL || 'audio-curve';
assert(/^[a-z][a-z0-9-]{0,60}$/.test(label));
async function main() {
  const delivery = path.join(folder, label);
  fs.mkdirSync(delivery, { recursive: true });
  for (const file of ['final.mp4', 'render-receipt.json']) {
    const target = path.join(delivery, file);
    if (path.resolve(source, file) === target) {
      assert(fs.existsSync(target), 'The retained delivery is missing');
      continue;
    }
    assert(!fs.existsSync(target), 'Use a fresh proof directory');
    // The immutable movie is read-only; a hard link avoids another disk copy.
    if (file.endsWith('.mp4')) fs.linkSync(path.join(source, file), target);
    else fs.copyFileSync(path.join(source, file), target);
  }
  process.env.STUDIO_QA_ALL_SOUND_LANES = '1';
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: state,
    viewport: { width: 1600, height: 1500 }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  let renderJobs = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/process') renderJobs++; });
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=finished-all-lanes');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: process.env.STUDIO_QA_PROJECT_NAME, exact: true }).click();
    await h.rail(page);
    await require('./materials-editing-proof').view(page, label);
    assert.equal(renderJobs, 0);
    const lanes = await page.evaluate(() => {
      const bounds = document.querySelector('.pro-timeline-scroll').getBoundingClientRect();
      const tracks = ['video','graphics','motion','broll','originalAudio','music','sfx'];
      if (document.querySelector('[data-testid="pro-track-row-voiceover"]')) tracks.splice(5, 0, 'voiceover');
      return tracks.map(track => {
        const row = document.querySelector(`[data-testid="pro-track-row-${track}"]`);
        const r = row?.getBoundingClientRect();
        return { track, fullyVisible: Boolean(r && r.top >= bounds.top && r.bottom <= bounds.bottom) };
      });
    });
    assert(lanes.every(lane => lane.fullyVisible), 'Native edited lanes are clipped');
    await page.screenshot({ path: path.join(delivery, 'finished-film-and-all-lanes.png') });
    const frames = path.join(delivery, 'studio-recording-frames');
    const names = fs.readdirSync(frames).filter(name => name.endsWith('.jpg')).sort();
    for (const [index, label] of [[0,'start'],[Math.floor(names.length/2),'middle'],[names.length-1,'end']]) {
      fs.copyFileSync(path.join(frames, names[index]), path.join(delivery, `studio-${label}.jpg`));
    }
    const scratchBytes = fs.readdirSync(frames).reduce((total, name) =>
      total + fs.statSync(path.join(frames, name)).blocks * 512, 0);
    fs.rmSync(frames, { recursive: true });
    fs.writeFileSync(path.join(delivery, 'full-lanes-receipt.json'), JSON.stringify({
      at: new Date().toISOString(), lanes, newRenderJobs: renderJobs, newGpuJobs: 0,
      sourceDelivery: path.relative(folder, source), originalMovieHardLinked: true,
      generatedRecordingScratchBytesReleased: scratchBytes,
      scope: 'Complete real Studio finished-file playback alongside all present editable picture/sound lanes. Exact exported soundtrack muxed at observed playback-start offset; muted QA browser. This screen recording is not live-preview sound/parity or creative approval.',
    }, null, 2)+'\n');
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), state);
    console.log(`Finished movie and all ${lanes.length} native edited lanes recorded; generated recording scratch released.`);
  } catch (error) {
    await page.screenshot({ path: path.join(folder, 'native-finished-capture-failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(folder, 'failure.json'), JSON.stringify({
      at: new Date().toISOString(), error: error.message, newRenderJobs: renderJobs,
      qualification: 'FAILED_NATIVE_FINISHED_CAPTURE',
    }, null, 2)+'\n');
    throw error;
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
