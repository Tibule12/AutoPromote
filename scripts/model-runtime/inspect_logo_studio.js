#!/usr/bin/env node
// The existing editor stores/reopens the real three-asset project. Signed out,
// deliberately separate from the still-unverified authenticated lifecycle.
const fs = require('fs/promises'), path = require('path');
const assert = require('assert/strict');
const { chromium } = require('playwright');
const { root, projectId } = require('./proof');

async function records(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('autopromote-viral-studio', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, query = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      query.onsuccess = () => { db.close(); resolve(query.result); };
      query.onerror = () => reject(query.error);
    };
  }));
}
async function main() {
  const target = path.join(root, 'logo-ident');
  const fixturePath = path.join(root, 'studio-fixture-project.json');
  const original = await fs.readFile(fixturePath);
  const project = JSON.parse(await fs.readFile(path.join(target, 'canonical-project-reviewed.json')));
  let browser;
  const receipt = { scope: 'Actual existing Studio component/IndexedDB with real media and artifacts. Signed-out local fixture; no normal-authentication qualification.',
    at: new Date().toISOString(), headless: true, muted: true, errors: [] };
  try {
    await fs.writeFile(fixturePath, JSON.stringify({ project: { id: projectId,
      name: 'Actual models and native AutoPromote motion', snapshot: project.snapshot },
      clip: project.snapshot.orderedClips[0], scope: receipt.scope }));
    browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', error => receipt.errors.push(error.message));
    await page.goto('http://127.0.0.1:6021/?fixture=factory&preserve=1');
    await page.getByTestId('viral-studio-workspace').waitFor({ timeout: 45000 });
    await page.getByRole('button', { name: 'Show media', exact: true }).click();
    await page.locator('.studio-project-rail__head > summary').click();
    await page.getByTestId('studio-save-project').click();
    await page.waitForFunction(() => document.querySelector('.studio-project-save-state')?.textContent.includes('Saved locally'));
    const saved = (await records(page)).find(record => record.id === projectId);
    assert(saved);
    assert.equal(saved.snapshot.projectMedia.length, 3);
    assert.equal(saved.snapshot.timeline.length, 4);
    assert.equal(saved.snapshot.analysisRefs.length, 5);
    const native = saved.snapshot.projectMedia.find(media => media.id.startsWith('native-ident-'));
    assert(native && native.contentHash);
    assert(saved.snapshot.subjectVfxScenes[0].modelArtifactRef);
    assert(saved.snapshot.subjectVfxScenes[0].trackingArtifactRef);
    receipt.saved = { projectId, mediaCount: 3, timelineCount: 4, modelArtifactRefs: 5,
      nativeSourceSha256: native.contentHash, canonicalRevision: saved.snapshot.studioDocument.revision };
    await page.reload();
    await page.getByTestId('viral-studio-workspace').waitFor({ timeout: 45000 });
    const reopened = (await records(page)).find(record => record.id === projectId);
    assert.deepEqual(reopened.snapshot.projectMedia, saved.snapshot.projectMedia);
    assert.deepEqual(reopened.snapshot.analysisRefs, saved.snapshot.analysisRefs);
    assert.deepEqual(reopened.snapshot.timeline, saved.snapshot.timeline);
    await page.screenshot({ path: path.join(target, 'studio-project-reopened.png') });
    receipt.status = 'LOCAL_COMPONENT_SAVE_REOPEN_PASS';
    receipt.coldReopen = true;
  } finally {
    if (browser) await browser.close();
    await fs.writeFile(fixturePath, original);
    await fs.writeFile(path.join(target, 'studio-lifecycle.json'), JSON.stringify(receipt, null, 2));
  }
  console.log(JSON.stringify({ status: receipt.status, ...receipt.saved, errors: receipt.errors }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
