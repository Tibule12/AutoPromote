#!/usr/bin/env node
// Download an already completed real Studio output without resubmitting work.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const q = require('./run');
(async () => {
  const { browser, page } = await q.connect();
  try {
    assert.equal(await page.getByLabel('Project name', { exact: true }).inputValue(), process.env.STUDIO_QA_DOWNLOAD_PROJECT);
    await page.getByRole('button', { name: 'After', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3);
    const cdp = await page.context().newCDPSession(page);
    let guid;
    const completed = new Promise((resolve, reject) => {
      cdp.on('Browser.downloadWillBegin', event => { guid = event.guid; });
      cdp.on('Browser.downloadProgress', event => {
        if (event.guid === guid && event.state === 'completed') resolve(event);
        if (event.guid === guid && event.state === 'canceled') reject(new Error('Native download canceled'));
      });
    });
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: q.report, eventsEnabled: true });
    const event = page.waitForEvent('download', { timeout: 120000 });
    await page.getByTestId('rendered-output-ready').getByRole('button', { name: /Download/ }).click();
    const download = await event;
    const result = await Promise.race([completed, new Promise((_, reject) => setTimeout(() => reject(new Error('Native download timed out')), 120000).unref())]);
    const file = path.join(q.report, 'download.mp4'); assert(!fs.existsSync(file), 'Preserve the previous download');
    fs.renameSync(path.join(q.report, guid), file); await cdp.detach();
    const technical = q.verifyMedia(file, { duration: 12, audio: true });
    await q.inspect(page, 'downloaded-existing-output');
    fs.writeFileSync(path.join(q.report, 'delivery.json'), JSON.stringify({ at: new Date().toISOString(),
      projectName: process.env.STUDIO_QA_DOWNLOAD_PROJECT, nativeCompleted: true, bytes: result.totalBytes,
      filename: download.suggestedFilename(), technical, headless: true, muted: true, noMocks: true,
      jobsStartedByDownload: 0, visualReview: 'PENDING' }, null, 2));
    console.log(JSON.stringify({ download: 'PASS', sha256: technical.sha256 }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
