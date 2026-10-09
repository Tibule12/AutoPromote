#!/usr/bin/env node
// Normal signed-in Studio submission, status, playback and export. The caller
// supplies a running GPU transport; this script never starts an instance.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const q = require('./run');
const f = require('./flows');
const project = process.env.STUDIO_QA_3D_PROJECT || 'Studio QA 20261008 3D NVIDIA repair';
(async () => {
  const { browser, page } = await q.connect();
  const events = [];
  try {
    if (!await page.getByRole('navigation', { name: 'Creative tools' }).count()) {
      await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
      await page.getByRole('region', { name: 'Saved Studio projects' }).getByRole('button', { name: project, exact: true }).click();
    } else await f.open(page, project);
    if (process.argv[2] === 'export') {
      await q.render(page, 'three_d', { duration: 12, width: 1280, height: 720, audio: true, projectName: project });
      console.log('3D timeline export downloaded and fully decoded; visual review remains required.');
      return;
    }
    await q.tool(page, 'Motion');
    await page.getByRole('button', { name: '3D Motion', exact: true }).click();
    const panel = page.getByTestId('studio-3d-panel');
    assert.equal(await panel.getByLabel('Main text', { exact: true }).inputValue(), 'QA 3D');
    let completed;
    let rejectTerminal;
    const failedTerminal = new Promise((_, reject) => { rejectTerminal = reject; });
    failedTerminal.catch(() => {});
    const observe = async response => {
      const route = new URL(response.url()).pathname;
      if (!route.startsWith('/api/media/studio-3d/preview')) return;
      const body = await response.json().catch(() => ({}));
      events.push({ path: route, status: response.status(), jobId: body.jobId, jobStatus: body.status, error: body.error, at: new Date().toISOString() });
      if (body.status === 'completed') completed = { jobId: body.jobId, hash: body.hash, renderReceipt: body.renderReceipt };
      if (['failed', 'cancelled'].includes(body.status)) rejectTerminal(new Error(`Owned HQ job ${body.jobId || route.split('/').at(-1)} ${body.status}: ${body.error || 'inspect retained renderer log'}`));
    };
    page.on('response', observe);
    try {
      // Capacity retries are native button actions. Existing jobs are left
      // untouched and a 429 cannot consume the new job's request allowance.
      const capacityDeadline = Date.now() + Number(process.env.STUDIO_QA_3D_WAIT_MS || 15 * 60000);
      for (;;) {
        const submission = page.waitForResponse(r => new URL(r.url()).pathname === '/api/media/studio-3d/preview');
        await panel.getByRole('button', { name: /^(Generate HQ 3D Preview|Retry HQ 3D Preview)$/ }).click();
        const response = await submission;
        if (response.status() === 202) break;
        const body = await response.json();
        if (response.status() !== 429 || !/capacity is busy/.test(body.error || '') || Date.now() >= capacityDeadline) throw new Error(`HQ submission ${response.status()}: ${body.error}`);
        await page.waitForTimeout(30000);
      }
      const video = panel.getByLabel('HQ 3D preview', { exact: true });
      await Promise.race([video.waitFor({ timeout: 18 * 60000 }), failedTerminal]);
      await page.waitForFunction(() => {
        const v = document.querySelector('video[aria-label="HQ 3D preview"]');
        return v?.readyState >= 3 && !v.error;
      }, undefined, { timeout: 30000 });
      await page.getByTestId('studio-save-project').click();
      const folder = path.join(q.report, 'three_d', 'nvidia-preview');
      fs.mkdirSync(folder, { recursive: true });
      const filename = path.join(folder, `preview-${completed.jobId}.mp4`);
      assert(!fs.existsSync(filename), 'Preserve the previous attempt');
      const download = await page.context().request.get(await video.getAttribute('src'));
      assert(download.ok(), 'Owned preview delivery failed');
      fs.writeFileSync(filename, await download.body());
      const technical = q.verifyMedia(filename, { duration: 1, width: 1280, height: 720, audio: false });
      assert.equal(completed.renderReceipt?.device?.gpu_verified, true, 'No real GPU proof returned');
      await q.inspect(page, '3d-nvidia-preview-result');
      const attempt = { at: new Date().toISOString(), realAuth: true, noMocks: true, events, ...completed, output: path.relative(q.root, filename), outputSha256: technical.sha256, technical };
      fs.writeFileSync(path.join(folder, `receipt-${completed.jobId}.json`), JSON.stringify(attempt, null, 2));
      for (const id of ['three_d', 'blender']) q.record(id, { status: 'BLOCKED', gpuUsed: true, testedEndToEnd: false,
        failureFound: 'Studio HQ previously returned 503: no retained NVIDIA dispatch/private output bucket',
        fixApplied: 'Existing Blender renderer connected to owned private jobs through bounded NVIDIA transport; strict GPU and transfer/decode checks',
        retestResult: 'Actual HQ preview delivered and decoded', remainingIssue: 'Visual review and timeline final export/reload pending', userFacingSeverity: 'High' }, attempt);
      console.log(JSON.stringify({ jobId: completed.jobId, output: attempt.output, gpu: completed.renderReceipt.device, seconds: technical.seconds }));
    } finally { page.off('response', observe); }
  } catch (error) {
    await q.inspect(page, '3d-nvidia-retest-failure').catch(() => {});
    const failed = { at: new Date().toISOString(), project, realAuth: true, noMocks: true,
      status: /daily limit reached/i.test(error.message) ? 'BLOCKED_DAILY_ALLOWANCE'
        : events.some(e => e.status === 429) ? 'BLOCKED_GPU_CAPACITY' : 'FAIL', events,
      error: String(error.message).replace(/https?:\/\/\S+/g, '[url]') };
    fs.writeFileSync(path.join(q.report, 'three-d-attempt-failure.json'), JSON.stringify(failed, null, 2) + '\n');
    console.error(error.message);
    process.exitCode = 1;
  } finally { await browser.close(); }
})();
