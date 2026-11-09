#!/usr/bin/env node
// Extend an existing real owned subject edit using its supported controls.
// Generate through Studio, retaining the normal review gate before final export.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
process.env.STUDIO_QA_REPORT ||= 'reports/studio-canonical-completion-20261008/subject-seven-effects';
const q = require('./run'), f = require('./flows');
const name = process.env.STUDIO_SEVEN_PROJECT || 'Studio seven subject effects QA 20261008';
(async () => {
  const { browser, page } = await q.connect();
  const receipt = { startedAt: new Date().toISOString(), projectName: name, realAuth: true, noMocks: true,
    headless: true, muted: true, status: 'RUNNING', events: [] };
  const observe = async r => {
    const route = new URL(r.url()).pathname;
    if (!route.includes('studio-subject-vfx')) return;
    const body = await r.json().catch(() => ({}));
    receipt.events.push({ path: route, status: r.status(), jobId: body.jobId, jobStatus: body.status, error: body.message || body.error });
    if (body.status === 'completed') receipt.gpuReceipt = body.receipt;
  };
  page.on('response', observe);
  try {
    if (!await page.getByRole('navigation', { name: 'Creative tools' }).count())
      throw new Error('Open the normally signed-in Studio entry first');
    if (process.argv[2] === 'prepare') {
      await f.open(page, 'Studio NVIDIA subject QA 20261008 r2');
      await f.duplicate(page, name);
      // The separately blocked 3D layer is retained in the source project.
      // Remove it from this derivative so it cannot obscure effect inspection.
      await q.tool(page, 'Motion');
      await page.getByRole('button', { name: '3D Motion', exact: true }).click();
      await page.getByTestId('studio-3d-panel').getByRole('button', { name: 'Delete', exact: true }).click();
      await q.tool(page, 'Composite');
      for (const type of ['kinetic_type', 'glow', 'particles']) {
        await page.getByLabel('Subject effect type', { exact: true }).selectOption(type);
        await page.getByRole('button', { name: 'Add layer', exact: true }).click();
      }
      const glow = page.getByRole('group', { name: 'Subject glow', exact: true }).getByLabel('strength', { exact: true });
      await glow.fill('0.4');
      await page.getByRole('button', { name: /Undo/ }).first().click();
      assert.equal(Number(await glow.inputValue()), .05);
      await page.getByRole('button', { name: /Redo/ }).first().click();
      assert.equal(Number(await glow.inputValue()), .4);
      await f.mediaRail(page);
      await page.getByTestId('studio-save-project').click();
      receipt.undoRedo = 'PASS';
      receipt.effects = ['text_behind', 'background_grade', 'tracked_callout', 'depth', 'kinetic_type', 'glow', 'particles'];
      receipt.status = 'PREPARED_NORMAL_UI_NO_GPU_JOB';
    } else if (process.argv[2] === 'render') {
      await f.open(page, name); await q.tool(page, 'Composite');
      await page.getByRole('button', { name: 'Render subject preview', exact: true }).click();
      await page.getByLabel('Rendered subject effects with original audio', { exact: true }).waitFor({ timeout: 240000 });
      const video = page.getByLabel('Rendered subject effects with original audio', { exact: true });
      await page.waitForFunction(() => { const v = document.querySelector('video[aria-label="Rendered subject effects with original audio"]');
        return v?.readyState >= 3 && !v.error; }, undefined, { timeout: 60000 });
      const response = await page.context().request.get(await video.getAttribute('src')); assert(response.ok());
      const file = path.join(q.report, 'preview.mp4'); assert(!fs.existsSync(file), 'Preserve the previous preview');
      fs.writeFileSync(file, await response.body());
      receipt.technical = q.verifyMedia(file, { duration: 3, width: 1280, height: 720, audio: true });
      assert.equal(receipt.gpuReceipt?.encoder, 'h264_nvenc');
      assert.equal(receipt.gpuReceipt?.frames, 72);
      for (const time of [.1, .5, 1.5, 2.9]) execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', file,
        '-frames:v', '1', '-y', path.join(q.report, `subject-${time}.png`)]);
      await f.mediaRail(page); await page.getByTestId('studio-save-project').click();
      receipt.status = 'NATIVE_GPU_PREVIEW_DELIVERED_REVIEW_REQUIRED';
    } else throw new Error('Use prepare or render');
  } catch (e) { receipt.status = 'FAIL'; receipt.error = String(e.message).replace(/https?:\/\/\S+/g, '[url]'); process.exitCode = 1; }
  finally {
    receipt.finishedAt = new Date().toISOString(); page.off('response', observe);
    fs.writeFileSync(path.join(q.report, `receipt-${process.argv[2]}.json`), JSON.stringify(receipt, null, 2) + '\n');
    await browser.close();
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
