// Fresh demo App controls only; no graph, session or response injection.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const directory = process.argv[2], root = path.resolve(__dirname, '../..');
const config = JSON.parse(fs.readFileSync(path.join(directory, 'browser-private.json')));
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'config.json')));
assert.equal(runtime.env.GCLOUD_PROJECT, 'demo-autopromote-credits');
assert.equal(new URL(config.origin).hostname, '127.0.0.1');
const proof = path.join(directory, 'hook-fx-undo-proof'); fs.mkdirSync(proof, { recursive: true, mode: 0o700 });
const { seek } = require(path.join(root, 'test/e2e/playwright/studio-stability/flows'));
const { clickStudioControl } = require(path.join(root, 'test/e2e/playwright/studio-timeline-layout'));
const result = { steps: [], browserErrors: [] }, title = 'Cut Hook Creator FX — verified Undo and final delivery';
const log = name => { result.steps.push(name); fs.writeFileSync(path.join(proof, 'progress.json'), JSON.stringify(result, null, 2)); console.log(name); };
async function rail(p) {
  await p.getByTestId('studio-pro-timeline').waitFor({ timeout: 90000 });
  const show = p.getByRole('button', { name: 'Show media', exact: true }); if (await show.isVisible()) await show.click();
  const head = p.locator('.studio-project-rail__head'); if (!await head.evaluate(e => e.open)) await head.locator(':scope > summary').click();
}
async function save(p, name) {
  await rail(p); await p.getByTestId('studio-save-project').click();
  const versions = p.getByLabel('Include saved versions in backup', { exact: true }); if (await versions.isChecked()) await versions.uncheck();
  const download = p.waitForEvent('download'); await p.getByRole('button', { name: 'Download project backup', exact: true }).click();
  const file = path.join(proof, name + '.autopromote.json'); await (await download).saveAs(file);
  return JSON.parse(fs.readFileSync(file)).snapshot;
}
async function creative(p, name) { await clickStudioControl(p, p.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name, exact: true })); }
async function undo(p) { await p.getByTestId('studio-undo-button').click(); }
async function redo(p) { await p.getByTestId('studio-redo-button').click(); }
const ranges = s => s.timeline.map(c => [c.startRequest, c.endRequest]);
// The broker refreshes expiring access capabilities on reopen. Keep every
// immutable object path/hash/generation and edit decision in the comparison.
function stableDecisions(value) {
  if (Array.isArray(value)) return value.map(stableDecisions);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,
    k === 'url' && typeof v === 'string' && v.startsWith(config.origin + '/api/credit-pilot/object/')
      ? v.split('?')[0] : stableDecisions(v)]));
  return value;
}
(async () => {
 const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
 const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, recordVideo: { dir: path.join(proof, 'recordings') } });
 await context.route('**/*', route => { const u = new URL(route.request().url()); return u.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort(); });
 const p = await context.newPage(); p.setDefaultTimeout(30000); p.on('dialog', d => d.accept()); p.on('pageerror', e => result.browserErrors.push(e.message));
 try {
  await p.goto(config.origin); await p.getByRole('button', { name: 'Sign In', exact: true }).click();
  await p.locator('#login-email').fill(config.email); await p.locator('#login-password').fill(config.password);
  await p.locator('form input[type=checkbox]').check(); await p.locator('form button[type=submit]').click();
  await p.getByTestId('shared-credit-balance').waitFor();
  await p.getByRole('button', { name: 'Viral Clip Studio', exact: true }).first().click();
  let s;
  if (process.argv.includes('--resume-delivery')) {
    s = JSON.parse(fs.readFileSync(path.join(proof, 'final.autopromote.json'))).snapshot;
    await p.getByLabel('Restore project backup', {exact:true}).setInputFiles(path.join(proof, 'final.autopromote.json'));
    await p.getByRole('button', { name: title, exact: true }).click();
  } else {
  await p.locator('.creator-studio-dropzone input[type=file]').setInputFiles(process.env.CREDITS_CONTROLS_SOURCE || path.join(directory, 'source.mp4'));
  await p.getByRole('button', { name: 'Open Creator Studio', exact: true }).click();
  await rail(p); await p.getByLabel('Project name', { exact: true }).fill(title);
  const pause = p.getByRole('button', { name: 'Pause comparison', exact: true }); if (await pause.isVisible()) await pause.click();
  await creative(p, 'Reframe'); await p.getByTestId('reframe-aspect-16-9').click(); await p.getByTestId('auto-reframe-toggle').uncheck();
  const frame = p.getByLabel('Rounded main footage', { exact: true }); if (await frame.count() && await frame.isChecked()) await frame.uncheck();
  await creative(p, 'Sound'); await p.getByLabel('Use voice repair on export', { exact: true }).uncheck();
  await creative(p, 'Export'); await p.getByLabel('Export frame rate', { exact: true }).selectOption('24');
  await p.getByLabel('Export resolution', { exact: true }).selectOption('720p');
  await seek(p, 8); await p.getByTestId('pro-quick-trim-end').click();
  await seek(p, 4); await p.getByTestId('pro-quick-split').click();
  assert.deepEqual(ranges(await save(p, 'split')), [[0,4],[4,8]]);
  await creative(p, 'Creator FX'); await p.getByTestId('creator-section-effects').click();
  await p.getByLabel('Creator effect intensity').fill('83');
  await p.getByTestId('studio-undo-button').focus(); await p.keyboard.press('Control+z');
  assert.equal(await p.getByLabel('Creator effect intensity').inputValue(), '62');
  assert.equal((await save(p, 'fx-setting-undo')).timeline.length, 2);
  await p.getByTestId('studio-undo-button').focus(); await p.keyboard.press('Control+z');
  assert.deepEqual(ranges(await save(p, 'cut-undo')), [[0,8]]);
  await p.getByTestId('studio-redo-button').focus(); await p.keyboard.press('Control+y');
  assert.equal((await save(p, 'cut-redo')).timeline.length, 2);
  await p.getByTestId('studio-redo-button').focus(); await p.keyboard.press('Control+y');
  assert.equal(await p.getByLabel('Creator effect intensity').inputValue(), '83');
  log('Keyboard Undo/Redo reverses Creator setting then cut, one action each');
  await seek(p, 0); await creative(p, 'Hook');
  const inspector = p.getByTestId('clip-studio-inspector'), enabled = inspector.getByRole('checkbox', { name: /Enable opening hook/ });
  await enabled.check(); const original = await inspector.getByLabel('Hook text', { exact: true }).inputValue();
  await inspector.getByRole('button', { name: 'Freeze frame', exact: true }).click();
  await inspector.getByLabel('Hook text', { exact: true }).fill('One reversible hook');
  await undo(p); assert.equal(await inspector.getByLabel('Hook text', { exact: true }).inputValue(), original);
  await undo(p); assert.equal(await inspector.getByRole('button', { name: 'Blur Reveal', exact: true }).getAttribute('aria-pressed'), 'true');
  await undo(p); assert(!await enabled.isChecked()); assert.equal((await save(p, 'hook-undos-preserve-cut')).timeline.length, 2);
  await redo(p); await redo(p); await redo(p); assert(await enabled.isChecked());
  assert.equal(await inspector.getByLabel('Hook text', { exact: true }).inputValue(), 'One reversible hook');
  await inspector.locator('.inspector-range input[type=range]').fill('2');
  log('Hook enable, template and copy each Undo/Redo without losing the cut');
  await seek(p, 4.5); await creative(p, 'Creator FX'); await p.getByTestId('creator-section-effects').click();
  await p.getByTestId('creator-demo-shake').click(); s = await save(p, 'shake'); assert.equal(s.motionKeyframes.filter(k => k.id.startsWith('creator-shake')).length, 18);
  await undo(p); s = await save(p, 'shake-undo'); assert.equal(s.motionKeyframes.filter(k => k.id.startsWith('creator-shake')).length, 0); assert.equal(s.timeline.length, 2);
  await redo(p); assert.equal((await save(p, 'shake-redo')).motionKeyframes.filter(k => k.id.startsWith('creator-shake')).length, 18);
  await seek(p, 5.2); await p.getByTestId('creator-demo-emoji').click(); s = await save(p, 'emoji');
  assert(s.overlays.some(o => o.name === 'Reaction emoji' && o.src.startsWith('data:image/png')));
  await undo(p); assert(!(await save(p, 'emoji-undo')).overlays.some(o => o.name === 'Reaction emoji')); await redo(p);
  await seek(p, 6.3); await p.getByLabel('Creator freeze hold', { exact: true }).fill('0.5');
  await p.waitForFunction(() => { const v = document.querySelector('[data-testid=studio-after-video]'); return v && v.readyState >= 2 && !v.seeking && v.videoWidth > 0; });
  await p.getByTestId('creator-demo-micro_freeze').click(); s = await save(p, 'freeze'); assert(s.overlays.some(o => o.name === 'Micro-freeze'));
  await undo(p); assert(!(await save(p, 'freeze-undo')).overlays.some(o => o.name === 'Micro-freeze')); await redo(p);
  await seek(p, 3); await p.getByLabel('Creator cut transition', { exact: true }).selectOption('energy_flash');
  await p.getByTestId('creator-demo-transition').click(); s = await save(p, 'transition'); assert.equal(s.timeline[0].transitionOut, 'energy_flash');
  await undo(p); assert.notEqual((await save(p, 'transition-undo')).timeline[0].transitionOut, 'energy_flash'); await redo(p);
  log('Native shake, emoji, captured freeze and cut transition each Undo/Redo');
  await seek(p, 0); s = await save(p, 'final');
  }
  await p.reload(); await p.getByTestId('shared-credit-balance').waitFor(); await p.getByRole('button', { name: 'Viral Clip Studio', exact: true }).first().click();
  await p.getByRole('button', { name: title, exact: true }).click(); const reopened = await save(p, 'cold-reopened');
  for (const field of ['timeline','motionKeyframes','overlays','addHook','hookTemplate','hookText','hookIntroSeconds']) assert.deepEqual(stableDecisions(reopened[field]), stableDecisions(s[field]), field);
  log('Exact cold reopen preserves cuts, Hook and native FX');
  await seek(p, 0); await creative(p, 'Export'); const dismiss = p.getByRole('button', { name: 'Dismiss', exact: true }); if (await dismiss.count()) await dismiss.click();
  await p.getByRole('button', { name: /^(Render Final Clip|Render Again)$/ }).click();
  const consent = p.getByRole('dialog', { name: 'Studio export', exact: true }); await consent.waitFor(); await consent.getByRole('button', { name: /^Approve / }).click();
  const downloadButton = p.getByRole('button', { name: 'Download Rendered Clip', exact: true }); await downloadButton.waitFor({ timeout: 650000 });
  const download = p.waitForEvent('download'); await downloadButton.click(); await (await download).saveAs(path.join(proof, 'hook-fx-final.mp4'));
  log('Actual canonical CPU Hook/FX render delivered and downloaded');
  await seek(p, 0); const play = p.getByRole('button', { name: 'Play edited preview', exact: true }); if (await play.count()) await play.click();
  await p.waitForTimeout(9500); const pauseFinal = p.getByRole('button', {name:'Pause comparison',exact:true}); if (await pauseFinal.isVisible()) await pauseFinal.click();
  await p.screenshot({ path: path.join(proof, 'finished.png') }); assert.deepEqual(result.browserErrors, []); result.status = 'PASS';
 } catch (e) { result.failure = e.message; await p.screenshot({ path: path.join(proof, 'failure.png') }).catch(() => {}); throw e; }
 finally { fs.writeFileSync(path.join(proof, 'results.json'), JSON.stringify(result, null, 2)); await context.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
