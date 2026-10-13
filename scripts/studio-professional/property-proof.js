#!/usr/bin/env node
// Normal signed-in UI only. No identity, project, route or render injection.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const h = require('../creative-templates/studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const { saveAuthenticatedState, authenticatedLocalState } = require('../creative-templates/studio-session');
const folder = path.resolve(__dirname, '../../reports/studio-professional-editing-20261013/proof');
const name = 'Property animation — 3s native proof · 20261013';
const state = path.join(folder, 'session.private.json');
const decisions = doc => { const { revision, journal, ...content } = doc; return hash(content); };
async function boundMicroproof(page) {
  const record = await h.save(page, 'microproof-bound');
  const snapshot = record.snapshot;
  const ticks = snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick;
  assert.equal(ticks, 3 * 90000, 'This proof is bounded to exactly three seconds');
  assert(!snapshot.threeDScenes?.length && !snapshot.subjectVfxScenes?.length, 'No model/GPU dispatch belongs in this proof');
  // The shared creative-film helper reserves 5 GiB for longer compositions.
  // This isolated 72-frame CPU proof reserves 1 GiB and caps recording scratch
  // at 64 MiB. Its product auth, uploads, rendering and downloads remain real.
  const storage = require('../creative-templates/proof-storage');
  storage.MAX_CAPTURE_BYTES = 64 * 1024 ** 2;
  storage.requireProofSpace = directory => {
    assert.equal(path.resolve(directory), folder);
    const stats = fs.statfsSync(folder), available = stats.bavail * stats.bsize;
    assert(available >= 1024 ** 3, 'Three-second proof requires 1 GiB free');
    return available;
  };
}
async function pause(page) {
  const button = page.getByRole('button', { name: 'Pause comparison', exact: true });
  if (await button.isVisible()) await button.click();
  await page.locator('video,audio').evaluateAll(elements => elements.forEach(el => { el.muted = true; el.pause(); }));
}
async function seek(page, time) {
  await pause(page);
  await page.getByLabel('Edited output position', { exact: true }).evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, time);
  await page.waitForTimeout(400);
  await pause(page);
}
async function value(page, label, property, next) {
  const input = page.getByLabel(`${label} ${property} value`, { exact: true });
  await input.fill(String(next)); await input.press('Enter'); await page.waitForTimeout(200);
}
async function main() {
  const action = process.argv[2] || 'inspect';
  fs.mkdirSync(folder, { recursive: true });
  // Playwright JSON storageState does not retain local File/Blob payloads.
  // Preserve real IndexedDB through a private browser profile across actions.
  const profile = path.join(folder, 'browser-profile.private');
  fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: ['--mute-audio', '--host-resolver-rules=MAP localhost 127.0.0.1'],
    acceptDownloads: true, viewport: { width: 1600, height: 1000 } });
  const page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(45000);
  let renders = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/process') renders++; });
  try {
    await page.goto('http://localhost:5000/?studioProfessionalSession=properties');
    // Visit the origin before querying its state. A new persistent context has
    // no visited origins yet; checking on about:blank would erase saved projects.
    if (!authenticatedLocalState(await context.storageState({ indexedDB: true }))) {
      await context.setStorageState(JSON.parse(fs.readFileSync(
        '/home/tibule12/.local/share/autopromote-qa/session/studio-session.private.json')));
      await page.reload();
    }
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (action === 'inspect') {
      await page.screenshot({ path: path.join(folder, 'entry.png') });
      console.log((await page.locator('body').innerText()).slice(-4500)); return;
    }
    if (action === 'edit') {
      await page.locator('.creator-studio-dropzone input[type=file]').setInputFiles(path.join(folder, 'property-grid.mp4'));
      console.log('Owned source upload started.');
      await page.getByRole('button', { name: 'Open Creator Studio', exact: true }).click({ timeout: 120000 });
      console.log('Normal Studio source opened.');
      await h.rail(page); await pause(page);
      await page.getByLabel('Project name', { exact: true }).fill(name);
      await q.tool(page, 'B-roll');
      console.log('Native media tool selected.');
      await page.getByTestId('visual-image-input').setInputFiles(path.join(folder, 'property-marker.png'));
      await pause(page);
      const before = await h.save(page, 'unanimated');
      console.log('Unanimated native project saved.');
      const layer = before.snapshot.overlays.find(item => item.type === 'image');
      assert(layer && !before.snapshot.motionKeyframes.some(key => key.targetId === layer.id));
      const label = layer.name || layer.text || 'Visual layer';
      const timeline = page.getByTestId('studio-pro-timeline');
      const resize = page.getByRole('separator', { name: 'Resize timeline' }); await resize.focus();
      for (let i = 0; i < 17; i++) await resize.press('ArrowUp');
      await timeline.getByRole('button', { name: 'Show motion keyframes', exact: true }).click();
      await timeline.getByRole('button', { name: `Expand ${label} keyframes`, exact: true }).click();
      console.log('Property rows expanded.');
      await seek(page, 0);
      await value(page, label, 'x', 25);
      const base = await h.save(page, 'base-value');
      assert.equal(base.snapshot.overlays.find(item => item.id === layer.id).x, 25);
      assert.equal(base.snapshot.motionKeyframes.length, before.snapshot.motionKeyframes.length);
      await timeline.getByRole('button', { name: `Add ${label} x keyframe at playhead`, exact: true }).click();
      await seek(page, 2);
      // Editing an animated property creates its next key, retaining every
      // other transform property and the existing canonical render consumer.
      await value(page, label, 'x', 75);
      const animated = await h.save(page, 'animated');
      const keys = animated.snapshot.motionKeyframes.filter(key => key.targetId === layer.id);
      assert.equal(keys.length, 2); assert(keys.every(key => key.property === 'x'));
      assert.deepEqual(keys.map(key => [key.time, key.value]), [[0, 25], [2, 75]]);
      await page.getByTestId('studio-undo-button').click(); await page.waitForTimeout(400);
      const undone = await h.save(page, 'undone');
      assert.equal(undone.snapshot.motionKeyframes.filter(key => key.targetId === layer.id).length, 1);
      await page.getByTestId('studio-redo-button').click(); await page.waitForTimeout(400);
      const redone = await h.save(page, 'redone');
      assert.equal(decisions(redone.snapshot.studioDocument), decisions(animated.snapshot.studioDocument));
      await timeline.getByRole('button', { name: `Remove ${label} x keyframe at playhead`, exact: true }).click();
      const removed = await h.save(page, 'removed');
      assert.equal(removed.snapshot.motionKeyframes.filter(key => key.targetId === layer.id).length, 1);
      await page.getByTestId('studio-undo-button').click(); await page.waitForTimeout(400);
      assert.equal(decisions((await h.save(page, 'restored')).snapshot.studioDocument), decisions(animated.snapshot.studioDocument));
      await seek(page, 1);
      assert.equal(Number(await page.getByLabel(`${label} x value`, { exact: true }).inputValue()), 50);
      await page.getByLabel(`${label} x value`, { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(folder, 'native-properties.png') });
      const saved = await h.save(page, 'saved');
      await page.reload(); await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
      await page.getByRole('button', { name, exact: true }).click();
      const reopened = await h.save(page, 'reopened');
      assert.equal(hash(reopened.snapshot.studioDocument), hash(saved.snapshot.studioDocument));
      fs.writeFileSync(path.join(folder, 'native-lifecycle.json'), JSON.stringify({
        at: new Date().toISOString(), projectId: reopened.id, canonicalHash: hash(reopened.snapshot.studioDocument),
        layerId: layer.id, label, nativeBaseValue: true, singlePropertyKeys: keys, evaluatedMidpoint: 50,
        undo: true, redo: true, removeAndUndo: true, saveColdReopen: true,
        renderJobs: renders, gpuJobs: 0, mocks: false, authBypass: false,
      }, null, 2));
      assert.equal(renders, 0);
    } else {
      await page.getByRole('button', { name, exact: true }).click(); await h.rail(page); await pause(page);
      if (action === 'render') { await boundMicroproof(page); await h.render(page, 'property-animation'); assert.equal(renders, 1); }
      else if (action === 'view') {
        await boundMicroproof(page);
        await page.setViewportSize({ width: 1600, height: 1400 });
        const lifecycle = JSON.parse(fs.readFileSync(path.join(folder, 'native-lifecycle.json')));
        const timeline = page.getByTestId('studio-pro-timeline');
        await timeline.getByRole('button', { name: 'Show motion keyframes', exact: true }).click();
        await timeline.getByRole('button', { name: `Expand ${lifecycle.label} keyframes`, exact: true }).click();
        const resize = page.getByRole('separator', { name: 'Resize timeline' }); await resize.focus();
        for (let i = 0; i < 17; i++) await resize.press('ArrowUp');
        await require('../creative-templates/materials-editing-proof').view(page, 'property-animation');
        assert.equal(renders, 0);
      }
      else if (action === 'preview') {
        const lifecycle = JSON.parse(fs.readFileSync(path.join(folder, 'native-lifecycle.json')));
        const timeline = page.getByTestId('studio-pro-timeline');
        await timeline.getByRole('button', { name: 'Show motion keyframes', exact: true }).click();
        await timeline.getByRole('button', { name: `Expand ${lifecycle.label} keyframes`, exact: true }).click();
        const observations = [];
        for (const time of [.5, 1, 1.5, 2.5]) {
          await seek(page, time);
          await page.getByText('Loading edited preview…', { exact: true }).waitFor({ state: 'hidden' });
          const frame = page.getByTestId('hook-preview-frame');
          const images = await frame.locator('img').evaluateAll(elements => elements.map(image =>
            ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight })));
          assert(images.length && images.every(image => image.complete && image.width > 0), 'Preview image did not decode');
          await frame.screenshot({ path: path.join(folder, `preview-${time}.png`) });
          observations.push({ time, value: Number(await page.getByLabel(`${lifecycle.label} x value`, { exact: true }).inputValue()), images });
        }
        fs.writeFileSync(path.join(folder, 'preview-values.json'), JSON.stringify(observations, null, 2));
        assert.equal(renders, 0);
      } else throw new Error('Unknown action');
    }
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), state);
    console.log(`Native professional property ${action} passed; ${renders} render jobs, zero GPU jobs.`);
  } catch (error) {
    await page.screenshot({ path: path.join(folder, `${action}-failure.png`) }).catch(() => {});
    console.error((await page.locator('body').innerText()).slice(-1800)); throw error;
  } finally { await context.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
