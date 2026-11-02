#!/usr/bin/env node
// Temporary native composition edits on a duplicate; restore the edit afterward.
// This is engineering evidence, not a new creative film or renderer qualification.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const h = require('./studio-proof');
const { hash } = require('../../src/creativeTemplates/contract');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const decisions = document => { const { revision, journal, ...content } = document; return hash(content); };
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({
    storageState: '/home/tibule12/.local/share/autopromote-qa/session/studio-cycling-keyframes.private.json',
    viewport: { width: 1600, height: 1000 }
  });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  let renders = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/process') renders++; });
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=layer-stack');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: 'VELO — keyframe timeline · 20261011', exact: true }).click();
    await h.rail(page);
    const original = await h.save(page, 'original');
    await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
    await page.getByLabel('Project name', { exact: true }).fill('VELO — layer-order diagnostic · 20261011');
    const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
    if (await pause.isVisible()) await pause.click();
    const before = await h.save(page, 'before');
    const logo = before.snapshot.overlays.find(layer => layer.type === 'image'); assert(logo);
    await page.locator('[data-testid^="pro-graphics-clip-"],[data-testid^="pro-broll-clip-"]').filter({ hasText: logo.name }).first().click();
    await page.getByLabel('Edited output position', { exact: true }).evaluate(element => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, '18.5');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.getByTitle('Send layer to back', { exact: true }).click();
    await page.getByTestId('clip-studio-inspector').getByRole('button', { name: 'Full screen', exact: true }).click();
    // Applying layout intentionally seeks the selected insert's start. Inspect
    // the later overlap after its authored opacity entrance has completed.
    await page.getByLabel('Edited output position', { exact: true }).evaluate(element => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, '18.5');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-testid="studio-after-video"]');
      return video?.readyState >= 3 && !video.seeking;
    });
    await page.getByText('Loading edited preview…', { exact: true }).waitFor({ state: 'hidden' });
    const edited = await h.save(page, 'edited');
    assert.equal(edited.snapshot.overlays[0].id, logo.id);
    assert.equal(edited.snapshot.overlays[0].bRollMode, 'fullscreen');
    const stack = await page.locator('.draggable-overlay').evaluateAll(layers => layers.map(element => ({
      fullscreen: element.classList.contains('broll-fullscreen'), z: Number(element.style.zIndex),
      text: element.classList.contains('is-text-overlay'), opacity: Number(element.style.opacity)
    })));
    const background = stack.find(layer => layer.fullscreen); assert(background);
    assert(stack.some(layer => layer.text && layer.opacity > .5 && layer.z > background.z), 'Fullscreen coverage defeated native saved title order');
    await page.screenshot({ path: path.join(folder, 'native-fullscreen-below-titles.png') });
    await page.getByTestId('studio-undo-button').click(); await page.waitForTimeout(500);
    await page.getByTestId('studio-undo-button').click(); await page.waitForTimeout(500);
    const restored = await h.save(page, 'restored');
    assert.equal(decisions(restored.snapshot.studioDocument), decisions(before.snapshot.studioDocument));
    const preserved = (await h.records(page)).find(item => item.id === original.id);
    assert.equal(hash(preserved.snapshot.studioDocument), hash(original.snapshot.studioDocument));
    assert.equal(renders, 0);
    fs.writeFileSync(path.join(folder, 'native-layer-order.json'), JSON.stringify({
      at: new Date().toISOString(), projectId: edited.id, editedCanonicalHash: hash(edited.snapshot.studioDocument),
      originalId: original.id, originalPreserved: true, nativeSendBack: true, nativeFullscreen: true,
      stack, restoredWithUndo: true, renderJobs: renders, gpuJobs: 0, noMocks: true,
      scope: 'Native temporary layer-order proof only. Not an exported creative film, full global composition or pixel parity.'
    }, null, 2));
    console.log('Native fullscreen/send-back stack passes; both edits undone and original preserved.');
  } catch (error) { await page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {}); throw error; }
  finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
