#!/usr/bin/env node
// Normal signed-in source intake and native project backups. No graph writes,
// render requests, authentication substitution or generated footage.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const report = path.join(root, 'reports/studio-real-footage-20261018');
const folder = path.join(report, 'proof');
process.env.STUDIO_TEMPLATE_PROOF_DIR = folder;
const h = require('../creative-templates/studio-proof');
const { pause } = require('./kinetic-type-proof');
const { hash } = require('../../src/creativeTemplates/contract');
const items = JSON.parse(fs.readFileSync(path.join(report, 'sources.json'))).items;
const names = { barber: 'Real footage · Barber · 20261018', boxing: 'Real footage · Boxing · 20261018', kitchen: 'Real footage · Kitchen · 20261018' };
const args = ['--mute-audio', '--disk-cache-size=16777216', '--host-resolver-rules=MAP localhost 127.0.0.2'];
async function entry(page) {
  await page.goto('http://localhost:5000/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
  assert(!(await page.evaluate(() => !!window.__E2E_BYPASS)));
}
async function open(page, pack) {
  await page.getByRole('region', { name: 'Saved Studio projects', exact: true })
    .getByRole('button', { name: names[pack], exact: true }).click();
  await h.rail(page); await pause(page);
}
async function verifyMedia(page, pack) {
  const selected = items.filter(i => i.pack === pack);
  const library = page.getByTestId('project-media-library');
  await library.waitFor();
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll('[data-testid="project-media-library"] article')];
    return cards.length === 3 && cards.every(c => c.classList.contains('is-ready'));
  }, undefined, { timeout: 240000 });
  const videos = [];
  for (const item of selected) {
    const filename = path.basename(item.path);
    const card = library.locator('article').filter({ has: page.getByRole('button', { name: `Preview ${filename}`, exact: true }) });
    await card.getByRole('button', { name: `Preview ${filename}`, exact: true }).click();
    await card.getByRole('button', { name: 'Preview', exact: true }).click();
    const video = page.locator('.studio-media-bin__preview video');
    // The native bin intentionally uses preload=none. Start actual playback
    // before waiting for decoded data, including in a genuinely empty cache.
    for (let attempt = 0; ; attempt++) {
      try {
        await video.evaluate(async e => { e.muted = true; await e.play(); e.pause(); });
        break;
      } catch (error) {
        // Normal owned-link refresh can replace the keyed video once. Re-select
        // that real element; do not swallow decoding/network/media failures.
        if (attempt >= 2 || !/removed from the document|interrupted by a new load/.test(error.message)) throw error;
      }
    }
    await page.waitForFunction(() => {
      const v = document.querySelector('.studio-media-bin__preview video');
      return v && v.readyState >= 2 && v.videoWidth > 0 && Number.isFinite(v.duration);
    });
    const facts = await video.evaluate(async e => {
      e.currentTime = Math.min(1, e.duration / 2);
      await e.play();
      await new Promise(resolve => setTimeout(resolve, 350));
      e.pause();
      return { seconds: e.duration, width: e.videoWidth, height: e.videoHeight, playedTo: e.currentTime, readyState: e.readyState };
    });
    assert(facts.playedTo > 0.1);
    assert(Math.abs(facts.seconds - item.seconds) < 0.1);
    assert.equal(facts.width, item.video.width);
    assert.equal(facts.height, item.video.height);
    videos.push({ assetId: item.assetId, filename, ...facts });
  }
  await library.screenshot({ path: path.join(folder, `${pack}-native-media-bin.png`) });
  return videos;
}
async function main() {
  const restore = process.argv[2] === 'restore';
  let browser;
  const context = restore
    ? await (browser = await chromium.launch({ channel: 'chromium', headless: true, args })).newContext({ storageState: path.join(root, require('../../config/daily-studio.json').authState), viewport: { width: 1920, height: 1440 }, acceptDownloads: true })
    : await chromium.launchPersistentContext(path.join(root, 'reports/studio-keyframe-selection-20261015/proof/browser-profile.private'), { channel: 'chromium', headless: true, args, viewport: { width: 1920, height: 1440 }, acceptDownloads: true });
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(60000);
  const prohibited = [];
  page.on('request', r => {
    if (r.method() === 'POST' && /media\/process|studio-3d-preview|studio-capabilities\/requests|publisher\/schedule|platform\/post/.test(new URL(r.url()).pathname)) prohibited.push(new URL(r.url()).pathname);
  });
  page.on('pageerror', e => fs.appendFileSync(path.join(folder, 'runtime-errors.private.log'), e.stack + '\n', { mode: 0o600 }));
  const receipt = [];
  try {
    for (const pack of Object.keys(names)) {
      await entry(page);
      const backupFile = path.join(folder, `${pack}-sources.autopromote.json`);
      if (restore) {
        await page.waitForFunction(() => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false);
        await page.getByLabel('Restore project backup', { exact: true }).setInputFiles(backupFile);
        await open(page, pack);
      } else {
        const existing = page.getByRole('region', { name: 'Saved Studio projects', exact: true }).getByRole('button', { name: names[pack], exact: true });
        if (await existing.count()) await open(page, pack);
        else {
          await page.locator('.creator-studio-dropzone input[type=file]').setInputFiles(items.filter(i => i.pack === pack).map(i => path.join(root, i.path)));
          await page.getByRole('button', { name: 'Open Creator Studio', exact: true }).click({ timeout: 360000 });
          await h.rail(page); await pause(page);
          await page.getByLabel('Project name', { exact: true }).fill(names[pack]);
        }
      }
      const media = await verifyMedia(page, pack);
      const saved = await h.save(page, `${pack}-${restore ? 'restored' : 'prepared'}`);
      assert.equal(saved.snapshot.projectMedia.length, 3);
      assert(saved.snapshot.projectMedia.every(m => !!m.storagePath && m.status === 'ready' && !m.file));
      const canonicalHash = hash(saved.snapshot.studioDocument);
      if (restore) {
        const original = JSON.parse(fs.readFileSync(backupFile));
        assert.equal(canonicalHash, hash(original.snapshot.studioDocument));
      } else {
        await entry(page); await open(page, pack);
        const reopened = await h.save(page, `${pack}-reopened`);
        assert.equal(hash(reopened.snapshot.studioDocument), canonicalHash);
        const event = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
        await (await event).saveAs(backupFile); fs.chmodSync(backupFile, 0o600);
      }
      receipt.push({ pack, projectName: names[pack], projectId: saved.id, canonicalHash, nativeBackup: path.relative(root, backupFile), exactColdReopen: !restore, independentRestore: restore, sourceVideos: media });
      fs.writeFileSync(path.join(folder, restore ? 'restored-projects.json' : 'prepared-projects.json'), JSON.stringify({ projects: receipt, unexpectedExecutionRequests: prohibited, authBypass: false }, null, 2));
      console.log(`${pack}: three owned videos play; ${restore ? 'exact independent restore' : 'native save, cold reopen and backup'} PASS.`);
    }
    assert.deepEqual(prohibited, []);
  } catch (e) {
    await page.screenshot({ path: path.join(folder, `intake-${restore ? 'restore' : 'prepare'}-failure-${Date.now()}.png`) }).catch(() => {});
    throw e;
  } finally { await context.close(); if (browser) await browser.close(); }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
