#!/usr/bin/env node
// Normal signed-in Studio regressions. Does not start any worker or GPU.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const q = require('./run'), f = require('./flows');
const phase = process.argv[2];
async function download(page, expectedFile) {
  const folder = path.join(q.report, 'after-worker-stop'); fs.mkdirSync(folder, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  let guid;
  const complete = new Promise((resolve, reject) => {
    cdp.on('Browser.downloadWillBegin', e => { guid = e.guid; });
    cdp.on('Browser.downloadProgress', e => {
      if(e.guid !== guid) return;
      if(e.state === 'completed') resolve(e);
      if(e.state === 'canceled') reject(new Error('Actual Studio download canceled'));
    });
  });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: folder, eventsEnabled: true });
  await page.getByTestId('rendered-output-ready').getByRole('button', { name: /Download/ }).click();
  await Promise.race([complete, new Promise((_, reject) => setTimeout(() => reject(new Error('Download timed out')), 90000).unref())]);
  const output = path.join(folder, 'download.mp4'); fs.renameSync(path.join(folder, guid), output);
  await cdp.detach();
  assert.equal(q.sha(output), q.sha(expectedFile), 'Worker shutdown changed the delivered file');
  const technical = q.verifyMedia(output, { duration: 12, width: 1280, height: 720, audio: true });
  return { output: path.relative(q.root, output), sha256: technical.sha256, technical };
}
(async () => {
  const { browser, page } = await q.connect();
  const receipts = { phase, at: new Date().toISOString(), realAuth: true, noMocks: true, gpuUsed: false };
  try {
    if(phase === 'caption-source') {
      await f.open(page, 'Studio QA hour captions'); await f.duplicate(page, 'Studio QA hour source isolation');
      await page.getByTestId('project-media-import-input').setInputFiles(path.join(q.root, 'reports/studio-stability-20261007/media/podcast-12s.mp4'));
      const imported = page.getByTestId('project-media-library').locator('.studio-media-card').last();
      await imported.getByText('Saved · ready to edit', { exact: true }).waitFor({ timeout: 60000 });
      await imported.locator('.studio-media-card__thumb').click();
      await imported.getByRole('button', { name: 'Add to sequence', exact: true }).click();
      await page.getByTestId('pro-video-clip-2').waitFor();
      assert.equal(await page.locator('[data-testid="pro-track-row-captions"] .pro-track-clip').count(), 3,
        'Captions from the first source leaked onto the imported source');
      const lane = await page.locator('[data-testid="pro-track-row-video"] .pro-track-lane').boundingBox();
      await page.mouse.click(lane.x + lane.width * .75, lane.y + lane.height * .5);
      await page.waitForTimeout(350);
      await page.getByTestId('studio-save-project').click();
      receipts.captionCues = 3; receipts.twoRealSources = true;
      await q.inspect(page, 'caption-source-isolation');
    } else if(phase === 'offline-download') {
      await page.getByRole('button', { name: 'After', exact: true }).click();
      const media = page.getByTestId('studio-after-video');
      await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3);
      const lane = await page.locator('[data-testid="pro-track-row-video"] .pro-track-lane').boundingBox();
      await page.mouse.click(lane.x + lane.width * .1, lane.y + lane.height * .5);
      const time = await media.evaluate(v => v.currentTime);
      if(await media.evaluate(v => v.paused)) await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
      await page.waitForFunction(t => document.querySelector('[data-testid="studio-after-video"]').currentTime > t + .3, time);
      await page.getByRole('button', { name: 'Pause comparison', exact: true }).click();
      receipts.playbackAdvanced = true;
      Object.assign(receipts, await download(page, path.join(q.report, 'captions/download.mp4')));
      await q.inspect(page, 'download-after-worker-stop');
    } else if(phase === 'offline-render') {
      await f.open(page, 'Studio QA 20261007 baseline'); await f.captionsOff(page); await q.tool(page, 'Export');
      const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/media/process' && r.request().method() === 'POST', { timeout: 60000 });
      page.once('dialog', d => d.accept());
      await page.getByRole('button', { name: /^Render (Final Clip|Again)$/ }).click();
      const r = await response, data = await r.json();
      assert.equal(r.status(), 503); assert.equal(data.code, 'STUDIO_RENDER_WORKER_UNAVAILABLE');
      assert.equal(Boolean(data.jobId), false);
      await page.getByText(/render worker is unavailable/i).first().waitFor();
      receipts.status = r.status(); receipts.code = data.code; receipts.noJobAcknowledged = true;
      receipts.noRecoveryPanel = await page.getByTestId('viral-render-recovery').count() === 0;
      await q.inspect(page, 'offline-render-rejection');
    } else if(phase === 'reload') {
      receipts.projectName = await f.persistence(page);
      receipts.captionTextRestored = (await page.getByTestId('pro-captions-clip-1').innerText()).includes('STUDIO QA CAPTION RETEST');
      assert(receipts.captionTextRestored);
    } else throw new Error('Use caption-source, offline-download, offline-render, or reload');
    fs.writeFileSync(path.join(q.report, phase + '.json'), JSON.stringify(receipts, null, 2));
    console.log(JSON.stringify(receipts));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
