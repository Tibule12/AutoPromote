#!/usr/bin/env node
'use strict';
// Check the anonymous page as well as the signed-in help panel before changing
// a local build. A signed-in session alone cannot detect a welcome flag loss.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const baseline = process.env.PREVIEW_COMPARE_URL;
const candidate = process.env.PREVIEW_CANDIDATE_URL || 'http://localhost:5006/';
for (const value of [baseline, candidate].filter(Boolean)) {
  const url = new URL(value);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Local preview URL required');
}
const folder = path.resolve(process.env.STUDIO_QA_PROOF_DIR || 'reports/welcome-preview-restoration-20261021/browser');
fs.mkdirSync(folder, { recursive: true });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
async function main() {
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio', '--host-resolver-rules=MAP localhost 127.0.0.1', '--disk-cache-size=1048576'] });
  const deadline = setTimeout(() => browser.close().finally(() => process.exit(1)), 180000);
  const errors = [], writes = [], checks = [];
  const observe = page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/')) writes.push(new URL(request.url()).pathname); });
  };
  try {
    for (const [width, height] of [[1440, 1000], [390, 844], [360, 800], [1200, 900]]) {
      const snapshots = [];
      for (const [name, url] of [['baseline', baseline], ['candidate', candidate]].filter(([, url]) => url)) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', timezoneId: 'Africa/Johannesburg' });
        const page = await context.newPage(); page.setDefaultTimeout(20000); observe(page);
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await page.getByRole('heading', { level: 1, name: 'More creating. Less posting work.' }).waitFor();
          await page.getByRole('tab', { name: 'LinkedIn', exact: true }).waitFor();
          await page.locator('.wf-queue-window img').evaluate(img => img.decode());
          await page.evaluate(() => document.fonts.ready);
          const state = await page.evaluate(() => ({
            heading: document.querySelector('h1').textContent,
            hero: document.querySelector('.wf-hero').innerText,
            links: [...document.querySelectorAll('a[href]')].map(a => ({ text: a.textContent, href: a.getAttribute('href') })),
            media: [...document.querySelectorAll('.wf-page img, .wf-page video, .wf-page source')].map(e => ({ tag: e.tagName, src: e.getAttribute('src'), poster: e.getAttribute('poster') })),
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
          }));
          assert.equal(state.overflow, false, `${name} ${width}px overflow`);
          snapshots.push({ name, ...state });
          await page.screenshot({ path: path.join(folder, `${name}-${width}.png`), animations: 'disabled' });
          if (name === 'candidate' && width === 1440) {
            await page.getByRole('button', { name: 'Watch the welcome Studio film with sound', exact: true }).click();
            const video = page.getByRole('dialog').locator('video');
            await video.evaluate(v => { v.muted = true; v.pause(); });
            await page.waitForFunction(() => Number.isFinite(document.querySelector('dialog video')?.duration));
            assert.equal(await video.getAttribute('src'), '/welcome/2026-10-21/welcome-reel.mp4');
            assert(Math.abs(await video.evaluate(v => v.duration) - 28) < .05);
            await page.keyboard.press('Escape');
            await page.getByRole('link', { name: 'Documentation', exact: true }).first().click();
            await page.getByRole('heading', { level: 1, name: 'A clearer path from edit to release.' }).waitFor();
          }
          checks.push({ name, width, height, welcomeWorkflowVisible: true, noOverflow: true });
        } finally { await context.close(); }
      }
      if (snapshots.length === 2) {
        const [before, after] = snapshots;
        for (const field of ['heading', 'hero', 'links', 'media']) assert.deepEqual(after[field], before[field], `${width}px changed ${field}`);
      }
    }
    let authenticated = null;
    if (process.env.STUDIO_QA_STORAGE_STATE) {
      const filename = process.env.STUDIO_QA_STORAGE_STATE;
      const original = fs.readFileSync(filename), storage = JSON.parse(original);
      const projectCount = storage.origins.flatMap(o => o.indexedDB || []).find(db => db.name === 'autopromote-viral-studio')?.stores.find(s => s.name === 'projects')?.records.length || 0;
      storage.origins = storage.origins.map(o => ({ ...o, origin: o.origin === 'http://localhost:5000' ? new URL(candidate).origin : o.origin, indexedDB: (o.indexedDB || []).filter(db => db.name !== 'autopromote-viral-studio') }));
      const context = await browser.newContext({ storageState: storage, viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage(); page.setDefaultTimeout(20000); observe(page);
      try {
        await page.goto(candidate, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Ask AutoPromote', exact: true }).click({ timeout: 60000 });
        const dialog = page.getByRole('dialog', { name: 'Ask AutoPromote' });
        for (const [question, expected] of [['How do I add keyframs?', 'studio.keyframes'], ['Where is it?', 'studio.keyframes'], ['The voice has background noise', 'studio.audio_restoration']]) {
          await dialog.getByLabel('Question', { exact: true }).fill(question);
          const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/product-assistance/ask' && r.request().method() === 'POST');
          await dialog.getByRole('button', { name: 'Ask', exact: true }).click();
          const response = await pending;
          assert.equal(response.status(), 200);
          const reply = await response.json(); assert.equal(reply.features[0].feature_id, expected);
          await dialog.locator('.product-assistance-answer').waitFor();
          assert.equal(await dialog.getByRole('alert').count(), 0);
        }
        await dialog.screenshot({ path: path.join(folder, 'candidate-authenticated-chat.png') });
        assert.equal(hash(fs.readFileSync(filename)), hash(original));
        authenticated = { realSavedLogin: true, questions: 3, savedSessionUnchanged: true, savedProjectRecordsUnchanged: projectCount };
      } finally { await context.close(); }
    }
    assert.deepEqual(errors, []);
    assert(writes.every(p => p === '/api/product-assistance/ask'));
    const result = { checkedAt: new Date().toISOString(), baseline, candidate, headless: true, muted: true, mockedResponses: false, matchingWelcomeContent: Boolean(baseline), checks, authenticated, browserErrors: errors, apiWrites: writes };
    fs.writeFileSync(path.join(folder, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ result: 'PASS', anonymousViewportChecks: checks.length, matchingWelcomeContent: Boolean(baseline), authenticated, browserErrors: errors.length }));
  } finally { clearTimeout(deadline); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
