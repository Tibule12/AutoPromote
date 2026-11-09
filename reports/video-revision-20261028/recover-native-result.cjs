const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const folder = path.join(__dirname, 'proof/reading-lesson');
Object.assign(process.env, { STUDIO_TEMPLATE_PROOF_DIR: folder, STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright', STUDIO_QA_EXPORT_FPS: '24', STUDIO_QA_EXPORT_RESOLUTION: 'source' });
const { pause } = require('../../scripts/studio-professional/kinetic-type-proof');
Object.assign(process.env, { STUDIO_QA_EXPECTED_WIDTH: '720', STUDIO_QA_EXPECTED_HEIGHT: '1280' });
const h = require('../../scripts/creative-templates/studio-proof');
(async () => {
  const state = JSON.parse(fs.readFileSync('/home/tibule12/.local/share/autopromote-qa/session/studio-session.private.json'));
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--host-resolver-rules=MAP localhost 127.0.0.35', '--no-proxy-server', '--disable-quic', '--disable-http2'] });
  const context = await browser.newContext({ storageState: { ...state, origins: state.origins.map(o => ({ ...o, indexedDB: (o.indexedDB || []).filter(d => d.name !== 'autopromote-viral-studio') })) }, viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('dialog', d => d.accept());
  let submissions = 0; page.on('request', r => { if (new URL(r.url()).pathname === '/api/media/process' && r.method() === 'POST') submissions++; });
  try {
    await page.goto('http://localhost:5000/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click({ timeout: 90000 });
    await page.waitForFunction(() => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false);
    const source = path.join(folder, 'TEACHING-r4.autopromote.json');
    await page.getByLabel('Restore project backup', { exact: true }).setInputFiles(source);
    await page.getByRole('region', { name: 'Saved Studio projects', exact: true }).getByRole('button', { name: JSON.parse(fs.readFileSync(source)).name, exact: true }).click();
    await h.rail(page); await pause(page);
    const q = require('../../test/e2e/playwright/studio-stability/run');
    const { hash } = require('../../src/creativeTemplates/contract');
    await q.tool(page, 'Export');
    const current = await h.save(page, 'result-r4-receipt-restore');
    assert.equal(current.id, 'viral-project-a1b92ff5-b8a9-442f-af50-2280687207bd');
    const receipt = { projectId: current.id, projectHash: hash(current.snapshot.studioDocument),
      submittedJobId: 'viral_f1d8fd1026f881d113838c6bab905a0a00cb63fc952a8ba097c58fccbb9a5e96',
      outputSha256: hash(fs.readFileSync(path.join(folder, 'result-r4/final.mp4'))) };
    const identity = path.join(folder, 'result-r4/observed-export-identity.json');
    fs.writeFileSync(identity, JSON.stringify(receipt, null, 2));
    await page.getByLabel('Restore export receipt', { exact: true }).setInputFiles(identity);
    await page.getByTestId('rendered-output-ready').waitFor({ timeout: 60000 });
    await h.recover(page, 'result-r4');
    const versions = page.getByLabel('Include saved versions in backup', { exact: true }); if (await versions.isChecked()) await versions.uncheck();
    const dl = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
    await (await dl).saveAs(path.join(folder, 'RENDERED-RESULT-r4.autopromote.json'));
    assert.equal(submissions, 0);
    await require('../../scripts/creative-templates/materials-editing-proof').view(page, 'result-r4');
    console.log('Actual accepted result recovered, downloaded and played; zero resubmissions.');
  } catch (e) { await page.screenshot({ path: path.join(folder, 'recovery-failure.png') }); throw e; }
  finally { await context.close(); await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
