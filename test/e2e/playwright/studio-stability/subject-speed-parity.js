#!/usr/bin/env node
// Real normal Studio flow over a previously reviewed owned SAM2 result.
// Reuse inference; exercise occurrence, speed, cold recovery and NVENC delivery.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
process.env.STUDIO_QA_REPORT ||= 'reports/studio-canonical-completion-20261008/subject-speed';
const q = require('./run'), flows = require('./flows');
const name = process.env.STUDIO_SUBJECT_SPEED_PROJECT || 'Studio subject speed QA 20261008';
async function saved(page) {
  return page.evaluate(name => new Promise(resolve => {
    const open = indexedDB.open('autopromote-viral-studio');
    open.onsuccess = () => {
      const db = open.result, req = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      req.onsuccess = () => { resolve(req.result.find(p => p.name === name)?.snapshot.studioDocument); db.close(); };
    };
  }), name);
}
async function main() {
  const { browser, page } = await q.connect();
  const receipt = { startedAt: new Date().toISOString(), realAuth: true, noMocks: true,
    headless: true, muted: true, projectName: name, inferenceJobsStarted: 0, status: 'RUNNING' };
  const step = text => { receipt.lastStep = text;
    fs.writeFileSync(path.join(q.report, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n'); console.log(text); };
  const events = [];
  const observe = req => {
    const route = new URL(req.url()).pathname;
    if (route.includes('studio-subject-vfx')) events.push({ route, method: req.method() });
  };
  page.on('request', observe);
  try {
    const entry = page.getByRole('button', { name: 'Viral Clip Studio', exact: true });
    if (!await page.getByRole('navigation', { name: 'Creative tools' }).count()) await entry.click();
    step('Opening the normally saved reviewed subject project');
    await flows.open(page, 'Studio NVIDIA subject QA 20261008 r2');
    step('Source decoded; duplicating the editable project');
    await flows.duplicate(page, name);
    step('Normal saved subject project duplicated');
    await q.tool(page, 'Pacing');
    await page.locator('.speed-preset-grid').getByRole('button', { name: '2×', exact: true }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Undo/ }).first().click();
    assert.equal(await page.locator('.speed-preset-grid').getByRole('button', { name: '1×', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: /Redo/ }).first().click();
    assert.equal(await page.locator('.speed-preset-grid').getByRole('button', { name: '2×', exact: true }).getAttribute('aria-pressed'), 'true');
    await q.tool(page, 'Reframe');
    await page.getByTestId('reframe-aspect-16-9').click();
    await page.getByTestId('reframe-preserve-frame').click();
    const options = page.locator('.studio-view-options');
    if (await options.getAttribute('open') === null) await options.locator(':scope > summary').click();
    const frame = page.getByTestId('main-footage-frame-toggle');
    if (await frame.getAttribute('aria-pressed') === 'true') await frame.click();
    await page.getByTestId('studio-save-project').click();
    await page.waitForFunction(name => new Promise(resolve => {
      const open = indexedDB.open('autopromote-viral-studio');
      open.onsuccess = () => {
        const db = open.result, req = db.transaction('projects', 'readonly').objectStore('projects').getAll();
        req.onsuccess = () => { const doc = req.result.find(p => p.name === name)?.snapshot.studioDocument;
          db.close(); resolve(doc?.outputTimeMap.at(-1)?.outputRange.endTick === 540000 && doc.visualGraph.settings.mainFrame.enabled === false); };
      };
    }), name);
    const before = await saved(page);
    await page.reload();
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('region', { name: 'Saved Studio projects', exact: true })
      .getByRole('button', { name, exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3,
      undefined, { timeout: 60000 });
    const after = await saved(page);
    for (const field of ['clipOccurrences', 'layers', 'outputTimeMap']) assert.deepEqual(after[field], before[field]);
    receipt.coldRecovery = 'PASS';
    step('Speed undo/redo and cold recovery of occurrences, effect layers and output clock pass');
    await q.tool(page, 'Composite');
    const proxy = page.getByLabel('Rendered subject effects with original audio', { exact: true });
    await proxy.waitFor();
    await page.waitForFunction(() => {
      const v = document.querySelector('video[aria-label="Rendered subject effects with original audio"]');
      return v?.readyState >= 3 && !v.error;
    }, undefined, { timeout: 60000 });
    assert(await page.getByLabel('I reviewed the sound, subject edges and camera cuts', { exact: true }).isChecked());
    const response = await page.context().request.get(await proxy.getAttribute('src'));
    assert(response.ok());
    const proxyFile = path.join(q.report, 'reviewed-proxy.mp4');
    fs.writeFileSync(proxyFile, await response.body());
    receipt.reviewedProxySha256 = q.sha(proxyFile);
    step('Same reviewed owned subject preview refreshed and downloaded');
    await page.getByTestId('pro-video-clip-1').click();
    await flows.seek(page, .25);
    await page.waitForFunction(() => { const v = document.querySelector('[data-testid="studio-after-video"]');
      return v?.paused && !v.seeking && v.readyState >= 3 && Math.abs(v.currentTime - .5) < .04; });
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="subject-programme-video"]');
      return document.querySelector('[data-testid="studio-program-canvas"]')?.dataset.programmeSource === 'subject-vfx' &&
        v?.muted && !v.seeking && Math.abs(v.currentTime - .5) < .04;
    }, undefined, { timeout: 60000 });
    receipt.reviewedSubjectInProgramme = 'PASS';
    await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(q.report, 'preview-0.25.png') });
    execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', proxyFile, '-frames:v', '1', '-y', path.join(q.report, 'reviewed-source-0.5.png')]);
    receipt.preFinalSourceTime = await page.getByTestId('studio-after-video').evaluate(v => v.currentTime);
    step('Programme 0.25s maps to decoded source 0.5s; paired preview captured before submission');
    receipt.output = await q.render(page, 'vfx', { duration: 6, width: 1280, height: 720, fps: 60, audio: true, projectName: name });
    if (process.env.STUDIO_SUBJECT_REQUIRE_NVENC !== 'false')
      assert(receipt.output.technical.video.encoder.includes('h264_nvenc'), 'NVIDIA encoding not proven');
    receipt.finalGpuEncoderUsed = receipt.output.technical.video.encoder.includes('h264_nvenc');
    for (const time of [.25, 1.45, 1.55, 3.75]) execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time),
      '-i', path.join(q.root, receipt.output.output), '-frames:v', '1', '-y', path.join(q.report, `final-${time}.png`)]);
    receipt.inferenceJobsStarted = events.filter(e => e.method === 'POST').length;
    assert.equal(receipt.inferenceJobsStarted, 0, 'Reuse of a reviewed source must not reinfer a mask');
    receipt.status = receipt.finalGpuEncoderUsed
      ? 'NATIVE_SPEED_RECOVERY_NVENC_DELIVERY_PASS_VISUAL_PAIR_REVIEW_PENDING'
      : 'NATIVE_SPEED_RECOVERY_CPU_DELIVERY_CACHED_GPU_SUBJECT_PASS_VISUAL_PAIR_REVIEW_PENDING';
  } catch (e) {
    receipt.status = 'FAIL'; receipt.error = String(e.message).replace(/https?:\/\/\S+/g, '[url]'); process.exitCode = 1;
  } finally {
    receipt.finishedAt = new Date().toISOString(); receipt.subjectApiEvents = events;
    fs.writeFileSync(path.join(q.report, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    page.off('request', observe); await browser.close();
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
