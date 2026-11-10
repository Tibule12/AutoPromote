// Record the entire actual four-minute native review playback; no new render.
// The imported review has flattened masks. This is an honest transport check.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { clickStudioControl } = require('../../test/e2e/playwright/studio-timeline-layout');
async function main() {
  const directory = path.resolve(process.argv[2]);
  const native = path.resolve(process.argv[3]); const output = path.resolve(process.argv[4]); fs.mkdirSync(output, { recursive: true });
  const expectedDuration = Number(process.env.STUDIO_REVIEW_EXPECTED_SECONDS || 240);
  const captureRate = Number(process.env.STUDIO_REVIEW_CAPTURE_FPS || 12);
  const exportFile=path.join(native,process.env.STUDIO_REVIEW_EXPORT_FILE || 'Four-minute native export.mp4');
  assert(Number.isFinite(expectedDuration) && expectedDuration > 0 && expectedDuration <= 240);
  assert(Number.isFinite(captureRate) && captureRate >= 12 && captureRate <= 24);
  const config = JSON.parse(fs.readFileSync(path.join(directory, 'browser-private.json')));
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 },
    storageState: path.join(native, 'native-state.json') });
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    return u.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('dialog', d => d.accept());
  // A recording must not silently create a new billable or local execution.
  await page.route('**/api/media/process', route => route.abort());
  try {
    await page.goto(config.origin);
    await page.waitForTimeout(1500);
    const signIn=page.getByRole('button',{name:'Sign In',exact:true});
    if(await signIn.isVisible()){
      await signIn.click();
      await page.locator('#login-email').fill(config.email);
      await page.locator('#login-password').fill(config.password);
      await page.locator('form input[type=checkbox]').check();
      await page.locator('form button[type=submit]').click();
    }
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).first().click();
    await page.getByRole('button', { name: process.env.STUDIO_REVIEW_PROJECT_NAME || 'Four-minute background replacement review', exact: true }).click();
    await clickStudioControl(page, page.getByRole('button', { name: 'Export', exact: true }));
    await page.getByTestId('rendered-output-ready').waitFor({ timeout: 60000 });
    const show = page.getByRole('button', { name: 'Show Finished Video', exact: true });
    if (await show.isVisible()) await show.click();
    const timeline = page.getByTestId('studio-pro-timeline');
    await timeline.getByRole('button', { name: 'Fit entire timeline', exact: true }).click();
    const separator = page.getByRole('separator', { name: 'Resize timeline' });
    await separator.focus();
    for (let i = 0; i < 7; i++) await separator.press('ArrowUp');
    const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
    if (await pause.isVisible()) await pause.click();
    const video = page.getByTestId('studio-after-video');
    const response = await context.request.get(await video.getAttribute('src')); assert(response.ok());
    const hash = b => require('crypto').createHash('sha256').update(b).digest('hex');
    assert.equal(hash(await response.body()), hash(fs.readFileSync(exportFile)));
    await page.getByLabel('Edited output position', { exact: true }).evaluate(e => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '0');
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v && !v.seeking && v.readyState >= 3;
    });
    if (await pause.isVisible()) await pause.click();
    await video.evaluate(v => { v.muted = true; window.__backgroundFrameClock = [];
      const tick = (_, m) => { if (!v.paused) window.__backgroundFrameClock.push({ mediaTime: m.mediaTime,
        expectedEpoch: (performance.timeOrigin + m.expectedDisplayTime) / 1000 });
        if (!v.ended) v.requestVideoFrameCallback(tick); }; v.requestVideoFrameCallback(tick);
    });
    await page.screenshot({ path: path.join(output, 'editable-timeline.png') });
    await page.bringToFront(); // Activate only this headless QA tab for painting.
    const frames = path.join(output, 'capture-frames'); fs.mkdirSync(frames, { recursive: true });
    const cdp = await context.newCDPSession(page); const captured = []; let bytes = 0; let lastCapture = -Infinity;
    cdp.on('Page.screencastFrame', event => {
      if (event.metadata.timestamp - lastCapture < 1/captureRate) { void cdp.send('Page.screencastFrameAck', {sessionId:event.sessionId}); return; }
      lastCapture = event.metadata.timestamp;
      const file = path.join(frames, `${String(captured.length).padStart(6, '0')}.jpg`);
      const data = Buffer.from(event.data, 'base64'); bytes += data.length;
      assert(bytes < 512 * 1024 * 1024); fs.writeFileSync(file, data);
      captured.push({ file, time: event.metadata.timestamp });
      void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: 1280,
      maxHeight: 880, everyNthFrame: 1 });
    for(let attempt=0;attempt<50&&!captured.length;attempt++) await page.waitForTimeout(100);
    assert(captured.length, 'No initial paused native compositor frame');
    await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.ended,
      undefined, { timeout: Math.max(15000, expectedDuration * 3000) });
    const playback = await video.evaluate(v => ({ duration: v.duration, currentTime: v.currentTime,
      ended: v.ended, width: v.videoWidth, height: v.videoHeight, frameClock: window.__backgroundFrameClock,
      quality: { totalVideoFrames: v.getVideoPlaybackQuality().totalVideoFrames,
        droppedVideoFrames: v.getVideoPlaybackQuality().droppedVideoFrames } }));
    await cdp.send('Page.stopScreencast'); await cdp.detach();
    assert(playback.ended && Math.abs(playback.duration - expectedDuration) <= 1/24 && captured.length > 20);
    const audioOffset = playback.frameClock[0].expectedEpoch - playback.frameClock[0].mediaTime - captured[0].time;
    assert(audioOffset >= 0 && audioOffset < 3);
    const concat = path.join(frames, 'frames.ffconcat');
    fs.writeFileSync(concat, 'ffconcat version 1.0\n' + captured.map((f, i) =>
      `file '${f.file}'\noption framerate 1000\nduration ${Math.max(.001, (captured[i+1]?.time ?? f.time+.1)-f.time)}\n`).join('') +
      `file '${captured.at(-1).file}'\noption framerate 1000\n`);
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-safe', '0', '-i', concat,
      '-itsoffset', String(audioOffset), '-i', exportFile,
      '-map', '0:v:0', '-map', '1:a:0', '-vf', 'fps=24', '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', path.join(output, 'Studio - complete final playback.mp4')]);
    fs.writeFileSync(path.join(output, 'studio-playback.json'), JSON.stringify({ playback,
      nativeFinishedOutput: true, editableTimelineVisible: await timeline.isVisible(),
      exportSha256: hash(fs.readFileSync(exportFile)),
      capturedFrames: captured.length, capturedBytes: bytes, captureRateLimit: captureRate, audioOffset,
      flattenedReviewSource: process.env.STUDIO_REVIEW_MASK_BACKED!=='true', editableLongFormMasksQualified: false,
      editableShortMaskScene:process.env.STUDIO_REVIEW_MASK_BACKED==='true'&&expectedDuration<=10,
      audio: 'Exact exported soundtrack muxed at the observed native frame display epoch; QA device muted.',
      smoothnessQualified: false, creativeGate: false, noRenderSubmitted: true }, null, 2));
    console.log('COMPLETE_NATIVE_PLAYBACK', captured.length, audioOffset);
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'recording-failure.png') });
    fs.writeFileSync(path.join(output, 'recording-failure.txt'), await page.locator('body').innerText()); throw error;
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
