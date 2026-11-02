#!/usr/bin/env node
// Restore the real native project through the normal owned-media backup input.
// Fresh QA context keeps real Firebase auth, while omitting only its local
// Studio project database. It never clears the retained profile or bypasses auth.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const h = require('./studio-proof');
const root = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const source = path.resolve(process.env.STUDIO_QA_PROJECT_FILE);
async function main() {
  fs.mkdirSync(root, { recursive: true });
  const native = JSON.parse(fs.readFileSync(source));
  const backup = { id: native.id, name: native.name, createdAt: native.createdAt,
    snapshot: native.snapshot, versions: native.versions || [] };
  const backupName = process.env.STUDIO_QA_BACKUP_NAME || 'VELO-keyframe-edit.autopromote.json';
  assert.equal(path.basename(backupName),backupName);
  const backupFile = path.join(root, backupName);
  if (process.env.STUDIO_QA_USE_EXACT_BACKUP === '1') {
    fs.copyFileSync(source,backupFile);fs.chmodSync(backupFile,0o600);
  } else fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), { mode: 0o600 });
  const state = JSON.parse(fs.readFileSync(process.env.STUDIO_QA_STORAGE_STATE || '/home/tibule12/.local/share/autopromote-qa/session/studio-cycling-keyframes-final.private.json'));
  for (const origin of state.origins) origin.indexedDB = (origin.indexedDB || []).filter(db => db.name !== 'autopromote-viral-studio');
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: state, viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  let renders = 0, checks = 0;
  page.on('request', request => { const url = new URL(request.url());
    if (url.pathname === '/api/media/process') renders++;
    if (url.pathname === '/api/media/studio-assets/resolve') checks++;
  });
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=keyframe-restore');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    assert.equal((await h.records(page)).length, 0, 'QA context is not a fresh Studio project store');
    // setInputFiles can dispatch into a disabled input; a real user cannot.
    // Wait for normal subscription/entitlement preparation before selecting it.
    await page.waitForFunction(()=>{
      const input=document.querySelector('input[aria-label="Restore project backup"]');
      return input && !input.disabled;
    });
    await page.getByLabel('Restore project backup', { exact: true }).setInputFiles(backupFile);
    await page.getByRole('button', { name: backup.name, exact: true }).waitFor();
    const saved = (await h.records(page)).find(project => project.id === backup.id);
    assert.equal(hash(saved.snapshot.studioDocument), hash(backup.snapshot.studioDocument));
    assert(checks > 0, 'Restore did not re-authorize any owned media');
    await page.getByRole('button', { name: backup.name, exact: true }).click();
    await h.rail(page); assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    assert.equal(renders, 0);
    const reopened = (await h.records(page)).find(project => project.id === backup.id);
    assert.equal(hash(reopened.snapshot.studioDocument), hash(backup.snapshot.studioDocument));
    fs.writeFileSync(path.join(root, 'native-backup-restore.json'), JSON.stringify({
      at: new Date().toISOString(), projectId: saved.id, canonicalHash: hash(saved.snapshot.studioDocument),
      backupSha256: hash(fs.readFileSync(backupFile)), nativeRestore: true, nativeOpen: true,
      actualOwnershipResolveRequests: checks, freshStudioStore: true, retainedProfilePreserved: true,
      renderJobs: renders, gpuJobs: 0, noMocks: true,
      scope: 'Exact owned editable project backup restore/open in a fresh real-auth QA context. Not cloud sync, public transfer or production billing qualification.'
    }, null, 2));
    console.log('Native backup restored and opened the exact edit after actual owned-media authorization; no render.');
  } catch (error) { await page.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {}); throw error; }
  finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
