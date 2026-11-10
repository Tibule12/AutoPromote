const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { chromium } = require('playwright');
const session = '/home/tibule12/.local/share/autopromote-qa/session/template-editorial-20261013.private.json';
const original = fs.readFileSync(session), storage = JSON.parse(original);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const projectCount = storage.origins.flatMap(o => o.indexedDB || []).find(d => d.name === 'autopromote-viral-studio').stores.find(s => s.name === 'projects').records.length;
storage.origins = storage.origins.map(o => ({ ...o, origin: o.origin === 'http://localhost:5000' ? 'http://localhost:5006' : o.origin, indexedDB: (o.indexedDB || []).filter(d => d.name !== 'autopromote-viral-studio') }));
const cases = [
  ['Hi', null],
  ['How can I split my video?', 'studio.cut'],
  ['How do I trim the end?', 'studio.trim'],
  ['Can I undo a mistake?', 'studio.undo_redo'],
  ['How do I add keyframs?', 'studio.keyframes'],
  ['Where is it?', 'studio.keyframes'],
  ['Where do I put the background music?', 'studio.music'],
  ['Make the music quieter when someone speaks', 'studio.ducking'],
  ['The voice has background noise', 'studio.audio_restoration'],
  ['subtitels are wrong', 'studio.captions'],
  ['Where is Logo Workshop?', 'studio.logo_design'],
  ['Can I edit vector points?', 'studio.vector_artwork'],
  ['Can I change my video background?', 'studio.compositing'],
  ['Can I keep the microphone and sofa?', 'studio.compositing'],
  ['Can I automatically cut to the person speaking?', 'cam_combiner.switching'],
  ['How is Cam Combiner different from Director?', 'director.proposals'],
  ['Where can I see the publishing queue?', 'publishing.schedule'],
  ['How do I connect YouTube?', 'publishing.connections'],
  ['Where can I see my analytics?', 'publishing.analytics'],
  ['My email is qa@example.invalid and I cannot sign in', 'system.account'],
  ['What is the weather tomorrow?', null],
  ['QX_UNKNOWN_RENDER_FAILURE', null],
  ['こんにちは', null],
  ['Can you guarantee a million views?', 'publishing.analytics'],
  ['Can I cancel a processing job?', 'system.cancellation'],
  ['Will generating a video use credits?', 'system.costs'],
];
async function main() {
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio', '--host-resolver-rules=MAP localhost 127.0.0.1', '--disk-cache-size=1048576'] });
  const timeout = setTimeout(() => browser.close().finally(() => process.exit(1)), 180000);
  const context = await browser.newContext({ storageState: storage, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  const errors = [], writes = [], replies = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', r => { if (r.method() !== 'GET' && new URL(r.url()).pathname.startsWith('/api/')) writes.push({ method: r.method(), path: new URL(r.url()).pathname }); });
  try {
    await page.goto('http://localhost:5006/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Ask AutoPromote', exact: true }).click({ timeout: 60000 });
    const dialog = page.getByRole('dialog', { name: 'Ask AutoPromote' });
    for (let i = 0; i < cases.length; i++) {
      if (i === 6) await dialog.getByRole('button', { name: 'Clear context' }).click();
      const [question, expected] = cases[i], mode = ['EXPLAIN', 'GUIDE', 'DIAGNOSE'][i % 3];
      await dialog.getByLabel('Question', { exact: true }).fill(question);
      await dialog.getByLabel('Help mode').selectOption(mode);
      const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/product-assistance/ask' && r.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Ask', exact: true }).click();
      const response = await pending, result = await response.json();
      assert.equal(response.status(), 200, question);
      await dialog.locator('.product-assistance-answer').waitFor();
      assert.equal(await dialog.locator('.product-assistance-answer').textContent(), result.answer);
      assert.equal(await dialog.getByRole('alert').count(), 0);
      assert.equal(result.read_only, true); assert.deepEqual(result.actions, []);
      if (expected) assert(i === 15 ? result.features.some(f => f.feature_id === expected) : result.features[0].feature_id === expected, question);
      if ([20, 21, 22].includes(i)) assert(result.documentation_gap, question);
      if (i === 19) { assert(result.privacy_notice); await dialog.getByRole('status').waitFor(); }
      if (i === 23) assert.match(result.answer, /does not promise guaranteed/);
      if (i === 5) assert.equal(response.request().postDataJSON().context.selected_feature_id, 'studio.keyframes');
      replies.push({ question, mode, status: response.status(), result });
      if ([5, 8, 9, 10, 19, 20, 22].includes(i)) await dialog.screenshot({ path: path.join(__dirname, `question-${i + 1}.png`) });
    }
    assert.deepEqual(errors, []);
    assert(writes.every(r => r.path === '/api/product-assistance/ask'));
    assert.equal(hash(fs.readFileSync(session)), hash(original));
    const proof = { checkedAt: new Date().toISOString(), origin: 'http://localhost:5006', questions: replies.length, allStatuses200: true, noVisibleAlerts: true, browserErrors: errors, headless: true, muted: true, realSavedLogin: true, mockedResponses: false, allThreeModes: true, followUpVerified: true, savedSessionUnchanged: true, savedProjectsUnchanged: projectCount, projectStoreImported: false, writes, replies };
    fs.writeFileSync(path.join(__dirname, 'browser-proof.private.json'), JSON.stringify(proof, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ result: 'PASS', questions: replies.length, allStatuses200: true, noVisibleAlerts: true, savedProjectsUnchanged: projectCount, followUpVerified: true }));
  } catch (error) {
    await page.screenshot({ path: path.join(__dirname, 'browser-failure.png'), timeout: 5000 }).catch(() => {});
    console.error(error.message); process.exitCode = 1;
  } finally { clearTimeout(timeout); await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
