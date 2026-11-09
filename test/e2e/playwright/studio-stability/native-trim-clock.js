#!/usr/bin/env node
// Real signed-in App, native timeline actions and actual browser media events.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
process.env.STUDIO_QA_REPORT ||= 'reports/studio-canonical-completion-20261008/native-trim-clock';
const q = require('./run'), flows = require('./flows');
const name = process.env.STUDIO_TRIM_QA_PROJECT || 'Studio trim clock QA ' + new Date().toISOString().replace(/[:.]/g, '-');
const url = 'http://localhost:5000/?studioQaSession=trim-clock-20261008';
async function main() {
  const { browser, context } = await q.connect();
  let page;
  const receipt = { startedAt: new Date().toISOString(), projectName: name, headless: true, muted: true,
    realAuth: true, noMocks: true, gpuUsed: false, renderJobsStarted: 0, checks: [], status: 'RUNNING' };
  const check = async (id, action) => { await action(); receipt.checks.push({ id, result: 'PASS', at: new Date().toISOString() }); };
  const media = () => page.getByTestId('studio-after-video');
  const clock = () => media().evaluate(v => ({ sourceTime: v.currentTime, paused: v.paused, seeking: v.seeking, duration: v.duration }));
  const settled = () => page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="studio-after-video"]'); return v && v.readyState >= 3 && !v.seeking;
  }, undefined, { timeout: 60000 });
  try {
    page = await context.newPage(); page.setDefaultTimeout(20000);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('region', { name: 'Saved Studio projects', exact: true })
      .getByRole('button', { name: 'Studio canonical decisions QA 20261008', exact: true }).click();
    await settled();
    await flows.duplicate(page, name);
    await page.getByTestId('pro-video-clip-1').click();
    await flows.seek(page, 2); await settled();
    await page.getByTestId('pro-quick-trim-start').click(); await settled();
    await flows.seek(page, 6); await settled();
    await page.getByTestId('pro-quick-trim-end').click(); await settled();
    await check('native_trim_2_to_8', async () => {
      assert.equal(await page.getByTestId('pro-video-clip-1').getAttribute('data-end-time'), '6');
      assert(Math.abs((await clock()).sourceTime - 8) < .05);
    });
    await check('paused_end_clock', async () => {
      await flows.seek(page, 6); await settled();
      await page.waitForTimeout(250);
      const state = await clock(); assert(state.paused); assert(Math.abs(state.sourceTime - 8) < .05);
      assert.match(await page.getByTestId('pro-current-edit').innerText(), /0:06/);
    });
    await check('timing_lock_and_undo', async () => {
      const row = page.getByTestId('pro-track-row-video');
      await row.getByRole('button', { name: 'Lock track', exact: true }).click();
      assert(await page.getByTestId('pro-quick-trim-end').isDisabled());
      assert(await page.getByTestId('timeline-quick-trim-end').isDisabled());
      await flows.seek(page, 3); await settled();
      await row.getByRole('button', { name: 'Unlock track', exact: true }).click();
      await page.getByTestId('pro-quick-trim-end').click();
      assert.equal(await page.getByTestId('pro-video-clip-1').getAttribute('data-end-time'), '3');
      await page.getByTestId('studio-undo-button').click();
      assert.equal(await page.getByTestId('pro-video-clip-1').getAttribute('data-end-time'), '6');
    });
    await flows.mediaRail(page); await page.getByTestId('studio-save-project').click();
    await page.waitForFunction(() => document.querySelector('.studio-project-save-state')?.textContent.includes('Saved locally'));
    await page.close(); page = await context.newPage(); page.setDefaultTimeout(20000);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('region', { name: 'Saved Studio projects', exact: true })
      .getByRole('button', { name, exact: true }).click();
    await settled();
    await check('cold_trim_recovery', async () => {
      assert.equal(await page.getByTestId('pro-video-clip-1').getAttribute('data-end-time'), '6');
      await flows.seek(page, 3); await settled();
      assert(Math.abs((await clock()).sourceTime - 5) < .05);
      await flows.seek(page, 6); await settled();
      assert.match(await page.getByTestId('pro-current-edit').innerText(), /0:06/);
    });
    await check('playing_trim_loop', async () => {
      await flows.seek(page, 5.8); await settled();
      await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
      await page.waitForFunction(() => {
        const v = document.querySelector('[data-testid="studio-after-video"]');
        return v && !v.paused && v.currentTime >= 2 && v.currentTime < 4;
      }, undefined, { timeout: 5000 });
      await page.getByRole('button', { name: 'Pause comparison', exact: true }).click();
      receipt.loopedClock = await clock();
    });
    await q.inspect(page, 'native-trim-recovered'); receipt.status = 'PASS';
  } catch (error) {
    receipt.status = 'FAIL'; receipt.error = error.message;
    if (page) await q.inspect(page, 'native-trim-failure').catch(() => {});
    throw error;
  } finally {
    receipt.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(q.report, 'receipt.json'), JSON.stringify(receipt, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ status: receipt.status, checks: receipt.checks.length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
