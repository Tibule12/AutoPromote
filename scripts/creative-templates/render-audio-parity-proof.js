#!/usr/bin/env node
// Real retained account/project entry, recovery controls and deterministic
// render. Old receipt/movie are preserved; no auth/project/worker injection.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const h = require('./studio-proof');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const state = process.env.STUDIO_QA_STORAGE_STATE;
const previous = path.resolve(process.env.STUDIO_QA_EXISTING_DELIVERY);
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const oldReceipt = JSON.parse(fs.readFileSync(path.join(previous, 'audio-curve/render-receipt.json')));
  assert.equal(hash(fs.readFileSync(path.join(previous, 'audio-curve/final.mp4'))), oldReceipt.outputSha256);
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: state, acceptDownloads: true,
    viewport: { width: 1600, height: 1400 } });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  const recoveryLookups = [];
  page.on('response', async response => {
    if (!new URL(response.url()).pathname.includes('/viral-render-attempt/')) return;
    const data = await response.json().catch(() => ({}));
    recoveryLookups.push({ httpStatus: response.status(), status: data.status, jobId: data.jobId });
  });
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=audio-parity-render');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: process.env.STUDIO_QA_PROJECT_NAME, exact: true }).click();
    await h.rail(page);
    const before = await h.save(page, 'recovery-before');
    assert.equal(before.id, oldReceipt.projectId);
    assert.equal(hash(before.snapshot.studioDocument), oldReceipt.projectHash);
    await page.getByRole('button', { name: 'After', exact: true }).click();
    const recovery = page.getByTestId('viral-render-recovery');
    // A legacy worker URL can be unavailable after the owned local worker has
    // stopped. Retry its status first; retain the existing completed receipt.
    if (await recovery.isVisible()) {
      const retry = recovery.getByRole('button', { name: 'Retry status check', exact: true });
      if (await retry.isVisible()) {
        await retry.click();
        await page.getByText('Checking your previous render…', { exact: true }).waitFor({ state: 'hidden' });
      }
      if (await recovery.isVisible() && await recovery.getByRole('button', { name: 'Dismiss', exact: true }).isVisible()) {
        // This fixture has an independently retained completed output and no
        // old local worker process. Dismiss only its local tracking, through
        // the ordinary UI. Never dismiss a checking/processing job.
        const text = await recovery.innerText();
        assert(!/processing|Checking your previous render/.test(text));
        saveAuthenticatedState(await context.storageState({ indexedDB: true }), state+'.before-native-dismiss');
        await recovery.getByRole('button', { name: 'Dismiss', exact: true }).click();
      }
    }
    fs.writeFileSync(path.join(folder, 'native-recovery-preflight.json'), JSON.stringify({
      at: new Date().toISOString(), projectId: before.id, canonicalHash: oldReceipt.projectHash,
      previousCompletedJob: oldReceipt.submittedJobId, previousOutputHash: oldReceipt.outputSha256,
      recoveryLookups, oldOutputAndReceiptPreserved: true, noMocks: true,
    }, null, 2)+'\n');
    await h.render(page, 'audio-curve');
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), state);
  } catch (error) {
    await page.screenshot({ path: path.join(folder, 'native-render-failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(folder, 'native-render-failure.json'), JSON.stringify({
      at: new Date().toISOString(), error: error.message, recoveryLookups,
    }, null, 2)+'\n');
    throw error;
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
