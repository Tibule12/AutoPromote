// Observe normal signed-in controls. No graph, session or result injection.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const repo = path.resolve(__dirname, '../..');
const dir = process.argv[2], action = process.argv[3] || 'author';
const out = '/dev/shm/autopromote-native-object-proof'; fs.mkdirSync(out, { recursive: true, mode: 0o700 });
fs.chmodSync(out, 0o700);
process.env.STUDIO_TEMPLATE_PROOF_DIR = out;
const h = require('../../scripts/creative-templates/studio-proof');
const { clickStudioControl, assertStudioTimelineLayout } = require('../../test/e2e/playwright/studio-timeline-layout');
const { restartDemoApi } = require('../../scripts/monetization/restart-demo-api.cjs');
const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'browser-private.json')));
const state = path.join(out, 'session.private.json'), title = 'Native 3D object integration';
const sha = bytes => require('node:crypto').createHash('sha256').update(bytes).digest('hex');
const events = [];
async function pause(page) { const pause = page.getByRole('button', { name: 'Pause comparison', exact: true }); if (await pause.isVisible()) await pause.click(); }
async function seek(page, value) {
  await pause(page);
  await page.getByLabel('Edited output position', { exact: true }).evaluate((input, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await page.waitForTimeout(300);
}
async function motion(page) {
  await clickStudioControl(page, page.getByRole('button', { name: 'Motion', exact: true }));
  await page.getByRole('button', { name: '3D Motion', exact: true }).click();
}
async function open(page) {
  await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).first().click();
  await page.getByRole('button', { name: title, exact: true }).click(); await h.rail(page); await pause(page);
}
async function backup(page, name) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
  await (await download).saveAs(path.join(out, `${name}.autopromote.json`));
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 },
    ...(action !== 'restore' && fs.existsSync(state) ? { storageState: state } : {}),
    recordVideo: { dir: path.join(out, 'recordings'), size: { width: 1600, height: 1000 } } });
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    return u.hostname === '127.0.0.1' || ['blob:', 'data:'].includes(u.protocol) ? route.continue() : route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(25000);
  page.on('pageerror', e => events.push({ error: e.message }));
  page.on('response', async response => {
    if (!response.url().includes('/api/')) return;
    const pathname = new URL(response.url()).pathname;
    if (pathname.includes('studio-3d/preview')) {
      const data = await response.json().catch(() => ({}));
      events.push({ route: pathname, httpStatus: response.status(), jobId: data.jobId, status: data.status, reused: data.reused, profile: data.renderProfile });
    } else if (response.status() >= 400) events.push({ route: pathname, httpStatus: response.status() });
  });
  page.on('dialog', dialog => void dialog.accept());
  try {
    await page.goto(cfg.origin); await page.waitForTimeout(1500);
    if (await page.getByRole('button', { name: 'Sign In', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await page.locator('#login-email').fill(cfg.email); await page.locator('#login-password').fill(cfg.password);
      await page.locator('input[type=checkbox]').check(); await page.locator('form button[type=submit]').click();
    }
    await page.getByTestId('shared-credit-balance').waitFor();
    if (action === 'author' || action === 'render') {
      if (action === 'author') {
      await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).first().click();
      await page.locator('.creator-studio-dropzone input[type=file]').setInputFiles(path.join(out, 'source.mp4'));
      await page.getByRole('button', { name: 'Open Creator Studio', exact: true }).click();
      await h.rail(page); await pause(page); await page.getByLabel('Project name', { exact: true }).fill(title);
      await clickStudioControl(page, page.getByRole('button', { name: 'Reframe', exact: true }));
      await page.getByTestId('reframe-aspect-16-9').click();
      const auto = page.getByTestId('auto-reframe-toggle'); if (await auto.isChecked()) await auto.uncheck();
      await seek(page, 0); await motion(page);
      await page.getByRole('button', { name: 'Object Composition Add at playhead', exact: true }).click();
      const panel = page.getByTestId('studio-3d-panel');
      await panel.getByLabel('End (s)', { exact: true }).fill('3.5');
      await panel.getByRole('button', { name: 'Advanced', exact: true }).click();
      await panel.getByLabel('Hold', { exact: true }).selectOption('still');
      await panel.getByLabel('Camera motion', { exact: true }).fill('0');
      await panel.getByLabel('Bloom', { exact: true }).fill('0');
      const field = (name, v) => panel.getByLabel(`Object ${name}`, { exact: true }).fill(String(v));
      await field('name', 'Purple sphere'); await field('x', -1.8);
      for (const axis of ['X', 'Y', 'Z']) await field(`scale${axis}`, .8);
      await panel.getByRole('button', { name: 'Add object pose at 0.00s', exact: true }).click();
      await seek(page, 3); await field('y', -.8); await field('rotationY', 90);
      await panel.getByRole('button', { name: 'Add object pose at 3.00s', exact: true }).click();
      await panel.getByRole('button', { name: 'Add torus', exact: true }).click();
      await field('name', 'Cyan orbit ring'); await field('colour', '#22d3ee'); await field('x', 1.8);
      for (const axis of ['X', 'Y', 'Z']) await field(`scale${axis}`, .8);
      await seek(page, 0); await panel.getByRole('button', { name: 'Add object pose at 0.00s', exact: true }).click();
      await seek(page, 3); await field('y', .8); await field('rotationY', 90);
      await panel.getByRole('button', { name: 'Add object pose at 3.00s', exact: true }).click();
      await seek(page, 1.5); await page.screenshot({ path: path.join(out, 'authored-workspace.png') });
      await assertStudioTimelineLayout(page, 'native-object-composition');
      const saved = await h.save(page, 'authored'); assert.equal(saved.snapshot.threeDScenes[0].objects.length, 2);
      await backup(page, 'authored');
      await page.reload(); await page.getByTestId('shared-credit-balance').waitFor(); await open(page);
      const cold = await h.save(page, 'cold-reopened');
      assert.deepEqual(cold.snapshot.threeDScenes, saved.snapshot.threeDScenes); await motion(page);
      } else { await open(page); await motion(page); }
      const acceptedResponse = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/media/studio-3d/preview');
      await page.getByRole('button', { name: 'Generate HQ 3D Preview', exact: true }).click();
      const accepted = await (await acceptedResponse).json(); assert(accepted.jobId, '3D request was rejected');
      await page.getByRole('button', { name: 'Rendering HQ preview…', exact: true }).waitFor();
      const spool = '/dev/shm/autopromote-object-blender-spool';
      let execution;
      for (let i = 0; i < 100; i++) {
        execution = fs.existsSync(path.join(spool, accepted.jobId, 'status.json')) ? accepted.jobId : null;
        if (execution) break; await page.waitForTimeout(100);
      }
      assert(execution, 'Real Blender worker did not start');
      const before = JSON.parse(fs.readFileSync(path.join(spool, execution, 'status.json'))); assert.equal(before.status, 'rendering');
      const acceptedProject = await h.save(page, 'accepted-before-restart');
      assert.equal(acceptedProject.snapshot.threeDScenes[0].hqPreviewJobId, execution);
      assert.equal(fs.existsSync(path.join(spool, execution, 'output/receipt.json')), false, 'Restart must occur while work is running');
      const restarted = await restartDemoApi(dir);
      fs.writeFileSync(path.join(out, 'api-restart.json'), JSON.stringify({ ...restarted, execution, workerPid: before.workerPid }, null, 2));
      await page.reload(); await page.getByTestId('shared-credit-balance').waitFor(); await open(page); await motion(page);
      await page.getByRole('button', { name: 'Check saved 3D render', exact: true }).click();
      await page.getByLabel('HQ 3D preview', { exact: true }).waitFor({ timeout: 240000 });
      const native = await h.save(page, 'completed'); assert.equal(native.snapshot.threeDScenes[0].hqPreviewJobId, execution);
      assert.equal(events.filter(e => e.route === '/api/media/studio-3d/preview').length, 2);
      assert(events.filter(e => e.route === '/api/media/studio-3d/preview').every(e => e.jobId === execution), 'Recovery created a second Blender request');
      const preview = page.getByLabel('HQ 3D preview', { exact: true });
      const downloaded = await context.request.get(await preview.getAttribute('src')); assert(downloaded.ok());
      const bytes = await downloaded.body(); fs.writeFileSync(path.join(out, 'native-blender-preview.mp4'), bytes);
      const receipt = JSON.parse(fs.readFileSync(path.join(spool, execution, 'output/receipt.json')));
      assert.equal(sha(bytes), receipt.artifacts['preview.mp4'].sha256);
      await backup(page, 'completed'); await page.screenshot({ path: path.join(out, 'recovered-blender-workspace.png') });
      console.log('NATIVE_AUTHOR_COLD_REOPEN_API_RESTART_SINGLE_BLENDER_EXECUTION_PASSED');
    } else {
      if (action === 'restore') {
        await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).first().click();
        await page.getByLabel('Restore project backup', { exact: true }).setInputFiles(path.join(out, 'completed.autopromote.json'));
        await page.getByRole('button', { name: title, exact: true }).click(); await h.rail(page);
        const restored = await h.save(page, 'independent-restored');
        const original = JSON.parse(fs.readFileSync(path.join(out, 'completed-project.private.json')));
        assert.deepEqual(restored.snapshot.threeDScenes, original.snapshot.threeDScenes);
        assert.deepEqual(restored.snapshot.studioDocument, original.snapshot.studioDocument);
        await motion(page); await page.screenshot({ path: path.join(out, 'independent-restored-workspace.png') });
        console.log('INDEPENDENT_NATIVE_OBJECT_BACKUP_RESTORE_PASSED');
      } else if (action === 'review') {
        await open(page); await motion(page);
        const panel = page.getByTestId('studio-3d-panel');
        await panel.getByLabel('Selected scene object', { exact: true }).selectOption({ label: 'Purple sphere' });
        assert.equal(await panel.getByLabel('Object name', { exact: true }).inputValue(), 'Purple sphere');
        assert.equal(await panel.getByRole('button', { name: /^Load object pose / }).count(), 2);
        const x = panel.getByLabel('Object x', { exact: true });
        await x.fill(''); await x.pressSequentially('-1.8'); assert.equal(await x.inputValue(), '-1.8'); await x.press('Enter');
        await page.getByRole('button', { name: 'Check saved 3D render', exact: true }).click();
        await page.getByLabel('HQ 3D preview', { exact: true }).waitFor();
        await seek(page, 1.5); await page.screenshot({ path: path.join(out, 'final-build-workspace.png') });
        await assertStudioTimelineLayout(page, 'styled-object-editor');
        const editorBox = await panel.getByRole('region', { name: 'Scene objects', exact: true }).boundingBox();
        assert(editorBox.width > 210, 'Object editor must span its inspector');
        await page.getByRole('button', { name: 'Help: 3D Motion', exact: true }).click();
        const help = page.getByRole('dialog', { name: 'Ask AutoPromote', exact: true }); await help.waitFor();
        await help.getByLabel('Question', { exact: true }).fill('How do I animate separate objects in Object Composition?');
        const reply = page.waitForResponse(r => new URL(r.url()).pathname === '/api/product-assistance/ask' && r.request().method() === 'POST');
        await help.getByRole('button', { name: 'Ask', exact: true }).click();
        const answer = await reply; assert.equal(answer.status(), 200);
        const data = await answer.json(); assert(data.features.some(f => f.feature_id === 'studio.three_d'));
        fs.writeFileSync(path.join(out, 'object-help-answer.private.json'), JSON.stringify(data), { mode: 0o600 });
        await help.locator('.product-assistance-answer').waitFor();
        await page.screenshot({ path: path.join(out, 'final-build-help.png') });
        console.log('FINAL_BUILD_REAL_SIGNED_IN_OBJECT_WORKSPACE_AND_HELP_PASSED');
      } else {
        await open(page);
        await clickStudioControl(page, page.getByRole('button', { name: 'Export', exact: true }));
        const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true }); if (await dismiss.isVisible()) await dismiss.click();
        await page.getByRole('button', { name: /^(Render Final Clip|Render Again)$/ }).click();
        const consent = page.getByRole('dialog', { name: 'Studio export', exact: true }); await consent.waitFor();
        await consent.getByRole('button', { name: /^Approve / }).click();
        await page.getByRole('button', { name: 'Download Rendered Clip', exact: true }).waitFor({ timeout: 180000 });
        const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download Rendered Clip', exact: true }).click();
        await (await download).saveAs(path.join(out, 'native-final.mp4'));
        await h.save(page, 'exported'); await backup(page, 'exported');
        await seek(page, 0);
        await page.getByRole('button', { name: 'Play comparison', exact: true }).click(); await page.waitForTimeout(5000); await pause(page);
        await page.screenshot({ path: path.join(out, 'final-native-workspace.png') });
        console.log('NATIVE_CANONICAL_ALPHA_COMPOSITED_EXPORT_PASSED');
      }
    }
    if (action !== 'restore') { await context.storageState({ path: state, indexedDB: true }); fs.chmodSync(state, 0o600); }
  } catch (error) {
    await page.screenshot({ path: path.join(out, `failed-${action}-${Date.now()}.png`) }).catch(() => {});
    fs.writeFileSync(path.join(out, `failed-${action}-${Date.now()}.txt`), await page.locator('body').innerText());
    throw error;
  } finally {
    if (action !== 'restore') { await context.storageState({ path: state, indexedDB: true }); fs.chmodSync(state, 0o600); }
    fs.writeFileSync(path.join(out, `${action}-events.json`), JSON.stringify(events, null, 2));
    await context.close(); await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
