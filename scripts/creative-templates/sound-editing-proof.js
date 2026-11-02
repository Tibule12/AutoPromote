#!/usr/bin/env node
// Real signed-in native controls; never inject auth, project state or worker results.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const q = require('../../test/e2e/playwright/studio-stability/run');
const h = require('./studio-proof');
const { hash } = require('../../src/creativeTemplates/contract');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
async function range(input, value) {
  await input.evaluate((element, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(next));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9233');
  try {
    const session = await browser.newBrowserCDPSession();
    assert((await session.send('Browser.getVersion')).userAgent.includes('HeadlessChrome'));
    const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('studioTemplateSession'));
    assert(page && !await page.evaluate(() => !!window.__E2E_BYPASS));
    await page.locator('video,audio').evaluateAll(es => es.forEach(e => { e.muted = true; e.pause(); }));
    await h.rail(page);
    await page.getByLabel('Project name', { exact: true }).fill('EMBER — editable sound and cuts · 20261010');
    const baseline = await h.save(page, 'before-sound');
    await q.tool(page, 'Sound');
    const swaps = [
      [0, 'cinematic_hit', 38], [1, 'airy_whoosh', 28], [2, 'reverse', 14],
      [3, 'bass_punch', 32], [4, 'airy_whoosh', 22], [5, 'metal_hit', 22],
      [10, 'cinematic_hit', 34], [11, 'sparkle', 18],
    ];
    for (const [index, tone, volume] of swaps) {
      await page.locator('.sound-effect-chip').nth(index).click();
      await page.getByLabel('Effect sound', { exact: true }).selectOption(tone);
      await range(page.getByTestId('sound-effect-volume'), volume);
    }
    await page.getByTestId('sound-effect-preset-tape_stop').click();
    await page.getByTestId('sound-effect-start').fill('13.65');
    await page.getByTestId('sound-effect-duration').fill('0.30');
    await range(page.getByTestId('sound-effect-volume'), 18);
    await page.getByTestId('sound-effect-duplicate').click();
    assert.equal(await page.locator('.sound-effect-chip').count(), 14);
    await page.waitForTimeout(600);
    await page.getByTestId('studio-undo-button').click();
    await q.tool(page, 'Sound');
    await page.waitForFunction(() => document.querySelectorAll('.sound-effect-chip').length === 13);
    await page.getByTestId('studio-redo-button').click();
    await q.tool(page, 'Sound');
    await page.waitForFunction(() => document.querySelectorAll('.sound-effect-chip').length === 14);
    await page.locator('.sound-effect-chip').last().click();
    await range(page.getByTestId('sound-effect-volume'), 12);
    const edited = await h.save(page, 'ember');
    assert.equal(edited.snapshot.soundEffects.length, 14);
    assert.equal(edited.snapshot.soundEffects[12].volume, .18);
    assert.equal(edited.snapshot.soundEffects[13].volume, .12);
    const selectedHash = hash(edited.snapshot.studioDocument);
    const timeline = page.getByTestId('studio-pro-timeline');
    await timeline.getByRole('button', { name: 'Fit entire timeline', exact: true }).click();
    await timeline.screenshot({ path: path.join(folder, 'timeline.png') });
    await page.getByTestId('sound-effect-editor').screenshot({ path: path.join(folder, 'sound-editor.png') });
    await page.reload();
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: edited.name, exact: true }).click();
    await h.rail(page);
    const recovered = await h.save(page, 'ember');
    assert.equal(hash(recovered.snapshot.studioDocument), selectedHash);
    fs.writeFileSync(path.join(folder, 'editing-receipt.json'), JSON.stringify({
      createdAt: new Date().toISOString(), projectId: edited.id,
      templateRef: edited.snapshot.creativeTemplateInstance.templateRef,
      source: 'Mixkit stock camera footage; no AI-generated shot',
      clipCount: edited.snapshot.timeline.length, cuesBefore: baseline.snapshot.soundEffects.length,
      cuesAfter: edited.snapshot.soundEffects.length, nativeToneChanges: swaps.length,
      nativeDuplicateUndoRedo: true, independentlyEditableCopies: true,
      nativeSaveColdReopenHash: selectedHash, noAuthOrRouteMocks: true, paidGpuJobs: 0,
      listeningReview: 'Unqualified; browser automation remains muted',
    }, null, 2));
    console.log('Native sound changes, duplicate, undo/redo and exact cold recovery passed.');
  } finally { await browser.close(); }
})().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
