// A real signed-in Studio edit. No graph injection, mocked media or publishing.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = path.join(__dirname, 'proof/reading-lesson');
const folder = path.join(base, 'tutorial');
Object.assign(process.env, {
  STUDIO_TEMPLATE_PROOF_DIR: folder, STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_EXPORT_FPS: '24', STUDIO_QA_EXPORT_RESOLUTION: 'source',
  STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright', STUDIO_QA_UPLOAD_BUDGET_MS: '300000',
  STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS: '1200000',
  STUDIO_QA_TIMELINE_HEIGHT: '430', STUDIO_QA_HIDE_MEDIA: '1',
});
const { pause, seek, range } = require('../../scripts/studio-professional/kinetic-type-proof');
Object.assign(process.env, { STUDIO_QA_EXPECTED_WIDTH: '720', STUDIO_QA_EXPECTED_HEIGHT: '1280' });
const h = require('../../scripts/creative-templates/studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const { hash } = require('../../src/creativeTemplates/contract');
const title = 'Stop rushing your text / narrated native lesson / 20261028 / r1';
const backupFile = path.join(folder, 'NARRATED-LESSON.autopromote.json');
const write = (name, data) => fs.writeFileSync(path.join(folder, name), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
async function backup(page) {
  const versions = page.getByLabel('Include saved versions in backup', { exact: true });
  if (await versions.isChecked()) await versions.uncheck();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
  await (await waiting).saveAs(backupFile);
}
async function transform(page, id, values) {
  await q.tool(page, 'Motion');
  await page.getByRole('button', { name: 'Transform keyframes', exact: true }).click();
  await page.getByLabel('Target layer', { exact: true }).selectOption(id);
  for (const [label, value] of Object.entries(values)) {
    const input = ['width', 'height', 'anchor X', 'anchor Y', 'duration', 'in point'].includes(label)
      ? page.getByLabel('Motion layer ' + label, { exact: true })
      : page.getByRole('spinbutton', { name: label, exact: true });
    await input.fill(String(value)); await input.blur();
  }
}
async function video(page, file, start, duration, sourceStart, geometry) {
  const before = await h.save(page, `before-video-${start}`);
  await seek(page, start); await q.tool(page, 'B-roll');
  await page.getByTestId('broll-video-input').setInputFiles(file);
  let newLayer;
  const deadline = Date.now() + 30000;
  while (!newLayer && Date.now() < deadline) {
    const current = await h.save(page, `loading-video-${start}`);
    newLayer = current.snapshot.overlays.find(l => l.type === 'video' && !before.snapshot.overlays.some(old => old.id === l.id));
    if (!newLayer) await page.waitForTimeout(300);
  }
  assert(newLayer, 'The new source must finish loading before editing its timing.');
  const at = page.locator('.inspector-time-grid').getByLabel('Start', { exact: true });
  await at.fill(String(start)); await at.blur();
  await page.getByLabel('B-roll duration', { exact: true }).fill(String(duration));
  await page.getByLabel('B-roll duration', { exact: true }).press('Enter');
  await range(page.getByLabel('B-roll source start', { exact: true }), sourceStart);
  await page.getByRole('button', { name: 'Picture-in-picture', exact: true }).click();
  await page.getByRole('button', { name: 'Keep original', exact: true }).click();
  const saved = await h.save(page, `video-${start}`);
  const layer = saved.snapshot.overlays.find(l => l.type === 'video' && !before.snapshot.overlays.some(old => old.id === l.id));
  assert(layer); await transform(page, layer.id, { ...geometry, duration, 'in point': start });
  console.log('Native video layer placed at', start);
  return layer.id;
}
async function poses(page, id, values) {
  for (const { time, ...fields } of values) {
    await seek(page, time); await transform(page, id, fields);
    await page.getByRole('button', { name: new RegExp('^◆ Add transform keyframe at') }).click();
    const saved = await h.save(page, `camera-${time}`);
    const actual = saved.snapshot.motionKeyframes.filter(k => k.targetId === id && k.property === 'x')
      .sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time))[0];
    assert(actual && Math.abs(actual.time - time) <= 1 / 24);
    await page.getByLabel(`Transform pose at ${actual.time.toFixed(2)} seconds easing`, { exact: true }).selectOption('hold');
    console.log('Native camera pose saved at', actual.time);
  }
}
async function prepare(page, resume = false) {
  const result = path.join(base, 'result-r4/final.mp4');
  assert(fs.existsSync(path.join(base, 'result-r4/worker-retention-receipt.json')), 'Use only the retained result of the accepted canonical native request.');
  let controls;
  if (!resume) {
  await page.locator('.viral-studio-entry-panel input[type=file][accept="video/*"]').setInputFiles(path.join(folder, 'blank-stage.mp4'));
  await page.getByRole('button', { name: 'Open Creator Studio', exact: true }).click({ timeout: 120000 });
  await h.rail(page); await pause(page);
  await page.getByLabel('Project name', { exact: true }).fill(title);
  await q.tool(page, 'Reframe');
  await page.getByTestId('reframe-aspect-9-16').click();
  const reframe = page.getByTestId('auto-reframe-toggle');
  if (await reframe.isChecked()) await reframe.uncheck();
  }
  const fullResult = { width: 66, height: 66, 'anchor X': 50, 'anchor Y': 50, X: 46, Y: 47, Scale: 1 };
  if (!resume) {
  await video(page, result, 0, 10, 0, fullResult);
  controls = await video(page, path.join(base, 'editing-in-studio.mp4'), 10, 34.8, 0,
    { width: 100, height: 38.671875, 'anchor X': 90, 'anchor Y': 50, X: 77.2, Y: 47, Scale: .78 });
  } else {
    const current = await h.save(page, 'continued');
    controls = current.snapshot.overlays.find(l => l.type === 'video' && l.startTime === 10).id;
  }
  await poses(page, controls, [
    { time: 10, X: 77.2, Y: 47, Scale: .78 },
    { time: 11.2, X: 46, Y: 59.8, Scale: 3.5 },
    { time: 18.45, X: 46, Y: 39.3, Scale: 3.5 },
    { time: 27.55, X: 46, Y: 25.9, Scale: 3.5 },
    { time: 36.65, X: 46, Y: 41.3, Scale: 3.5 },
  ]);
  await video(page, result, 44.8, 7.2, 3, fullResult);
  await video(page, result, 52, 8, 0, fullResult);
  await q.tool(page, 'Graphics');
  const importer = page.getByTestId('studio-graphics-import');
  if (!await importer.evaluate(e => e.open)) await importer.locator('summary').click();
  await page.getByLabel('Graphics composition file', { exact: true }).setInputFiles(path.join(folder, 'lesson-labels.graphics.json'));
  await importer.getByRole('status').waitFor();
  assert((await importer.getByRole('status').innerText()).includes('imported.'));
  await q.tool(page, 'Sound');
  await page.getByTestId('voiceover-recording-input').setInputFiles(path.join(base, 'narration/narration.wav'));
  const voiceStart = page.getByLabel('Start for narration.wav', { exact: true });
  await voiceStart.fill('0'); await voiceStart.blur();
  const original = page.getByRole('checkbox', { name: /^Keep original audio/ });
  if (await original.isChecked()) await original.uncheck();
  const repair = page.getByLabel('Use voice repair on export', { exact: true });
  if (await repair.isChecked()) await repair.uncheck();
  await q.tool(page, 'Export');
  await page.getByLabel('Export frame rate', { exact: true }).selectOption('24');
  const saved = await h.save(page, 'prepared'); await backup(page);
  write('native-edit.json', { projectId: saved.id, canonicalHash: hash(saved.snapshot.studioDocument), nativeActions: true,
    narration: 'Local Kokoro preset bf_emma, disclosed; no voice cloning or music bed',
    actualRecordedControls: true, externalFinalCompositing: false,
    camera: 'Native B-roll transform/anchor keys focus the unmodified whole-frame recording.',
    noPublishing: true });
  for (const t of [2.5, 13, 22, 32, 39, 48, 55]) {
    await seek(page, t); await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(folder, `native-${t}.png`) });
  }
}
async function polish(page) {
  await seek(page, 0); await q.tool(page, 'Reframe');
  const reframe = page.getByTestId('auto-reframe-toggle');
  if (await reframe.isChecked()) await reframe.uncheck();
  const before = await h.save(page, 'before-polish');
  const videos = before.snapshot.overlays.filter(l => l.type === 'video');
  assert.equal(videos.length, 4);
  for (let i = 0; i < videos.length; i++) {
    const start = [0, 10, 44.8, 52][i], duration = [10, 34.8, 7.2, 8][i];
    await transform(page, videos[i].id, { duration, 'in point': start,
      ...(i === 1 ? {} : { width: 76, height: 76, X: 46, Y: 52, Scale: 1 }) });
  }
  for (const layer of before.snapshot.overlays.filter(l => l.name?.startsWith('Control close-up')))
  {
    await q.tool(page, 'Motion');
    await page.getByRole('button', { name: 'Logo & layers', exact: true }).click();
    await page.getByRole('button', { name: `Delete ${layer.name}`, exact: true }).click();
  }
  if (!before.snapshot.overlays.some(l => l.name === 'Instruction window')) {
    await q.tool(page, 'Graphics');
    const importer = page.getByTestId('studio-graphics-import');
    if (!await importer.evaluate(e => e.open)) await importer.locator('summary').click();
    await page.getByLabel('Graphics composition file', { exact: true }).setInputFiles(path.join(folder, 'instruction-window.graphics.json'));
    await importer.getByRole('status').waitFor();
    assert((await importer.getByRole('status').innerText()).includes('imported.'));
  }
  if (!before.snapshot.overlays.some(l => l.name === 'Opening colour field')) {
    await q.tool(page, 'Graphics');
    const importer = page.getByTestId('studio-graphics-import');
    if (!await importer.evaluate(e => e.open)) await importer.locator('summary').click();
    await page.getByLabel('Graphics composition file', { exact: true }).setInputFiles(path.join(folder, 'colour-fields.graphics.json'));
    await importer.getByRole('status').waitFor();
    assert((await importer.getByRole('status').innerText()).includes('imported.'));
  }
    await q.tool(page, 'Composite');
    for (const [index, name] of ['Opening colour field', 'Closing colour field'].entries()) {
      let moves = 0;
      while (true) {
        const current = await h.save(page, `field-order-${index}`);
        const layer = current.snapshot.overlays.find(l => l.name === name);
        assert(layer);
        if (current.snapshot.compositionOrder.indexOf(layer.id) <= index) break;
        assert(moves++ < 128);
        await page.getByRole('button', { name: `Send ${name} backward`, exact: true }).click();
      }
    }
  await q.tool(page, 'Composite');
  while (true) {
    const current = await h.save(page, 'instruction-order');
    const frame = current.snapshot.overlays.find(l => l.name === 'Instruction window'); assert(frame);
    if (current.snapshot.compositionOrder.indexOf(frame.id) <= 6) break;
    await page.getByRole('button', { name: 'Send Instruction window backward', exact: true }).click();
  }
  await poses(page, videos[1].id, [{ time: 10, X: 73, Y: 47, Scale: .65 }]);
  const copies = ['STOP RUSHING\nYOUR TEXT.', '1 / ADD TITLE', '2 / PLACE IT\nFOR A PHONE',
    '3 / RISE\n+ LETTERS\n0.5s / .065s', 'KEEP THE\nREADING HOLD', 'WATCH ONCE\nWITHOUT PAUSING',
    'FAST ENTRANCE.\nCALM HOLD.', 'Preset synthetic narration'];
  await q.tool(page, 'Graphics');
  for (let i = 0; i < copies.length; i++) {
    await page.locator('.title-layer-list button').nth(i).click();
    await page.getByLabel('Title text', { exact: true }).fill(copies[i]);
    await range(page.getByLabel('Title text box width', { exact: true }), 90);
    await range(page.getByLabel('Title size', { exact: true }), i === 7 ? .23 : [0, 6].includes(i) ? .65 : .5);
  }
  const revisedVoice = path.join(base, 'narration-v2/narration.wav');
  if (fs.existsSync(path.join(base, 'narration-v2/narration-receipt.json'))) {
    await q.tool(page, 'Sound');
    while (await page.getByRole('button', { name: 'Remove take', exact: true }).count())
      await page.getByRole('button', { name: 'Remove take', exact: true }).first().click();
    await page.getByTestId('voiceover-recording-input').setInputFiles(revisedVoice);
    await page.getByLabel('Start for narration.wav', { exact: true }).waitFor();
    const start = page.getByLabel('Start for narration.wav', { exact: true });
    await start.fill('0'); await start.blur();
  }
  await q.tool(page, 'Export');
  const after = await h.save(page, 'polished');
  for (let i = 0; i < videos.length; i++) {
    const layer = after.snapshot.overlays.find(l => l.id === videos[i].id);
    assert(Math.abs(layer.startTime - [0, 10, 44.8, 52][i]) < .001);
    assert(Math.abs(layer.duration - [10, 34.8, 7.2, 8][i]) < .001);
  }
  await backup(page);
  write('polished-edit.json', { projectId: after.id, canonicalHash: hash(after.snapshot.studioDocument),
    timingVerifiedFromSavedNativeProject: true, updatedThroughNativeControls: true });
  for (const t of [2.5, 13, 22, 32, 39, 48, 55]) {
    await seek(page, t); await page.waitForTimeout(1200);
    await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(folder, `polished-${t}.png`) });
  }
}
(async () => {
  const phase = process.argv[2] || 'prepare';
  const source = JSON.parse(fs.readFileSync(fs.existsSync(path.join(folder, 'accepted-session.private.json'))
    ? path.join(folder, 'accepted-session.private.json') : '/home/tibule12/.local/share/autopromote-qa/session/studio-session.private.json'));
  const storageState = { ...source, origins: source.origins.map(o => ({ ...o,
    indexedDB: (o.indexedDB || []).filter(d => d.name !== 'autopromote-viral-studio') })) };
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--host-resolver-rules=MAP localhost 127.0.0.35', '--no-proxy-server', '--disable-quic', '--disable-http2'] });
  const context = await browser.newContext({ storageState, viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('dialog', d => d.accept());
  let submissions = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/media/process' && r.method() === 'POST') submissions++; });
  page.on('response', async response => {
    if (new URL(response.url()).pathname !== '/api/media/process' || !response.ok()) return;
    const result = await response.json();
    write('accepted-request.json', { jobId: result.jobId || result.job_id, status: result.status, resubmissionAllowed: false });
    write('accepted-session.private.json', await context.storageState({ indexedDB: true }));
    console.log('Accepted native export persisted for recovery.');
  });
  try {
    await page.goto('http://localhost:5000/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click({ timeout: 90000 });
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (phase === 'prepare' || phase === 'all') { assert(!fs.existsSync(path.join(folder, 'native-edit.json'))); await prepare(page); }
    else {
      await page.waitForFunction(() => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false);
      await page.getByLabel('Restore project backup', { exact: true }).setInputFiles(backupFile);
      await page.getByRole('region', { name: 'Saved Studio projects', exact: true }).getByRole('button', { name: title, exact: true }).click();
      await h.rail(page); await pause(page);
      if (phase === 'continue') await prepare(page, true);
      if (phase === 'polish') await polish(page);
    }
    if (phase === 'all' || phase === 'render') {
      assert(!fs.existsSync(path.join(folder, 'final/native-render-completed.json')), 'Recover the completed job; no second submission.');
      assert(!fs.existsSync(path.join(folder, 'accepted-request.json')), 'Recover the accepted job; an observer failure never authorizes resubmission.');
      await h.render(page, 'final'); await backup(page);
    } else if (phase === 'view') {
      await q.tool(page, 'Export');
      await page.getByLabel('Restore export receipt', { exact: true }).setInputFiles(path.join(folder, 'final/render-receipt.json'));
      await page.getByTestId('rendered-output-ready').waitFor({ timeout: 90000 });
      await require('../../scripts/creative-templates/materials-editing-proof').view(page, 'final');
    } else if (phase === 'recover') { await h.recover(page, 'final'); await backup(page); }
    write('session.private.json', await context.storageState({ indexedDB: true }));
    write(`${phase}-observation.json`, { phase, submissions, ordinaryAuth: true });
    console.log('Native tutorial phase complete:', phase);
  } catch (e) {
    write(`failure-${Date.now()}.json`, { phase, error: e.message, submissions });
    await page.screenshot({ path: path.join(folder, `failure-${Date.now()}.png`) }).catch(() => {});
    await backup(page).catch(() => {});
    throw e;
  } finally { await context.close(); await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
