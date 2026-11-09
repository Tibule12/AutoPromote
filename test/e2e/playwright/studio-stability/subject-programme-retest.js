#!/usr/bin/env node
// Retry the identical saved edit through normal Studio controls. This runner
// never starts a GPU instance or changes auth, effects, graph state or media.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
process.env.STUDIO_QA_REPORT ||= 'reports/studio-canonical-completion-20261008/subject-programme-retest';
const q = require('./run'), flows = require('./flows');
const name = process.env.STUDIO_SUBJECT_SPEED_PROJECT || 'Studio subject speed NVIDIA QA 20261008 r11';
async function main() {
  const { browser, page } = await q.connect();
  const receipt = { startedAt: new Date().toISOString(), projectName: name, realAuth: true,
    noMocks: true, headless: true, muted: true, graphChanges: 0, inferenceJobsStarted: 0,
    status: 'RUNNING', events: [], samples: [] };
  const step = text => { receipt.lastStep = text; fs.writeFileSync(path.join(q.report, 'receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n'); console.log(text); };
  const observe = req => {
    const route = new URL(req.url()).pathname;
    if (route.includes('studio-subject-vfx')) receipt.events.push({ route, method: req.method() });
  };
  page.on('request', observe);
  try {
    if (!await page.getByRole('navigation', { name: 'Creative tools' }).count()) {
      const saved = page.getByRole('region', { name: 'Saved Studio projects', exact: true });
      if (!await saved.count()) await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
      await saved.getByRole('button', { name, exact: true }).click();
      await page.getByRole('navigation', { name: 'Creative tools' }).waitFor({ timeout: 60000 });
    }
    await flows.open(page, name);
    step('Reopened the exact saved 2x subject/3D edit without changing its graph');
    if (process.env.STUDIO_SUBJECT_CLEAR_COMPLETED === 'true') {
      await q.tool(page, 'Pacing');
      const presets = page.locator('.speed-preset-grid');
      await presets.getByRole('button', { name: '1×', exact: true }).click();
      await presets.getByRole('button', { name: '2×', exact: true }).click();
      receipt.nativeSpeedRestore = '1x then 2x clears completed-file playback; final settings retained';
    }
    await q.tool(page, 'Composite');
    const proxy = page.getByLabel('Rendered subject effects with original audio', { exact: true });
    await page.waitForFunction(() => { const v = document.querySelector('video[aria-label="Rendered subject effects with original audio"]');
      return v?.readyState >= 3 && !v.error; }, undefined, { timeout: 60000 });
    assert(await page.getByLabel('I reviewed the sound, subject edges and camera cuts', { exact: true }).isChecked());
    const response = await page.context().request.get(await proxy.getAttribute('src'));
    assert(response.ok());
    const file = path.join(q.report, 'reviewed-proxy.mp4'); fs.writeFileSync(file, await response.body());
    receipt.reviewedProxySha256 = q.sha(file);
    assert.equal(receipt.reviewedProxySha256, 'fa90d4e44ab9cffce3c5dd24cc42c2abf5ad2c8b4935435e3875d5edd7496ba0');
    await page.getByTestId('pro-video-clip-1').click();
    for (const time of [.25, .45, .75, 1.45, 1.55, 3.75]) {
      await flows.seek(page, time);
      await page.waitForFunction(expected => { const v = document.querySelector('[data-testid="studio-after-video"]');
        return v?.paused && !v.seeking && v.readyState >= 3 && Math.abs(v.currentTime - expected) < .04;
      }, time * 2);
      if (time < 1.5) await page.waitForFunction(expected => {
        const v = document.querySelector('[data-testid="subject-programme-video"]');
        return document.querySelector('[data-testid="studio-program-canvas"]')?.dataset.programmeSource === 'subject-vfx'
          && v?.muted && !v.seeking && Math.abs(v.currentTime - expected) < .04;
      }, time * 2, { timeout: 60000 });
      await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(q.report, `preview-${time}.png`) });
      receipt.samples.push({ programmeTime: time, sourceTime: await page.getByTestId('studio-after-video').evaluate(v => v.currentTime),
        programmeSource: await page.getByTestId('studio-program-canvas').getAttribute('data-programme-source') });
      step(`Captured pre-final programme ${time}s at mapped source ${time * 2}s`);
    }
    receipt.output = await q.render(page, 'vfx', { duration: 6, width: 1280, height: 720, fps: 60, frames: 360, audio: true, projectName: name });
    receipt.gpuEncoderUsed = receipt.output.technical.video.encoder.includes('h264_nvenc');
    if (process.env.STUDIO_SUBJECT_REQUIRE_NVENC === 'true') assert(receipt.gpuEncoderUsed, 'NVIDIA encoding not proven');
    for (const {programmeTime: time} of receipt.samples) execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time),
      '-i', path.join(q.root, receipt.output.output), '-frames:v', '1', '-y', path.join(q.report, `final-${time}.png`)]);
    receipt.inferenceJobsStarted = receipt.events.filter(e => e.method === 'POST').length;
    assert.equal(receipt.inferenceJobsStarted, 0, 'Owned reviewed source must be reused without new inference');
    receipt.status = 'NATIVE_DELIVERY_PASS_VISUAL_PAIR_REVIEW_PENDING';
  } catch (e) {
    receipt.status = 'FAIL'; receipt.error = String(e.message).replace(/https?:\/\/\S+/g, '[url]'); process.exitCode = 1;
  } finally {
    receipt.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(q.report, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    page.off('request', observe); await browser.close();
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
