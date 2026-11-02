#!/usr/bin/env node
// Observe the actual owned source decoders without audio taps/screen recording.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const h = require('./studio-proof');
async function main() {
  const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
  const state = process.env.STUDIO_QA_STORAGE_STATE || '/home/tibule12/.local/share/autopromote-qa/session/studio-cycling-sfx-envelope-source.private.json';
  const name = process.env.STUDIO_QA_PROJECT_NAME || 'VELO — SFX envelope · 20261011';
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: state, viewport: { width: 1600, height: 1000 } });
  await context.addInitScript(() => {
    const operations = []; window.__sourcePreparationOperations = operations;
    const longTasks = []; window.__sourceLongTasks = longTasks;
    new PerformanceObserver(list => list.getEntries().forEach(entry => {
      longTasks.push({ startMs: entry.startTime, durationMs: entry.duration });
    })).observe({ type: 'longtask', buffered: true });
    const clock = () => performance.now();
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { ...descriptor,
      set(value) {
        if (/studio-(after|next|later)-video|background-sound-preview/.test(this.dataset.testid || '')) {
          operations.push({ type: 'seek-assignment', role: this.dataset.testid,
            wallMs: clock(), from: descriptor.get.call(this), to: value,
            seeking: this.seeking, readyState: this.readyState,
            stack: new Error().stack?.split('\n').slice(2, 5).join('\n') });
        }
        return descriptor.set.call(this, value);
      } });
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function(bytes, ...args) {
      const row = { type: 'audio-decode', wallMs: clock(), bytes: bytes.byteLength };
      operations.push(row);
      const result = decode.call(this, bytes, ...args);
      if (result?.then) result.then(buffer => { row.finishedAt = clock(); row.duration = buffer.duration; },
        () => { row.failedAt = clock(); });
      return result;
    };
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function(...args) {
      const row = { type: 'audio-resume', wallMs: clock(), state: this.state };
      operations.push(row);
      const result = resume.apply(this, args);
      result.then(() => { row.finishedAt = clock(); row.finalState = this.state; },
        () => { row.failedAt = clock(); });
      return result;
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) {
      const row = { type: 'media-play', wallMs: clock(), role: this.dataset.testid,
        readyState: this.readyState, seeking: this.seeking };
      if (/studio-(after|next|later)-video/.test(row.role || '')) operations.push(row);
      const result = play.apply(this, args);
      result?.then(() => { row.finishedAt = clock(); }, () => { row.failedAt = clock(); });
      return result;
    };
  });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  // Chromium's own pipeline state distinguishes a network/decoder starvation
  // from a blocked React callback. Omit URLs, tokens and private source paths.
  const mediaDiagnostics = [], networkDiagnostics = [], requests = new Map();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Media.enable'); await cdp.send('Network.enable');
  const profileCpu = process.env.STUDIO_QA_CPU_PROFILE === '1';
  if (profileCpu) await cdp.send('Profiler.enable');
  for (const type of ['playerEventsAdded', 'playerErrorsAdded', 'playerMessagesAdded']) {
    cdp.on(`Media.${type}`, data => mediaDiagnostics.push({ type, ...data,
      ...(data.events ? { events: data.events.filter(event => !/https?:|token|url/i.test(event.value)) } : {}),
      ...(data.messages ? { messages: data.messages.filter(message => !/https?:|token|url/i.test(message.message)) } : {}) }));
  }
  cdp.on('Network.requestWillBeSent', data => {
    if (['Media', 'Fetch'].includes(data.type)) requests.set(data.requestId, {
      requestId: data.requestId, type: data.type, started: data.timestamp,
      range: data.request.headers.Range || data.request.headers.range || null });
  });
  cdp.on('Network.responseReceived', data => {
    const row = requests.get(data.requestId); if (!row) return;
    Object.assign(row, { responded: data.timestamp, status: data.response.status,
      mimeType: data.response.mimeType, cache: data.response.fromDiskCache,
      contentRange: data.response.headers['content-range'] || data.response.headers['Content-Range'] || null });
  });
  cdp.on('Network.loadingFinished', data => {
    const row = requests.get(data.requestId); if (!row) return;
    networkDiagnostics.push({ ...row, ended: data.timestamp, bytes: data.encodedDataLength });
    requests.delete(data.requestId);
  });
  cdp.on('Network.loadingFailed', data => {
    const row = requests.get(data.requestId); if (!row) return;
    networkDiagnostics.push({ ...row, ended: data.timestamp, failed: data.errorText });
    requests.delete(data.requestId);
  });
  let renders = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/process') renders++; });
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=source-performance');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await h.rail(page);
    await page.getByRole('button', { name: 'After', exact: true }).click();
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    assert(!await page.getByTestId('hook-preview-frame').evaluate(e => e.classList.contains('has-rendered-output')));
    const before = await h.save(page, 'source-before');
    const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
    if (await pause.isVisible()) await pause.click();
    await page.getByLabel('Edited output position', { exact: true }).evaluate(el => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '0');
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v && !v.seeking && v.readyState >= 3;
    });
    // A pending native seek can finish after the first Pause. Clear retained
    // transport intent with the visible control after readiness has settled.
    if (await pause.isVisible()) await pause.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.paused);
    const unmute = page.getByRole('button', { name: 'Unmute preview audio', exact: true });
    if (await unmute.isVisible()) await unmute.click();
    await page.evaluate(({ lastId, lastEnd }) => {
      const events = [], frames = [], cleanups = [];
      let startedAt = null, endedAt = null, clickedAt = null, requestedAt = performance.now();
      const click = event => {
        if (event.target.closest('[aria-label="Play comparison"]')) clickedAt = performance.now();
      };
      document.addEventListener('click', click, true);
      cleanups.push(() => document.removeEventListener('click', click, true));
      const observe = (v, type) => {
        const quality = v.getVideoPlaybackQuality();
        const row = { type, wallMs: performance.now(), role: v.dataset.testid,
          clipId: document.querySelector('.timeline-clip-thumb.active')?.dataset.testid?.replace('timeline-clip-', ''),
          sourceTime: v.currentTime, programmeTime: Number(document.querySelector('[aria-label="Edited output position"]')?.value || 0),
          paused: v.paused, seeking: v.seeking, readyState: v.readyState, networkState: v.networkState,
          playbackRate: v.playbackRate, totalFrames: quality.totalVideoFrames, droppedFrames: quality.droppedVideoFrames,
          buffered: Array.from({ length: v.buffered.length }, (_, i) => [v.buffered.start(i), v.buffered.end(i)]) };
        if (type === 'playing' && row.role === 'studio-after-video' && startedAt === null) startedAt = row.wallMs;
        if (row.role === 'studio-after-video' && row.clipId === lastId && row.sourceTime >= lastEnd - .02 && startedAt !== null) endedAt ||= row.wallMs;
        events.push(row); return row;
      };
      for (const v of document.querySelectorAll('[data-testid="studio-after-video"], [data-testid="studio-next-video"], [data-testid="studio-later-video"]')) {
        for (const type of ['playing', 'waiting', 'stalled', 'pause', 'seeking', 'seeked', 'ended', 'progress', 'error']) {
          const listener = () => observe(v, type); v.addEventListener(type, listener);
          cleanups.push(() => v.removeEventListener(type, listener));
        }
        let frame;
        const tick = (_, metadata) => {
          if (v.dataset.testid === 'studio-after-video' && startedAt !== null && !v.paused) {
            const row = observe(v, 'frame'); row.decodedMediaTime = metadata.mediaTime;
            frames.push(row);
          }
          frame = v.requestVideoFrameCallback(tick);
        };
        frame = v.requestVideoFrameCallback(tick);
        cleanups.push(() => v.cancelVideoFrameCallback(frame));
        observe(v, 'initial');
      }
      window.__sourcePerformanceFinished = () => endedAt !== null;
      window.__stopSourcePerformance = () => {
        cleanups.forEach(cleanup => cleanup());
        return { requestedAt, clickedAt, startedAt, endedAt, events: events.filter(e => e.type !== 'frame'), frames,
          preparationOperations: window.__sourcePreparationOperations, longTasks: window.__sourceLongTasks };
      };
    }, { lastId: before.snapshot.timeline.at(-1).id, lastEnd: before.snapshot.timeline.at(-1).endRequest });
    console.log('Measuring native source playback without audio/screen capture.');
    if (profileCpu) await cdp.send('Profiler.start');
    await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
    await page.waitForFunction(() => window.__sourcePerformanceFinished(), undefined, { timeout: 60000 });
    if (profileCpu) {
      const { profile } = await cdp.send('Profiler.stop');
      const nodes = new Map(profile.nodes.map(node => [node.id, node]));
      const totals = new Map();
      for (let index = 0; index < (profile.samples || []).length; index++) {
        const id = profile.samples[index];
        totals.set(id, (totals.get(id) || 0) + (profile.timeDeltas[index] || 0));
      }
      // Script names/function locations are enough to attribute stalls. Keep
      // private request URLs, source bytes and authentication out of the report.
      const functions = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([id, us]) => {
        const frame = nodes.get(id).callFrame;
        return { function: frame.functionName, file: frame.url.split('?')[0].split('/').at(-1),
          line: frame.lineNumber, column: frame.columnNumber, milliseconds: us / 1000 };
      });
      fs.writeFileSync(path.join(folder, 'playback-cpu.json'), JSON.stringify({ functions,
        profilingEnabled: true, durationMs: (profile.endTime - profile.startTime) / 1000 }, null, 2));
    }
    const observations = await page.evaluate(() => window.__stopSourcePerformance());
    if (await pause.isVisible()) await pause.click();
    const after = await h.save(page, 'source-after');
    assert.equal(hash(after.snapshot.studioDocument), hash(before.snapshot.studioDocument));
    assert.equal(renders, 0);
    const activeWaits = observations.events.filter(e => e.type === 'waiting' && e.role === 'studio-after-video' && e.wallMs >= observations.startedAt && e.wallMs <= observations.endedAt);
    const result = { at: new Date().toISOString(), projectId: before.id, canonicalHash: hash(before.snapshot.studioDocument),
      wallSeconds: (observations.endedAt - observations.startedAt) / 1000,
      preparationBeforePlayingMs: observations.startedAt - observations.requestedAt,
      actualClickToPlayingMs: observations.clickedAt === null ? null : observations.startedAt - observations.clickedAt,
      waitingForEnabledPlayMs: observations.clickedAt === null ? null : observations.clickedAt - observations.requestedAt,
      activeWaitingEvents: activeWaits.length, waiting: activeWaits, frameCallbacks: observations.frames.length,
      observations, mediaDiagnostics, networkDiagnostics,
      pendingNetwork: [...requests.values()], noMocks: true, screenRecording: false, audioRecording: false,
      comparisonMode: 'after', decoderCount: 3,
      newRenderJobs: renders, newGpuJobs: 0, humanListening: false,
      scope: 'Actual same-edit source playback in a fresh authenticated headless browser. Per-decoder buffer/events/frame observations only; not general performance, pixel/audio parity or creative approval.' };
    fs.writeFileSync(path.join(folder, 'source-performance.json'), JSON.stringify(result, null, 2));
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), state);
    console.log(JSON.stringify({ wallSeconds: result.wallSeconds, preparationBeforePlayingMs: result.preparationBeforePlayingMs,
      actualClickToPlayingMs: result.actualClickToPlayingMs, waitingForEnabledPlayMs: result.waitingForEnabledPlayMs,
      activeWaitingEvents: result.activeWaitingEvents, frameCallbacks: result.frameCallbacks }));
  } catch (error) {
    const decoder = await page.getByTestId('studio-after-video').evaluate(v => ({
      time: v.currentTime, paused: v.paused, seeking: v.seeking, readyState: v.readyState,
      networkState: v.networkState, error: v.error?.code || null,
      buffered: Array.from({ length: v.buffered.length }, (_, i) => [v.buffered.start(i), v.buffered.end(i)]),
    })).catch(() => null);
    fs.writeFileSync(path.join(folder, 'source-startup-failure.json'), JSON.stringify({
      at: new Date().toISOString(), message: error.message, decoder, noMocks: true, qualified: false,
    }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
