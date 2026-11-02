#!/usr/bin/env node
// Restore an actual exported receipt through normal owned Studio controls.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const retained = path.resolve('reports/model-capability-runtime-v1-20261009/proof/launch-template/cycling-parity-20261010/corrected-export-r3');
const privateState = '/home/tibule12/.local/share/autopromote-qa/session/studio-cycling-project.private.json';
const receiptFile = path.join(retained, 'cycling/render-receipt.json');
const expected = JSON.parse(fs.readFileSync(receiptFile));
const h = require('./studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');

async function enter(page) {
  await page.goto('http://localhost:5000/?studioTemplateSession=cycling-recovery');
  await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
  await page.getByRole('button', { name: 'VELO — preview switching · 20261010', exact: true }).click();
  await h.rail(page);
  await q.tool(page, 'Export');
}

async function main() {
  fs.mkdirSync(path.join(folder, 'cycling'), { recursive: true });
  fs.copyFileSync(receiptFile, path.join(folder, 'cycling/render-receipt.json'));
  const finalMovie = path.join(folder, 'cycling/final.mp4');
  if (!fs.existsSync(finalMovie)) fs.copyFileSync(path.join(retained, 'cycling/final.mp4'), finalMovie);
  assert.equal(hash(fs.readFileSync(finalMovie)), expected.outputSha256);
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: privateState, viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  const api = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/media/')) api.push({ path: url.pathname, status: response.status() });
  });
  try {
    await enter(page);
    if (!await page.getByTestId('rendered-output-ready').isVisible()) {
      await page.getByLabel('Restore export receipt', { exact: true }).setInputFiles(receiptFile);
      await page.getByTestId('rendered-output-ready').waitFor({ timeout: 45000 });
    }
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    const before = await h.save(page, 'recovered');
    assert.equal(hash(before.snapshot.studioDocument), expected.projectHash);
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), privateState);
    await enter(page);
    await page.getByTestId('rendered-output-ready').waitFor({ timeout: 45000 });
    await require('./materials-editing-proof').view(page, 'cycling');
    const after = await h.save(page, 'cold-recovered');
    assert.equal(hash(after.snapshot.studioDocument), expected.projectHash);
    assert(!api.some(event => event.path === '/api/media/process'), 'Recovery submitted a render');
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), privateState);
    fs.writeFileSync(path.join(folder, 'native-receipt-recovery.json'), JSON.stringify({
      at: new Date().toISOString(), projectId: after.id, canonicalHash: expected.projectHash,
      completedJobId: expected.submittedJobId, outputSha256: expected.outputSha256,
      nativeReceiptInput: true, coldRecovery: true, fullStudioPlayback: true,
      noStateInjection: true, noAuthBypass: true, newRenderJobs: 0, newGpuJobs: 0, api,
    }, null, 2));
    console.log('Native receipt restore, cold recovery and complete Studio movie/timeline recording PASS.');
  } catch (error) {
    await page.screenshot({ path: path.join(folder, 'recovery-failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(folder, 'recovery-api-observation.json'), JSON.stringify(api, null, 2));
    throw error;
  } finally {
    // A failed playback must not erase the actual, already-restored project/login.
    try { saveAuthenticatedState(await context.storageState({ indexedDB: true }), privateState); } catch (_) {}
    await context.close(); await browser.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
