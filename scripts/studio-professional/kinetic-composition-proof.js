#!/usr/bin/env node
// Author the full-frame motion composition through normal signed-in Studio.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const folder = path.resolve('reports/studio-kinetic-composition-20261015/proof');
process.env.STUDIO_KINETIC_PROOF_DIR = folder;
const { pause, seek, range, recording } = require('./kinetic-type-proof');
const h = require('../creative-templates/studio-proof'), q = require('../../test/e2e/playwright/studio-stability/run');
const { chromium } = require('playwright'), { hash } = require('../../src/creativeTemplates/contract');
const name = 'MAKE EVERY WORD MOVE — full-frame motion composition';
async function open(page, title) { await page.getByRole('button', { name: title, exact: true }).click(); await h.rail(page); await pause(page); }
async function number(page, label, value) { const input = page.getByLabel(label, { exact: true }); await input.fill(String(value)); await input.press('Enter'); await input.blur(); }
async function property(page, label, value) { await number(page, label, value); }
async function card(page, file, start, duration, { scale = 1, rotation = 0, arrival, endScale = 1, endRotation = 0, fadeOut = false } = {}) {
  await seek(page, start); await q.tool(page, 'Motion'); await page.getByRole('button', { name: 'Logo & layers', exact: true }).click();
  await page.getByTestId('motion-logo-input').setInputFiles(path.resolve('reports/studio-kinetic-composition-20261015/assets', file));
  await page.getByRole('button', { name: 'Reset transform', exact: true }).waitFor();
  await page.waitForFunction(file => [...document.querySelectorAll('.motion-layer-select strong')].some(e => e.textContent === file), file);
  await page.getByRole('button', { name: 'Reset transform', exact: true }).click();
  for (const [label, value] of [['Motion layer in point', start], ['Motion layer duration', duration], ['Motion layer width', 100], ['Motion layer height', 100]]) await number(page, label, value);
  for (const label of ['Enable layer glow', 'Enable layer shadow', 'Enable layer motion blur']) { const input = page.getByLabel(label, { exact: true }); if (await input.isChecked()) await input.uncheck(); }
  await property(page, 'Scale', scale); await property(page, 'Rotate', rotation);
  await page.getByRole('button', { name: /^◆ Add transform keyframe at/ }).click();
  if (arrival !== undefined) {
    await seek(page, arrival); await property(page, 'Scale', endScale); await property(page, 'Rotate', endRotation);
    if (fadeOut) await range(page.getByLabel(/^Opacity/), 0);
  }
  const saved = await h.save(page, file.replace('.svg', ''));
  const layer = saved.snapshot.overlays.find(layer => layer.name === file); assert(layer);
  await q.tool(page, 'Composite');
  // Four typography groups remain above the background and orbit artwork.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: `Send ${file} backward`, exact: true }).click();
  return layer.id;
}
async function design(page) {
  assert(!fs.existsSync(path.join(folder, 'native-composition.json')), 'Preserve the completed composition');
  await open(page, 'MAKE EVERY WORD MOVE — kinetic type · r3');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name', { exact: true }).fill(name);
  const baseline = await h.save(page, 'baseline');
  const stop = await recording(page);
  try {
    await q.tool(page, 'Graphics');
    for (let index = 0; index < baseline.snapshot.overlays.length; index++) {
      const layer = baseline.snapshot.overlays[index];
      await page.locator('.title-layer-list button').nth(index).click();
      const dark = layer.startTime >= 4.4 && layer.startTime < 13.4;
      const accent = layer.text === 'MOVE.' || layer.text === 'MOTION.';
      await page.getByLabel('Title text color', { exact: true }).fill(dark ? '#101014' : accent ? '#d2ff3f' : '#f2efeb');
      await page.locator('.title-typography-row').first().getByRole('combobox').last().selectOption('none');
      await range(page.getByLabel('Title outline width', { exact: true }), 0);
    }
    await q.tool(page, 'Composite');
    for (const group of baseline.snapshot.compoundClips) {
      await seek(page, group.timing.startTime);
      await number(page, `${group.name} scale`, 1.75);
      await page.getByRole('button', { name: `Add ${group.name} scale keyframe at playhead`, exact: true }).click();
      await seek(page, group.timing.startTime + group.timing.duration - .35);
      await number(page, `${group.name} scale`, 1.95);
    }
    const artwork = [];
    artwork.push(await card(page, 'ink-stage.svg', 0, 20));
    artwork.push(await card(page, 'acid-stage.svg', 4.45, 4.8, { scale: .1, rotation: -8, arrival: 4.95 }));
    artwork.push(await card(page, 'paper-stage.svg', 9.25, 6, { scale: .1, rotation: 8, arrival: 9.65 }));
    artwork.push(await card(page, 'orbit.svg', 13.4, 1.95, { scale: .4, rotation: -35, arrival: 15.3, endScale: 1.25, endRotation: 55, fadeOut: true }));
    for (const time of [1.5, 6.5, 11.5, 14.2, 17]) {
      await seek(page, time); await page.screenshot({ path: path.join(folder, `composition-${time}.png`) });
    }
    const saved = await h.save(page, 'designed');
    assert.equal(saved.snapshot.overlays.filter(layer => layer.type === 'text').length, 33);
    assert.equal(saved.snapshot.overlays.filter(layer => layer.type === 'image').length, 4);
    for (const id of artwork) assert(saved.snapshot.compositionOrder.indexOf(id) < saved.snapshot.compositionOrder.indexOf(saved.snapshot.compoundClips[0].layerIds[0]));
  } finally { await stop(); }
  const before = await h.save(page, 'final-edit');
  await page.reload(); await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click(); await open(page, name);
  const reopened = await h.save(page, 'reopened'); assert.equal(hash(before.snapshot.studioDocument), hash(reopened.snapshot.studioDocument));
  fs.writeFileSync(path.join(folder, 'native-composition.json'), JSON.stringify({ projectId: reopened.id, canonicalHashBeforeMediaUpload: hash(reopened.snapshot.studioDocument),
    textLayers: 33, imageLayers: 4, groups: 4, keyframes: reopened.snapshot.motionKeyframes.length,
    fullFrameMotionComposition: true, proceduralSvgAssetsImportedNormally: true, noGraphInjection: true, exactColdReopen: true, gpuJobs: 0 }, null, 2));
  console.log('Full-frame ink/acid/paper typography, camera pushes, animated stage changes and orbital interlude authored in Studio.');
}
async function main() {
  const action = process.argv[2] || 'design'; fs.mkdirSync(folder, { recursive: true });
  const shm = fs.statfsSync('/dev/shm');
  assert(shm.bavail * shm.bsize > 1024 ** 3, 'Keep at least 1GiB for native browser video buffers.');
  const context = await chromium.launchPersistentContext(path.resolve('reports/studio-keyframe-selection-20261015/proof/browser-profile.private'), {
    // This host has a 12GiB tmpfs. Use Chromium's normal shared-memory path
    // rather than Playwright's disk-backed fallback for decoded video buffers.
    ignoreDefaultArgs: ['--disable-dev-shm-usage'],
    channel: 'chromium', headless: true, args: ['--mute-audio', '--disk-cache-size=16777216', '--host-resolver-rules=MAP localhost 127.0.0.1'], viewport: { width: 1920, height: 1200 }, acceptDownloads: true });
  const page = context.pages()[0]; page.setDefaultTimeout(30000); let submissions = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/process') submissions++; });
  try {
    await page.goto('http://localhost:5000/?studioKineticComposition=20261015', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click(); assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (action === 'design') await design(page);
    else if (action === 'finish') {
      await open(page, name); await q.tool(page, 'Motion');
      await page.getByRole('button', { name: 'Logo & layers', exact: true }).click();
      await page.getByLabel(/^Target layer/).selectOption({ label: 'orbit.svg' });
      const stop = await recording(page);
      try {
        await seek(page, 15.3); await range(page.getByLabel(/^Opacity/), 0);
        await q.tool(page, 'Composite');
        for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Send orbit.svg backward', exact: true }).click();
        for (const time of [1.5, 6.5, 11.5, 14.2, 17]) { await seek(page, time); await page.screenshot({ path: path.join(folder, `composition-${time}.png`) }); }
      } finally { await stop(); }
      const before = await h.save(page, 'final-edit');
      await page.reload(); await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click(); await open(page, name);
      const reopened = await h.save(page, 'reopened'); assert.equal(hash(before.snapshot.studioDocument), hash(reopened.snapshot.studioDocument));
      const s = reopened.snapshot, images = s.overlays.filter(layer => layer.type === 'image');
      assert.equal(images.length, 4); assert.equal(s.overlays.filter(layer => layer.type === 'text').length, 33);
      for (const image of images) assert(s.compositionOrder.indexOf(image.id) < s.compositionOrder.indexOf(s.compoundClips[0].layerIds[0]));
      fs.writeFileSync(path.join(folder, 'native-composition.json'), JSON.stringify({ projectId: reopened.id, canonicalHashBeforeMediaUpload: hash(s.studioDocument),
        textLayers: 33, imageLayers: 4, groups: 4, keyframes: s.motionKeyframes.length,
        fullFrameMotionComposition: true, proceduralSvgAssetsImportedNormally: true, noGraphInjection: true, exactColdReopen: true, gpuJobs: 0 }, null, 2));
      console.log('Full-frame designed composition saved and exactly cold-reopened.');
    }
    else { await open(page, name); if (action === 'render') {
      const saved = await h.save(page, 'render-baseline'), ink = saved.snapshot.overlays.find(layer => layer.name === 'ink-stage.svg'); assert(ink);
      await seek(page, 1.5);
      const stage = await page.getByTestId('hook-preview-frame').boundingBox();
      const image = await page.locator(`[data-studio-layer-id="${ink.id}"]`).boundingBox();
      assert(Math.abs(stage.width - image.width) < 2, 'The ordinary 100% backdrop must fill the programme width');
      fs.writeFileSync(path.join(folder, 'native-full-frame-geometry.json'), JSON.stringify({ stage, backdrop: image, fullProgrammeWidth: true, nativeNormalApp: true }, null, 2));
      for (const time of [1.5, 6.5, 11.5, 14.2, 17]) { await seek(page, time); await page.screenshot({ path: path.join(folder, `final-composition-${time}.png`) }); }
      await h.render(page, 'composition');
    }
      else if (action === 'view') await require('../creative-templates/materials-editing-proof').view(page, 'composition');
      else throw Error('Unknown action'); }
    assert.equal(submissions, action === 'render' ? 1 : 0);
  } catch (error) { await page.screenshot({ path: path.join(folder, `failure-${action}-${Date.now()}.png`) }).catch(() => {}); throw error; }
  finally { await context.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
