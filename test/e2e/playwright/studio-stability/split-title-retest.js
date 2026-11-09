#!/usr/bin/env node
// Native visibility retest of the already saved, split source-bound title.
// Pacing 1x/2x clears completed-file playback before pre-final measurements.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
process.env.STUDIO_QA_REPORT ||= 'reports/studio-canonical-completion-20261008/split-title-retest';
const q = require('./run'), f = require('./flows');
(async () => {
  const { browser, page } = await q.connect();
  const receipt = { startedAt: new Date().toISOString(), realAuth: true, noMocks: true,
    headless: true, muted: true, gpuJobsStarted: 0, renderJobsStarted: 0, samples: [], status: 'RUNNING' };
  try {
    if (!await page.getByRole('navigation', { name: 'Creative tools' }).count())
      await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await f.open(page, 'Studio subject speed NVIDIA QA 20261008 r11');
    await q.tool(page, 'Pacing');
    const presets = page.locator('.speed-preset-grid');
    await presets.getByRole('button', { name: '1×', exact: true }).click();
    await presets.getByRole('button', { name: '2×', exact: true }).click();
    for (const time of [.75, 1.55]) {
      await f.seek(page, time);
      await page.waitForFunction(expected => {
        const v = document.querySelector('[data-testid="studio-after-video"]');
        return v?.readyState >= 3 && !v.seeking && Math.abs(v.currentTime - expected) < .04;
      }, time * 2, { timeout: 60000 });
      const title = page.locator('.draggable-overlay').filter({ hasText: 'Shared project state' });
      await title.waitFor({ state: 'visible' });
      assert(await title.isVisible(), 'Saved split-source title omitted from programme');
      assert.notEqual(await page.getByTestId('studio-program-canvas').getAttribute('data-programme-source'), 'final');
      await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(q.report, `preview-${time}.png`) });
      receipt.samples.push({ programmeTime: time, sourceTime: time * 2, titleVisible: true });
    }
    receipt.status = 'NATIVE_SPLIT_TITLE_VISIBILITY_PASS_FULL_PARITY_UNQUALIFIED';
    console.log(receipt.status);
  } catch (e) { receipt.status = 'FAIL'; receipt.error = e.message; process.exitCode = 1; }
  finally {
    receipt.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(q.report, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    await browser.close();
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
