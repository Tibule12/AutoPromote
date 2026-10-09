#!/usr/bin/env node
// Requires the real canonical-visual-reopen flow and an already-running worker.
// Uses native authenticated Studio Render/Download, never starts services.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const cpuVariant = process.argv.includes('--cpu-2d-variant');
process.env.STUDIO_QA_REPORT ||= cpuVariant
  ? 'reports/studio-canonical-visual-20261008/render-flow-2d'
  : 'reports/studio-canonical-visual-20261008/render-flow';
const q = require('./run');
const flows = require('./flows');
const kernel = require(path.join(q.root, 'src/generated/studioDirectorReplayKernel.cjs'));
const statePath = path.join(q.root, process.env.STUDIO_VISUAL_QA_REPORT || 'reports/studio-canonical-visual-20261008/browser-flow');
const clean = value => String(value).replace(/https?:\/\/[^\s"<>]+/g, raw => {
  try { const url = new URL(raw); return url.origin + url.pathname; } catch { return '[url]'; }
});
async function main() {
  const state = JSON.parse(fs.readFileSync(path.join(statePath, 'receipt.json')));
  assert.equal(state.stateFlow, 'PASS', 'Finish the normal reopen flow first');
  let document = JSON.parse(fs.readFileSync(path.join(statePath, 'document-after.json')));
  const { browser, page } = await q.connect();
  const submitted = [];
  const receipt = { startedAt: new Date().toISOString(), projectName: state.projectName, realAuth: true,
    noMocks: true, headless: true, muted: true, stateFlowReceipt: path.relative(q.root, path.join(statePath, 'receipt.json')),
    parentStateSha256: state.afterSha256, gpuJobsStarted: 0, workerStarted: false, status: 'BLOCKED',
    scope: cpuVariant ? 'Separately duplicated 2D edit; 3D explicitly disabled through its normal control' : 'Complete reopened edit including active 3D',
    visualReview: 'PENDING', listeningReview: 'NOT_RUN' };
  const observe = request => {
    if (!request.url().endsWith('/api/media/process')) return;
    const data = request.postDataJSON()?.options?.viralData;
    if (!data) return;
    // Keep decisions only; no source/access URL or auth material in evidence.
    submitted.push({ finish: data.finish_plan, composition: data.composition_plan,
      captionStyle: data.caption_style, captionSegments: data.caption_segments,
      brandWatermark: data.brand_watermark, exportSettings: data.export_settings });
  };
  try {
    const browserSession = await browser.newBrowserCDPSession();
    const flags = await browserSession.send('Browser.getBrowserCommandLine');
    assert(flags.arguments.includes('--mute-audio'), 'Browser-level mute required');
    await browserSession.detach();
    if (!await page.locator('[aria-label="Project name"]').count()) {
      await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
      await page.getByRole('button', { name: state.projectName, exact: true }).click();
      await page.waitForFunction(name => document.querySelector('[aria-label="Project name"]')?.value === name, state.projectName);
    }
    assert.equal(await page.getByLabel('Project name', { exact: true }).inputValue(), state.projectName, 'Wrong project selected');
    if (cpuVariant) {
      receipt.projectName = state.projectName + ' CPU 2D';
      await flows.duplicate(page, receipt.projectName);
      await q.tool(page, 'Motion');
      await page.getByRole('button', { name: '3D Motion', exact: true }).click();
      await page.getByRole('button', { name: 'Advanced', exact: true }).click();
      for (const name of ['Font family', 'Weight', 'Easing', 'Background', 'Quality', 'Light direction', 'Audio response', 'Shadows', 'Reflections']) {
        assert(await page.getByLabel(name, { exact: true }).isDisabled(), `Unwired ${name} control still active`);
      }
      receipt.unsupported3DControls = 'PASS: all nine unavailable controls disabled in the actual Studio';
      await page.getByLabel('Enabled', { exact: true }).uncheck();
      await page.getByTestId('studio-save-project').click();
      await page.waitForFunction(() => document.querySelector('.studio-project-save-state')?.textContent.includes('Saved locally'));
      document = await page.evaluate(name => new Promise((resolve, reject) => {
        const open = indexedDB.open('autopromote-viral-studio');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction('projects', 'readonly').objectStore('projects').getAll();
          get.onsuccess = () => { db.close(); resolve(get.result.find(p => p.name === name)?.snapshot.studioDocument); };
          get.onerror = () => { db.close(); reject(get.error); };
        };
      }), receipt.projectName);
      assert(document.layers.filter(l => l.type === 'three_d').every(l => l.parameters.enabled === false));
      fs.writeFileSync(path.join(q.report, 'document-before-export.json'), JSON.stringify(document, null, 2));
    }
    const expectedFinish = kernel.compileStudioFinishForRender(document);
    const expectedComposition = kernel.compileStudioCompositionForRender(document);
    await page.locator('video,audio').evaluateAll(es => es.forEach(e => { e.muted = true; e.pause(); }));
    await page.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Captions', exact: true }).click();
    await page.locator('.caption-segment-row').first().getByRole('button', { name: '▶', exact: true }).click();
    const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
    if (await pause.isVisible()) await pause.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.paused);
    await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(q.report, 'pre-final-preview.png') });
    page.on('request', observe);
    const result = await q.render(page, 'compositing', { duration: 12, audio: true, projectName: receipt.projectName });
    assert.equal(submitted.length, 1, 'Render submission count differs from one owned request');
    const actual = submitted[0];
    assert.equal(actual.brandWatermark, false);
    assert.equal(actual.captionStyle, 'minimal');
    assert.equal(actual.finish.reframe.aspect, '4:5');
    assert.deepEqual(actual.finish.color, expectedFinish.color);
    assert.deepEqual(actual.finish.motion, expectedFinish.motion);
    assert.deepEqual(actual.composition, expectedComposition);
    assert.equal(actual.captionSegments[0].caption_x, 35);
    assert.equal(actual.captionSegments[0].caption_y, 70);
    assert(Math.abs(result.technical.video.width / result.technical.video.height - 4 / 5) < .005,
      'Final output ignored requested 4:5 aspect');
    receipt.status = 'TECHNICAL_PASS_REVIEW_PENDING';
    receipt.nativeRender = result;
    receipt.decisions = submitted;
    receipt.parameterContract = 'PASS';
    receipt.gpuUsed = false;
    receipt.deviceScope = 'Already-running local CPU worker; no GPU qualification';
  } catch (error) {
    const needsHQ = document.layers.some(l => l.type === 'three_d' && l.parameters.enabled !== false && !l.parameters.hqPreviewJobId);
    receipt.status = !submitted.length && needsHQ ? 'BLOCKED' : 'FAIL';
    receipt.error = clean(error.message);
    if (receipt.status === 'BLOCKED') {
      receipt.remainingIssue = 'Active saved 3D scene has no HQ preview. NVIDIA is stopped; no GPU window was started. The normal Studio guard correctly prevented submission.';
      q.record('compositing', { status: 'BLOCKED', remainingIssue: receipt.remainingIssue, retestResult: 'No render submitted; real UI requires HQ 3D preview', gpuUsed: false });
    }
    throw error;
  } finally {
    page?.off('request', observe);
    receipt.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(q.report, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    await browser.close();
  }
  console.log(JSON.stringify({ status: receipt.status, output: receipt.nativeRender.output,
    gpuUsed: false, parameterContract: receipt.parameterContract }));
}
main().catch(error => { console.error(clean(error.message)); process.exitCode = 1; });
