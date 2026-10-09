#!/usr/bin/env node
// Real normal-account controls and IndexedDB recovery. No auth injection,
// network stubs, fixture host, worker startup or render/GPU submission.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../../..');
const report = path.resolve(root, process.env.STUDIO_VISUAL_QA_REPORT || 'reports/studio-canonical-visual-20261008/browser-flow');
const projectName = process.env.STUDIO_VISUAL_QA_PROJECT || `Studio visual QA ${new Date().toISOString().replace(/[:.]/g, '-')}`;
const sourceName = process.env.STUDIO_VISUAL_QA_SOURCE || 'Studio shared-state 20261008';
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value).replace(/https?:\/\/[^\s"<>]+/g, raw => {
  try { const url = new URL(raw); return url.origin + url.pathname; } catch { return '[url]'; }
}).replace(/Bearer\s+[^\s]+/g, 'Bearer [redacted]');
fs.mkdirSync(report, { recursive: true });
const receipt = { startedAt: new Date().toISOString(), projectName, sourceName,
  realAuthRequired: true, noMocks: true, headless: true, muted: true, gpuJobsStarted: 0,
  renderSubmitted: false, previewFinalParity: 'BLOCKED: no authorized running render worker', steps: [] };
const write = () => fs.writeFileSync(path.join(report, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
async function stored(page, name) {
  // Read-only observation of the normal application's project store.
  return page.evaluate(async selectedName => {
    const records = await new Promise((resolve, reject) => {
      const open = indexedDB.open('autopromote-viral-studio');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const get = db.transaction('projects', 'readonly').objectStore('projects').getAll();
        get.onerror = () => { db.close(); reject(get.error); };
        get.onsuccess = () => { db.close(); resolve(get.result); };
      };
    });
    const selected = records.find(p => p.name === selectedName);
    if (!selected) throw Error('Saved QA project missing');
    const originals = [];
    for (const p of records.filter(p => p.name === 'Studio shared-state 20261008' || p.name === 'Studio stereo delivery 20261008')) {
      const bytes = new TextEncoder().encode(JSON.stringify(p.snapshot));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      originals.push({ id: p.id, name: p.name, snapshotSha256: [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('') });
    }
    return { id: selected.id, name: selected.name, document: selected.snapshot.studioDocument, originals };
  }, name);
}
async function tool(page, name) {
  await page.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name, exact: true }).click();
}
async function range(locator, target) {
  const { min, max, step } = await locator.evaluate(e => ({ min: Number(e.min || 0), max: Number(e.max || 100), step: Number(e.step || 1) }));
  assert(target >= min && target <= max, 'Unexpected range target');
  // Native range keyboard controls avoid depending on custom thumb geometry.
  // PageUp makes large steps, so this does not generate hundreds of edits.
  await locator.press('Home');
  await locator.press('PageUp');
  const jump = Number(await locator.inputValue()) - min;
  assert(jump >= step, 'Range PageUp did not change its value');
  const pages = Math.floor((target - min + 1e-8) / jump);
  assert(pages <= 10, 'Unexpected range page count');
  if (!pages) await locator.press('Home');
  else for (let i = 1; i < pages; i++) await locator.press('PageUp');
  const delta = Math.round((target - Number(await locator.inputValue())) / step);
  assert(Math.abs(delta) <= 12, 'Range page gesture missed its target');
  for (let i = 0; i < Math.abs(delta); i++) await locator.press(delta > 0 ? 'ArrowRight' : 'ArrowLeft');
  assert(Math.abs(Number(await locator.inputValue()) - target) < step / 2 + 1e-6);
}
async function revealProject(page) {
  await page.getByTestId('studio-after-video').waitFor({ state: 'attached' });
  const show = page.getByRole('button', { name: 'Show media', exact: true });
  if (await show.isVisible()) await show.click();
  await page.locator('.studio-project-rail').waitFor({ state: 'visible' });
  const head = page.locator('.studio-project-rail__head');
  if (!await head.evaluate(e => e.open)) await head.locator(':scope > summary').click();
}
async function save(page) {
  await revealProject(page);
  await page.getByTestId('studio-save-project').click();
  await page.waitForFunction(() => document.querySelector('.studio-project-save-state')?.textContent.includes('Saved locally'));
}
async function mute(page) {
  await page.locator('video,audio').evaluateAll(es => es.forEach(e => { e.muted = true; e.pause(); }));
}
async function snapshot(page, name) {
  await mute(page);
  await page.locator('.viral-studio-container').screenshot({ path: path.join(report, name + '.png') });
  fs.writeFileSync(path.join(report, name + '.json'), JSON.stringify({
    text: clean(await page.locator('.viral-studio-container').innerText()),
    video: await page.getByTestId('studio-after-video').evaluate(e => ({
      readyState: e.readyState, time: e.currentTime, duration: e.duration, paused: e.paused,
      muted: e.muted, error: e.error?.message || null,
    })),
  }, null, 2));
}
async function main() {
  const browser = await chromium.connectOverCDP(process.env.STUDIO_QA_CDP || 'http://127.0.0.1:9229');
  let page;
  try {
    const session = await browser.newBrowserCDPSession();
    assert((await session.send('Browser.getVersion')).userAgent.includes('HeadlessChrome'), 'Visible browser prohibited');
    await session.detach();
    const context = browser.contexts()[0];
    for (const candidate of context.pages()) {
      if (await candidate.locator('[aria-label="Project name"]').count() &&
          await candidate.locator('[aria-label="Project name"]').inputValue() === projectName) page = candidate;
    }
    if (!page) {
      page = await context.newPage();
      await page.goto('http://localhost:5000/', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
      await page.getByRole('button', { name: sourceName, exact: true }).waitFor();
      const resume = page.getByRole('button', { name: projectName, exact: true });
      const selectedName = await resume.count() ? projectName : sourceName;
      await page.getByRole('button', { name: selectedName, exact: true }).click();
      await page.waitForFunction(name => document.querySelector('[aria-label="Project name"]')?.value === name, selectedName);
      if (selectedName !== projectName) {
        await revealProject(page);
        await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
        await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
        await page.getByLabel('Project name', { exact: true }).fill(projectName);
        await save(page);
      }
    }
    page.setDefaultTimeout(15000);
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS), 'Auth bypass prohibited');
    await page.evaluate(() => history.replaceState(null, '', '/?studioQaSession=canonical-visual-20261008'));
    await mute(page);
    const baseline = await stored(page, projectName);
    receipt.originalProjectsBefore = baseline.originals;
    await tool(page, 'Reframe');
    await page.getByTestId('auto-reframe-toggle').check();
    await page.getByTestId('reframe-aspect-4-5').click();
    await page.getByTestId('reframe-preserve-frame').click();
    receipt.steps.push('Normal reframe controls: enabled, 4:5, preserve full source');
    await tool(page, 'Captions');
    await page.locator('.caption-import-srt-btn input[type=file]').setInputFiles({
      name: 'reviewed-state.srt', mimeType: 'application/x-subrip',
      buffer: Buffer.from('1\n00:00:03,000 --> 00:00:05,000\nShared project state\n\n2\n00:00:07,000 --> 00:00:09,000\nReviewed timeline words\n'),
    });
    for (let i = 1; i <= 2; i++) {
      await page.getByLabel(`Caption ${i} speaker`, { exact: true }).selectOption({ label: 'Host' });
      await page.getByLabel(`Caption ${i} language`, { exact: true }).selectOption({ label: 'English' });
      await page.getByLabel(`Caption ${i} text`, { exact: true }).fill(i === 1 ? 'Shared project state reviewed' : 'Reviewed timeline words verified');
    }
    await page.getByRole('button', { name: 'Minimal', exact: true }).click();
    await page.getByLabel('Caption 1 placement', { exact: true }).selectOption('custom');
    await range(page.getByLabel('Caption 1 horizontal position', { exact: true }), 35);
    await range(page.getByLabel('Caption 1 vertical position', { exact: true }), 70);
    await page.getByLabel('Caption 1 accent', { exact: true }).fill('#abcdef');
    await page.locator('.caption-segment-row').first().getByRole('button', { name: '▶', exact: true }).click();
    assert((await page.locator('[data-testid^="pro-captions-clip-"]').allTextContents()).join(' ').includes('Shared project state reviewed'));
    receipt.steps.push('SRT import; reviewed words/speaker/language; Minimal; custom 35/70 position and #abcdef accent; actual caption timeline');
    await tool(page, 'Motion');
    await page.getByRole('button', { name: 'Transform keyframes', exact: true }).click();
    const panel = page.locator('.clip-inspector-body');
    for (const [label, value] of [['X', '45'], ['Y', '55'], ['Scale', '1.10'], ['Rotate', '4']]) {
      await panel.getByLabel(label, { exact: true }).fill(value);
      await panel.getByLabel(label, { exact: true }).press('Tab');
    }
    await page.getByRole('button', { name: /Add transform keyframe at/ }).click();
    receipt.steps.push('Normal main video transforms and keyframe at caption boundary');
    await tool(page, 'Color');
    await range(page.getByLabel('Exposure', { exact: true }), 1.08);
    await range(page.getByLabel('Contrast', { exact: true }), 1.08);
    await page.getByLabel('Precision RGB grade', { exact: true }).check();
    await page.getByLabel('Rounded main footage', { exact: true }).check();
    await save(page);
    const beforeUndo = await stored(page, projectName);
    assert.equal(beforeUndo.document.visualGraph.settings.finishFx.contrast, 1.08);
    await page.waitForTimeout(800);
    // One native arrow edit is one history operation. A Home/PageUp sequence
    // consists of several independent operations and must not be conflated.
    await page.getByLabel('Contrast', { exact: true }).press('ArrowRight');
    // History coalesces rapid parameter gestures; let it record this gesture.
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Undo/ }).first().click();
    assert.equal(Number(await page.getByLabel('Contrast', { exact: true }).inputValue()), 1.08);
    await page.getByRole('button', { name: /Redo/ }).first().click();
    assert.equal(Number(await page.getByLabel('Contrast', { exact: true }).inputValue()), 1.09);
    await page.getByLabel('Contrast', { exact: true }).press('ArrowLeft');
    await save(page);
    receipt.steps.push('Grade/frame, native undo/redo, final checkpoint save');
    const before = await stored(page, projectName);
    assert.equal(before.document.visualGraph.settings.reframeAspect, '4:5');
    assert.equal(before.document.visualGraph.settings.captionStyle, 'minimal');
    assert.equal(before.document.visualGraph.settings.mainTransform.x, 45);
    assert.equal(before.document.layers.find(l => l.type === 'caption').parameters.captionX, 35);
    assert.equal(before.document.layers.find(l => l.type === 'caption').parameters.textReviewed, true);
    assert(before.document.linkedTiming.keys.motionKeyframes.length > 0);
    receipt.beforeSha256 = hash(before.document);
    fs.writeFileSync(path.join(report, 'document-before.json'), JSON.stringify(before.document, null, 2));
    await snapshot(page, 'before-reopen');
    await page.close();
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto('http://localhost:5000/?studioQaSession=canonical-visual-20261008', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: projectName, exact: true }).click();
    await page.getByTestId('studio-after-video').waitFor({ state: 'attached' });
    await mute(page);
    await tool(page, 'Captions');
    assert.equal(await page.getByLabel('Caption 1 text', { exact: true }).inputValue(), 'Shared project state reviewed');
    assert.equal(await page.getByLabel('Caption 1 placement', { exact: true }).inputValue(), 'custom');
    assert.equal(Number(await page.getByLabel('Caption 1 horizontal position', { exact: true }).inputValue()), 35);
    assert.equal(Number(await page.getByLabel('Caption 1 vertical position', { exact: true }).inputValue()), 70);
    await page.locator('.caption-segment-row').first().getByRole('button', { name: '▶', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3);
    await snapshot(page, 'reopened-captions');
    await tool(page, 'Motion');
    await page.getByRole('button', { name: 'Transform keyframes', exact: true }).click();
    assert.equal(Number(await page.locator('.clip-inspector-body').getByLabel('X', { exact: true }).inputValue()), 45);
    await tool(page, 'Color');
    assert.equal(Number(await page.getByLabel('Exposure', { exact: true }).inputValue()), 1.08);
    assert.equal(Number(await page.getByLabel('Contrast', { exact: true }).inputValue()), 1.08);
    await save(page);
    const after = await stored(page, projectName);
    fs.writeFileSync(path.join(report, 'document-after.json'), JSON.stringify(after.document, null, 2));
    receipt.afterSha256 = hash(after.document);
    receipt.originalProjectsAfter = after.originals;
    assert.deepEqual(after.originals, baseline.originals, 'Original saved project changed');
    assert.deepEqual(after.document, before.document, 'Cold reopen changed canonical edit decisions');
    receipt.steps.push('Tab closed; new normal App; saved-project entry; recovered controls/media/caption timeline; exact graph including revision; originals unchanged');
    await snapshot(page, 'reopened-grade');
    receipt.stateFlow = 'PASS';
    receipt.finishedAt = new Date().toISOString();
    write();
    console.log(JSON.stringify({ stateFlow: receipt.stateFlow, revision: after.document.revision, beforeSha256: receipt.beforeSha256,
      afterSha256: receipt.afterSha256, gpuJobsStarted: 0, renderSubmitted: false, report: path.relative(root, report) }));
  } catch (error) {
    receipt.stateFlow = 'FAIL';
    receipt.error = clean(error.message);
    receipt.finishedAt = new Date().toISOString();
    if (page && !page.isClosed()) await snapshot(page, 'failure').catch(() => {});
    write();
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(clean(error.message)); process.exitCode = 1; });
