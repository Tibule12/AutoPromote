const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const stage = process.argv[2];
assert(['before', 'after'].includes(stage));
const folder = __dirname;
const saved = '/home/tibule12/.local/share/autopromote-qa/session/template-editorial-20261013.private.json';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const original = fs.readFileSync(saved);
const storage = JSON.parse(original);
const savedProjectCount = storage.origins.flatMap(o => o.indexedDB || []).find(db => db.name === 'autopromote-viral-studio').stores.find(store => store.name === 'projects').records.length;
// Reuse the retained real Firebase login in an isolated headless context on
// the failing local preview. The retained session and project files are read only.
storage.origins = storage.origins.map(origin => ({ ...origin, origin: origin.origin === 'http://localhost:5000' ? 'http://localhost:5006' : origin.origin, indexedDB: (origin.indexedDB || []).filter(db => db.name !== 'autopromote-viral-studio') }));
async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--mute-audio', '--host-resolver-rules=MAP localhost 127.0.0.1', '--disk-cache-size=1048576', '--media-cache-size=1048576'] });
  const deadline = setTimeout(() => { console.error('Documentation browser probe reached its three-minute deadline.'); browser.close().finally(() => process.exit(1)); }, 180000);
  const context = await browser.newContext({ storageState: storage, viewport: { width: 1440, height: 1000 } });
  console.log('Headless context ready with retained real login; project/media stores excluded from this documentation-only probe.');
  const page = await context.newPage();
  console.log('QA page ready.');
  page.setDefaultTimeout(20000);
  const writes = [], exceptions = [], responses = [];
  page.on('pageerror', error => exceptions.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() !== 'GET' && url.pathname.startsWith('/api/')) writes.push({ path: url.pathname, method: request.method() });
  });
  try {
    await page.goto('http://localhost:5006/', { waitUntil: 'domcontentloaded' });
    console.log('App document loaded.');
    await page.screenshot({ path: path.join(folder, `${stage}-app.png`), timeout: 10000 });
    await page.getByRole('button', { name: 'Ask AutoPromote', exact: true }).waitFor({ timeout: 60000 });
    console.log('Real authenticated help launcher available.');
    await page.getByRole('button', { name: 'Ask AutoPromote', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Ask AutoPromote' });
    const questions = stage === 'before' ? [['How do I add keyframes?', 'GUIDE']] : [
      ['How do I add keyframes?', 'GUIDE'],
      ['How is Cam Combiner different from AI Director?', 'EXPLAIN'],
      ['Why are automatic captions broken?', 'DIAGNOSE'],
    ];
    for (const [question, mode] of questions) {
      await dialog.getByLabel('Question', { exact: true }).fill(question);
      await dialog.getByLabel('Help mode').selectOption(mode);
      const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/product-assistance/ask' && r.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Ask', exact: true }).click();
      const response = await pending;
      const result = await response.json();
      responses.push({ question, mode, status: response.status(), result });
      assert.equal(response.status(), stage === 'before' ? 503 : 200);
      if (stage === 'before') await dialog.getByRole('alert').filter({ hasText: 'Product documentation is temporarily unavailable' }).waitFor();
      else {
        await dialog.locator('.product-assistance-answer').waitFor();
        assert.equal(await dialog.getByRole('alert').count(), 0);
        assert(result.features.length > 0);
        assert.equal(result.read_only, true);
        assert.deepEqual(result.actions, []);
        if (mode === 'DIAGNOSE') assert.equal(result.features[0].status, 'BROKEN');
      }
      await dialog.screenshot({ path: path.join(folder, `${stage}-${mode.toLowerCase()}.png`) });
    }
    await dialog.getByRole('button', { name: 'Close product help' }).click();
    const doc = await context.request.get('http://localhost:5006/api/product-assistance/docs/README.md');
    assert.equal(doc.status(), stage === 'before' ? 503 : 200);
    if (stage === 'after') {
      await page.goto('http://localhost:5006/#/docs/studio/motion-keyframes', { waitUntil: 'domcontentloaded' });
      await page.locator('.public-prose').waitFor();
      assert.equal(await page.locator('[role="alert"]').count(), 0);
      await page.screenshot({ path: path.join(folder, 'after-documentation.png') });
    }
    assert.equal(digest(fs.readFileSync(saved)), digest(original));
    assert(!writes.some(r => /render|upload|publish|model-runtime|promotion-schedules/.test(r.path)));
    assert.deepEqual(exceptions, []);
    const proof = { stage, checkedAt: new Date().toISOString(), origin: 'http://localhost:5006', headless: true, muted: true, realSavedLogin: true, mockedResponses: false, savedSessionUnchanged: true, savedProjectsUnchanged: savedProjectCount, projectStoreImported: false, documentationStatus: doc.status(), exceptions, writes, responses };
    fs.writeFileSync(path.join(folder, `${stage}.private.json`), JSON.stringify(proof, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ stage, result: 'PASS', statuses: responses.map(r => r.status), documentationStatus: doc.status(), savedProjectsUnchanged: savedProjectCount }));
  } catch (error) {
    await page.screenshot({ path: path.join(folder, `${stage}-failure.png`), timeout: 5000 }).catch(() => {});
    console.error(error.message);
    process.exitCode = 1;
  } finally { clearTimeout(deadline); await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
