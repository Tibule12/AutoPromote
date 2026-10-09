#!/usr/bin/env node
// Normal signed-in Studio controls, real CPU media worker, native download.
// Pre-final frames are captured BEFORE submission from the interactive edit.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
process.env.STUDIO_QA_REPORT ||= 'reports/studio-canonical-completion-20261008/paired-flow';
const q = require('./run');
const flows = require('./flows');
const kernel = require(path.join(q.root, 'src/generated/studioDirectorReplayKernel.cjs'));
const projectName = process.env.STUDIO_PAIR_QA_PROJECT || 'Studio paired visual QA ' + new Date().toISOString().replace(/[:.]/g, '-');
const sourceProjectName = process.env.STUDIO_PAIR_QA_SOURCE || 'Studio canonical decisions QA 20261008';
const speed = Number(process.env.STUDIO_PAIR_QA_SPEED || 1);
const fps = Number(process.env.STUDIO_PAIR_QA_FPS || 30);
assert([.5, 1, 2].includes(speed), 'Paired fixture supports constant .5x/1x/2x; ramps need their own source map');
assert([30, 60].includes(fps), 'Paired delivery checks support 30fps/60fps');
const sha = data => require('node:crypto').createHash('sha256').update(JSON.stringify(data)).digest('hex');
async function saved(page) {
  return page.evaluate(name => new Promise((resolve, reject) => {
    const open = indexedDB.open('autopromote-viral-studio');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, get = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      get.onsuccess = () => { db.close(); resolve(get.result.find(p => p.name === name)?.snapshot.studioDocument); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  }), projectName);
}
async function main() {
  const { browser, page } = await q.connect();
  const receipt = { startedAt: new Date().toISOString(), projectName, headless: true, muted: true,
    realAuth: true, noMocks: true, gpuUsed: false, gpuJobsStarted: 0, status: 'RUNNING', pairs: [] };
  const requests = [];
  const observe = request => {
    if (new URL(request.url()).pathname === '/api/media/process') requests.push(request.postDataJSON()?.options?.viralData);
  };
  try {
    const session = await browser.newBrowserCDPSession();
    assert((await session.send('Browser.getBrowserCommandLine')).arguments.includes('--mute-audio'));
    await session.detach();
    page.on('request', observe);
    if (await page.getByRole('navigation', { name: 'Creative tools' }).isVisible()) {
      await flows.open(page, sourceProjectName);
    } else {
      await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
      await page.getByRole('region', { name: 'Saved Studio projects', exact: true })
        .getByRole('button', { name: sourceProjectName, exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3,
        undefined, { timeout: 60000 });
    }
    await flows.duplicate(page, projectName);
    await q.tool(page, 'Hook');
    await page.getByLabel(/Enable opening hook/).uncheck();
    await q.tool(page, 'Motion');
    await page.getByRole('button', { name: '3D Motion', exact: true }).click();
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    await page.getByLabel('Enabled', { exact: true }).uncheck();
    await q.tool(page, 'Captions');
    // Explicit reviewed annotation scope, not a false full-transcript claim.
    await page.getByLabel('Caption coverage', { exact: true }).selectOption('full');
    await page.getByRole('button', { name: 'Check caption coverage', exact: true }).click();
    await page.getByTestId('caption-coverage-result').filter({ hasText: /Possible uncovered audio/ }).waitFor({ timeout: 120000 });
    receipt.fullCoveragePreflight = await page.getByTestId('caption-coverage-result').innerText();
    assert.equal(requests.length, 0, 'Coverage check must not submit a render');
    await page.getByLabel('Caption coverage', { exact: true }).selectOption('selected');
    assert.equal(await page.getByLabel('Caption coverage', { exact: true }).inputValue(), 'selected');
    if (process.env.STUDIO_PAIR_QA_WRAP_TITLE === '1') {
      await q.tool(page, 'Graphics');
      await page.getByTestId('pro-track-row-graphics').getByRole('button').filter({ hasText: 'Shared project state' }).click();
      const width = page.getByLabel('Title text box width', { exact: true });
      await width.focus(); await page.keyboard.press('Home');
      for (let i = 15; i < 45; i++) await page.keyboard.press('ArrowRight');
      assert.equal(await width.inputValue(), '45');
    }
    if (speed !== 1) {
      await q.tool(page, 'Pacing');
      await page.locator('.speed-preset-grid').getByRole('button', { name: `${speed}×`, exact: true }).click();
    }
    await q.tool(page, 'Export');
    await page.getByLabel('Export resolution', { exact: true }).selectOption('source');
    await page.getByLabel('Export frame rate', { exact: true }).selectOption(String(fps));
    await page.getByLabel('Export codec', { exact: true }).selectOption('h264');
    await flows.mediaRail(page);
    await page.getByTestId('studio-save-project').click();
    await page.waitForFunction(() => document.querySelector('.studio-project-save-state')?.textContent.includes('Saved locally'));
    // The previous save's label can still be visible while IndexedDB commits
    // the new edit. Read the committed decision rather than an old label.
    await page.waitForFunction(({ name, endTick }) => new Promise(resolve => {
      const open = indexedDB.open('autopromote-viral-studio');
      open.onerror = () => resolve(false);
      open.onsuccess = () => {
        const db = open.result, get = db.transaction('projects', 'readonly').objectStore('projects').getAll();
        get.onsuccess = () => {
          const doc = get.result.find(project => project.name === name)?.snapshot.studioDocument;
          db.close(); resolve(doc?.editGraph?.settings?.captionCoverageMode === 'selected' &&
            doc.outputTimeMap.at(-1)?.outputRange.endTick === endTick);
        };
        get.onerror = () => { db.close(); resolve(false); };
      };
    }), { name: projectName, endTick: 12 * 90000 / speed }, { timeout: 10000 });
    const document = await saved(page);
    receipt.documentSha256 = sha(document);
    fs.writeFileSync(path.join(q.report, 'document-before-render.json'), JSON.stringify(document, null, 2));
    assert.equal(document.editGraph.settings.captionCoverageMode, 'selected');
    assert.equal(document.outputTimeMap.at(-1).outputRange.endTick / 90000, 12 / speed);
    receipt.constantSpeed = speed;
    receipt.outputFps = fps;
    assert(document.layers.filter(l => l.type === 'three_d').every(l => l.parameters.enabled === false));
    // A user deselects the graphic before inspecting delivery pixels. Selection
    // handles are editing chrome and cannot be part of a preview/final pair.
    await page.getByTestId('pro-video-clip-1').click();
    const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
    if (await pause.isVisible()) await pause.click();
    const captureTimes = process.env.STUDIO_PAIR_QA_TIMES
      ? process.env.STUDIO_PAIR_QA_TIMES.split(',').map(Number) : [1, 3.5, 5.5, 7.5, 10].map(time => time / speed);
    assert(captureTimes.every(time => Number.isFinite(time) && time >= 0 && time < 12 / speed));
    for (const time of captureTimes) {
      await flows.seek(page, time);
      await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.paused);
      await page.waitForFunction(sourceTime => {
        const video = document.querySelector('[data-testid="studio-after-video"]');
        return video && !video.seeking && video.readyState >= 3 && Math.abs(video.currentTime - sourceTime) < .04;
      }, time * speed);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => document.fonts.ready);
      const state = await page.getByTestId('studio-after-video').evaluate(e => ({
        currentTime: e.currentTime, readyState: e.readyState, width: e.videoWidth, height: e.videoHeight,
      }));
      assert(Math.abs(state.currentTime - time * speed) < .04, 'Pre-final mapped source clock drifted');
      await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(q.report, `preview-${time}.png`), animations: 'disabled' });
      receipt.pairs.push({ outputTime: time, preFinalSource: state, preview: `preview-${time}.png` });
      receipt.pairs.at(-1).programmeGeometry = await page.evaluate(() => {
        const canvas = document.querySelector('[data-testid="studio-program-canvas"]');
        const frame = document.querySelector('[data-testid="hook-preview-frame"]');
        const rect = element => {
          const r = element.getBoundingClientRect();
          return { width: r.width, height: r.height, x: r.x, y: r.y };
        };
        const style = getComputedStyle(canvas);
        return { canvas: rect(canvas), frame: rect(frame), bitmap: [canvas.width, canvas.height],
          transform: style.transform, filter: style.filter, clipPath: style.clipPath };
      });
      if (process.env.STUDIO_PAIR_QA_CAPTURE_SOURCE === '1') {
        const png = await page.getByTestId('studio-after-video').evaluate(video => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          canvas.getContext('2d').drawImage(video, 0, 0);
          return canvas.toDataURL('image/png').split(',')[1];
        });
        fs.writeFileSync(path.join(q.report, `source-${time}.png`), Buffer.from(png, 'base64'));
        const programme = await page.getByTestId('studio-program-canvas').evaluate(canvas =>
          canvas.toDataURL('image/png').split(',')[1]);
        fs.writeFileSync(path.join(q.report, `programme-${time}.png`), Buffer.from(programme, 'base64'));
      }
      receipt.pairs.at(-1).titleLayout = await page.locator('.draggable-overlay.is-text-overlay').evaluateAll(elements =>
        elements.map(element => {
          const style = getComputedStyle(element), box = element.getBoundingClientRect();
          return { text: element.textContent, fontFamily: style.fontFamily, fontSize: style.fontSize,
            fontWeight: style.fontWeight, boxSizing: style.boxSizing, width: style.width,
            lineHeight: style.lineHeight, height: style.height, x: box.x, y: box.y,
            renderedWidth: box.width, renderedHeight: box.height };
        }));
      receipt.pairs.at(-1).captionLayout = await page.getByTestId('live-caption-preview').evaluateAll(elements =>
        elements.map(element => {
          const pill = element.querySelector('.caption-preview-pill-active'), style = getComputedStyle(pill);
          return { text: pill.textContent, fontFamily: style.fontFamily, fontSize: style.fontSize,
            opacity: Number(style.opacity),
            words: [...pill.querySelectorAll('.caption-preview-word')].map(word => ({
              text: word.textContent, transform: getComputedStyle(word).transform,
              animation: getComputedStyle(word).animationName,
            })) };
        }));
      if (process.env.STUDIO_PAIR_QA_CAPTION_BOUNDARIES === '1') {
        const expected = document.layers.some(layer => layer.type === 'caption' &&
          state.currentTime * 90000 >= layer.sourceRange.startTick &&
          state.currentTime * 90000 < layer.sourceRange.endTick);
        assert.equal(receipt.pairs.at(-1).captionLayout.length > 0, expected,
          `Caption presence differs from reviewed source cue at ${time}s`);
        assert(receipt.pairs.at(-1).captionLayout.every(cue => cue.words.every(word =>
          word.animation === 'none' && word.transform === 'none')),
          'Minimal caption must not receive a decorative per-word animation');
      }
    }
    const output = await q.render(page, 'compositing', { duration: 12 / speed, fps, audio: true, projectName });
    receipt.output = output;
    receipt.submittedOutputSettings = requests.at(-1)?.output_settings;
    const [fpsNumerator, fpsDenominator] = output.technical.video.fps.split('/').map(Number);
    assert.equal(fpsNumerator / fpsDenominator, fps, 'Native delivery ignored the selected frame rate');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].caption_coverage_mode, 'selected');
    assert.equal(requests[0].caption_review_copy, false);
    assert.deepEqual(requests[0].finish_plan.motion, kernel.compileStudioFinishForRender(document).motion);
    assert.deepEqual(requests[0].composition_plan, kernel.compileStudioCompositionForRender(document));
    for (const pair of receipt.pairs) {
      const file = path.join(q.report, `final-${pair.outputTime}.png`);
      execFileSync('ffmpeg', ['-v', 'error', '-ss', String(pair.outputTime), '-i', path.join(q.root, output.output),
        '-frames:v', '1', '-y', file]);
      pair.final = path.basename(file);
    }
    receipt.output = output;
    receipt.status = 'PAIRS_CAPTURED_REVIEW_PENDING';
    receipt.previewFinalParity = 'UNQUALIFIED until paired geometry/text/pixels/audio are reviewed';
  } catch (error) {
    receipt.status = 'FAIL'; receipt.error = String(error.message).replace(/https?:\/\/[^\s]+/g, '[url]');
    throw error;
  } finally {
    page.off('request', observe);
    receipt.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(q.report, 'receipt.json'), JSON.stringify(receipt, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ status: receipt.status, pairs: receipt.pairs.length, output: receipt.output?.output }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
