// Native finishing revision: keep the reviewed first 52 seconds and replace
// the closing picture through Studio, preserving the existing spoken track.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = path.join(__dirname, 'proof/reading-lesson');
const folder = path.join(base, 'corrected-tutorial'); fs.mkdirSync(folder, { recursive: true });
Object.assign(process.env, { STUDIO_TEMPLATE_PROOF_DIR: folder, STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_EXPORT_FPS: '24', STUDIO_QA_EXPORT_RESOLUTION: 'source', STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright',
  STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS: '1200000', STUDIO_QA_UPLOAD_BUDGET_MS: '300000',
  STUDIO_QA_TIMELINE_HEIGHT: '430', STUDIO_QA_HIDE_MEDIA: '1' });
const { pause, seek } = require('../../scripts/studio-professional/kinetic-type-proof');
Object.assign(process.env, { STUDIO_QA_EXPECTED_WIDTH: '720', STUDIO_QA_EXPECTED_HEIGHT: '1280' });
const h = require('../../scripts/creative-templates/studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const { hash } = require('../../src/creativeTemplates/contract');
const name = 'Stop rushing your text / narrated lesson / corrected ending';
const backupPath = path.join(folder, 'FINAL-LESSON.autopromote.json');
const write = (file, value) => fs.writeFileSync(path.join(folder, file), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
async function backup(page) {
  const versions = page.getByLabel('Include saved versions in backup', { exact: true });
  if (await versions.isChecked()) await versions.uncheck();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
  await (await download).saveAs(backupPath);
}
async function prepare(page) {
  assert(!fs.existsSync(path.join(folder, 'native-edit.json')));
  await page.locator('.viral-studio-entry-panel input[type=file][accept="video/*"]').setInputFiles(path.join(base, 'tutorial/final/final.mp4'));
  await page.getByRole('button', { name: 'Open Creator Studio', exact: true }).click({ timeout: 120000 });
  await h.rail(page); await pause(page);
  await page.getByLabel('Project name', { exact: true }).fill(name);
  await q.tool(page, 'Reframe'); await page.getByTestId('reframe-aspect-9-16').click();
  if (await page.getByTestId('auto-reframe-toggle').isChecked()) await page.getByTestId('auto-reframe-toggle').uncheck();
  await q.tool(page, 'Color');
  const rounded = page.getByLabel('Rounded main footage', { exact: true });
  if (await rounded.isChecked()) await rounded.uncheck();
  await q.tool(page, 'Sound');
  const repair = page.getByLabel('Use voice repair on export', { exact: true });
  if (await repair.isChecked()) await repair.uncheck();
  const original = page.getByRole('checkbox', { name: /^Keep original audio/ });
  if (!await original.isChecked()) await original.check();
  await seek(page, 52); await q.tool(page, 'B-roll');
  await page.getByTestId('broll-video-input').setInputFiles(path.join(base, 'result-r4/final.mp4'));
  await page.getByRole('button', { name: 'Picture-in-picture', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Picture-in-picture', exact: true }).click();
  await page.getByRole('button', { name: 'Keep original', exact: true }).click();
  const added = await h.save(page, 'source-added');
  const layer = added.snapshot.overlays.find(l => l.type === 'video'); assert(layer);
  await q.tool(page, 'Motion'); await page.getByRole('button', { name: 'Transform keyframes', exact: true }).click();
  await page.getByLabel('Target layer', { exact: true }).selectOption(layer.id);
  for (const [field, value] of [['duration', 8], ['in point', 52], ['width', 76], ['height', 76]]) {
    const input = page.getByLabel('Motion layer ' + field, { exact: true }); await input.fill(String(value)); await input.blur();
  }
  for (const [field, value] of [['X', 46], ['Y', 52], ['Scale', 1]]) {
    const input = page.getByRole('spinbutton', { name: field, exact: true }); await input.fill(String(value)); await input.blur();
  }
  const labels = [
    { name: 'Closing takeaway', text: 'FAST ENTRANCE.\nCALM HOLD.', startTime: 52, duration: 8, y: 22, scale: .65 },
    { name: 'Disclosed preset narration', text: 'Preset synthetic narration', startTime: 57, duration: 3, y: 68, scale: .23 },
  ].map((l, i) => ({ id: 'closing-' + i, type: 'text', x: 46, width: 90, rotation: 0, opacity: 1,
    color: '#F7E8CC', fontWeight: 800, textAlign: 'center', strokeWidth: 0, keys: [], ...l }));
  const pkg = path.join(folder, 'closing.graphics.json');
  fs.writeFileSync(pkg, JSON.stringify({ format: 'autopromote-graphics', version: 1, name: 'Clear closing label spacing', width: 720, height: 1280, duration: 60, layers: labels, groups: [] }, null, 2));
  await q.tool(page, 'Graphics'); const importer = page.getByTestId('studio-graphics-import');
  if (!await importer.evaluate(e => e.open)) await importer.locator('summary').click();
  await page.getByLabel('Graphics composition file', { exact: true }).setInputFiles(pkg);
  await importer.getByRole('status').waitFor(); assert((await importer.getByRole('status').innerText()).includes('imported.'));
  await q.tool(page, 'Export'); await page.getByLabel('Export frame rate', { exact: true }).selectOption('24');
  const saved = await h.save(page, 'prepared'); await backup(page);
  write('native-edit.json', { projectId: saved.id, canonicalHash: hash(saved.snapshot.studioDocument),
    nativeControlsOnly: true, graphInjection: false, mainSource: '../tutorial/final/final.mp4',
    originalEditableProject: '../tutorial/NARRATED-LESSON.autopromote.json',
    change: 'Native picture insert replaces the eight-second ending; disclosure moved below the poster wording.',
    soundtrack: 'Keep the exact spoken soundtrack from the first export; no additional music or voice processing.' });
  for (const t of [52.5, 55, 58]) { await seek(page, t); await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(folder, `native-${t}.png`) }); }
}
(async () => {
  const phase = process.argv[2] || 'all';
  const source = JSON.parse(fs.readFileSync('/home/tibule12/.local/share/autopromote-qa/session/studio-session.private.json'));
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--host-resolver-rules=MAP localhost 127.0.0.35', '--no-proxy-server', '--disable-quic', '--disable-http2'] });
  const context = await browser.newContext({ storageState: { ...source, origins: source.origins.map(o => ({ ...o,
    indexedDB: (o.indexedDB || []).filter(d => d.name !== 'autopromote-viral-studio') })) }, viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('dialog', d => d.accept());
  let submissions = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/media/process' && r.method() === 'POST') submissions++; });
  page.on('response', async response => {
    if (new URL(response.url()).pathname === '/api/media/process' && response.ok()) {
      const job = await response.json(); write('accepted.json', { jobId: job.jobId || job.job_id, resubmissionAllowed: false });
      write('accepted-session.private.json', await context.storageState({ indexedDB: true }));
    }
  });
  try {
    await page.goto('http://localhost:5000/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click({ timeout: 90000 });
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (['all', 'prepare'].includes(phase)) await prepare(page);
    else {
      await page.waitForFunction(() => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false);
      await page.getByLabel('Restore project backup', { exact: true }).setInputFiles(backupPath);
      await page.getByRole('region', { name: 'Saved Studio projects', exact: true }).getByRole('button', { name, exact: true }).click();
      await h.rail(page); await pause(page);
    }
    if (['all', 'render'].includes(phase)) {
      assert(!fs.existsSync(path.join(folder, 'accepted.json')), 'Recover the accepted job.');
      await h.render(page, 'final'); await backup(page);
    }
    if (['all', 'view'].includes(phase)) {
      if (phase === 'view') {
        await q.tool(page, 'Export');
        await page.getByLabel('Restore export receipt', { exact: true }).setInputFiles(path.join(folder, 'final/render-receipt.json'));
        await page.getByTestId('rendered-output-ready').waitFor({ timeout: 90000 });
      }
      await require('../../scripts/creative-templates/materials-editing-proof').view(page, 'final');
    }
    if (phase === 'restore') {
      const current = await h.save(page, 'independently-restored');
      const receipt = JSON.parse(fs.readFileSync(path.join(folder, 'final/render-receipt.json')));
      assert.equal(hash(current.snapshot.studioDocument), receipt.projectHash);
      await q.tool(page, 'Export');
      await page.getByLabel('Restore export receipt', { exact: true }).setInputFiles(path.join(folder, 'final/render-receipt.json'));
      const ready = page.getByTestId('rendered-output-ready'); await ready.waitFor({ timeout: 90000 });
      const waiting = page.waitForEvent('download'); await ready.getByRole('button', { name: /Download/ }).click();
      const file = path.join(folder, 'cold-restored.mp4'); await (await waiting).saveAs(file);
      assert.equal(hash(fs.readFileSync(file)), receipt.outputSha256);
      assert.equal(submissions, 0);
      write('independent-restore.json', { nativeBackupRestored: true, exactCanonicalHash: receipt.projectHash,
        nativeOwnedDownloadSha256: receipt.outputSha256, freshBrowserContext: true, submissions: 0 });
    }
    write(`${phase}-observation.json`, { submissions, noPublishing: true, nativeAuth: true });
    console.log('Native closing revision complete:', phase);
  } catch (e) {
    write(`failure-${Date.now()}.json`, { phase, submissions, error: e.message });
    await page.screenshot({ path: path.join(folder, `failure-${Date.now()}.png`) }).catch(() => {});
    await backup(page).catch(() => {}); throw e;
  } finally { await context.close(); await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
