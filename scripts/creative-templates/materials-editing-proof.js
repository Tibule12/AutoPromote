#!/usr/bin/env node
// Normal authenticated Studio controls only. No state/auth/render injection.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const h = require('./studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const { hash } = require('../../src/creativeTemplates/contract');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const cues = {
  ember: [['1492.wav', 5.30, .5, 18], ['1143.mp3', 15.25, 1.6, 18]],
  velo: [['2918.wav', 1.82, 1.1, 22], ['788.mp3', 15.25, 1.6, 16]],
  onda: [['1093.wav', 13.22, .65, 15], ['2353.wav', 17, 1.3, 16]],
};
const music = { ember: 1147, velo: 369, onda: 872 };
async function range(input, value) {
  await input.evaluate((el, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(next));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function pause(page) {
  const pauseButton = page.getByRole('button', { name: 'Pause comparison', exact: true });
  if (await pauseButton.isVisible()) await pauseButton.click();
  await page.locator('video,audio').evaluateAll(es => es.forEach(e => { e.muted = true; e.pause(); }));
}
async function timeline(page, name) {
  await pause(page);
  const saved = await h.save(page, name);
  const baseline = hash(saved.snapshot.studioDocument);
  const separator = page.getByRole('separator', { name: 'Resize timeline' });
  await separator.focus();
  if (process.env.STUDIO_QA_TIMELINE_HEIGHT) {
    const target = Number(process.env.STUDIO_QA_TIMELINE_HEIGHT);
    assert(Number.isFinite(target) && target >= 148 && target <= 800);
    for (let i = 0; i < 40; i++) {
      const current = Number(await separator.getAttribute('aria-valuenow'));
      if (Math.abs(current - target) < 24) break;
      await separator.press(current < target ? 'ArrowUp' : 'ArrowDown');
    }
  } else for (let i = 0; i < (process.env.STUDIO_QA_ALL_SOUND_LANES === '1' ? 26 : 12); i++) await separator.press('ArrowUp');
  const view = page.getByTestId('studio-pro-timeline');
  await view.getByRole('button', { name: 'Fit entire timeline', exact: true }).click();
  // Keyboard navigation/layout changes must not alter graphics or the edit.
  const current = await h.save(page, name);
  assert.equal(hash(current.snapshot.studioDocument), baseline);
  await view.screenshot({ path: path.join(folder, `${name}-timeline.png`) });
  await page.getByTestId('viral-studio-workspace').screenshot({ path: path.join(folder, `${name}-studio.png`) });
  return current;
}
async function edit(page, name) {
  await pause(page);
  await h.rail(page);
  await page.getByLabel('Project name', { exact: true }).fill(`${name.toUpperCase()} — music and cinematic sound · 20261010`);
  await q.tool(page, 'Sound');
  await page.getByTestId('background-sound-input').setInputFiles(path.join(folder, 'materials', `mixkit-music-${music[name]}.mp3`));
  await range(page.locator('label.inspector-range').filter({ hasText: 'Background volume' }).locator('input'), 34);
  await range(page.getByLabel('Music fade in', { exact: true }), .05);
  await range(page.getByLabel('Music fade out', { exact: true }), .9);
  const duck = page.getByRole('checkbox', { name: /Duck under speech/ });
  if (await duck.isChecked()) await duck.uncheck();
  for (const [file, start, duration, volume] of cues[name]) {
    await page.getByTestId('sound-effect-input').setInputFiles(path.join(folder, 'materials', `mixkit-sfx-${file}`));
    await page.getByTestId('sound-effect-start').fill(String(start));
    await page.getByTestId('sound-effect-duration').fill(String(duration));
    await range(page.getByTestId('sound-effect-volume'), volume);
    await range(page.getByTestId('sound-effect-fade-out'), .12);
  }
  await pause(page);
  await timeline(page, name);
  console.log(`Native ${name} music replacement and two sampled SFX cues saved.`);
}
async function cold(page, name) {
  const before = await h.save(page, name);
  await page.reload();
  await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
  await page.getByRole('button', { name: before.name, exact: true }).click();
  await h.rail(page);
  await pause(page);
  const after = await h.save(page, name);
  assert.equal(after.id, before.id);
  assert.equal(hash(after.snapshot.studioDocument), hash(before.snapshot.studioDocument));
  fs.writeFileSync(path.join(folder, `${name}-recovery.json`), JSON.stringify({
    createdAt: new Date().toISOString(), projectId: after.id, canonicalHash: hash(after.snapshot.studioDocument),
    nativeColdReopen: true, clips: after.snapshot.timeline.length,
    graphics: after.snapshot.overlays.length, soundCues: after.snapshot.soundEffects.length,
    templateRef: after.snapshot.creativeTemplateInstance.templateRef, noMocks: true,
  }, null, 2));
  console.log(`Native ${name} cold reopen retained the exact project.`);
}
async function navigation(page, name) {
  await pause(page);
  const before = await h.save(page, name);
  const canonicalHash = hash(before.snapshot.studioDocument);
  for (const time of [.25, 2.75, 6.25, 12.75, 18.75]) {
    await range(page.getByLabel('Edited output position', { exact: true }), time);
    await page.waitForTimeout(350);
    await pause(page);
    const after = await h.save(page, name);
    assert.equal(hash(after.snapshot.studioDocument), canonicalHash, `Navigation at ${time}s changed the edit`);
  }
  fs.writeFileSync(path.join(folder, `${name}-navigation.json`), JSON.stringify({
    projectId: before.id, canonicalHash, mappedTimes: [.25, 2.75, 6.25, 12.75, 18.75],
    nativeNavigationPreservesEdit: true, noMocks: true,
  }, null, 2));
  console.log(`Native ${name} navigation across five cuts preserved the edit.`);
}
async function view(page, name) {
  await q.tool(page, 'Export');
  const ready = page.getByTestId('rendered-output-ready');
  await ready.waitFor({ timeout: 90000 });
  const showFinished = page.getByRole('button', { name: 'Show Finished Video', exact: true });
  if (await showFinished.isVisible()) await showFinished.click();
  console.log('Owned finished render ready; preparing native timeline recording.');
  await timeline(page, name);
  const before = await h.save(page, name);
  const renderReceipt = JSON.parse(fs.readFileSync(path.join(folder, name, 'render-receipt.json')));
  assert.equal(hash(before.snapshot.studioDocument), renderReceipt.projectHash,
    'The visible edit differs from the finished movie');
  if (process.env.STUDIO_QA_HIDE_MEDIA === '1') {
    const hideMedia = page.getByRole('button', { name: 'Hide media', exact: true });
    if (await hideMedia.isVisible()) await hideMedia.click();
  }
  const finalMovie = path.join(folder, name, 'final.mp4');
  assert.equal(hash(fs.readFileSync(finalMovie)), renderReceipt.outputSha256);
  const verifiedMovie = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'format=duration:stream=duration,r_frame_rate', '-of', 'json', finalMovie], { encoding: 'utf8' }));
  // HTMLMediaElement.duration includes the container's audio tail. Retimed
  // picture can end before that tail by its declared one-frame rounding.
  const expectedMovieDuration = Number(verifiedMovie.format.duration);
  const pictureDuration = Number(verifiedMovie.streams[0].duration);
  const [pictureRateNumerator, pictureRateDenominator] = verifiedMovie.streams[0].r_frame_rate.split('/').map(Number);
  assert(Math.abs(expectedMovieDuration - pictureDuration) <= pictureRateDenominator / pictureRateNumerator,
    'Container/picture clocks exceed the existing one-output-frame boundary');
  const output = page.getByTestId('studio-after-video');
  // Activate only this already-verified headless tab. Background tabs throttle
  // screencast painting and cannot provide a useful moving timeline recording.
  await page.bringToFront();
  const pauseButton = page.getByRole('button', { name: 'Pause comparison', exact: true });
  if (!await pauseButton.isVisible()) await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
  await pauseButton.click();
  await range(page.getByLabel('Edited output position', { exact: true }), 0);
  // Seeking can finish after the preceding pause request. Clear any retained
  // play intent through the native control after the seek has settled.
  try {
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v && !v.seeking && v.readyState >= 3;
    }, undefined, { timeout: 15000 });
  } catch (error) {
    const decoder = await output.evaluate(v => ({ time: v.currentTime, paused: v.paused,
      seeking: v.seeking, readyState: v.readyState, networkState: v.networkState,
      errorCode: v.error?.code || null, duration: Number.isFinite(v.duration) ? v.duration : null,
      buffered: Array.from({ length: v.buffered.length }, (_, i) => [v.buffered.start(i), v.buffered.end(i)]),
      renderedOutputVisible: document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output'),
    }));
    fs.writeFileSync(path.join(folder, name, 'studio-playback-startup-failure.json'), JSON.stringify({
      at: new Date().toISOString(), decoder, projectId: before.id,
      canonicalHash: renderReceipt.projectHash, outputSha256: renderReceipt.outputSha256, noResubmission: true,
    }, null, 2));
    throw error;
  }
  if (await pauseButton.isVisible()) await pauseButton.click();
  await output.evaluate(v => { v.muted = true; });
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="studio-after-video"]');
    return v && v.paused && v.currentTime < .1 && v.readyState >= 3;
  });
  const decodedBefore = await output.evaluate(v => v.getVideoPlaybackQuality().totalVideoFrames);
  // Retain the actual decoder/transport state when a recording stalls. A
  // timeout and a frozen screenshot cannot distinguish waiting from pause,
  // source replacement or a media error. Observe without changing playback.
  await output.evaluate(v => {
    const initialSource = v.currentSrc;
    const observations = [];
    const frameClock = [];
    let frameCallback = 0;
    const observeFrame = (_now, metadata) => {
      if (!v.paused && !v.ended) frameClock.push({
        mediaTime: metadata.mediaTime,
        expectedDisplayEpoch: (performance.timeOrigin + metadata.expectedDisplayTime) / 1000,
        presentedFrames: metadata.presentedFrames,
      });
      frameCallback = v.requestVideoFrameCallback(observeFrame);
    };
    if (v.requestVideoFrameCallback) frameCallback = v.requestVideoFrameCallback(observeFrame);
    const observe = type => {
      const quality = v.getVideoPlaybackQuality();
      observations.push({ type, wallMs: performance.now(), time: v.currentTime,
        paused: v.paused, ended: v.ended, seeking: v.seeking,
        readyState: v.readyState, networkState: v.networkState,
        errorCode: v.error?.code || null,
        sourceChanged: v.currentSrc !== initialSource,
        isActiveDecoder: v.dataset.testid === 'studio-after-video',
        renderedOutputVisible: document.querySelector('[data-testid="hook-preview-frame"]')
          ?.classList.contains('has-rendered-output'),
        programmeTime: Number(document.querySelector('[aria-label="Edited output position"]')?.value || 0),
        playbackRate: v.playbackRate,
        totalFrames: quality.totalVideoFrames, droppedFrames: quality.droppedVideoFrames,
        buffered: Array.from({ length: v.buffered.length }, (_, i) =>
          [v.buffered.start(i), v.buffered.end(i)]),
      });
      if (observations.length > 300) observations.shift();
    };
    const events = ['playing', 'waiting', 'stalled', 'pause', 'ended', 'seeking',
      'seeked', 'emptied', 'error', 'loadedmetadata'];
    const listeners = events.map(type => { const listener = () => observe(type);
      v.addEventListener(type, listener); return [type, listener]; });
    observe('initial');
    const timer = setInterval(() => observe('clock'), 250);
    window.__stopNativeStudioRecordingObservation = () => {
      clearInterval(timer);
      listeners.forEach(([type, listener]) => v.removeEventListener(type, listener));
      if (frameCallback) v.cancelVideoFrameCallback(frameCallback);
      window.__nativeStudioRecordedFrameClock = frameClock;
      observe('final');
      delete window.__stopNativeStudioRecordingObservation;
      return observations;
    };
  });
  const storage = require('./proof-storage');
  const captureGeometry = await output.evaluate(v => {
    const rect = e => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x:r.x, y:r.y, width:r.width, height:r.height };
    };
    return { viewport:{ width:innerWidth, height:innerHeight }, video:rect(v),
      frame:rect(document.querySelector('[data-testid="hook-preview-frame"]')),
      timeline:rect(document.querySelector('[data-testid="studio-pro-timeline"]')),
      workspace:rect(document.querySelector('[data-testid="viral-studio-workspace"]')),
      source:{ width:v.videoWidth, height:v.videoHeight },
      objectFit:getComputedStyle(v).objectFit };
  });
  const scratch = storage.recordingScratch(folder, name);
  const frames = scratch.frames;
  const cdp = await page.context().newCDPSession(page);
  const recorded = [];
  let captureBytes = 0, captureStorageFailure = null;
  let firstFrameReady;
  const firstFrame = new Promise(resolve => { firstFrameReady = resolve; });
  cdp.on('Page.screencastFrame', event => {
    const bytes = Buffer.from(event.data, 'base64');
    if (captureStorageFailure || captureBytes + bytes.length > storage.MAX_CAPTURE_BYTES) {
      captureStorageFailure = 'Studio recording exceeded the 256 MiB scratch limit';
      void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
      return;
    }
    const file = path.join(frames, `${String(recorded.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, bytes);
    captureBytes += bytes.length;
    const compositorEpoch = Number(event.metadata?.timestamp);
    assert(Number.isFinite(compositorEpoch) && compositorEpoch > 1e9,
      'Native capture needs its actual compositor epoch timestamp');
    recorded.push({ file, time: compositorEpoch, receivedAt: Date.now() / 1000 });
    if (recorded.length === 1) firstFrameReady();
    void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: 1600,
    maxHeight: page.viewportSize()?.height || 1000, everyNthFrame: 1 });
  let captureTimer;
  try {
    await Promise.race([firstFrame, new Promise((_, reject) => {
      captureTimer = setTimeout(() => reject(new Error('No initial paused Studio capture')), 5000);
    })]);
  } finally { clearTimeout(captureTimer); }
  const playing = output.evaluate(v => new Promise(resolve =>
    v.addEventListener('playing', () => resolve(Date.now() / 1000), { once: true })));
  await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
  let playingTimer, playingAt;
  try {
    playingAt = await Promise.race([playing, new Promise((_, reject) => {
      playingTimer = setTimeout(() => reject(new Error('Native decoder did not begin playing')), 15000);
    })]);
  } finally { clearTimeout(playingTimer); }
  console.log('Native decoder playing; observing complete movie.');
  let audioTrackReveal = null;
  try {
    if (process.env.STUDIO_QA_SHOW_AUDIO_TRACKS === '1') {
      // Use the ordinary inspector/scrolling to reveal the lower sound lanes
      // during the same complete movie; do not alter project decisions.
      await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.currentTime >= 7,
        undefined, { timeout: 60000 });
      await q.tool(page, 'Sound');
      await page.getByTestId('pro-track-row-sfx').scrollIntoViewIfNeeded();
      await page.getByTestId('viral-studio-workspace').screenshot({
        path: path.join(folder, name, 'native-music-sfx-timeline.png')
      });
      audioTrackReveal = { nativeSoundInspector: true, sfxLaneVisible: true,
        atOutputSeconds: await output.evaluate(video => video.currentTime) };
    }
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.ended,
      undefined, { timeout: Math.ceil(expectedMovieDuration * 1000) + 15000 });
  } catch (error) {
    const observations = await page.evaluate(() => window.__stopNativeStudioRecordingObservation());
    await cdp.send('Page.stopScreencast');
    await cdp.detach();
    fs.writeFileSync(path.join(folder, name, 'studio-playback-failure.json'), JSON.stringify({
      at: new Date().toISOString(), projectId: before.id,
      canonicalHash: renderReceipt.projectHash, outputSha256: renderReceipt.outputSha256,
      completedJobId: renderReceipt.submittedJobId, observations,
      recordedFrames: recorded.length, noResubmission: true,
      scope: 'Actual native decoder/transport observation. This failed recording is not a completed Studio delivery.',
    }, null, 2));
    throw error;
  }
  const observations = await page.evaluate(() => window.__stopNativeStudioRecordingObservation());
  const frameClock = await page.evaluate(() => {
    const result = window.__nativeStudioRecordedFrameClock;
    delete window.__nativeStudioRecordedFrameClock;
    return result;
  });
  fs.writeFileSync(path.join(folder, name, 'studio-transport-observation.json'),
    JSON.stringify(observations, null, 2));
  await cdp.send('Page.stopScreencast');
  const playback = await output.evaluate(v => ({ duration: v.duration, time: v.currentTime,
    ended: v.ended, width: v.videoWidth, height: v.videoHeight, playbackRate: v.playbackRate,
    decodedFrames: v.getVideoPlaybackQuality().totalVideoFrames }));
  await cdp.detach();
  assert(!captureStorageFailure, captureStorageFailure);
  fs.writeFileSync(path.join(folder, name, 'studio-playback-observation.json'), JSON.stringify({
    playback, recordedFrames: recorded.length, playingAt, decodedBefore,
  }, null, 2));
  assert(playback.ended && Math.abs(playback.duration - expectedMovieDuration) < .000001 && recorded.length > 20,
    `Incomplete native recording: ${recorded.length} painted frames`);
  assert(observations.every(row => row.playbackRate === 1),
    'Native completed movie must not receive its authored speed ramp a second time');
  const concat = path.join(frames, 'frames.ffconcat');
  fs.writeFileSync(concat, 'ffconcat version 1.0\n' + recorded.map((f, i) =>
    `file '${f.file}'\noption framerate 1000\nduration ${Math.max(.001, (recorded[i + 1]?.time ?? f.time + .1) - f.time)}\n`).join('') + `file '${recorded.at(-1).file}'\noption framerate 1000\n`);
  const recording = path.join(folder, name, 'edited-in-studio.mp4');
  if (fs.existsSync(recording)) {
    fs.renameSync(recording, path.join(folder, name, `previous-studio-recording-${hash(fs.readFileSync(recording))}.mp4`));
  }
  assert(frameClock?.length, 'Observe actual native frame presentation before muxing its score');
  const programmeZeroEpoch = frameClock[0].expectedDisplayEpoch - frameClock[0].mediaTime;
  const audioOffset = programmeZeroEpoch - recorded[0].time;
  assert(audioOffset >= 0 && audioOffset < 2, 'Native recording programme offset is out of bounds');
  fs.writeFileSync(path.join(folder, name, 'studio-recording-clock.json'), JSON.stringify({
    clock: 'Native requestVideoFrameCallback expected display epoch and CDP compositor epoch',
    imageDemuxTimebase: '1/1000', playingEventEpoch: playingAt, programmeZeroEpoch,
    firstCompositorEpoch: recorded[0].time, audioOffset,
    frames: recorded.map(({ time, receivedAt }) => ({ compositorEpoch: time, receivedAt })),
    nativeFrames: frameClock, fittedImageAlignment: false,
  }, null, 2));
  assert.equal(hash(fs.readFileSync(finalMovie)), renderReceipt.outputSha256);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=r_frame_rate', '-of', 'json', finalMovie], { encoding: 'utf8' }));
  const [fpsNumerator, fpsDenominator] = probe.streams[0].r_frame_rate.split('/').map(Number);
  const movieFps = fpsNumerator / fpsDenominator;
  const captureSeconds = recorded.at(-1).time - recorded[0].time;
  const screenFramesPerSecond = (recorded.length - 1) / captureSeconds;
  const sparseCapture = screenFramesPerSecond < movieFps * .9;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-safe', '0', '-i', concat,
    '-itsoffset', String(audioOffset), '-i', finalMovie, '-map', '0:v:0', '-map', '1:a:0',
    '-vf', `fps=${movieFps},scale=1600:-2`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '24',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', recording]);
  const recordingScratch = storage.finishRecordingScratch(scratch, recording);
  const after = await h.save(page, name);
  assert.equal(hash(after.snapshot.studioDocument), hash(before.snapshot.studioDocument));
  const playbackFile = path.join(folder, name, 'studio-playback.json');
  if (fs.existsSync(playbackFile)) fs.renameSync(playbackFile,
    path.join(folder, name, `previous-studio-playback-${Date.now()}.json`));
  fs.writeFileSync(playbackFile, JSON.stringify({
    createdAt: new Date().toISOString(), playback, canonicalHash: hash(after.snapshot.studioDocument),
    nativeFinishedOutput: true, timelineVisible: true, audioTrackReveal, recording, screencastFrames: recorded.length,
    recordingScratch, captureGeometry,
    recordingCapture: { captureSeconds, screenFramesPerSecond, movieFps,
      encodedScreenRecordingFps: movieFps, sparseCapture,
      smoothPlaybackEvidence: false,
      limitation: 'Screen capture cadence and encoding are separate from native movie playback; use playback-performance.js without screencasting to measure the latter' },
    recordingAudio: 'Soundtrack muxed from the exact hash-verified export at the observed native playback-start offset; QA browser muted',
    audioOffset, decodedFramesThisPlayback: playback.decodedFrames - decodedBefore,
    recordingClock: path.join(folder, name, 'studio-recording-clock.json'),
    projectId: before.id, outputSha256: renderReceipt.outputSha256,
    submittedJobId: renderReceipt.submittedJobId, templateRef: renderReceipt.templateRef,
    listeningReview: 'pending founder review', noMocks: true,
  }, null, 2));
  if (sparseCapture) console.warn(`Sparse ${name} screen capture: ${screenFramesPerSecond.toFixed(2)} fps for a ${movieFps} fps movie; recording does not establish playback smoothness.`);
  console.log(`Full ${name} movie played in Studio with its editable timeline; screen recording retained.`);
}
async function main() {
  const [action, name = 'ember'] = process.argv.slice(2);
  const browser = await chromium.connectOverCDP(process.env.STUDIO_QA_CDP_URL || 'http://127.0.0.1:9233');
  try {
    const cdp = await browser.newBrowserCDPSession();
    assert((await cdp.send('Browser.getVersion')).userAgent.includes('HeadlessChrome'));
    const marker = process.env.STUDIO_TEMPLATE_SESSION || 'studioTemplateSession=materials';
    let page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes(marker));
    if (action === 'create') {
      assert(name !== 'ember');
      assert(!page, 'Use a fresh native tab for a new brand instance');
      page = await browser.contexts()[0].newPage();
      await page.goto(`http://localhost:5000/?${marker}`);
      await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
      await page.getByRole('button', { name: 'EMBER — music and cinematic sound · 20261010', exact: true }).click();
      await h.rail(page);
      await pause(page);
      await h.apply(page, name);
      await edit(page, name);
      return;
    }
    assert(page && !await page.evaluate(() => !!window.__E2E_BYPASS));
    page.setDefaultTimeout(30000);
    if (action === 'edit') await edit(page, name);
    else if (action === 'cold') await cold(page, name);
    else if (action === 'timeline') await timeline(page, name);
    else if (action === 'navigation') await navigation(page, name);
    else if (action === 'view') await view(page, name);
    else throw new Error('Unknown action');
  } finally { await browser.close(); }
}
if (require.main === module) main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
module.exports = { view };
