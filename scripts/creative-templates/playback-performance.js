#!/usr/bin/env node
// Read-only timing diagnostics around normal authenticated Studio playback.
// Deliberately no screencast: screen capture itself changes the workload.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const q = require('../../test/e2e/playwright/studio-stability/run');
const h = require('./studio-proof');

async function main() {
  const name = process.argv[2] || 'velo';
  assert(['ember', 'velo', 'onda'].includes(name));
  const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
  const resultName = process.env.STUDIO_QA_RESULT_NAME || 'playback-performance';
  assert(/^[a-z0-9-]+$/.test(resultName));
  const receipt = JSON.parse(fs.readFileSync(path.join(folder, name, 'render-receipt.json')));
  assert.equal(hash(fs.readFileSync(path.join(folder, name, 'final.mp4'))), receipt.outputSha256);
  const context = await chromium.launchPersistentContext(process.env.STUDIO_QA_PROFILE, {
    headless: true, channel: 'chrome', viewport: { width: 1600, height: 1000 },
    args: ['--mute-audio', '--remote-debugging-port=9234'], acceptDownloads: true,
  });
  try {
    const page = context.pages()[0] || await context.newPage();
    for (const extra of context.pages()) if (extra !== page) await extra.close();
    page.setDefaultTimeout(90000);
    const cdp = await context.newCDPSession(page);
    const version = await cdp.send('Browser.getVersion');
    assert(version.userAgent.includes('HeadlessChrome'));
    const entry = await page.goto(`http://localhost:5000/?studioTemplateSession=performance-${name}`);
    const appAddress = await entry.serverAddr();
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: `${name.toUpperCase()} — music and cinematic sound · 20261010`, exact: true }).click();
    await page.getByTestId('studio-pro-timeline').waitFor();
    console.log('Normal authenticated project opened.');
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    const before = (await h.records(page)).find(p => p.id === receipt.projectId);
    assert.equal(hash(before.snapshot.studioDocument), receipt.projectHash);
    await q.tool(page, 'Export');
    await page.getByTestId('rendered-output-ready').waitFor();
    console.log('Exact finished render recovered.');
    // Hydration can report Play before the canplay handler resumes the media.
    // Exercise an explicit native Play -> Pause so the transport intention is
    // definitely paused, rather than pausing only the decoder behind the UI.
    const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
    if (!await pause.isVisible()) await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
    await pause.click();
    const slider = page.getByLabel('Edited output position', { exact: true });
    await slider.evaluate(el => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '0');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    console.log('Native transport paused and rewound.');
    const output = page.getByTestId('studio-after-video');
    await output.evaluate(v => { v.muted = true; });
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v && v.paused && v.currentTime < .1 && v.readyState >= 3;
    }, undefined, { timeout: 20000 });
    await page.bringToFront();
    const backdropDiagnostic = process.env.STUDIO_QA_DIAGNOSTIC_BACKDROP === '1';
    if (backdropDiagnostic) {
      // Isolate editor chrome only. This temporary style is a diagnostic,
      // never qualifying model output, canonical edits or a product fix.
      await page.locator('.viral-studio-overlay').evaluate(el => {
        el.style.backdropFilter = 'none'; el.style.background = '#020617';
      });
    }
    const geometry = await output.evaluate(v => {
      const canvas = document.querySelector('[data-testid="studio-program-canvas"]');
      const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      return { video: rect(v), canvas: rect(canvas), viewport: { width: innerWidth, height: innerHeight },
        hidden: document.hidden, sourceDuration: v.duration, timelineVisible: !!document.querySelector('[data-testid="studio-pro-timeline"]') };
    });
    console.log('Monitor geometry:', JSON.stringify(geometry));
    const chrome = await page.locator('.viral-studio-overlay').evaluate(el => {
      const s = getComputedStyle(el);
      return { backdropFilter: s.backdropFilter, backgroundColour: s.backgroundColor, backgroundImage: s.backgroundImage };
    });
    if (process.env.STUDIO_QA_EXPECT_NO_BACKDROP === '1') {
      assert(!backdropDiagnostic, 'A temporary style cannot qualify the source fix');
      assert.equal(chrome.backdropFilter, 'none', 'Effective cascade still enables full-screen backdrop blur');
      assert(!chrome.backgroundColour.startsWith('rgba('), 'Workspace must be opaque');
    }
    await page.getByTestId('viral-studio-workspace').screenshot({ path: path.join(folder, name, `${resultName}.studio.png`) });
    const traced = process.env.STUDIO_QA_TRACE === '1';
    let traceComplete;
    if (traced) {
      traceComplete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,cc,gpu', transferMode: 'ReturnAsStream' });
    }
    await cdp.send('Performance.enable');
    const metricsBefore = await cdp.send('Performance.getMetrics');
    await output.evaluate(v => {
      const frames = [], events = [], longTasks = [];
      const quality = () => {
        const q = v.getVideoPlaybackQuality();
        return { totalVideoFrames: q.totalVideoFrames, droppedVideoFrames: q.droppedVideoFrames };
      };
      const qualityBefore = quality();
      let start = null, callback, observer;
      const listeners = new Map();
      const record = event => {
        const now = performance.now();
        if (event.type === 'playing' && start === null) start = now;
        events.push({ type: event.type, wallMs: now, mediaTime: v.currentTime });
      };
      for (const type of ['playing', 'waiting', 'stalled', 'pause', 'ended', 'ratechange']) {
        listeners.set(type, record); v.addEventListener(type, record);
      }
      const frame = (now, info) => {
        if (start !== null) frames.push({ wallMs: now, mediaTime: info.mediaTime, presentedFrames: info.presentedFrames });
        callback = v.requestVideoFrameCallback(frame);
      };
      callback = v.requestVideoFrameCallback(frame);
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration }))));
        observer.observe({ type: 'longtask' });
      }
      window.__studioPlaybackObservation = () => {
        const end = performance.now(), qualityAfter = quality();
        v.cancelVideoFrameCallback(callback); observer?.disconnect();
        for (const [type, listener] of listeners) v.removeEventListener(type, listener);
        return { start, end, frames, events, longTasks, qualityBefore, qualityAfter,
          duration: v.duration, mediaTime: v.currentTime, ended: v.ended, playbackRate: v.playbackRate };
      };
    });
    await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v && !v.paused && v.currentTime > 0 && v.currentTime < 2;
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.ended,
      undefined, { timeout: 60000 });
    const observation = await page.evaluate(() => { const result = window.__studioPlaybackObservation(); delete window.__studioPlaybackObservation; return result; });
    const metricsAfter = await cdp.send('Performance.getMetrics');
    const metricDelta = Object.fromEntries(metricsAfter.metrics.filter(m => /Duration$|Count$/.test(m.name)).map(m =>
      [m.name, m.value - (metricsBefore.metrics.find(x => x.name === m.name)?.value || 0)]));
    if (traced) {
      await cdp.send('Tracing.end');
      const { stream } = await traceComplete;
      const traceFile = path.join(folder, name, `${resultName}.trace.private.json`);
      const fd = fs.openSync(traceFile, 'w', 0o600);
      try {
        let chunk;
        do { chunk = await cdp.send('IO.read', { handle: stream }); fs.writeSync(fd, chunk.base64Encoded ? Buffer.from(chunk.data, 'base64') : chunk.data); } while (!chunk.eof);
      } finally { fs.closeSync(fd); await cdp.send('IO.close', { handle: stream }); }
    }
    const endedAt = observation.events.find(e => e.type === 'ended' && e.wallMs > observation.start)?.wallMs;
    assert(observation.ended && observation.start !== null && endedAt);
    const wallSeconds = (endedAt - observation.start) / 1000;
    assert(wallSeconds > observation.duration * .9 && wallSeconds < 60, 'Invalid playback interval');
    const gaps = observation.frames.slice(1).map((f, i) => f.wallMs - observation.frames[i].wallMs).sort((a, b) => a - b);
    const after = (await h.records(page)).find(p => p.id === receipt.projectId);
    assert.equal(hash(after.snapshot.studioDocument), receipt.projectHash);
    const result = {
      createdAt: new Date().toISOString(), projectId: before.id, canonicalHash: receipt.projectHash,
      outputSha256: receipt.outputSha256, browserVersion: version.product,
      appAddress,
      geometry, chrome, metricDelta, diagnosticTraceEnabled: traced, backdropDiagnostic,
      monitor: await output.evaluate(v => {
        const style = getComputedStyle(v), canvas = document.querySelector('[data-testid="studio-program-canvas"]');
        return { display: style.display, visibility: style.visibility, opacity: style.opacity,
          canvasDisplay: getComputedStyle(canvas).display };
      }),
      scope: 'Native finished-file After playback in headless Chrome, muted; predictive editing preview and listening quality not qualified',
      screencastEnabled: false, noMocks: true, wallSeconds, mediaSeconds: observation.duration,
      observedFrameCallbacks: observation.frames.length, observedCallbacksPerSecond: observation.frames.length / wallSeconds,
      decodedFrames: observation.qualityAfter.totalVideoFrames - observation.qualityBefore.totalVideoFrames,
      droppedFrames: observation.qualityAfter.droppedVideoFrames - observation.qualityBefore.droppedVideoFrames,
      waitingEvents: observation.events.filter(e => e.type === 'waiting').length,
      stalledEvents: observation.events.filter(e => e.type === 'stalled').length,
      frameGapP95Ms: gaps[Math.floor(gaps.length * .95)], maxFrameGapMs: gaps.at(-1),
      playbackRate: observation.playbackRate, observation,
    };
    fs.writeFileSync(path.join(folder, name, `${resultName}.json`), JSON.stringify(result, null, 2));
    const { observation: _, ...summary } = result;
    console.log(JSON.stringify(summary, null, 2));
    if (process.env.STUDIO_QA_RECORD === '1') {
      await require('./materials-editing-proof').view(page, name);
    }
  } finally { await context.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
