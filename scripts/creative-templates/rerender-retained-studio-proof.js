#!/usr/bin/env node
// Re-export an exact existing real-auth canonical project after a shared
// renderer repair. Never alters the project or imports a replacement film.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const h = require('./studio-proof');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const state = process.env.STUDIO_QA_STORAGE_STATE;
const previous = path.resolve(process.env.STUDIO_QA_EXISTING_DELIVERY);
const label = process.env.STUDIO_QA_DELIVERY_LABEL;
assert(/^[a-z][a-z0-9-]{0,60}$/.test(label), 'A bounded delivery label is required');
const previousLabel = process.env.STUDIO_QA_PREVIOUS_DELIVERY_LABEL || label;
assert(/^[a-z][a-z0-9-]{0,60}$/.test(previousLabel), 'A bounded previous delivery label is required');
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const old = JSON.parse(fs.readFileSync(path.join(previous, previousLabel, 'render-receipt.json')));
  assert.equal(hash(fs.readFileSync(path.join(previous, previousLabel, 'final.mp4'))), old.outputSha256);
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: state, acceptDownloads: true,
    viewport: { width: 1600, height: 1400 } });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=retained-renderer-repair');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: process.env.STUDIO_QA_PROJECT_NAME, exact: true }).click();
    await h.rail(page);
    const before = await h.save(page, 'reopened');
    assert.equal(before.id, old.projectId);
    assert.equal(hash(before.snapshot.studioDocument), old.projectHash);
    await page.getByRole('button', { name: 'After', exact: true }).click();
    const recovery = page.getByTestId('viral-render-recovery');
    if (await recovery.isVisible()) {
      const retry = recovery.getByRole('button', { name: 'Retry status check', exact: true });
      if (await retry.isVisible()) {
        await retry.click();
        await page.getByText('Checking your previous render…', { exact: true }).waitFor({ state: 'hidden' });
      }
      const dismiss = recovery.getByRole('button', { name: 'Dismiss', exact: true });
      if (await recovery.isVisible() && await dismiss.isVisible()) {
        assert(!/processing|Checking your previous render/.test(await recovery.innerText()));
        await dismiss.click();
      }
    }
    await h.render(page, label);
    const next = JSON.parse(fs.readFileSync(path.join(folder, label, 'render-receipt.json')));
    assert.equal(next.projectHash, old.projectHash);
    assert.notEqual(next.submittedJobId, old.submittedJobId);
    await require('./materials-editing-proof').view(page, label);
    const frames = path.join(folder, label, 'studio-recording-frames');
    const files = fs.readdirSync(frames).filter(f => f.endsWith('.jpg')).sort();
    for (const [index, name] of [[0, 'start'], [Math.floor(files.length / 2), 'middle'], [files.length - 1, 'end']])
      fs.copyFileSync(path.join(frames, files[index]), path.join(folder, label, `studio-${name}.jpg`));
    const released = fs.readdirSync(frames).reduce((sum, f) => sum + fs.statSync(path.join(frames, f)).blocks * 512, 0);
    fs.rmSync(frames, { recursive: true });
    fs.writeFileSync(path.join(folder, 'native-rerender-receipt.json'), JSON.stringify({
      projectId: before.id, projectHash: old.projectHash,
      oldOutputHash: old.outputSha256, newOutputHash: next.outputSha256,
      oldJob: old.submittedJobId, newJob: next.submittedJobId,
      exactCanonicalProjectPreserved: true, nativeCpuExportDownloadFullDecodeAndStudioTimeline: true,
      recordingScratchBytesReleased: released, newGpuJobs: 0,
      scope: 'Real native lifecycle only. Picture/sound comparison and human creative review are separate.',
    }, null, 2) + '\n');
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), state);
    console.log('Exact retained project rerender, download, full decode and complete Studio movie/timeline passed.');
  } catch (error) {
    await page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(folder, 'failure.json'), JSON.stringify({ error: error.message, qualified: false }) + '\n');
    throw error;
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
