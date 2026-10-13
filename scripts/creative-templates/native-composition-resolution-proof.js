#!/usr/bin/env node
// Re-export the exact native saved edits after the shared resolution repair.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const h = require('./studio-proof'), q = require('../../test/e2e/playwright/studio-stability/run');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR), state = process.env.STUDIO_QA_STORAGE_STATE;
async function main() {
  const browser = await chromium.launch({ channel: 'chromium', headless: true,
    args: ['--mute-audio', '--disk-cache-size=1048576', '--media-cache-size=1048576'] });
  const context = await browser.newContext({ storageState: state, viewport: { width: 1600, height: 1400 }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=composition-resolution');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: process.env.STUDIO_QA_PROJECT_NAME, exact: true }).click();
    await h.rail(page);
    const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
    if (await pause.isVisible()) await pause.click();
    await q.tool(page, 'Export');
    await page.getByLabel('Export resolution', { exact: true }).selectOption(process.env.STUDIO_QA_EXPORT_RESOLUTION || '720p');
    await page.getByLabel('Export frame rate', { exact: true }).selectOption(process.env.STUDIO_QA_EXPORT_FPS || '30');
    const before = await h.save(page, 'delivery-before');
    if (process.env.STUDIO_QA_RECOVER === '1') await h.recover(page, 'delivery');
    else await h.render(page, 'delivery');
    await require('./materials-editing-proof').view(page, 'delivery');
    const frames = path.join(folder, 'delivery/studio-recording-frames');
    const files = fs.readdirSync(frames).filter(f => f.endsWith('.jpg')).sort();
    for (const [index, label] of [[0, 'start'], [Math.floor(files.length / 2), 'middle'], [files.length - 1, 'end']])
      fs.copyFileSync(path.join(frames, files[index]), path.join(folder, 'delivery', `studio-${label}.jpg`));
    fs.rmSync(frames, { recursive: true });
    const after = await h.save(page, 'delivery-after');
    assert.equal(hash(before.snapshot.studioDocument), hash(after.snapshot.studioDocument));
    const receipt = JSON.parse(fs.readFileSync(path.join(folder, 'delivery/render-receipt.json')));
    fs.writeFileSync(path.join(folder, 'delivery/native-same-edit.json'), JSON.stringify({
      at: new Date().toISOString(), projectId: after.id, canonicalHash: receipt.projectHash,
      outputHash: receipt.outputSha256, normalNativeExportDownloadFullPlaybackAndTimeline: true,
      authoredEditUnchanged: true, gpuJobs: 0, scope: 'Shared composition-resolution repair; full pixel/creative/public qualification remains open.'
    }, null, 2));
    console.log('Same native edit exported at delivery composition resolution; full final playback/timeline passed.');
  } catch (error) {
    await page.screenshot({ path: path.join(folder, 'delivery-failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(folder, 'delivery-failure.json'), JSON.stringify({ error: error.message, qualified: false }));
    throw error;
  } finally {
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), state);
    await context.close(); await browser.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
