#!/usr/bin/env node
// A bounded native Studio edit. The private persistent profile contains real
// authentication and IndexedDB; no route, identity or graph is injected.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const combined = process.env.STUDIO_QA_EFFECTS_PROOF === '1';
const folder = path.resolve(__dirname, '../../reports/studio-professional-continuation-20261013/proof', combined ? 'combined' : '.');
process.env.STUDIO_TEMPLATE_PROOF_DIR = folder;
process.env.STUDIO_QA_EXPECTED_WIDTH = '720';
process.env.STUDIO_QA_EXPECTED_HEIGHT = '1280';
process.env.STUDIO_QA_EXPORT_FPS = '24';
process.env.STUDIO_QA_NATIVE_DOWNLOAD_METHOD = 'playwright';
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const h = require('../creative-templates/studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const baseName = 'Transparent graphics — native blur and motion · 20261013';
const name = combined ? 'Image effects — shared shadow, glow and blur · 20261013' : baseName;

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
  await page.locator('video,audio').evaluateAll(elements => elements.forEach(el => { el.muted = true; el.pause(); }));
}
async function seek(page, time) {
  await pause(page);
  await range(page.getByLabel('Edited output position', { exact: true }), time);
  await page.waitForFunction(t => {
    const v = document.querySelector('[data-testid="studio-after-video"]');
    return v && !v.seeking && v.readyState >= 3 && Math.abs(v.currentTime - t) < .001;
  }, time);
  await page.waitForTimeout(300);
  await pause(page);
}
async function bound(page) {
  const record = await h.save(page, 'bounded');
  assert.equal(record.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick, 270000);
  assert(!record.snapshot.threeDScenes?.length && !record.snapshot.subjectVfxScenes?.length);
  const storage = require('../creative-templates/proof-storage');
  storage.MAX_CAPTURE_BYTES = 64 * 1024 ** 2;
  storage.requireProofSpace = directory => {
    assert.equal(path.resolve(directory), folder);
    const stats = fs.statfsSync(folder), bytes = stats.bavail * stats.bsize;
    assert(bytes >= 1024 ** 3, 'This 3s CPU proof requires 1 GiB headroom');
    return bytes;
  };
  return record;
}
async function capture(page) {
  await q.tool(page, 'Export');
  if (fs.existsSync(path.join(folder, 'blur-animation/render-receipt.json')))
    await page.getByTestId('rendered-output-ready').waitFor({ timeout: 90000 });
  const live = page.getByRole('button', { name: 'Show Live Edit', exact: true });
  if (await live.isVisible()) await live.click();
  await page.getByRole('separator', { name: 'Resize timeline', exact: true }).focus();
  await page.keyboard.press('Escape');
  const record = await h.save(page, 'preview');
  const completed = path.join(folder, 'blur-animation/render-receipt.json');
  if (fs.existsSync(completed)) {
    const receipt = JSON.parse(fs.readFileSync(completed));
    assert.equal(record.id, receipt.projectId);
    assert.equal(hash(record.snapshot.studioDocument), receipt.projectHash);
  }
  fs.writeFileSync(path.join(folder, 'native-preview-binding.json'), JSON.stringify({
    projectId: record.id, canonicalHash: hash(record.snapshot.studioDocument),
    source: 'actual live programme canvas and ordinary image overlay; finished file hidden',
    nativeSourcePreview: true, noResubmission: true,
  }, null, 2));
  const samples = [];
  for (const [index, time] of [.5, 1, 1.5, 2.5].entries()) {
    await seek(page, time);
    assert.equal(await page.getByTestId('studio-program-canvas').getAttribute('data-programme-source'), 'source');
    const stage = page.getByTestId('hook-preview-frame');
    const layer = stage.locator('.draggable-overlay.is-media-overlay');
    assert.equal(await layer.count(), 1);
    const properties = await layer.evaluate(el => ({
      filter: getComputedStyle(el).filter, width: el.clientWidth, height: el.clientHeight,
      box: el.getBoundingClientRect().toJSON(),
    }));
    assert(properties.filter.includes('blur('));
    if (combined) assert.equal((properties.filter.match(/drop-shadow\(/g) || []).length, 2);
    const background = await page.getByTestId('studio-program-canvas').evaluate(c => c.toDataURL('image/png'));
    fs.writeFileSync(path.join(folder, `background-${index}.png`), Buffer.from(background.split(',')[1], 'base64'));
    await stage.screenshot({ path: path.join(folder, `preview-${index}.png`) });
    samples.push({ time, properties });
  }
  fs.writeFileSync(path.join(folder, 'native-preview.json'), JSON.stringify(samples, null, 2));
}
async function main() {
  const action = process.argv[2] || 'edit';
  const context = await chromium.launchPersistentContext(path.join(folder, 'browser-profile.private'), {
    channel: 'chromium', headless: true,
    args: ['--mute-audio', '--host-resolver-rules=MAP localhost 127.0.0.1'],
    viewport: { width: 1600, height: 1400 }, acceptDownloads: true,
  });
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(45000);
  let renders = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/process') renders++; });
  try {
    await page.goto('http://localhost:5000/?studioProfessionalSession=blur');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (action === 'edit') {
      if (await page.getByRole('button', { name, exact: true }).count()) {
        assert(!fs.existsSync(path.join(folder, 'native-edit.json')), 'Preserve the completed native edit');
        await page.getByRole('button', { name, exact: true }).click();
        await h.rail(page); await pause(page);
      } else {
        if (combined) {
          await page.getByRole('button', { name: baseName, exact: true }).click();
          await h.rail(page);
          await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
          await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
        } else {
          await page.locator('.creator-studio-dropzone input[type=file]').setInputFiles(path.join(folder, 'source-grid.mp4'));
          await page.getByRole('button', { name: 'Open Creator Studio', exact: true }).click({ timeout: 120000 });
        }
        await h.rail(page); await pause(page);
        await page.getByLabel('Project name', { exact: true }).fill(name);
        if (!combined) {
          await q.tool(page, 'B-roll');
          await page.getByTestId('visual-image-input').setInputFiles(path.join(folder, 'alpha-marker.png'));
        }
      }
      const original = await h.save(page, 'unblurred');
      const layer = original.snapshot.overlays.find(item => item.type === 'image');
      assert(layer);
      await q.tool(page, 'Motion');
      await page.getByRole('button', { name: 'Logo & layers', exact: true }).click();
      await page.getByText('Target layer', { exact: true }).locator('..').locator('select').selectOption(layer.id);
      await page.getByLabel('Motion layer in point', { exact: true }).fill('0');
      if (combined) {
        await page.getByLabel('Enable layer shadow', { exact: true }).check();
        await page.getByLabel('Layer shadow color', { exact: true }).fill('#ffb800');
        await page.getByLabel('Layer shadow X offset', { exact: true }).fill('24');
        await page.getByLabel('Layer shadow Y offset', { exact: true }).fill('12');
        await range(page.getByRole('slider', { name: /^Shadow blur/ }), 8);
        await range(page.getByRole('slider', { name: /^Shadow opacity/ }), .8);
        await page.getByLabel('Enable layer glow', { exact: true }).check();
        await page.getByLabel('Layer glow color', { exact: true }).fill('#00ccff');
        await range(page.getByRole('slider', { name: /^Glow radius/ }), 16);
        await range(page.getByRole('slider', { name: /^Glow strength/ }), .7);
      }
      await range(page.getByRole('slider', { name: /^Layer blur/ }), 0);
      await h.save(page, 'unblurred');
      await range(page.getByRole('slider', { name: /^Layer blur/ }), 12);
      const blurred = await h.save(page, 'blurred');
      assert.equal(blurred.snapshot.overlays.find(item => item.id === layer.id).blur, 12);
      await page.getByTestId('studio-undo-button').click();
      const undone = await h.save(page, 'undone');
      assert.equal(Number(undone.snapshot.overlays.find(item => item.id === layer.id).blur || 0), 0);
      await page.getByTestId('studio-redo-button').click();
      const redone = await h.save(page, 'redone');
      assert.equal(redone.snapshot.overlays.find(item => item.id === layer.id).blur, 12);
      const timeline = page.getByTestId('studio-pro-timeline');
      await timeline.getByRole('button', { name: 'Show motion keyframes', exact: true }).click();
      const label = layer.name || layer.text || 'Visual layer';
      await timeline.getByRole('button', { name: `Expand ${label} keyframes`, exact: true }).click();
      await seek(page, 0);
      await page.getByLabel(`${label} x value`, { exact: true }).fill('30');
      await page.getByLabel(`${label} x value`, { exact: true }).press('Enter');
      const add = timeline.getByRole('button', { name: `Add ${label} x keyframe at playhead`, exact: true });
      if (await add.count()) await add.click();
      await seek(page, 2);
      await page.getByLabel(`${label} x value`, { exact: true }).fill('70');
      await page.getByLabel(`${label} x value`, { exact: true }).press('Enter');
      const saved = await h.save(page, 'saved');
      await page.reload();
      await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
      await page.getByRole('button', { name, exact: true }).click();
      const reopened = await h.save(page, 'reopened');
      assert.equal(hash(saved.snapshot.studioDocument), hash(reopened.snapshot.studioDocument));
      await bound(page); await capture(page);
      fs.writeFileSync(path.join(folder, 'native-edit.json'), JSON.stringify({
        projectId: reopened.id, canonicalHash: hash(reopened.snapshot.studioDocument), layerId: layer.id,
        blur: 12, effects: reopened.snapshot.overlays.find(item => item.id === layer.id),
        undo: true, redo: true, saveColdReopen: true,
        originalProjectPreserved: true, renders, gpuJobs: 0, authBypass: false, mocks: false,
      }, null, 2));
      assert.equal(renders, 0);
    } else {
      await page.getByRole('button', { name, exact: true }).click();
      await h.rail(page); await pause(page); await bound(page);
      if (action === 'render') { await h.render(page, 'blur-animation'); assert.equal(renders, 1); }
      else if (action === 'preview') { await capture(page); assert.equal(renders, 0); }
      else if (action === 'view') {
        const saved = await h.save(page, 'view');
        const layer = saved.snapshot.overlays.find(item => item.type === 'image');
        const timeline = page.getByTestId('studio-pro-timeline');
        await timeline.getByRole('button', { name: 'Show motion keyframes', exact: true }).click();
        await timeline.getByRole('button', { name: `Expand ${layer.name || layer.text || 'Visual layer'} keyframes`, exact: true }).click();
        await require('../creative-templates/materials-editing-proof').view(page, 'blur-animation');
        assert.equal(renders, 0);
        fs.rmSync(path.join(folder, 'blur-animation/studio-recording-frames'), { recursive: true });
      } else throw new Error('Unknown proof action');
    }
    console.log(`Native blur ${action} passed; ${renders} CPU render submissions, zero GPU jobs.`);
  } catch (error) {
    await page.screenshot({ path: path.join(folder, `${action}-failure.png`) }).catch(() => {});
    fs.writeFileSync(path.join(folder, `${action}-failure.json`), JSON.stringify({ error: error.message, qualified: false }));
    console.error((await page.locator('body').innerText()).slice(-2200));
    throw error;
  } finally { await context.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
