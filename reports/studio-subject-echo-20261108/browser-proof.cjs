const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const report = __dirname, folder = path.join(report, 'private/native'), phase = process.argv[3] || 'author';
fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
Object.assign(process.env, { STUDIO_MOTION_VARIANT: 'episode', STUDIO_MOTION_PROOF_DIR: folder,
  STUDIO_MOTION_PROOF_TITLE: 'Subject Echoes — photographic and chromatic', STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright',
  STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS: '1800000', STUDIO_QA_UPLOAD_BUDGET_MS: '360000',
  STUDIO_QA_EXPECTED_WIDTH: '1280', STUDIO_QA_EXPECTED_HEIGHT: '720' });
const n = require('../../scripts/studio-professional/motion-flow-proof.cjs'), q = require('../../test/e2e/playwright/studio-stability/run'),
  h = require('../../scripts/creative-templates/studio-proof'), { recording } = require('../../scripts/studio-professional/kinetic-type-proof'), { chromium } = require('playwright');
const write = (name, data) => fs.writeFileSync(path.join(folder, name), JSON.stringify(data, null, 2), { mode: 0o600 });
async function backup(p) { await p.getByTestId('dock-tab-timeline').click(); await h.rail(p); await n.backup(p, 'Editable Project'); }
async function seek(p, time) {
  await n.pause(p); await n.range(p.getByLabel('Edited output position', { exact: true }), time);
  await p.waitForFunction(t => { const f = document.querySelector('[data-testid="hook-preview-frame"]'), c = document.querySelector('[data-testid="studio-program-canvas"]');
    return c && Math.abs(Number(c.dataset.programmeTime) - t) < 1 / 24 && c.getAttribute('aria-busy') !== 'true' && document.querySelector('[data-testid="studio-layer-loading"]')?.parentElement?.dataset.layerPendingCount === '0'; }, time, { timeout: 90000 });
  await p.waitForTimeout(350);
}
async function play(p, finished) {
  await p.getByTestId('dock-tab-timeline').click(); await n.pause(p);
  await n.range(p.getByLabel('Edited output position', { exact: true }), 0); await p.waitForTimeout(500);
  await p.evaluate(() => { window.__echoFrames = []; window.__echoTimer = setInterval(() => {
    const c = document.querySelector('[data-testid="studio-program-canvas"]'), v = document.querySelector('[data-testid="studio-after-video"]');
    window.__echoFrames.push({ wall: performance.now(), programme: Number(c?.dataset.programmeTime) || 0, video: v?.currentTime || 0 });
  }, 40); });
  const name = finished ? 'Complete finished playback in Studio' : 'Complete live Studio playback';
  const stop = await recording(p, path.join(folder, name)), started = Date.now();
  try { await p.getByRole('button', { name: 'Play edited preview', exact: true }).click();
    await p.waitForFunction(() => window.__echoFrames.some(s => Math.max(s.programme, s.video) > 7.5) &&
      [...document.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === 'Play edited preview'), undefined, { timeout: 150000 });
    write(name + '.json', { complete: true, seconds: 8, wallMs: Date.now() - started,
      samples: await p.evaluate(() => window.__echoFrames) });
  } finally { await p.evaluate(() => clearInterval(window.__echoTimer)); await stop(); }
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--disable-gpu'] }),
    context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.route('**/*', r => { const u = new URL(r.request().url()); return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? r.continue() : r.abort(); });
  const p = await context.newPage(), errors = []; p.setDefaultTimeout(90000); p.on('dialog', d => void d.accept());
  p.on('pageerror', e => errors.push(e.message));
  const uploadEvents=[];p.on('response', response=>{const u=new URL(response.url());if(u.pathname.includes('upload')){uploadEvents.push({path:u.pathname,status:response.status(),method:response.request().method()});write(phase+'-upload-events.json',uploadEvents);}});p.on('console',message=>{if(message.type()==='warning'&&message.text().includes('Firebase resumable upload failed')){uploadEvents.push({firebaseFallback:true,message:message.text().slice(0,180)});write(phase+'-upload-events.json',uploadEvents);}});
  const progress = setInterval(() => { p.screenshot({ path: path.join(folder, 'progress-' + phase + '.png') }).catch(() => {});
    p.locator('body').innerText().then(async body => write('progress-' + phase + '.json', { at: new Date().toISOString(), body, dom:await p.evaluate(()=>{const c=document.querySelector('[data-testid="studio-program-canvas"]'),f=document.querySelector('[data-testid="hook-preview-frame"]'),l=document.querySelector('[data-testid="studio-layer-loading"]');return {canvas:c?.dataset,frame:f?.dataset,loadingParent:l?.parentElement?.dataset,loadingHidden:l?.hidden};}) })).catch(() => {}); }, 15000);
  try {
    await n.entry(p);
    if (phase === 'author' || phase === 'resume-author') {
      if (phase === 'resume-author') await n.open(p);
      else {
      await p.locator('.creator-studio-dropzone input[type=file]').setInputFiles(path.join(report, 'sources/City.mp4'));
      await p.getByRole('button', { name: 'Open Creator Studio', exact: true }).click({ timeout: 180000 });
      await h.rail(p); await n.pause(p); await p.getByLabel('Project name', { exact: true }).fill(n.title);
      await q.tool(p, 'Reframe'); await p.getByTestId('reframe-aspect-16-9').click(); await p.getByTestId('reframe-preserve-frame').click();
      const rounded = p.getByLabel('Rounded main footage', { exact: true }); if (await rounded.count() && await rounded.isChecked()) await rounded.uncheck();
      await q.tool(p, 'Cut'); await p.getByTestId('pro-video-clip-1').click(); await p.waitForTimeout(300);
      await n.range(p.getByText('Clip start', { exact: true }).locator('..').locator('input'), 2); await p.waitForTimeout(300);
      await n.range(p.getByText('Clip end', { exact: true }).locator('..').locator('input'), 6); await p.waitForTimeout(300); await n.save(p, 'first-cut');
      await h.rail(p); const card = p.locator('.studio-media-card').filter({ has: p.locator('strong', { hasText: 'City.mp4' }) });
      await card.getByRole('button', { name: 'Preview City.mp4', exact: true }).click();
      await card.getByRole('button', { name: 'Add to sequence', exact: true }).click();
      await q.tool(p, 'Cut'); await p.getByTestId('pro-video-clip-2').click(); await p.waitForTimeout(300);
      await n.range(p.getByText('Clip start', { exact: true }).locator('..').locator('input'), 2); await p.waitForTimeout(300);
      await n.range(p.getByText('Clip end', { exact: true }).locator('..').locator('input'), 6); await p.waitForTimeout(300);
      await h.rail(p); await p.getByTestId('project-media-import-input').setInputFiles(path.join(report, 'sources/City - source-bound luma matte.mp4'));
      await p.locator('.studio-media-card').filter({ has: p.locator('strong', { hasText: 'City - source-bound luma matte.mp4' }) }).waitFor();
      await q.tool(p, 'Sound'); await p.getByLabel('Use voice repair on export', { exact: true }).uncheck();
      await p.getByTestId('background-sound-input').setInputFiles(path.join(report, 'sources/Instrumental.wav'));
      }
      const before = await n.save(p, 'before-echo'); assert.equal(before.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick, 8 * 90000);
      await p.getByTestId('studio-mode-fxflow').click(); await q.tool(p, 'Node Flow'); await seek(p, 0);
      const panel = p.getByTestId('studio-subject-echo'); await panel.locator('summary').click();
      const source = before.snapshot.projectMedia.find(m => m.name === 'City.mp4'), matte = before.snapshot.projectMedia.find(m => m.name === 'City - source-bound luma matte.mp4');
      assert(source && matte); await panel.getByLabel(/^Subject footage/).selectOption(source.id);
      await panel.getByLabel(/^Matching subject matte/).selectOption(matte.id);
      for (const [label, value] of [['Source start (s)', '2'], ['Matching matte start (s)', '0'], ['Echo copies', '4'], ['Delay per copy (s)', '.16'], ['Nearest echo opacity', '.65'], ['Spread per copy (%)', '-4']])
        await panel.getByLabel(label, { exact: true }).fill(value);
      const stop = await recording(p, path.join(folder, 'Native subject echo controls and history'));
      try {
        await panel.getByRole('button', { name: 'Apply subject echoes', exact: true }).click();
        await panel.getByRole('status').filter({ hasText: 'Subject echoes applied' }).waitFor();
        const ghost = await n.save(p, 'photographic-echo'); assert.equal(ghost.snapshot.overlays.length, 16);
        await p.getByTestId('studio-undo-button').click(); assert.equal(n.decisions((await n.save(p, 'undone')).snapshot.studioDocument), n.decisions(before.snapshot.studioDocument));
        await p.getByTestId('studio-redo-button').click(); assert.equal(n.decisions((await n.save(p, 'redone')).snapshot.studioDocument), n.decisions(ghost.snapshot.studioDocument));
        await seek(p, 4); await panel.getByLabel(/^Echo appearance/).selectOption('chroma');
        await panel.getByRole('button', { name: 'Apply subject echoes', exact: true }).click();
        await panel.getByRole('status').filter({ hasText: 'Subject echoes applied' }).waitFor();
        const final = await n.save(p, 'render-candidate'); assert.equal(final.snapshot.overlays.length, 32);
        write('authoring.json', { nativeControl: true, manualArtDirection: true, automaticSegmentation: false,
          suppliedSourceBoundMatte: true, photoAndChromaModes: true, nativeApplyUndoRedoExact: true,
          projectId: final.id, layers: 32, keys: final.snapshot.motionKeyframes.length, sourceOffset: 2, matteOffset: 0 });
        await p.screenshot({ path: path.join(folder, 'Subject echo feature controls.png') }); await backup(p);
      } finally { await stop(); }
    } else {
      await n.open(p); const reopened = await n.save(p, 'independently-reopened');
      const accepted = JSON.parse(fs.readFileSync(path.join(folder, 'Editable Project.autopromote.json')));
      assert.equal(n.decisions(reopened.snapshot.studioDocument), n.decisions(accepted.snapshot.studioDocument));
      write('independent-restore.json', { exactDecisions: true, normalSignIn: true });
      if (phase === 'render') await n.render(p);
      else if (phase === 'preview') {
        await p.getByTestId('studio-mode-fxflow').click();
        const show = p.getByRole('button', { name: 'Show Live Edit', exact: true }); if (await show.isVisible()) await show.click();
        for (const t of [.5, 1.5, 2.75, 3.958333, 4, 4.5, 5.5, 6.75, 7.958333]) {
          await seek(p, t); await p.getByTestId('hook-preview-frame').screenshot({ path: path.join(folder, 'live-' + t.toFixed(3) + '.png') });
        }
        await play(p, false); await n.save(p, 'render-candidate'); await backup(p);
      } else if (phase === 'finished') {
        await q.tool(p, 'Export'); await p.getByLabel('Restore export receipt', { exact: true }).setInputFiles(path.join(folder, 'native-motion-flow/render-receipt.json'));
        await p.getByTestId('rendered-output-ready').waitFor();
        const show = p.getByRole('button', { name: 'Show Finished Video', exact: true }); if (await show.isVisible()) await show.click();
        await p.waitForFunction(() => document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output'));
        await play(p, true); await backup(p);
      }
    }
    assert.deepEqual(errors, []); write(phase + '-ui.json', { normalSignIn: true, nativeUi: true, headless: true, muted: true, errors });
    console.log(phase + ' complete');
  } catch (error) {
    if(phase==='render'){try{await p.getByTestId('dock-tab-timeline').click();await h.rail(p);await n.save(p,'failed-export-checkpoint');await n.backup(p,'Interrupted Project');}catch(checkpointError){write('interrupted-backup-failure.json',{error:checkpointError.message});}}
    write('failure-' + phase + '-' + Date.now() + '.json', { error: error.stack, errors, body: await p.locator('body').innerText().catch(() => '') });
    await p.screenshot({ path: path.join(folder, 'failure-' + phase + '.png') }).catch(() => {}); throw error;
  } finally { clearInterval(progress); await context.close(); await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
