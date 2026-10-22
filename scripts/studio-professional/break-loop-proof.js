#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const folder = path.resolve('reports/studio-break-the-loop-20261015/proof');
process.env.STUDIO_KINETIC_PROOF_DIR = folder;
const { pause, seek, range, recording } = require('./kinetic-type-proof');
const h = require('../creative-templates/studio-proof'), q = require('../../test/e2e/playwright/studio-stability/run');
const { hash } = require('../../src/creativeTemplates/contract'), { chromium } = require('playwright');
const name = 'BREAK THE LOOP — authored motion';
const decisions = doc => { const { revision, journal, idempotency, ...rest } = doc; return hash(rest); };
async function open(page, title) { await page.getByRole('button', { name: title, exact: true }).click(); await h.rail(page); await pause(page); }
async function poses(page, suffix = 'live') {
  for (const time of [1.8, 3.5, 4.6, 6.8, 9.9, 12.7, 15.7, 18]) {
    await seek(page, time); await page.waitForTimeout(400);
    await page.locator('.after-preview-loading').waitFor({ state: 'hidden', timeout: 90000 });
    await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(folder, `${suffix}-${time}.png`) });
  }
}
async function polish(page) {
  await q.tool(page, 'Motion'); await page.getByRole('button', { name: 'Logo & layers', exact: true }).click();
  const toggle = page.getByRole('button', { name: '⤳ Motion path', exact: true });
  if (await toggle.getAttribute('aria-pressed') === 'true') await toggle.click();
  const saved = await h.save(page, 'polish-baseline'), dot = saved.snapshot.overlays.find(l => l.name === 'Final / travelling dot');
  const t = page.getByTestId('studio-pro-timeline'), show = t.getByRole('button', { name: 'Show motion keyframes', exact: true });
  if (await show.isVisible()) await show.click();
  const expand = t.getByRole('button', { name: 'Expand Final / travelling dot keyframes', exact: true });
  if (await expand.isVisible()) await expand.click();
  const keys = saved.snapshot.motionKeyframes.filter(k => k.targetId === dot.id && k.property === 'x').sort((a, b) => a.time - b.time);
  await range(page.getByLabel('Timeline zoom', { exact: true }), 8);
  assert.equal(keys.length, 17); const stop = await recording(page); await page.waitForTimeout(150);
  try {
    for (const property of ['x', 'y']) {
      const row = saved.snapshot.motionKeyframes.filter(k => k.targetId === dot.id && k.property === property).sort((a, b) => a.time - b.time);
      for (let i = 0; i < row.length; i++) {
        await t.getByTestId(`motion-timeline-key-${row[i].id}`).click();
        const u = i / 16, value = property === 'x' ? 18 + u * 58 : 72 - 8 * u - 36 * Math.sin(Math.PI * u);
        const field = page.getByLabel('Selected motion key value', { exact: true }); await field.fill(String(value)); await field.blur();
      }
    }
    await poses(page, 'polished');
  } finally { await stop(); }
  const before = await h.save(page, 'polished');
  for (let i = 0; i < keys.length; i++) assert.equal(before.snapshot.motionKeyframes.find(k => k.id === keys[i].id).value, 18 + i / 16 * 58);
  await page.reload(); await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click(); await open(page, name);
  const reopened = await h.save(page, 'polished-reopened'); assert.equal(hash(before.snapshot.studioDocument), hash(reopened.snapshot.studioDocument));
  fs.writeFileSync(path.join(folder, 'native-polish.json'), JSON.stringify({ projectId: reopened.id, canonicalHash: hash(reopened.snapshot.studioDocument),
    dotPathAdjustedThroughNativeKeys: 34, exactColdReopen: true, noGraphInjection: true }, null, 2));
}
async function design(page, resume = false) {
  assert(!fs.existsSync(path.join(folder, 'native-design.json')), 'Preserve the completed native edit.');
  if (!resume) {
  await open(page, 'MAKE EVERY WORD MOVE — full-frame motion composition');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name', { exact: true }).fill(name);
  await q.tool(page, 'Graphics');
  while (await page.locator('.title-layer-list button').count()) {
    await page.locator('.title-layer-list button').first().click();
    await page.getByTestId('title-editor').getByRole('button', { name: 'Remove', exact: true }).click();
  }
  await q.tool(page, 'Motion'); await page.getByRole('button', { name: 'Logo & layers', exact: true }).click();
  for (const file of ['ink-stage.svg', 'acid-stage.svg', 'paper-stage.svg', 'orbit.svg'])
    await page.getByRole('button', { name: `Delete ${file}`, exact: true }).click();
  await q.tool(page, 'Sound');
  while (await page.locator('.sound-effect-chip').count()) {
    await page.locator('.sound-effect-chip').first().click(); await page.getByTestId('sound-effect-remove').click();
  }
  await page.getByTestId('background-sound-input').setInputFiles(path.resolve('reports/studio-break-the-loop-20261015/assets/break-the-loop-original-score.wav'));
  await range(page.locator('.inspector-range').filter({ hasText: 'Background volume' }).locator('input[type=range]'), 60);
  const duck = page.getByLabel(/Duck under speech/); if (await duck.isChecked()) await duck.uncheck();
  const loop = page.getByLabel(/Loop for the full clip/); if (await loop.isChecked()) await loop.uncheck();
  await range(page.getByLabel('Music fade in', { exact: true }), .05); await range(page.getByLabel('Music fade out', { exact: true }), .2);
  } else await open(page, name);
  await seek(page, 0); await q.tool(page, 'Graphics');
  const baseline = await h.save(page, 'clean'); assert.equal(baseline.snapshot.overlays.length, 0);
  const panel = page.getByTestId('studio-graphics-import'); await panel.locator('summary').click();
  const stop = await recording(page); await page.waitForTimeout(150);
  let editingError;
  try {
    await page.getByLabel('Graphics composition file', { exact: true }).setInputFiles(path.resolve('reports/studio-break-the-loop-20261015/assets/break-the-loop.graphics.json'));
    await panel.getByRole('status').waitFor(); assert((await panel.getByRole('status').innerText()).includes('imported.'), await panel.getByRole('status').innerText());
    const imported = await h.save(page, 'imported');
    assert.equal(imported.snapshot.overlays.length, 58);
    await page.getByTestId('studio-undo-button').click();
    const undone = await h.save(page, 'import-undone');
    assert.equal(undone.snapshot.overlays.length, 0);
    assert.equal(decisions(undone.snapshot.studioDocument), decisions(baseline.snapshot.studioDocument));
    await page.getByTestId('studio-redo-button').click();
    const redone = await h.save(page, 'import-redone');
    assert.equal(decisions(redone.snapshot.studioDocument), decisions(imported.snapshot.studioDocument));
    await page.locator('.title-layer-list button').filter({ has: page.locator('strong', { hasText: /^DIFFERENT$/ }) }).click();
    await page.getByLabel('Title text color', { exact: true }).fill('#ff5436');
    const changed = await h.save(page, 'individual-title-edited');
    assert.equal(changed.snapshot.overlays.find(layer => layer.text === 'DIFFERENT').color, '#ff5436');
    await page.getByTestId('studio-undo-button').click();
    assert.equal(decisions((await h.save(page, 'individual-title-undone')).snapshot.studioDocument), decisions(imported.snapshot.studioDocument));
    const t = page.getByTestId('studio-pro-timeline'), show = t.getByRole('button', { name: 'Show motion keyframes', exact: true });
    if (await show.isVisible()) await show.click();
    await t.getByRole('button', { name: 'Expand Final / travelling dot keyframes', exact: true }).click();
    const dot = imported.snapshot.overlays.find(l => l.name === 'Final / travelling dot');
    const key = imported.snapshot.motionKeyframes.find(k => k.targetId === dot.id && k.property === 'y' && Math.abs(k.time - 16.45) < .0001); assert(key);
    await t.getByTestId(`motion-timeline-key-${key.id}`).click();
    await page.getByLabel('Selected motion key value', { exact: true }).fill('58'); await page.getByLabel('Selected motion key value', { exact: true }).blur();
    assert.equal((await h.save(page, 'dot-key-edited')).snapshot.motionKeyframes.find(k => k.id === key.id).value, 58);
    await page.getByTestId('studio-undo-button').click();
    assert.equal(decisions((await h.save(page, 'dot-key-undone')).snapshot.studioDocument), decisions(imported.snapshot.studioDocument));
    await poses(page);
  } catch (error) { editingError = error; throw error; }
  finally { await stop().catch(error => { if (!editingError) throw error; }); }
  const before = await h.save(page, 'final-edit');
  await page.reload(); await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click(); await open(page, name);
  const reopened = await h.save(page, 'reopened'); assert.equal(hash(before.snapshot.studioDocument), hash(reopened.snapshot.studioDocument));
  fs.writeFileSync(path.join(folder, 'native-design.json'), JSON.stringify({ projectId: reopened.id, canonicalHashBeforeMediaUpload: hash(reopened.snapshot.studioDocument),
    layers: reopened.snapshot.overlays.length, groups: reopened.snapshot.compoundClips.length, keys: reopened.snapshot.motionKeyframes.length,
    nativeImportUndoRedo: true, nativeIndividualTextEditUndo: true, nativeIndividualPropertyKeyEditUndo: true, exactColdReopen: true,
    sharedCanonicalGraph: true, noGraphInjection: true, gpuJobs: 0, paidCost: 0 }, null, 2));
  console.log('Authored composition imported, edited, undo/redo verified, saved and exactly cold-reopened.');
}
async function main() {
  fs.mkdirSync(folder, { recursive: true }); const action = process.argv[2] || 'design';
  const shm = fs.statfsSync('/dev/shm'); assert(shm.bavail * shm.bsize > 1024 ** 3);
  const context = await chromium.launchPersistentContext(path.resolve('reports/studio-keyframe-selection-20261015/proof/browser-profile.private'), {
    ignoreDefaultArgs: ['--disable-dev-shm-usage'], channel: 'chromium', headless: true,
    args: ['--mute-audio', '--disk-cache-size=16777216', '--host-resolver-rules=MAP localhost 127.0.0.1'], viewport: { width: 1920, height: 1200 }, acceptDownloads: true });
  const page = context.pages()[0]; page.setDefaultTimeout(60000); let submissions = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/media/process') submissions++; });
  try {
    await page.goto('http://localhost:5000/?studioBreakLoop=20261015', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click(); assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (action === 'design' || action === 'continue') await design(page, action === 'continue');
    else {
      await open(page, name);
      if (action === 'poses') await poses(page, 'review');
      else if (action === 'polish') await polish(page);
      else if (action === 'render') await h.render(page, 'break-the-loop');
      else if (action === 'recover') {
        await h.recover(page, 'break-the-loop');
        const receipt = JSON.parse(fs.readFileSync(path.join(folder, 'break-the-loop/render-receipt.json')));
        if (process.env.STUDIO_QA_EXPECTED_JOB) assert.equal(receipt.submittedJobId, process.env.STUDIO_QA_EXPECTED_JOB);
      }
      else if (action === 'view') {
        const retry = page.getByRole('button', { name: 'Retry status check', exact: true });
        if (await retry.isVisible()) await retry.click();
        await require('../creative-templates/materials-editing-proof').view(page, 'break-the-loop');
        await h.rail(page); await pause(page);
        const pending = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
        const download = await pending, destination = path.join(folder, 'BREAK-THE-LOOP.autopromote.json');
        await download.saveAs(destination); fs.chmodSync(destination, 0o600);
        const backup = JSON.parse(fs.readFileSync(destination)), receipt = JSON.parse(fs.readFileSync(path.join(folder, 'break-the-loop/render-receipt.json')));
        assert.equal(hash(backup.snapshot.studioDocument), receipt.projectHash);
        assert.deepEqual(Object.keys(backup).sort(), ['createdAt', 'id', 'name', 'snapshot', 'versions']);
        fs.writeFileSync(path.join(folder, 'native-project-backup.json'), JSON.stringify({ normalNativeBackupDownload: true,
          canonicalHash: hash(backup.snapshot.studioDocument), sha256: hash(fs.readFileSync(destination)), bytes: fs.statSync(destination).size,
          authenticationExported: false, projectId: backup.id }, null, 2));
      }
      else throw Error('Unknown proof action');
    }
    assert.equal(submissions, action === 'render' ? 1 : 0);
  } catch (error) {
    await page.screenshot({ path: path.join(folder, `failure-${action}-${Date.now()}.png`) }).catch(() => {});
    fs.writeFileSync(path.join(folder, 'last-failure.private.txt'), (await page.locator('body').innerText()).slice(-24000), { mode: 0o600 });
    throw error;
  } finally { await context.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
