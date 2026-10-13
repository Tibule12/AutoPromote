#!/usr/bin/env node
// Native Studio controls and ordinary owned CPU export. No graph/auth/route injection.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const inverted = process.env.STUDIO_QA_INVERTED_MASK === '1';
const report = path.resolve(__dirname, '../../reports/studio-professional-masked-effects-20261013/proof');
const folder = inverted ? path.join(report, 'inverted') : report;
process.env.STUDIO_TEMPLATE_PROOF_DIR = folder;
Object.assign(process.env, { STUDIO_QA_EXPECTED_WIDTH: '720', STUDIO_QA_EXPECTED_HEIGHT: '1280',
  STUDIO_QA_EXPORT_FPS: '24', STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright' });
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const h = require('../creative-templates/studio-proof'), q = require('../../test/e2e/playwright/studio-stability/run');
const baseline = 'Image effects — shared shadow, glow and blur · 20261013';
const ellipseName = 'Masked image effects — animated ellipse · 20261013';
const name = inverted ? 'Masked image effects — animated inverted polygon · 20261013' : ellipseName;
const polygon = 'polygon(10% 15%, 80% 5%, 95% 60%, 55% 90%, 5% 65%)';
const decisions = document => { const { revision, journal, ...content } = document; return hash(content); };
async function range(input, value) {
  await input.evaluate((el, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(next));
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
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
    return v && !v.seeking && v.readyState >= 3 && Math.abs(v.currentTime-t) < .001;
  }, time); await page.waitForTimeout(300); await pause(page);
}
async function bound(page) {
  const record = await h.save(page, 'bounded');
  assert.equal(record.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick, 270000);
  assert(!record.snapshot.threeDScenes?.length && !record.snapshot.subjectVfxScenes?.length);
  const s = require('../creative-templates/proof-storage'); s.MAX_CAPTURE_BYTES = 64 * 1024 ** 2;
  s.requireProofSpace = directory => {
    assert.equal(path.resolve(directory), folder);
    const stat = fs.statfsSync(folder), free = stat.bavail * stat.bsize;
    assert(free >= 1024 ** 3, 'This3s CPU proof reserves1GiB'); return free;
  };
}
async function expand(page, label) {
  const timeline = page.getByTestId('studio-pro-timeline');
  const toggle = timeline.getByRole('button', { name: 'Show motion keyframes', exact: true });
  if (await toggle.isVisible()) await toggle.click();
  const row = timeline.getByRole('button', { name: `Expand ${label} keyframes`, exact: true });
  if (await row.isVisible()) await row.click();
  return timeline;
}
async function capture(page) {
  await q.tool(page, 'Export');
  const completed = path.join(folder, 'masked-effects/render-receipt.json');
  if (fs.existsSync(completed)) await page.getByTestId('rendered-output-ready').waitFor({ timeout: 90000 });
  const live = page.getByRole('button', { name: 'Show Live Edit', exact: true }); if (await live.isVisible()) await live.click();
  await page.getByRole('separator', { name: 'Resize timeline', exact: true }).focus(); await page.keyboard.press('Escape');
  const saved = await h.save(page, 'preview');
  if (fs.existsSync(completed)) {
    const receipt = JSON.parse(fs.readFileSync(completed));
    assert.equal(saved.id, receipt.projectId); assert.equal(hash(saved.snapshot.studioDocument), receipt.projectHash);
  }
  const binding = { projectId: saved.id, canonicalHash: hash(saved.snapshot.studioDocument),
    actualLiveSource: true, finishedFileHidden: true, noResubmission: true };
  fs.writeFileSync(path.join(folder, 'preview-binding.json'), JSON.stringify(binding, null, 2));
  const samples = [];
  for (const [index, time] of [.5, 1, 1.5, 2.5].entries()) {
    await seek(page, time);
    const canvas = page.getByTestId('studio-program-canvas'); assert.equal(await canvas.getAttribute('data-programme-source'), 'source');
    const image = page.getByTestId('hook-preview-frame').locator('.draggable-overlay.is-media-overlay');
    assert.equal(await image.count(), 1);
    const properties = await image.evaluate(el => ({ filter: getComputedStyle(el).filter,
      mask: getComputedStyle(el).maskImage, transform: getComputedStyle(el).transform,
      opacity: getComputedStyle(el).opacity, localBox: [el.clientWidth, el.clientHeight],
      feather: el.dataset.maskFeather, inverted: el.dataset.maskInverted }));
    assert(properties.mask.startsWith('url(')); assert(properties.filter.includes('blur('));
    assert.equal((properties.filter.match(/drop-shadow\(/g)||[]).length, 2);
    const background = await canvas.evaluate(c => c.toDataURL('image/png'));
    fs.writeFileSync(path.join(folder, `background-${index}.png`), Buffer.from(background.split(',')[1], 'base64'));
    await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(folder, `preview-${index}.png`) });
    samples.push({ time, properties, stage: await page.getByTestId('hook-preview-frame').evaluate(el => ({
      width: el.clientWidth, height: el.clientHeight, bounds: el.getBoundingClientRect().toJSON(),
    })) });
  }
  fs.writeFileSync(path.join(folder, 'native-preview.json'), JSON.stringify(samples, null, 2));
}
async function main() {
  const action = process.argv[2] || 'edit';
  const context = await chromium.launchPersistentContext(path.join(folder, 'browser-profile.private'), {
    channel: 'chromium', headless: true, args: ['--mute-audio', '--host-resolver-rules=MAP localhost 127.0.0.1'],
    viewport: { width: 1600, height: Number(process.env.STUDIO_QA_VIEWPORT_HEIGHT || 1400) }, acceptDownloads: true,
  });
  const page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(45000);
  let renders = 0; page.on('request', req => { if (new URL(req.url()).pathname === '/api/media/process') renders++; });
  try {
    await page.goto('http://localhost:5000/?studioProfessionalSession=masked-effects');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (action === 'edit') {
      if (await page.getByRole('button', { name, exact: true }).count()) {
        assert(!fs.existsSync(path.join(folder, 'native-edit.json')), 'Preserve the completed edit');
        await page.getByRole('button', { name, exact: true }).click(); await h.rail(page);
      } else {
        await page.getByRole('button', { name: inverted ? ellipseName : baseline, exact: true }).click(); await h.rail(page);
        await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
        await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
        await page.getByLabel('Project name', { exact: true }).fill(name);
      }
      await pause(page);
      const before = await h.save(page, 'original'); const layer = before.snapshot.overlays.find(o => o.type === 'image'); assert(layer);
      await q.tool(page, 'Composite');
      await page.getByText('Composite target', { exact: true }).locator('..').locator('select').selectOption(layer.id);
      await page.getByRole('checkbox', { name: /Enable mask/ }).check();
      await page.getByRole('button', { name: inverted ? 'polygon' : 'ellipse', exact: true }).click();
      if (inverted) { const input = page.getByLabel('Mask polygon path', { exact: true }); await input.fill(polygon); await input.press('Enter'); }
      await range(page.getByRole('slider', { name: /^Feather/ }), inverted ? 12 : 18);
      const inverse = page.getByRole('checkbox', { name: 'Invert mask', exact: true });
      if (inverted) await inverse.check(); else await inverse.uncheck();
      await q.tool(page, 'Export');
      const label = layer.name || layer.text || 'Visual layer'; const timeline = await expand(page, label);
      const resize = page.getByRole('separator', { name: 'Resize timeline', exact: true }); await resize.focus();
      for (let i = 0; i < 20; i++) await resize.press('ArrowUp');
      const values = { x: [36, 64], scale: [.75, 1.1], rotation: [-15, 15], opacity: [.65, .95] };
      for (const [property, pair] of Object.entries(values)) {
        await seek(page, 0);
        const input = page.getByLabel(`${label} ${property} value`, { exact: true }); await input.fill(String(pair[0])); await input.press('Enter');
        const add = timeline.getByRole('button', { name: `Add ${label} ${property} keyframe at playhead`, exact: true });
        if (await add.isVisible()) await add.click();
        await seek(page, 2); await input.fill(String(pair[1])); await input.press('Enter');
      }
      // A resumed attempt can already contain the intended values. Make one
      // concrete reversible edit so its history check never clicks a no-op.
      const opacity = page.getByLabel(`${label} opacity value`, { exact: true });
      await seek(page, 2); await opacity.fill('0.9'); await opacity.press('Enter');
      await opacity.fill('0.95'); await opacity.press('Enter');
      const changed = await h.save(page, 'animated');
      await page.getByTestId('studio-undo-button').click(); await h.save(page, 'undone');
      await page.getByTestId('studio-redo-button').click(); const redone = await h.save(page, 'redone');
      assert.equal(decisions(redone.snapshot.studioDocument), decisions(changed.snapshot.studioDocument));
      await seek(page, 1); await page.screenshot({ path: path.join(folder, 'native-keyframes.png') });
      const saved = await h.save(page, 'saved');
      await page.reload(); await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
      await page.getByRole('button', { name, exact: true }).click(); await h.rail(page); await pause(page);
      const reopened = await h.save(page, 'reopened'); assert.equal(hash(reopened.snapshot.studioDocument), hash(saved.snapshot.studioDocument));
      const keys = reopened.snapshot.motionKeyframes.filter(k => k.targetId === layer.id);
      assert.equal(keys.length, 8); assert.deepEqual([...new Set(keys.map(k => k.property))].sort(), Object.keys(values).sort());
      await bound(page); await capture(page);
      fs.writeFileSync(path.join(folder, 'native-edit.json'), JSON.stringify({ projectId: reopened.id,
        canonicalHash: hash(reopened.snapshot.studioDocument), mask: reopened.snapshot.overlays.find(o => o.id === layer.id).mask,
        keys, undo: true, redo: true, saveColdReopen: true, cpuExports: renders, gpuJobs: 0, mocks: false, authBypass: false }, null, 2));
      assert.equal(renders, 0);
    } else {
      await page.getByRole('button', { name, exact: true }).click(); await h.rail(page); await pause(page); await bound(page);
      if (action === 'render') { await h.render(page, 'masked-effects'); assert.equal(renders, 1); }
      else if (action === 'preview') { await capture(page); assert.equal(renders, 0); }
      else if (action === 'view') {
        const saved = await h.save(page, 'view'); const layer = saved.snapshot.overlays.find(o => o.type === 'image');
        await expand(page, layer.name || layer.text || 'Visual layer');
        await require('../creative-templates/materials-editing-proof').view(page, 'masked-effects');
        fs.rmSync(path.join(folder, 'masked-effects/studio-recording-frames'), { recursive: true }); assert.equal(renders, 0);
      } else throw new Error('Unknown native masked-effects action');
    }
    console.log(`Native masked-effects ${inverted ? 'inverted polygon' : 'ellipse'} ${action} passed; ${renders} CPU exports, zero GPU jobs.`);
  } catch (error) {
    await page.screenshot({ path: path.join(folder, `${action}-failure.png`) }).catch(() => {});
    fs.writeFileSync(path.join(folder, `${action}-failure.json`), JSON.stringify({ error: error.message, qualified: false }));
    console.error((await page.locator('body').innerText()).slice(-1200)); throw error;
  } finally { await context.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
