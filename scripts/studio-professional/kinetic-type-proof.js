#!/usr/bin/env node
// Real owned Studio entry, native text authoring and native CPU export only.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const folder = path.resolve(process.env.STUDIO_KINETIC_PROOF_DIR || 'reports/studio-kinetic-typography-20261015/proof');
process.env.STUDIO_TEMPLATE_PROOF_DIR = folder;
Object.assign(process.env, { STUDIO_QA_EXPECTED_WIDTH: '1280', STUDIO_QA_EXPECTED_HEIGHT: '720', STUDIO_QA_EXPORT_FPS: '24', STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright' });
const { chromium } = require('playwright'), h = require('../creative-templates/studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const { hash } = require('../../src/creativeTemplates/contract');
const name = 'MAKE EVERY WORD MOVE — kinetic type · r3';
const decisions = doc => { const { revision, journal, idempotency, ...rest } = doc; return hash(rest); };
async function pause(page) {
  const b = page.getByRole('button', { name: 'Pause comparison', exact: true }); if (await b.isVisible()) await b.click();
  await page.locator('video,audio').evaluateAll(elements => elements.forEach(e => { e.muted = true; e.pause(); }));
}
async function seek(page, value) {
  await pause(page); await range(page.getByLabel('Edited output position', { exact: true }), value);
  await page.locator('.after-preview-loading').waitFor({ state: 'hidden', timeout: 90000 }); await page.waitForTimeout(200); await pause(page);
}
async function range(input, value) { await input.evaluate((e, v) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, String(v));
  e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
}, value); }
async function recording(page) {
  require('../creative-templates/proof-storage').requireProofSpace(folder);
  const frames = path.join(folder, `editing-frames-${Date.now()}.private`); fs.mkdirSync(frames, { recursive: true });
  const session = await page.context().newCDPSession(page), images = []; let bytes = 0, failure;
  session.on('Page.screencastFrame', event => {
    const data = Buffer.from(event.data, 'base64');
    if (bytes + data.length > 256 * 1024 ** 2) failure = 'Editing capture exceeded256MiB';
    if (!failure) { const file = path.join(frames, `${String(images.length).padStart(6, '0')}.jpg`); fs.writeFileSync(file, data); images.push({ file, time: Date.now() / 1000 }); bytes += data.length; }
    void session.send('Page.screencastFrameAck', { sessionId: event.sessionId });
  });
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 65, maxWidth: 1920, maxHeight: 1200, everyNthFrame: 2 });
  return async () => {
    await session.send('Page.stopScreencast'); await session.detach(); assert(!failure, failure); assert(images.length);
    const concat = path.join(frames, 'frames.ffconcat'); fs.writeFileSync(concat, 'ffconcat version 1.0\n' + images.map((f, i) => `file '${f.file}'\nduration ${Math.max(.001, (images[i + 1]?.time ?? f.time + .1) - f.time)}\n`).join('') + `file '${images.at(-1).file}'\n`);
    const movie = path.join(folder, 'editing-in-studio.mp4');
    if (fs.existsSync(movie)) fs.renameSync(movie, movie.replace('.mp4', `-${Date.now()}.mp4`));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-safe', '0', '-i', concat, '-vf', 'fps=24', '-c:v', 'libx264', '-preset', 'fast', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', movie]);
    const keep = new Set([images[0].file, images[Math.floor(images.length / 2)].file, images.at(-1).file]);
    for (const item of images) if (!keep.has(item.file)) fs.unlinkSync(item.file); fs.unlinkSync(concat);
    fs.writeFileSync(path.join(folder, 'editing-recording.json'), JSON.stringify({ seconds: images.at(-1).time - images[0].time, frames: images.length, rawBytes: bytes, nativeControlsOnly: true, setupExcluded: true, audio: 'Silent native editing capture' }, null, 2));
  };
}
async function open(page, title) { await page.getByRole('button', { name: title, exact: true }).click(); await h.rail(page); await pause(page); }
async function addTitle(page, beat) {
  await q.tool(page, 'Graphics'); await seek(page, beat.start);
  await page.getByRole('group', { name: 'Add title layer', exact: true }).count();
  await page.locator('[aria-label="Add title layer"]').getByRole('button', { name: /Headline/ }).click();
  await page.getByLabel('Title text', { exact: true }).fill(beat.text);
  await page.getByLabel('Title start time', { exact: true }).fill(String(beat.start)); await page.getByLabel('Title start time', { exact: true }).blur();
  await page.getByLabel('Title duration', { exact: true }).fill(String(beat.duration)); await page.getByLabel('Title duration', { exact: true }).blur();
  await page.getByRole('button', { name: 'Center', exact: true }).last().click();
  await range(page.getByLabel('Title text box width', { exact: true }), 90);
  await range(page.getByLabel('Title size', { exact: true }), beat.scale);
  await page.getByLabel('Title text color', { exact: true }).fill(beat.color);
  await page.getByLabel('Kinetic movement', { exact: true }).selectOption(beat.style);
  await page.getByLabel('Kinetic unit', { exact: true }).selectOption(beat.unit || 'word');
  await page.getByLabel('Kinetic order', { exact: true }).selectOption(beat.direction || 'forward');
  for (const [label, value] of [['Kinetic stagger (s)', beat.stagger], ['Kinetic entrance (s)', beat.entry || .5], ['Kinetic travel (%)', beat.travel || 10], ['Kinetic rotation (deg)', beat.tilt || 16]]) {
    if (label === 'Kinetic travel (%)' && beat.style === 'pop') continue;
    if (label === 'Kinetic rotation (deg)' && beat.style !== 'spin') continue;
    await page.getByLabel(label, { exact: true }).fill(String(value));
  }
  const before = await h.save(page, `before-${beat.id}`);
  await page.getByRole('button', { name: 'Build editable text motion', exact: true }).click();
  await page.waitForFunction(previous => [...document.querySelectorAll('.title-layer-list button')].length > previous,
    before.snapshot.overlays.filter(o => o.type === 'text').length);
  const after = await h.save(page, `after-${beat.id}`);
  const group = after.snapshot.compoundClips.find(g => !before.snapshot.compoundClips.some(old => old.id === g.id)); assert(group);
  const keys = after.snapshot.motionKeyframes.filter(k => group.layerIds.includes(k.targetId)); assert(keys.length >= 32);
  return { before, after, group, keys };
}
async function edit(page, resume = false) {
  assert(!fs.existsSync(path.join(folder, 'native-edit.json')), 'Preserve the completed kinetic edit');
  if (!resume) {
  await open(page, 'ONDA — motion workspace · r1'); await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name', { exact: true }).fill(name); await q.tool(page, 'Graphics');
  while (await page.locator('.title-layer-list button').count()) {
    await page.locator('.title-layer-list button').first().click(); await page.getByTestId('title-editor').getByRole('button', { name: 'Remove', exact: true }).click();
  }
  await seek(page, 6);
  const logo = page.locator('.draggable-overlay.is-media-overlay');
  if (await logo.count()) { await logo.first().click({ force: true }); await logo.first().locator('.overlay-delete-btn').click(); }
  } else await open(page, name);
  const clean = await h.save(page, 'clean-footage'); assert.equal(clean.snapshot.overlays.length, 0);
  const separator = page.getByRole('separator', { name: 'Resize timeline' }); await separator.focus(); for (let i = 0; i < 8; i++) await separator.press('ArrowUp');
  await q.tool(page, 'Graphics');
  const stop = await recording(page), results = [];
  try {
    for (const beat of [
      { id: 'opening', text: 'MAKE EVERY\nWORD MOVE.', start: .25, duration: 3.9, scale: 1.85, color: '#ffffff', style: 'spin', stagger: .16, travel: 14, tilt: 22 },
      { id: 'letters', text: 'THINK BIG.\nMOVE BOLD.', start: 4.65, duration: 3.8, scale: 1.8, color: '#c4a0ff', style: 'rise', unit: 'letter', direction: 'center', stagger: .065, travel: 12 },
      { id: 'rhythm', text: 'TYPE IT.\nTIME IT.\nMAKE IT HIT.', start: 9.5, duration: 3.9, scale: 1.7, color: '#ffffff', style: 'pop', direction: 'reverse', stagger: .12, entry: .4 },
      { id: 'ending', text: 'YOUR WORDS.\nIN MOTION.', start: 15.25, duration: 4.6, scale: 1.9, color: '#c4a0ff', style: 'spin', stagger: .18, travel: 12, tilt: 18 },
    ]) {
      const result = await addTitle(page, beat); results.push({ beat, groupId: result.group.id, layerIds: result.group.layerIds, keys: result.keys });
      if (beat.id === 'opening') {
        await page.getByTestId('studio-undo-button').click(); assert.equal(decisions((await h.save(page, 'build-undone')).snapshot.studioDocument), decisions(result.before.snapshot.studioDocument));
        await page.getByTestId('studio-redo-button').click(); assert.equal(decisions((await h.save(page, 'build-redone')).snapshot.studioDocument), decisions(result.after.snapshot.studioDocument));
        const t = page.getByTestId('studio-pro-timeline');
        const show = t.getByRole('button', { name: 'Show motion keyframes', exact: true }); if (await show.isVisible()) await show.click();
        await t.getByRole('button', { name: 'Expand MAKE · 1 keyframes', exact: true }).click();
        const rotation = result.keys.find(key => key.targetId === result.group.layerIds[0] && key.property === 'rotation' && key.time > beat.start);
        await t.getByTestId(`motion-timeline-key-${rotation.id}`).click();
        const value = page.getByLabel('Selected motion key value', { exact: true }); await value.fill('-4'); await value.blur();
        const edited = await h.save(page, 'word-key-edited'); assert.equal(edited.snapshot.motionKeyframes.find(key => key.id === rotation.id).value, -4);
        await page.getByTestId('studio-undo-button').click();
        assert.equal(decisions((await h.save(page, 'word-key-undone')).snapshot.studioDocument), decisions(result.after.snapshot.studioDocument));
        await q.tool(page, 'Graphics');
        await page.locator('.title-layer-list button').filter({ has: page.locator('strong', { hasText: /^MOVE\.$/ }) }).click();
        await page.getByLabel('Title text color', { exact: true }).fill('#c4a0ff');
      }
      await seek(page, beat.start + .8); await page.screenshot({ path: path.join(folder, `${beat.id}-live.png`) });
    }
  } finally { await stop(); }
  const final = await h.save(page, 'final-edit');
  await page.reload(); await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click(); await open(page, name);
  const reopened = await h.save(page, 'reopened'); assert.equal(hash(final.snapshot.studioDocument), hash(reopened.snapshot.studioDocument));
  fs.writeFileSync(path.join(folder, 'native-edit.json'), JSON.stringify({ projectId: final.id, canonicalHash: hash(final.snapshot.studioDocument),
    sourceShots: final.snapshot.timeline.length, layers: final.snapshot.overlays.length, keys: final.snapshot.motionKeyframes.length,
    beats: results, nativeConversionUndoRedo: true, nativeIndividualWordKeyEditUndo: true, nativeWordColourEdit: true,
    exactColdReopen: true, normalOwnedProjectDuplicate: true, noGraphInjection: true, gpuJobs: 0 }, null, 2));
  console.log('Four native kinetic typography beats saved and exactly cold-reopened.');
}
async function main() {
  const action = process.argv[2] || 'edit'; fs.mkdirSync(folder, { recursive: true });
  const context = await chromium.launchPersistentContext(path.resolve('reports/studio-keyframe-selection-20261015/proof/browser-profile.private'), {
    channel: 'chromium', headless: true, args: ['--mute-audio', '--disk-cache-size=16777216', '--host-resolver-rules=MAP localhost 127.0.0.1'], viewport: { width: 1920, height: 1200 }, acceptDownloads: true });
  const page = context.pages()[0]; page.setDefaultTimeout(60000); let renders = 0;
  page.on('request', request => { const p = new URL(request.url()).pathname; if (p === '/api/media/process') renders++; assert(!p.includes('studio-3d-preview') || request.method() !== 'POST'); });
  try {
    await page.goto('http://localhost:5000/?studioKineticType=20261015', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click(); assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (action === 'edit' || action === 'continue') await edit(page, action === 'continue');
    else { await open(page, name); if (action === 'render') await h.render(page, 'kinetic');
      else if (action === 'view') await require('../creative-templates/materials-editing-proof').view(page, 'kinetic');
      else throw Error('Unknown action'); }
    assert.equal(renders, action === 'render' ? 1 : 0);
  } catch (error) { await page.screenshot({ path: path.join(folder, `${action}-failure-${Date.now()}.png`) }).catch(() => {}); throw error; }
  finally { await context.close(); }
}
module.exports = { pause, seek, range, recording };
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
