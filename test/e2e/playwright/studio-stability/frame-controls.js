#!/usr/bin/env node
// Actual signed-in Studio edits, history, cold recovery and CPU final download.
// No auth injection, route interception or GPU dispatch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
process.env.STUDIO_QA_REPORT ||= 'reports/studio-canonical-completion-20261008/frame-controls';
const q = require('./run');
const flows = require('./flows');
const kernel = require(path.join(q.root, 'src/generated/studioDirectorReplayKernel.cjs'));
const name = process.env.STUDIO_FRAME_QA_PROJECT || 'Studio framing controls QA 20261008';
const clean = value => String(value).replace(/https?:\/\/[^\s"<>]+/g, raw => {
  try { const url = new URL(raw); return url.origin + url.pathname; } catch { return '[url]'; }
}).replace(/Bearer\s+[^\s]+/g, 'Bearer [redacted]');
async function documentFor(page) {
  return page.evaluate(name => new Promise((resolve, reject) => {
    const open = indexedDB.open('autopromote-viral-studio');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const get = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      get.onerror = () => { db.close(); reject(get.error); };
      get.onsuccess = () => { db.close(); resolve(get.result.find(p => p.name === name)?.snapshot.studioDocument); };
    };
  }), name);
}
async function save(page) {
  await flows.mediaRail(page);
  await page.getByTestId('studio-save-project').click();
  for (let n = 0; n < 30; n++) {
    const doc = await documentFor(page);
    if (doc?.visualGraph.settings.mainFrame.enabled === false &&
        doc.visualGraph.settings.mainTransform.rotation === 0 &&
        doc.visualGraph.settings.reframeAspect === '16:9') return doc;
    await page.waitForTimeout(200);
  }
  throw Error('The native Save did not commit the framing decisions');
}
async function main() {
  console.log('Connecting to the retained headless Studio');
  const { browser, page } = await q.connect();
  console.log('Connected; reading the normal App entry');
  const receipt = { startedAt: new Date().toISOString(), realAuth: true,
    headless: true, muted: true, noMocks: true, gpuJobsStarted: 0,
    projectName: name, status: 'RUNNING', steps: [] };
  const step = message => {
    receipt.steps.push(message);
    fs.writeFileSync(path.join(q.report, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(message);
  };
  let submitted;
  const observe = req => {
    if (new URL(req.url()).pathname === '/api/media/process') submitted = req.postDataJSON()?.options?.viralData;
  };
  page.on('request', observe);
  try {
    const session = await browser.newBrowserCDPSession();
    assert((await session.send('Browser.getBrowserCommandLine')).arguments.includes('--mute-audio'));
    await session.detach();
    console.log('Headless and muted browser arguments verified');
    if (!await page.getByRole('navigation', { name: 'Creative tools' }).isVisible())
      await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    if (await page.getByRole('navigation', { name: 'Creative tools' }).isVisible()) {
      await flows.open(page, 'Studio paired visual QA 20261008 r17');
    } else {
      await page.getByRole('region', { name: 'Saved Studio projects', exact: true })
        .getByRole('button', { name: 'Studio paired visual QA 20261008 r17', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3,
        undefined, { timeout: 60000 });
    }
    console.log('Original saved project source decoded');
    await flows.duplicate(page, name);
    console.log('Normal project Duplicate completed');
    await page.getByTestId('pro-video-clip-1').click();
    await flows.seek(page, 0);
    await q.tool(page, 'Motion');
    await page.getByRole('button', { name: 'Transform keyframes', exact: true }).click();
    await page.getByRole('button', { name: 'Reset transform', exact: true }).click();
    step('Native Reset transform removes the QA tilt, zoom, offsets and main-video keys');
    await q.tool(page, 'Reframe');
    await page.getByTestId('reframe-aspect-16-9').click();
    await page.getByTestId('reframe-preserve-frame').click();
    const viewOptions = page.locator('.studio-view-options');
    if (await viewOptions.getAttribute('open') === null) await viewOptions.locator(':scope > summary').click();
    const frame = page.getByTestId('main-footage-frame-toggle');
    assert.equal(await frame.getAttribute('aria-pressed'), 'true');
    await page.waitForTimeout(800);
    await frame.click();
    assert.equal(await frame.getAttribute('aria-pressed'), 'false');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Undo/ }).first().click();
    assert.equal(await frame.getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: /Redo/ }).first().click();
    assert.equal(await frame.getAttribute('aria-pressed'), 'false');
    await q.tool(page, 'Color');
    assert.equal(await page.getByLabel('Rounded main footage', { exact: true }).isChecked(), false);
    assert.equal(await page.getByLabel('Rounded main footage', { exact: true }).isEnabled(), true);
    step('Frame off/on history is shared with the enabled Color inspector checkbox');
    const before = await save(page);
    const visual = before.visualGraph.settings;
    assert.equal(visual.mainTransform.rotation, 0);
    assert.equal(visual.mainTransform.scale, 1);
    assert.equal(visual.mainTransform.x, 50);
    assert.equal(visual.mainTransform.y, 50);
    assert.equal(visual.mainFrame.enabled, false);
    assert.equal(kernel.compileStudioFinishForRender(before).motion.keyframes.length, 0);
    await page.reload();
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('region', { name: 'Saved Studio projects', exact: true })
      .getByRole('button', { name, exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3,
      undefined, { timeout: 60000 });
    assert.equal(await page.getByTestId('main-footage-frame-toggle').getAttribute('aria-pressed'), 'false');
    const after = await documentFor(page);
    const restored = after.visualGraph.settings;
    for (const field of ['mainTransform', 'mainFrame', 'reframeAspect', 'smartCropMode'])
      assert.deepEqual(restored[field], visual[field], `Cold recovery changed ${field}`);
    assert.deepEqual(kernel.compileStudioFinishForRender(after), kernel.compileStudioFinishForRender(before));
    step('Normal Save, new App load and saved project reopen retain the exact framing decisions');
    receipt.documentSha256 = crypto.createHash('sha256').update(JSON.stringify(after)).digest('hex');
    receipt.framingDecisions = { mainTransform: visual.mainTransform, mainFrame: visual.mainFrame,
      aspect: visual.reframeAspect, mode: visual.smartCropMode };
    await page.getByTestId('pro-video-clip-1').click();
    await flows.seek(page, 7.5);
    await page.waitForFunction(time => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v?.readyState >= 3 && !v.seeking && v.paused && Math.abs(v.currentTime - time) < .04;
    }, 7.5);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(q.report, 'preview-7.5.png') });
    receipt.previewFrame = await page.getByTestId('hook-preview-frame').evaluate(e => ({
      width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height,
      radius: getComputedStyle(e).borderRadius,
    }));
    receipt.previewSourceTime = await page.getByTestId('studio-after-video').evaluate(v => v.currentTime);
    receipt.previewCaption = await page.getByTestId('live-caption-preview').allTextContents();
    assert(receipt.previewCaption.join(' ').includes('Reviewed timeline words verified'),
      'Preview must show the reviewed cue for the decoded 7.5-second source frame');
    assert.equal(receipt.previewFrame.radius, '0px');
    assert(Math.abs(receipt.previewFrame.width / receipt.previewFrame.height - 16/9) < .01);
    receipt.output = await q.render(page, 'compositing', { duration: 12, width: 1280, height: 720,
      audio: true, projectName: name });
    assert.equal(submitted?.finish_plan?.main_frame?.enabled, false);
    // The delivery envelope adds reframe/version/adjustment fields. Every field
    // owned by the canonical finish compiler must agree with the saved edit.
    for (const [field, expected] of Object.entries(kernel.compileStudioFinishForRender(after)))
      assert.deepEqual(submitted.finish_plan[field], expected, `Export changed canonical finish field ${field}`);
    execFileSync('ffmpeg', ['-v', 'error', '-ss', '7.5', '-i', path.join(q.root, receipt.output.output),
      '-frames:v', '1', '-y', path.join(q.report, 'final-7.5.png')]);
    receipt.status = 'CONTROL_HISTORY_RECOVERY_DELIVERY_PASS_VISUAL_REVIEW_PENDING';
    receipt.remainingIssue = 'Existing later framing cuts are retained. No broad reframe, caption, mix or creative qualification.';
  } catch (error) {
    receipt.status = 'FAIL'; receipt.error = clean(error.message); process.exitCode = 1;
  } finally {
    receipt.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(q.report, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    page.off('request', observe); await browser.close();
  }
}
main().catch(error => { console.error(clean(error.message)); process.exitCode = 1; });
