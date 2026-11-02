// Observe the existing editable Studio project without changing its decisions.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const episode = path.join(root, 'reports/studio-folded-space-20261101/flowing-ribbon/episode');
const out = path.resolve(process.argv[3]);
assert(out.startsWith(path.join(root, 'reports/')) && !fs.existsSync(out));
fs.mkdirSync(out, { recursive: true });
Object.assign(process.env, { STUDIO_MOTION_VARIANT: 'episode', STUDIO_MOTION_PROOF_DIR: episode,
  STUDIO_MOTION_PROOF_TITLE: 'AutoPromote — Flowing worlds / Episode' });
const native = require('./motion-flow-proof.cjs');
const qa = require('../../test/e2e/playwright/studio-stability/run');
const {recording}=require('./kinetic-type-proof');
const capture=process.env.STUDIO_QA_CAPTURE==='true';
const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value), { mode: 0o600 });
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 },
    storageState: path.join(episode, 'session.private.json') });
  await context.route('**/*', r => {
    const u = new URL(r.request().url());
    return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['blob:', 'data:'].includes(u.protocol) ? r.continue() : r.abort();
  });
  const p = await context.newPage(); p.setDefaultTimeout(45000);
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  try {
    await native.entry(p); await native.open(p);
    await qa.tool(p, 'Export');
    const live = p.getByRole('button', { name: 'Show Live Edit', exact: true });
    if (await live.isVisible()) await live.click();
    await p.waitForFunction(() => !document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output') && document.querySelector('[data-testid="studio-program-canvas"]'));
    await p.getByTestId('studio-mode-fxflow').click();
    await p.getByTestId('dock-tab-timeline').click(); await native.seek(p, 0);
    console.log('Native editable programme opened; measuring live playback.');
    await p.evaluate(() => {
      const start = performance.now(), events = [], samples = [], longTasks = [];
      const read = () => ({ ms: performance.now() - start,
        programme: Number(document.querySelector('[data-testid="studio-program-canvas"]')?.dataset.programmeTime),
        videos: [...document.querySelectorAll('[data-testid="studio-after-video"],[data-testid="studio-next-video"],[data-testid="studio-later-video"]')].map(v => ({
          slot: v.dataset.testid, source: new URL(v.currentSrc || v.src, location.href).pathname,
          time: v.currentTime, paused: v.paused, seeking: v.seeking, ready: v.readyState,
          ended: v.ended, rate: v.playbackRate, decoded: v.getVideoPlaybackQuality().totalVideoFrames,
          dropped: v.getVideoPlaybackQuality().droppedVideoFrames,
          audioGraph:!!v.__audioRemixGraph,audioContextState:v.__audioRemixGraph?.context?.state })) });
      const videos = [...document.querySelectorAll('video')];
      const handlers = videos.flatMap(v => ['play','playing','pause','waiting','stalled','seeking','seeked','ended','emptied','loadeddata','canplay'].map(type => {
        const handler = () => events.push({ ...read(), event: type, video: v.dataset.testid || v.dataset.studioOverlayDecoder || 'other' });
        v.addEventListener(type, handler); return () => v.removeEventListener(type, handler);
      }));
      const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => ({ms:e.startTime-start,duration:e.duration}))));
      observer.observe({ type: 'longtask', buffered: false });
      const timer = setInterval(() => samples.push(read()), 500);
      window.__previewProfile = () => { clearInterval(timer); observer.disconnect(); handlers.forEach(f => f()); return { events, samples, longTasks, terminal: read() }; };
    });
    const cdp = await context.newCDPSession(p);
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 5000 });
    await cdp.send('Profiler.start');
    const stopRecording=capture?await recording(p,out):null;
    const began = Date.now(); await p.getByRole('button', { name: 'Play edited preview', exact: true }).click();
    let complete = false, failure;
    try { await p.waitForFunction(() => Number(document.querySelector('[data-testid="studio-program-canvas"]')?.dataset.programmeTime) >= 35.95, null, { timeout: 240000 }); complete = true; }
    catch (e) { failure = e.message; }
    const elapsedMs = Date.now() - began;
    write('cpu-profile.private.json', (await cdp.send('Profiler.stop')).profile);
    write('playback.json', { complete, elapsedMs, failure, errors, ...await p.evaluate(() => window.__previewProfile()) });
    if(complete && process.env.STUDIO_QA_CHECK_END==='true'){
      await p.waitForTimeout(1500);
      const held=await p.evaluate(()=>{const v=document.querySelector('[data-testid="studio-after-video"]'),c=document.querySelector('[data-testid="studio-program-canvas"]');return{
        programme:Number(c?.dataset.programmeTime),sourceTime:v?.currentTime,paused:v?.paused,
        playAvailable:[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')==='Play edited preview'),
        live:!document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output')}});
      write('terminal-hold.json',held);assert(held.live&&held.paused&&held.playAvailable&&held.programme>35.9&&held.sourceTime>11.9,'The last source frame must remain held without restarting');
    }
    await native.pause(p);
    await p.getByTestId('hook-preview-frame').screenshot({ path: path.join(out, 'terminal.png') });
    if(stopRecording)await stopRecording();
    assert(complete, failure); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ complete, elapsedMs, report: path.relative(root, out) }));
  } finally { await context.close(); await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
