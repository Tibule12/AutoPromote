#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const folder = path.resolve(__dirname, '../../reports/studio-professional-mask-authoring-20261013/proof');
process.env.STUDIO_TEMPLATE_PROOF_DIR = folder;
process.env.STUDIO_QA_EXPECTED_WIDTH = '720';
process.env.STUDIO_QA_EXPECTED_HEIGHT = '1280';
process.env.STUDIO_QA_EXPORT_FPS = '24';
process.env.STUDIO_QA_NATIVE_DOWNLOAD_METHOD = 'playwright';
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const h = require('../creative-templates/studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const name = 'Editable masks — authored polygon and square crop · 20261013';
const authoredPath = 'polygon(10% 15%, 80% 5%, 95% 60%, 55% 90%, 5% 65%)';
const changedPath = 'polygon(20% 15%, 80% 5%, 95% 60%, 55% 90%, 5% 65%)';
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
  await page.locator('video,audio').evaluateAll(es => es.forEach(el => { el.muted = true; el.pause(); }));
}
async function seek(page, time) {
  await pause(page); await range(page.getByLabel('Edited output position', { exact: true }), time);
  await page.waitForFunction(t => {
    const v = document.querySelector('[data-testid="studio-after-video"]');
    return v && !v.seeking && v.readyState >= 3 && Math.abs(v.currentTime - t) < .001;
  }, time);
  await page.waitForTimeout(300); await pause(page);
}
async function bound(page) {
  const record = await h.save(page, 'bounded');
  assert.equal(record.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick, 270000);
  assert(!record.snapshot.threeDScenes?.length && !record.snapshot.subjectVfxScenes?.length);
  const storage = require('../creative-templates/proof-storage');
  storage.MAX_CAPTURE_BYTES = 64 * 1024 ** 2;
  storage.requireProofSpace = directory => {
    assert.equal(path.resolve(directory), folder);
    const s = fs.statfsSync(folder), free = s.bavail * s.bsize;
    assert(free >= 1024 ** 3, 'This three-second CPU proof reserves1GiB'); return free;
  };
}
async function motion(page, id) {
  await q.tool(page, 'Motion');
  await page.getByRole('button', { name: 'Logo & layers', exact: true }).click();
  await page.getByText('Target layer', { exact: true }).locator('..').locator('select').selectOption(id);
}
async function composite(page, id) {
  await q.tool(page, 'Composite');
  await page.getByText('Composite target', { exact: true }).locator('..').locator('select').selectOption(id);
}
async function capture(page) {
  await q.tool(page, 'Export');
  const completed = path.join(folder, 'authored-masks/render-receipt.json');
  if (fs.existsSync(completed)) await page.getByTestId('rendered-output-ready').waitFor({ timeout: 90000 });
  const live = page.getByRole('button', { name: 'Show Live Edit', exact: true });
  if (await live.isVisible()) await live.click();
  await page.getByRole('separator', { name: 'Resize timeline', exact: true }).focus();
  await page.keyboard.press('Escape');
  const record = await h.save(page, 'preview');
  if (fs.existsSync(completed)) {
    const receipt = JSON.parse(fs.readFileSync(completed));
    assert.equal(record.id, receipt.projectId); assert.equal(hash(record.snapshot.studioDocument), receipt.projectHash);
  }
  fs.writeFileSync(path.join(folder, 'preview-binding.json'), JSON.stringify({
    projectId: record.id, canonicalHash: hash(record.snapshot.studioDocument), source: 'native live source canvas',
  }, null, 2));
  const rows = [];
  for (const [index, time] of [.5, 1, 1.5, 2.5].entries()) {
    await seek(page, time);
    const canvas = page.getByTestId('studio-program-canvas');
    assert.equal(await canvas.getAttribute('data-programme-source'), 'source');
    const background = await canvas.evaluate(c => c.toDataURL('image/png'));
    fs.writeFileSync(path.join(folder, `background-${index}.png`), Buffer.from(background.split(',')[1], 'base64'));
    const stage = page.getByTestId('hook-preview-frame');
    await stage.screenshot({ path: path.join(folder, `preview-${index}.png`) });
    rows.push({ time, masks: await stage.locator('.draggable-overlay').evaluateAll(es => es.map(el => ({
      mask: getComputedStyle(el).maskImage, clipPath: getComputedStyle(el).clipPath,
      box: el.getBoundingClientRect().toJSON(), feather: el.dataset.maskFeather, inverted: el.dataset.maskInverted,
    }))) });
    assert.equal(rows.at(-1).masks.length, 2);
    assert(rows.at(-1).masks.every(item => item.mask.startsWith('url(') && item.clipPath === 'none'));
  }
  fs.writeFileSync(path.join(folder, 'native-preview.json'), JSON.stringify(rows, null, 2));
}
async function main() {
  const action = process.argv[2] || 'edit';
  const context = await chromium.launchPersistentContext(path.join(folder, 'browser-profile.private'), {
    channel: 'chromium', headless: true, args: ['--mute-audio', '--host-resolver-rules=MAP localhost 127.0.0.1'],
    viewport: { width: 1600, height: 1400 }, acceptDownloads: true,
  });
  const page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(45000);
  let renders = 0;
  page.on('request', req => { if (new URL(req.url()).pathname === '/api/media/process') renders++; });
  try {
    await page.goto('http://localhost:5000/?studioProfessionalSession=mask-authoring');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (action === 'edit') {
      if (await page.getByRole('button', { name, exact: true }).count()) {
        assert(!fs.existsSync(path.join(folder, 'native-edit.json')));
        await page.getByRole('button', { name, exact: true }).click(); await h.rail(page); await pause(page);
      } else {
        await page.locator('.creator-studio-dropzone input[type=file]').setInputFiles(path.join(folder, 'source-grid.mp4'));
        await page.getByRole('button', { name: 'Open Creator Studio', exact: true }).click({ timeout: 120000 });
        await h.rail(page); await pause(page);
        await page.getByLabel('Project name', { exact: true }).fill(name);
        for (let i = 0; i < 2; i++) {
          await seek(page, 0); await q.tool(page, 'B-roll');
          await page.getByTestId('visual-image-input').setInputFiles(path.join(folder, 'opaque-marker.png'));
        }
      }
      const initial = await h.save(page, 'original');
      const images = initial.snapshot.overlays.filter(item => item.type === 'image'); assert.equal(images.length, 2);
      for (const [index, image] of images.entries()) {
        await motion(page, image.id);
        await page.getByLabel('Motion layer in point', { exact: true }).fill('0');
        await page.getByLabel('Motion layer width', { exact: true }).fill('55');
        await page.getByLabel('Motion layer height', { exact: true }).fill('24');
        await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('50');
        await page.getByRole('spinbutton', { name: 'Y', exact: true }).fill(index ? '70' : '30');
        await composite(page, image.id);
        await page.getByRole('checkbox', { name: /Enable mask/ }).check();
        await page.getByRole('button', { name: index ? 'polygon' : 'rectangle', exact: true }).click();
        await range(page.getByRole('slider', { name: /^Feather/ }), index ? 16 : 12);
        if (!index) await range(page.getByRole('slider', { name: /^Mask corner radius/ }), 0);
        else {
          const input = page.getByLabel('Mask polygon path', { exact: true });
          await input.fill(authoredPath); await input.press('Enter');
          await input.fill('polygon(1% 2%)'); await input.press('Enter');
          await page.getByRole('alert').filter({ hasText: '3 to 64 points' }).waitFor();
          assert.equal((await h.save(page, 'invalid-not-committed')).snapshot.overlays.find(o => o.id === image.id).mask.path, authoredPath);
          await input.press('Escape'); assert.equal(await input.inputValue(), authoredPath);
          await input.fill(changedPath); await input.press('Enter');
          await h.save(page, 'path-changed'); await page.getByTestId('studio-undo-button').click();
          assert.equal(await input.inputValue(), authoredPath);
          await page.getByTestId('studio-redo-button').click(); assert.equal(await input.inputValue(), changedPath);
          await input.fill(authoredPath); await input.press('Enter');
          await page.getByRole('checkbox', { name: 'Invert mask', exact: true }).check();
        }
      }
      const saved = await h.save(page, 'saved');
      await page.screenshot({ path: path.join(folder, 'native-mask-controls.png') });
      assert.equal(saved.snapshot.overlays.find(o => o.id === images[0].id).mask.radius, 0);
      assert.equal(saved.snapshot.overlays.find(o => o.id === images[1].id).mask.path, authoredPath);
      await page.reload(); await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
      await page.getByRole('button', { name, exact: true }).click(); await h.rail(page); await pause(page);
      const reopened = await h.save(page, 'reopened'); assert.equal(hash(saved.snapshot.studioDocument), hash(reopened.snapshot.studioDocument));
      await bound(page); await capture(page);
      fs.writeFileSync(path.join(folder, 'native-edit.json'), JSON.stringify({
        projectId: reopened.id, canonicalHash: hash(reopened.snapshot.studioDocument), rectangleRadius: 0,
        authoredPath, invalidDraftRejected: true, escape: true, undo: true, redo: true, saveColdReopen: true,
        renderJobs: renders, gpuJobs: 0, mocks: false, authBypass: false,
      }, null, 2));
      assert.equal(renders, 0);
    } else {
      await page.getByRole('button', { name, exact: true }).click(); await h.rail(page); await pause(page); await bound(page);
      if (action === 'render') { await h.render(page, 'authored-masks'); assert.equal(renders, 1); }
      else if (action === 'preview') { await capture(page); assert.equal(renders, 0); }
      else if (action === 'controls') {
        await q.tool(page, 'Export');
        await page.getByTestId('rendered-output-ready').waitFor({ timeout: 90000 });
        const live = page.getByRole('button', { name: 'Show Live Edit', exact: true });
        if (await live.isVisible()) await live.click();
        await seek(page, 1);
        const saved = await h.save(page, 'controls');
        const images = saved.snapshot.overlays.filter(o => o.type === 'image');
        await composite(page, images[0].id);
        assert.equal(await page.getByRole('slider', { name: /^Mask corner radius/ }).inputValue(), '0');
        await page.screenshot({ path: path.join(folder, 'native-zero-radius.png') });
        await composite(page, images[1].id);
        assert.equal(await page.getByLabel('Mask polygon path', { exact: true }).inputValue(), authoredPath);
        await page.screenshot({ path: path.join(folder, 'native-mask-controls.png') }); assert.equal(renders, 0);
      }
      else if (action === 'view') {
        await require('../creative-templates/materials-editing-proof').view(page, 'authored-masks');
        fs.rmSync(path.join(folder, 'authored-masks/studio-recording-frames'), { recursive: true }); assert.equal(renders, 0);
      } else throw new Error('Unknown native mask action');
    }
    console.log(`Native mask ${action} passed; ${renders} CPU exports, zero GPU jobs.`);
  } catch (error) {
    await page.screenshot({ path: path.join(folder, `${action}-failure.png`) }).catch(() => {});
    fs.writeFileSync(path.join(folder, `${action}-failure.json`), JSON.stringify({ error: error.message, qualified: false }));
    console.error((await page.locator('body').innerText()).slice(-1200)); throw error;
  } finally { await context.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
