#!/usr/bin/env node
// Normal Studio gestures on retained owned footage. Never inject project/auth state.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const folder = path.resolve('reports/studio-keyframe-marquee-20261015/proof');
process.env.STUDIO_TEMPLATE_PROOF_DIR = folder;
Object.assign(process.env, { STUDIO_QA_EXPECTED_WIDTH: '1280', STUDIO_QA_EXPECTED_HEIGHT: '720',
  STUDIO_QA_EXPORT_FPS: '24', STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright' });
const { chromium } = require('playwright'), h = require('../creative-templates/studio-proof');
const { hash } = require('../../src/creativeTemplates/contract');
const name = 'Property animation — marquee and layer paste · r3';
const original = 'Property timeline — multi-key animation · r1';
const decisionHash = doc => { const { revision, journal, idempotency, ...rest } = doc; return hash(rest); };
async function pause(page) {
  const button = page.getByRole('button', { name: 'Pause comparison', exact: true });
  if (await button.isVisible()) await button.click();
  await page.locator('video,audio').evaluateAll(es => es.forEach(e => { e.muted = true; e.pause(); }));
}
async function seek(page, time) {
  await pause(page);
  await page.getByLabel('Edited output position', { exact: true }).evaluate((e, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, String(v));
    e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
  }, time);
  await page.waitForTimeout(300); await pause(page);
  await page.locator('.after-preview-loading').waitFor({ state: 'hidden', timeout: 90000 });
  return Number(await page.getByLabel('Edited output position', { exact: true }).inputValue());
}
async function expand(page, label) {
  const t = page.getByTestId('studio-pro-timeline');
  const show = t.getByRole('button', { name: 'Show motion keyframes', exact: true });
  if (await show.isVisible()) await show.click();
  const button = t.getByRole('button', { name: `Expand ${label} keyframes`, exact: true });
  if (await button.isVisible()) await button.click();
  return t;
}
async function boxSelect(page, label, start, end, options = {}) {
  const t = await expand(page, label);
  const scale = t.getByRole('group', { name: `${label} scale keyframes`, exact: true });
  const opacity = t.getByRole('group', { name: `${label} opacity keyframes`, exact: true });
  // Ordinary timeline scrolling only. The rectangle itself uses real pointer capture.
  await scale.evaluate((lane, time) => {
    const scroll = lane.closest('.pro-timeline-scroll');
    scroll.scrollTop += lane.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 70;
    scroll.scrollLeft += lane.getBoundingClientRect().left + lane.getBoundingClientRect().width * time / 20 - scroll.getBoundingClientRect().left - 240;
  }, start);
  await page.waitForTimeout(100);
  const a = await scale.boundingBox(), b = await opacity.boundingBox();
  const x1 = a.x + a.width * start / 20, x2 = a.x + a.width * end / 20;
  if (options.modifier) await page.keyboard.down(options.modifier);
  await page.mouse.move(x1, a.y + 2); await page.mouse.down();
  await page.mouse.move(x2, b.y + 34, { steps: 12 });
  await t.getByTestId('keyframe-marquee').waitFor();
  if (options.capture) await page.screenshot({ path: path.join(folder, options.capture) });
  if (options.cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
  if (options.modifier) await page.keyboard.up(options.modifier);
  return t.locator('.pro-motion-keyframe[aria-pressed="true"]').evaluateAll(es => es.map(e => e.dataset.keyId));
}
async function edit(page) {
  assert(!fs.existsSync(path.join(folder, 'native-marquee-edit.json')), 'Retain completed native workflow');
  await page.getByRole('button', { name: original, exact: true }).click(); await h.rail(page); await pause(page);
  await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name', { exact: true }).fill(name);
  await seek(page, 4.9);
  const baseline = await h.save(page, 'baseline');
  const source = baseline.snapshot.overlays.find(layer => layer.name === 'feature-one-line-1');
  const destination = baseline.snapshot.overlays.find(layer => layer.name === 'feature-one-line-2');
  const separator = page.getByRole('separator', { name: 'Resize timeline' });
  await separator.focus(); for (let i = 0; i < 14; i++) await separator.press('ArrowUp');
  const t = await expand(page, source.name);
  await t.getByRole('button', { name: 'Zoom in timeline', exact: true }).click();
  await t.getByRole('button', { name: 'Zoom in timeline', exact: true }).click();
  const sourceKeys = baseline.snapshot.motionKeyframes.filter(key => key.targetId === source.id &&
    ['scale', 'opacity'].includes(key.property) && key.time < 5.2);
  assert.equal(sourceKeys.length, 4);
  const selected = await boxSelect(page, source.name, 4.6, 5.15, { capture: 'marquee-across-properties.png' });
  assert.deepEqual(selected.sort(), sourceKeys.map(key => key.id).sort());
  await boxSelect(page, source.name, 4.6, 4.7, { modifier: 'Alt' });
  assert.equal(await t.locator('.pro-motion-keyframe[aria-pressed="true"]').count(), 2);
  await boxSelect(page, source.name, 4.6, 4.7, { modifier: 'Shift' });
  assert.equal(await t.locator('.pro-motion-keyframe[aria-pressed="true"]').count(), 4);
  await boxSelect(page, source.name, 4.6, 4.7, { cancel: true });
  assert.equal(await t.locator('.pro-motion-keyframe[aria-pressed="true"]').count(), 4);
  assert.equal(hash((await h.save(page, 'selection-only')).snapshot.studioDocument), hash(baseline.snapshot.studioDocument));
  await t.getByLabel('Selected keyframe time scale', { exact: true }).fill('1.25');
  await t.getByRole('button', { name: 'Scale key timing', exact: true }).click();
  await t.getByLabel('Selected keyframe interpolation', { exact: true }).selectOption('ease_out');
  await t.getByRole('button', { name: 'Apply interpolation', exact: true }).click();
  await t.getByRole('button', { name: 'Copy keys', exact: true }).click();
  const sourceEdited = await h.save(page, 'source-edited');
  await t.getByLabel('Keyframe paste destination', { exact: true }).selectOption(destination.id);
  const pasteAt = await seek(page, 4.775);
  // A conflicting destination rejects atomically; the original keys remain intact.
  await t.getByRole('button', { name: 'Paste at playhead', exact: true }).click();
  assert.equal(hash((await h.save(page, 'collision-rejected')).snapshot.studioDocument), hash(sourceEdited.snapshot.studioDocument));
  assert((await t.getByRole('alert').innerText()).includes('already occupies'));
  const destinationSelected = await boxSelect(page, destination.name, 4.7, 5.3);
  assert.equal(destinationSelected.length, 4);
  await t.getByRole('button', { name: 'Delete keys', exact: true }).click();
  const cleared = await h.save(page, 'destination-cleared');
  await t.getByRole('button', { name: 'Paste at playhead', exact: true }).click();
  const pasted = await h.save(page, 'pasted');
  const fresh = pasted.snapshot.motionKeyframes.filter(key => key.targetId === destination.id &&
    !baseline.snapshot.motionKeyframes.some(old => old.id === key.id));
  assert.equal(fresh.length, 4);
  const copied = sourceEdited.snapshot.motionKeyframes.filter(key => sourceKeys.some(old => old.id === key.id));
  for (const key of copied) assert(fresh.some(paste => paste.property === key.property && paste.value === key.value &&
    paste.easing === key.easing && hash(paste.curve) === hash(key.curve) &&
    Math.abs(paste.time - (pasteAt + key.time - 4.65)) < 1 / 90000));
  await page.getByTestId('studio-undo-button').click();
  assert.equal(decisionHash((await h.save(page, 'paste-undone')).snapshot.studioDocument), decisionHash(cleared.snapshot.studioDocument));
  await page.getByTestId('studio-redo-button').click();
  assert.equal(decisionHash((await h.save(page, 'paste-redone')).snapshot.studioDocument), decisionHash(pasted.snapshot.studioDocument));
  const graphics = t.getByTestId('pro-track-row-graphics');
  await graphics.getByRole('button', { name: 'Lock track', exact: true }).click();
  assert(await t.getByRole('button', { name: 'Paste at playhead', exact: true }).isDisabled());
  await graphics.getByRole('button', { name: 'Unlock track', exact: true }).click();
  assert(await t.getByRole('button', { name: 'Paste at playhead', exact: true }).isEnabled());
  await seek(page, 5.05); await page.screenshot({ path: path.join(folder, 'layer-animation-studio.png') });
  const final = await h.save(page, 'final-edit');
  await page.reload(); await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click(); await h.rail(page); await pause(page);
  const reopened = await h.save(page, 'reopened');
  assert.equal(hash(reopened.snapshot.studioDocument), hash(final.snapshot.studioDocument));
  fs.writeFileSync(path.join(folder, 'native-marquee-edit.json'), JSON.stringify({ projectId: reopened.id,
    canonicalHash: hash(reopened.snapshot.studioDocument), sourceId: source.id, destinationId: destination.id,
    copiedKeys: copied, pastedKeys: fresh, pasteAt, propertyKeys: reopened.snapshot.motionKeyframes.length,
    nativeMultiPropertyMarquee: true, additiveSelection: true, subtractSelection: true, escapeRestoresSelection: true,
    selectionDoesNotEditGraph: true, nativeMultiPropertyTimeScaleAndEasing: true,
    destinationCollisionRejectedAtomically: true, crossLayerPasteUndoRedo: true, destinationTrackLock: true,
    exactColdReopen: true, noMocks: true, gpuJobs: 0 }, null, 2));
  console.log('Native multi-property marquee and cross-layer paste/history/cold reopen passed.');
}
async function edgeSelection(page) {
  const separator = page.getByRole('separator', { name: 'Resize timeline' });
  await separator.focus(); for (let i = 0; i < 14; i++) await separator.press('ArrowUp');
  const t = await expand(page, 'feature-one-line-2');
  const selected = await boxSelect(page, 'feature-one-line-2', 4.7, 5.4);
  assert.equal(selected.length, 4);
  const lane = t.getByRole('group', { name: 'feature-one-line-2 scale keyframes', exact: true });
  await lane.evaluate(e => { const scroll = e.closest('.pro-timeline-scroll');
    scroll.scrollTop += e.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 70; });
  const scroll = t.locator('.pro-timeline-scroll'), before = await scroll.evaluate(e => e.scrollTop);
  const a = await lane.boundingBox(), b = await scroll.boundingBox();
  const x = Math.max(b.x + 220, Math.min(b.x + b.width - 50, a.x + a.width * 8 / 20));
  assert(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.pro-motion-property .pro-track-lane'), { x, y: a.y + 30 }), 'Start inside a visible property lane');
  await page.mouse.move(x, a.y + 30); await page.mouse.down();
  await page.mouse.move(x + 20, b.y + b.height - 4, { steps: 8 });
  await page.waitForTimeout(400);
  const after = await scroll.evaluate(e => e.scrollTop);
  assert(after > before, 'Marquee must scroll into lower property rows');
  await page.keyboard.press('Escape'); await page.mouse.up();
  const restored = await t.locator('.pro-motion-keyframe[aria-pressed="true"]').evaluateAll(es => es.map(e => e.dataset.keyId));
  assert.deepEqual(restored.sort(), selected.sort());
  fs.writeFileSync(path.join(folder, 'native-marquee-scroll.json'), JSON.stringify({ before, after,
    verticalEdgeScroll: true, escapeRestoresFourKeys: true, graphEdited: false, noMocks: true }, null, 2));
}
async function revealPropertiesDuringPlayback(page) {
  await page.waitForFunction(() => { const v = document.querySelector('[data-testid="studio-after-video"]');
    return v && !v.paused && v.currentTime >= 3 && document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output');
  }, undefined, { timeout: 90000 });
  await page.getByRole('group', { name: 'feature-one-line-2 scale keyframes', exact: true }).evaluate(lane => {
    const scroll = lane.closest('.pro-timeline-scroll');
    scroll.scrollTop += lane.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 100;
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.currentTime >= 12,
    undefined, { timeout: 30000 });
  await page.locator('.pro-timeline-scroll').evaluate(e => { e.scrollTop = 0; });
  fs.writeFileSync(path.join(folder, 'native-playback-property-reveal.json'), JSON.stringify({
    baseSourceGraphicsAndSoundLanesAtOpeningAndEnding: true, destinationPropertyRowsDuringAnimation: true,
    onlyTimelineScrolled: true, graphEdited: false, noMocks: true }, null, 2));
}
async function main() {
  const action = process.argv[2] || 'edit'; fs.mkdirSync(folder, { recursive: true });
  // Reuse the actual private authenticated profile. All original projects remain; editing duplicates normally.
  const profile = path.resolve('reports/studio-keyframe-selection-20261015/proof/browser-profile.private');
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
    args: ['--mute-audio', '--disk-cache-size=16777216', '--host-resolver-rules=MAP localhost 127.0.0.1'], viewport: { width: 1600, height: 1900 },
    acceptDownloads: true, ...(action === 'edit' ? { recordVideo: { dir: path.join(folder, 'editing-recording.private'), size: { width: 1600, height: 1900 } } } : {}) });
  const page = context.pages()[0]; page.setDefaultTimeout(60000); let renders = 0;
  page.on('request', request => { const p = new URL(request.url()).pathname;
    if (p === '/api/media/process') renders++;
    assert(!p.includes('studio-3d-preview') || request.method() !== 'POST'); });
  try {
    await page.goto('http://localhost:5000/?studioPropertySelection=20261015', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (action === 'edit') await edit(page);
    else {
      await page.getByRole('button', { name, exact: true }).click(); await h.rail(page); await pause(page);
      if (action === 'render') await h.render(page, 'animation');
      else if (action === 'view') {
        await edgeSelection(page); await page.locator('.pro-timeline-scroll').evaluate(e => { e.scrollTop = 0; });
        await Promise.all([require('../creative-templates/materials-editing-proof').view(page, 'animation'), revealPropertiesDuringPlayback(page)]);
      }
      else throw Error('Unknown action');
    }
    assert.equal(renders, action === 'render' ? 1 : 0);
  } catch (error) {
    await page.screenshot({ path: path.join(folder, `${action}-failure-${Date.now()}.png`) }).catch(() => {});
    throw error;
  } finally { const video = page.video(); await context.close(); if (video) console.log('Actual editing video:', await video.path()); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
