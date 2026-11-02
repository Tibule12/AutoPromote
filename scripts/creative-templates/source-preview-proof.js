#!/usr/bin/env node
// Real authenticated Studio; optional faithful reuse of its existing browser
// session through Playwright storageState. No fabricated identities or mocks.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const h = require('./studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const original = 'VELO — cycling rhythm · 20261010';
const draft = 'VELO — preview switching · 20261010';
async function range(input, value) {
  await input.evaluate((el, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(next));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function pause(page) {
  const b = page.getByRole('button', { name: 'Pause comparison', exact: true });
  if (await b.isVisible()) await b.click();
  await page.locator('video,audio').evaluateAll(es => es.forEach(e => { e.muted = true; e.pause(); }));
}
async function measure(page, label) {
  await pause(page);
  assert(!await page.getByTestId('hook-preview-frame').evaluate(e => e.classList.contains('has-rendered-output')));
  await range(page.getByLabel('Edited output position', { exact: true }), 0);
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="studio-after-video"]');
    return v && v.readyState >= 3 && !v.seeking;
  });
  const before = await h.save(page, `${label}-before`);
  await page.evaluate(() => {
    const frames = [], events = [], cleanups = [];
    const observe = v => ({ wall: performance.now(), programmeTime: Number(document.querySelector('[aria-label="Edited output position"]').value), sourceTime: v.currentTime, playbackRate: v.playbackRate });
    for (const v of document.querySelectorAll('[data-testid="studio-after-video"], [data-testid="studio-next-video"]')) {
      let id;
      const active = () => v.dataset.testid === 'studio-after-video';
      const frame = (_, info) => {
        if (active()) frames.push({ ...observe(v), mediaTime: info.mediaTime });
        id = v.requestVideoFrameCallback(frame);
      };
      id = v.requestVideoFrameCallback(frame);
      const listener = e => { if (active()) events.push({ type: e.type, ...observe(v) }); };
      for (const t of ['playing', 'waiting', 'stalled', 'loadedmetadata']) v.addEventListener(t, listener);
      cleanups.push(() => {
        v.cancelVideoFrameCallback(id);
        for (const t of ['playing', 'waiting', 'stalled', 'loadedmetadata']) v.removeEventListener(t, listener);
      });
    }
    window.__sourcePreviewObservation = () => {
      cleanups.forEach(fn => fn());
      return { frames, events, end: observe(document.querySelector('[data-testid="studio-after-video"]')) };
    };
  });
  const start = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="Edited output position"]').value) >= 19.5, undefined, { timeout: 60000 });
  const result = await page.evaluate(() => { const r = window.__sourcePreviewObservation(); delete window.__sourcePreviewObservation; return r; });
  await pause(page);
  const after = await h.save(page, `${label}-after`);
  assert.equal(hash(after.snapshot.studioDocument), hash(before.snapshot.studioDocument));
  const playingStart = result.events.find(event => event.type === 'playing')?.wall || start;
  const receipt = { at: new Date().toISOString(), start, playingStart, ...result,
    startupBeforePlayingMs: playingStart - start, wallSeconds: (result.end.wall - playingStart) / 1000,
    projectId: after.id, canonicalHash: hash(after.snapshot.studioDocument), noMocks: true, preFinal: true, screencast: false };
  fs.writeFileSync(path.join(folder, `${label}-playback.json`), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ label, wallSeconds: receipt.wallSeconds, frames: result.frames.length,
    waiting: result.events.filter(e => e.type === 'waiting').length, canonicalHash: receipt.canonicalHash }));
}
async function inspect(page) {
  await pause(page);
  assert(!await page.getByTestId('hook-preview-frame').evaluate(e => e.classList.contains('has-rendered-output')));
  const before = await h.save(page, 'visual-before');
  const frames = [];
  for (const time of [.625, 2.75, 6.25, 12.75, 18.875]) {
    await range(page.getByLabel('Edited output position', { exact: true }), time);
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v && v.readyState >= 3 && !v.seeking;
    });
    await page.waitForTimeout(350); await pause(page);
    frames.push(await page.getByTestId('studio-after-video').evaluate(v => ({
      programmeTime: Number(document.querySelector('[aria-label="Edited output position"]').value),
      sourceTime: v.currentTime, width: v.videoWidth, height: v.videoHeight, paused: v.paused,
    })));
    await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(folder, `raw-frame-${time}.png`) });
  }
  const separator = page.getByRole('separator', { name: 'Resize timeline' });
  await separator.focus();
  for (let i = 0; i < 12; i++) await separator.press('ArrowUp');
  const timeline = page.getByTestId('studio-pro-timeline');
  await timeline.getByRole('button', { name: 'Fit entire timeline', exact: true }).click();
  const after = await h.save(page, 'visual-after');
  assert.equal(hash(after.snapshot.studioDocument), hash(before.snapshot.studioDocument));
  await timeline.screenshot({ path: path.join(folder, 'repaired-timeline.png') });
  await page.getByTestId('viral-studio-workspace').screenshot({ path: path.join(folder, 'repaired-studio.png') });
  fs.writeFileSync(path.join(folder, 'visual-inspection.json'), JSON.stringify({
    at: new Date().toISOString(), projectId: after.id, canonicalHash: hash(after.snapshot.studioDocument),
    frames, unchangedEdit: true, preFinal: true, noMocks: true,
    scope: 'Representative raw-source frames and timeline; full moving-film/sound parity remains unqualified.',
  }, null, 2));
  console.log('Five native raw-source frames and the full timeline retained; edit hash unchanged.');
}
async function download(page, resolveCompleted) {
  await q.tool(page, 'Export');
  await page.getByTestId('rendered-output-ready').waitFor({ timeout: 90000 });
  const until = Date.now() + 10000;
  while (!resolveCompleted()?.jobId && Date.now() < until) await page.waitForTimeout(100);
  const completed = resolveCompleted();
  assert(completed?.jobId, 'Owner-bound completed recovery was not observed');
  const record = await h.save(page, 'download-project');
  const cdp = await page.context().newCDPSession(page);
  const events = []; let guid, suggestedName, terminal;
  const done = new Promise(resolve => { terminal = resolve; });
  cdp.on('Browser.downloadWillBegin', e => { guid = e.guid; suggestedName = path.basename(e.suggestedFilename); console.log('Native download began.'); });
  cdp.on('Browser.downloadProgress', e => {
    if (e.guid !== guid) return;
    events.push({ at: Date.now(), ...e });
    if (e.state !== 'inProgress') terminal(e);
  });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: folder, eventsEnabled: true });
  await page.getByTestId('rendered-output-ready').getByRole('button', { name: /Download/ }).click();
  let timer;
  const end = await Promise.race([done, new Promise(resolve => { timer = setTimeout(() => resolve({ state: 'timeout' }), 45000); })]);
  clearTimeout(timer);
  const receipt = { at: new Date().toISOString(), events, end, projectId: record.id,
    canonicalHash: hash(record.snapshot.studioDocument), submittedJobId: completed.jobId,
    serverOutputSha256: completed.result?.outputSha256, nativeDownload: end.state === 'completed', noMocks: true,
    downloadBehavior: 'allow', suggestedName };
  if (end.state === 'completed') {
    const source = end.filePath || path.join(folder, suggestedName);
    const file = path.join(folder, 'native-download.mp4'); fs.renameSync(source, file);
    receipt.outputSha256 = hash(fs.readFileSync(file));
    assert.equal(receipt.outputSha256, receipt.serverOutputSha256);
    receipt.technical = q.verifyMedia(file, { duration: 20, width: 720, height: 1280, fps: 24, frames: 480 });
  }
  fs.writeFileSync(path.join(folder, 'native-download.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ end: end.state, lastProgress: events.at(-1), outputSha256: receipt.outputSha256 }));
  if (!page.isClosed()) await cdp.detach();
}
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const options = { headless: true, channel: process.env.STUDIO_QA_BROWSER_CHANNEL || 'chrome',
    args: ['--mute-audio'] };
  const browser = process.env.STUDIO_QA_STORAGE_STATE ? await chromium.launch(options) : null;
  const context = browser ? await browser.newContext({ storageState: process.env.STUDIO_QA_STORAGE_STATE,
    viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
    : await chromium.launchPersistentContext(process.env.STUDIO_QA_PROFILE, {
      ...options, viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = context.pages()[0] || await context.newPage();
  for (const extra of context.pages()) if (extra !== page) await extra.close();
  page.setDefaultTimeout(90000);
  let completed; const responses = [];
  page.on('response', async r => {
    const pathname = new URL(r.url()).pathname;
    if (!pathname.startsWith('/api/media/')) return;
    const d = await r.json().catch(() => ({}));
    responses.push({ path: pathname, httpStatus: r.status(), jobStatus: d.status, jobId: d.jobId });
    if (pathname.startsWith('/api/media/viral-render-attempt/') || pathname.startsWith('/api/media/status/')) {
      if (d.status === 'completed') completed = d;
    }
  });
  page.on('close', () => console.log('Studio page closed.'));
  context.browser().on('disconnected', () => console.log('Owned browser disconnected.'));
  try {
    const version = await (await context.browser().newBrowserCDPSession()).send('Browser.getVersion');
    assert(version.userAgent.includes('HeadlessChrome'));
    fs.writeFileSync(path.join(folder, `${process.argv[2]}-browser.json`), JSON.stringify(version, null, 2));
    await page.goto('http://localhost:5000/?studioTemplateSession=source-switch');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    const [action, label = action] = process.argv.slice(2);
    await page.getByRole('button', { name: ['baseline', 'download', 'export-session'].includes(action) ? original : draft, exact: true }).click();
    await h.rail(page); await pause(page);
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (action === 'export-session') {
      const state = await context.storageState({ indexedDB: true });
      saveAuthenticatedState(state, process.env.STUDIO_QA_STATE_OUTPUT);
      console.log('Existing authenticated localhost browser state retained privately; no identity or project values changed.');
    } else if (action === 'download') {
      await page.reload(); await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
      await page.getByRole('button', { name: original, exact: true }).click(); await h.rail(page);
      await download(page, () => completed);
    }
    else if (action === 'inspect') await inspect(page);
    else {
      if (action === 'baseline') {
        await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
        await page.getByLabel('Project name', { exact: true }).fill(draft);
        await h.save(page, 'draft-created');
        // Cold saved entry binds its own project-scoped render recovery.
        await page.reload(); await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
        await page.getByRole('button', { name: draft, exact: true }).click(); await h.rail(page);
      }
      await measure(page, label);
      if (process.env.STUDIO_QA_REPEAT === '1') await measure(page, `${label}-repeat`);
    }
  } catch (e) {
    if (!page.isClosed()) await page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
    throw e;
  } finally {
    fs.writeFileSync(path.join(folder, `${process.argv[2]}-responses.json`), JSON.stringify(responses, null, 2));
    await context.close();
    if (browser) await browser.close();
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
