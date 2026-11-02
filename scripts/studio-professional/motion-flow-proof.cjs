#!/usr/bin/env node
// Real App, normal emulator sign-in, ordinary UI editing and native CPU export.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const baseFolder = path.join(root, 'reports/studio-motion-flow-takeover-20261031');
const cinematicVariant = process.env.STUDIO_MOTION_VARIANT === 'cinematic';
const dialogueVariant = process.env.STUDIO_MOTION_VARIANT === 'dialogue';
const textureVariant = process.env.STUDIO_MOTION_VARIANT === 'video-texture';
const episodeVariant = process.env.STUDIO_MOTION_VARIANT === 'episode';
const folder = process.env.STUDIO_MOTION_PROOF_DIR ? path.resolve(root,process.env.STUDIO_MOTION_PROOF_DIR) : episodeVariant ? path.join(root,'reports/studio-cinematic-episode-20261101') : textureVariant ? path.join(baseFolder,'video-texture') : dialogueVariant ? path.join(baseFolder, 'dialogue') : cinematicVariant ? path.join(baseFolder, 'cinematic') : baseFolder;
fs.mkdirSync(folder, {recursive:true});
process.env.STUDIO_TEMPLATE_PROOF_DIR = folder;
process.env.STUDIO_KINETIC_PROOF_DIR = folder;
const h = require('../creative-templates/studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const { recording } = require('./kinetic-type-proof');
const { hash } = require('../../src/creativeTemplates/contract');
const directory = process.argv[2], phase = process.argv[3] || 'author';
const config = JSON.parse(fs.readFileSync(path.join(directory, 'browser-private.json')));
let title = cinematicVariant && (phase !== 'cinematic' || ['Editable Project.autopromote.json','Interrupted Project.autopromote.json'].some(name=>fs.existsSync(path.join(folder,name)))) ? 'Motion & Flow — Evidence Reconstruction' : 'Motion & Flow — Investigative Motion Test';
if (dialogueVariant) title = 'Motion & Flow — Dialogue Opening';
if (textureVariant) title = 'Motion & Flow — Open World';
if (episodeVariant) title = process.env.STUDIO_MOTION_PROOF_TITLE || 'AutoPromote — Every frame, intentional';
const source = name => path.join(baseFolder, 'media', name);
const stamp = name => path.join(folder, name);
const browserState = stamp('session.private.json');
const decisions = doc => { const { revision, journal, idempotency, ...rest } = doc; return hash(rest); };
async function pause(p) {
  for (const name of ['Pause edited preview', 'Pause comparison']) {
    const button = p.getByRole('button', { name, exact: true });
    if (await button.isVisible()) {
      try { await button.click({ timeout: 15000 }); }
      catch (error) {
        // Natural completion can replace Pause with Play between the visibility
        // read and click. Preserve real failures while accepting that held end.
        if (await button.isVisible()) throw error;
      }
    }
  }
  await p.locator('video,audio').evaluateAll(nodes => nodes.forEach(el => { el.muted = true; el.pause(); }));
}
async function seek(p, t) {
  await pause(p);
  await range(p.getByLabel('Edited output position', { exact: true }), t);
  await p.waitForTimeout(250);
  await pause(p);
}
async function range(input, value) {
  await input.evaluate((el, v) => {
    el._valueTracker?.setValue('__control__');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function save(p, name) {
  const show = p.getByRole('button', { name: 'Show media', exact: true });
  if (await show.isVisible()) await show.click();
  const head = p.locator('.studio-project-rail__head');
  if (!await head.evaluate(el => el.open)) await head.locator(':scope > summary').click();
  await p.getByTestId('studio-save-project').click();
  await p.waitForFunction(() => document.querySelector('.studio-project-save-state')?.classList.contains('is-saved'));
  const record = await p.evaluate(title => new Promise((resolve, reject) => {
    const open = indexedDB.open('autopromote-viral-studio'); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, request = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      request.onsuccess = () => { db.close(); resolve(request.result.find(item => item.name === title)); }; };
  }), title);
  assert(record?.snapshot?.studioDocument);
  fs.writeFileSync(stamp(`${name}-project.private.json`), JSON.stringify(record, null, 2), {mode: 0o600});
  return record;
}
async function backup(p, name) {
  const show = p.getByRole('button', { name: 'Show media', exact: true });
  if (await show.isVisible()) await show.click();
  const versions = p.getByLabel('Include saved versions in backup', { exact: true });
  if (await versions.isChecked()) await versions.uncheck();
  const pending = p.waitForEvent('download');
  await p.getByRole('button', { name: 'Download project backup', exact: true }).click();
  await (await pending).saveAs(stamp(`${name}.autopromote.json`));
}
async function entry(p) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(config.origin, {signal: AbortSignal.timeout(500)})).ok) break; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  await p.goto(config.origin, { waitUntil: 'domcontentloaded' });
  const signin = p.getByRole('button', { name: 'Sign In', exact: true });
  await signin.or(p.getByTestId('shared-credit-balance')).first().waitFor({ timeout: 45000 });
  if (await signin.isVisible()) {
    await signin.click();
    await p.locator('#login-email').fill(config.email); await p.locator('#login-password').fill(config.password);
    await p.locator('form input[type=checkbox]').check(); await p.locator('form button[type=submit]').click();
  }
  await p.getByTestId('shared-credit-balance').waitFor({ timeout: 45000 });
  assert.equal(await p.evaluate(() => !!window.__E2E_BYPASS), false);
  const helpButton = p.getByRole('button', { name: 'Ask AutoPromote', exact: true });
  if (await helpButton.isVisible()) {
    await helpButton.click();
    await p.getByRole('dialog', { name: 'Ask AutoPromote' }).screenshot({ path: stamp('signed-in-help.png') });
    await p.getByRole('button', { name: 'Close product help', exact: true }).click();
  }
  await p.getByRole('button', { name: 'Viral Clip Studio', exact: true }).first().click();
}
async function open(p) {
  if (!await p.getByRole('button', { name: title, exact: true }).count()) {
    const names = phase === 'texture-rig' ? ['Interrupted Project.autopromote.json','Editable Project.autopromote.json'] : phase === 'render-raw' ? ['Raw Project.autopromote.json'] : phase === 'portable' ? ['Portable Project.autopromote.json'] : ['Editable Project.autopromote.json', 'Interrupted Project.autopromote.json'];
    const file = ['cinematic','dialogue','video-texture'].includes(phase) ? (names.map(stamp).find(f=>fs.existsSync(f)) || (phase==='video-texture'?path.join(baseFolder,'dialogue/Portable Project.autopromote.json'):path.join(baseFolder, 'Raw Project.autopromote.json'))) : names.map(stamp).find(f => fs.existsSync(f));
    assert(file, 'A native project backup is required to restore this browser.');
    await p.getByLabel('Restore project backup', { exact: true }).setInputFiles(file);
    if (['dialogue','video-texture'].includes(phase)) {
      const rawTitle = JSON.parse(fs.readFileSync(file)).name;
      await p.getByRole('button', { name: rawTitle, exact: true }).click();
      await h.rail(p); await pause(p);
      await p.getByRole('button', { name: 'Duplicate', exact: true }).click();
      await p.getByLabel('Project name', { exact: true }).fill(title);
      await save(p, 'dialogue-duplicate');
      return;
    }
    await p.getByRole('button', { name: title, exact: true }).waitFor({timeout: 90000});
  }
  await p.getByRole('button', { name: title, exact: true }).click(); await p.locator('.viral-studio-container').waitFor(); await pause(p); }
async function author(p) {
  const resume = fs.existsSync(stamp('Interrupted Project.autopromote.json')) || fs.existsSync(stamp('Editable Project.autopromote.json')) || await p.getByRole('button', { name: title, exact: true }).count();
  if (resume) await open(p);
  if (!resume) {
  await p.locator('.creator-studio-dropzone input[type=file]').setInputFiles(source('presenter-1.mp4'));
  await p.getByRole('button', { name: 'Open Creator Studio', exact: true }).click({ timeout: 180000 });
  await h.rail(p); await pause(p); await p.getByLabel('Project name', { exact: true }).fill(title);
  }
  const stop = await recording(p);
  try {
    if (!resume) {
    await q.tool(p, 'Reframe'); await p.getByTestId('reframe-aspect-16-9').click(); await p.getByTestId('reframe-preserve-frame').click();
    const rounded = p.getByLabel('Rounded main footage', { exact: true });
    if (await rounded.count() && await rounded.isChecked()) await rounded.uncheck();
    await q.tool(p, 'Sound'); await p.getByLabel('Use voice repair on export', { exact: true }).uncheck();
    await h.rail(p); await p.getByTestId('project-media-import-input').setInputFiles(source('presenter-2.mp4'));
    const card = p.locator('.studio-media-card').filter({ has: p.locator('strong', { hasText: 'presenter-2.mp4' }) });
    await card.getByRole('button', { name: 'Preview presenter-2.mp4', exact: true }).click();
    await card.getByRole('button', { name: 'Add to sequence', exact: true }).click({ timeout: 90000 });
    await q.tool(p, 'Cut'); await p.getByTestId('pro-video-clip-1').click(); await seek(p, 6.75);
    await p.getByTestId('inspector-cut-split').click();
    await p.getByTestId('pro-video-clip-3').click(); await seek(p, 8.25); await p.getByTestId('inspector-cut-trim-start').click();
    await p.getByTestId('pro-video-clip-1').click();
    const advanced = p.locator('details.precision-edit-details'); await advanced.locator('summary').click();
    await p.getByLabel('Precision edit nudge', { exact: true }).selectOption('0.25');
    await p.getByLabel('lcut later', { exact: true }).click();
    await p.getByTestId('pro-video-clip-3').click(); await p.getByLabel('jcut earlier', { exact: true }).click();
    const raw = await save(p, 'raw'); await backup(p, 'Raw Project');
    assert.equal(raw.snapshot.timeline.length, 3);
    assert.equal(new Set(raw.snapshot.timeline.map(c => c.sourceStoragePath || c.storagePath)).size, 2);
    console.log('Native multi-cut, two-source and J/L edit authored.');
    }
    const current = await save(p, 'resumed');
    if (!current.snapshot.overlays.some(o => o.name === 'clock-video')) {
    await q.tool(p, 'Graphics');
    const panel = p.getByTestId('studio-graphics-import'); await panel.locator('summary').click();
    await p.getByLabel('Graphics composition file', { exact: true }).setInputFiles(stamp('evidence.graphics.json'));
    await panel.getByRole('status').filter({ hasText: 'imported' }).waitFor();
    }
    await p.getByTestId('studio-mode-fxflow').click();
    await seek(p, 0);
    if (!(await save(p, 'before-rig')).snapshot.overlays.some(o => o.isNullRig)) await p.getByTestId('comp-add-null-rig').click();
    let saved = await save(p, 'rig-added');
    const rig = saved.snapshot.overlays.find(o => o.isNullRig);
    const clock = saved.snapshot.overlays.find(o => o.name === 'clock-video');
    const real = saved.snapshot.overlays.find(o => o.name === 'clock-real');
    await p.getByLabel('Parent layer for clock-video', { exact: true }).selectOption(rig.id);
    await p.getByLabel('Parent layer for clock-real', { exact: true }).selectOption(rig.id);
    // Move and rotate the rig through the new canvas controls, with one history transaction.
    await p.getByTestId(`comp-layer-row-${rig.id}`).locator('.ap-comp-layer-title').click();
    await seek(p, 10.5);
    const move = p.getByLabel(`Move ${rig.name}`, { exact: true }), box = await move.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down();
    await p.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 - 6, { steps: 12 }); await p.mouse.up();
    const afterMove = await save(p, 'rig-dragged');
    await p.getByTestId('studio-undo-button').click(); const undone = await save(p, 'rig-undo');
    await p.getByTestId('studio-redo-button').click(); const redone = await save(p, 'rig-redo');
    assert.equal(decisions(redone.snapshot.studioDocument), decisions(afterMove.snapshot.studioDocument));
    assert.notEqual(decisions(undone.snapshot.studioDocument), decisions(redone.snapshot.studioDocument));
    // Authored rig motion remains editable on the existing key timeline.
    const property = p.getByLabel('Motion driver target property', { exact: true });
    for (const [time, value] of [[8.5, .94], [11.5, 1.02], [14.5, 1]]) {
      await seek(p, time); await property.selectOption('scale'); await p.getByTestId('comp-add-keyframe-playhead').click();
      await p.getByLabel('Selected keyframe value', { exact: true }).fill(String(value));
    }
    const handle = p.getByTestId('comp-curve-handle-1');
    const beforeCurve = await save(p, 'curve-before');
    await handle.scrollIntoViewIfNeeded(); const hb = await handle.boundingBox();
    await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down();
    await p.mouse.move(hb.x + hb.width / 2 + 15, hb.y + hb.height / 2 - 12, { steps: 12 }); await p.mouse.up();
    const afterCurve = await save(p, 'curve-after');
    assert.notEqual(decisions(afterCurve.snapshot.studioDocument), decisions(beforeCurve.snapshot.studioDocument), 'Curve drag must actually change a key.');
    await p.getByTestId('studio-undo-button').click(); const curveUndo = await save(p, 'curve-undo');
    assert.equal(decisions(curveUndo.snapshot.studioDocument), decisions(beforeCurve.snapshot.studioDocument));
    await p.getByTestId('studio-redo-button').click();
    assert.equal(decisions((await save(p, 'curve-redo')).snapshot.studioDocument), decisions(afterCurve.snapshot.studioDocument));
    console.log('Native rig dragging and Bezier handle gesture/undo/redo verified.');
    // An actual luma-inverted relationship (hidden clock source) supplies a restrained cutout.
    // Keep the visible dials intact; use a separate alpha source for the typography reveal.
    await seek(p, 0);
    await p.getByTestId('comp-add-adjustment-layer').click();
    saved = await save(p, 'grade-created');
    const grade = saved.snapshot.adjustmentLayers.at(-1);
    await p.getByTestId('dock-tab-node_flow').click();
    await p.getByTestId(`flow-node-Adjustment:${grade.id}`).click();
    await range(p.getByLabel('Adjustment exposure', { exact: true }), -.12);
    await range(p.getByLabel('Adjustment contrast', { exact: true }), 1.1);
    await range(p.getByLabel('Adjustment saturation', { exact: true }), .88);
    await p.getByLabel('Adjustment LUT', { exact: true }).setInputFiles(stamp('investigative.cube'));
    await p.getByLabel('Adjustment glow enabled', { exact: true }).check();
    await range(p.getByLabel('Adjustment glow strength', { exact: true }), .08);
    await p.screenshot({ path: stamp('actual-studio-controls.png') });
    saved = await save(p, 'authored'); await backup(p, 'Editable Project');
    fs.writeFileSync(stamp('author-receipt.json'), JSON.stringify({ projectId: saved.id, hash: hash(saved.snapshot.studioDocument), rigId: rig.id, clocks: [clock.id, real.id], realStudioUI: true, normalEmulatorAuth: true }, null, 2));
  } finally { await stop(); }
}
async function finishProject(p) {
  const stop = await recording(p);
  try {
    let saved = await save(p, 'before-scene');
    if (!saved.snapshot.overlays.some(o => o.name === 'Evidence stage')) {
      await q.tool(p, 'Graphics'); const panel = p.getByTestId('studio-graphics-import');
      if (!await panel.evaluate(el => el.open)) await panel.locator('summary').click();
      await p.getByLabel('Graphics composition file', { exact: true }).setInputFiles(stamp('evidence-stage.graphics.json'));
      await panel.getByRole('status').filter({ hasText: 'imported' }).waitFor();
    }
    saved = await save(p, 'scene-assets');
    await p.getByTestId('studio-mode-fxflow').click();
    const rule = saved.snapshot.overlays.find(o => o.name === 'Evidence comparison rule');
    const matte = saved.snapshot.overlays.find(o => o.name === 'Evidence rule matte');
    const rig = saved.snapshot.overlays.find(o => o.isNullRig);
    await p.getByLabel('Track matte mode for Evidence comparison rule', { exact: true }).selectOption('luma_inverted');
    await p.getByLabel('Track matte source for Evidence comparison rule', { exact: true }).selectOption(matte.id);
    for (const name of [rule.name, matte.name]) await p.getByLabel(`Parent layer for ${name}`, { exact: true }).selectOption(rig.id);
    // Use the visible, reviewed action executor to insert actual moving media.
    await seek(p, 2.5);
    const panel = p.getByTestId('studio-scene-actions');
    if (!await panel.evaluate(el => el.open)) await panel.locator('summary').click();
    await panel.getByLabel('Scene evidence source', { exact: true }).selectOption(saved.snapshot.projectMedia.find(m => m.name === 'presenter-1.mp4').id);
    await panel.getByRole('button', { name: 'Build evidence scene plan', exact: true }).click();
    await panel.getByRole('button', { name: 'Apply reviewed scene actions', exact: true }).click();
    await panel.getByRole('status').filter({ hasText: 'Scene actions applied' }).waitFor();
    const result = await save(p, 'scene-applied');
    assert(result.snapshot.overlays.some(o => o.name === 'Evidence recording plane' && o.perspective));
    assert.equal(result.snapshot.overlays.find(o => o.id === rule.id).trackMatte.mode, 'luma_inverted');
    const stage = result.snapshot.overlays.find(o => o.name === 'Evidence stage');
    const firstTitle = result.snapshot.overlays.find(o => o.name === 'study-label');
    const fullGradePlan = { format: 'autopromote-scene-actions', version: 1, projectId: result.id,
      baseRevision: result.snapshot.studioDocument.revision, name: 'Ordered investigative source grade', actions: [
        { type: 'move_layer', targetId: stage.id, beforeId: firstTitle.id },
        { type: 'adjustment', id: 'source-grade', name: 'Investigative source grade', startTime: 0, duration: 15.75,
          grade: { exposureStops: -.08, contrast: 1.08, saturation: .92 } },
      ] };
    fs.writeFileSync(stamp('reviewed-scene-actions.json'), JSON.stringify(fullGradePlan, null, 2));
    await panel.getByLabel('Scene action plan', { exact: true }).setInputFiles(stamp('reviewed-scene-actions.json'));
    await panel.getByRole('button', { name: 'Apply reviewed scene actions', exact: true }).click();
    await panel.getByRole('status').filter({ hasText: 'Scene actions applied' }).waitFor();
    let graded = await save(p, 'full-grade-plan');
    await p.getByTestId('dock-tab-node_flow').click();
    const grade = graded.snapshot.adjustmentLayers.find(g => g.name === 'Investigative source grade');
    await p.getByTestId(`flow-node-Adjustment:${grade.id}`).click();
    await p.getByLabel('Adjustment LUT', { exact: true }).setInputFiles(stamp('investigative.cube'));
    await p.getByLabel('Adjustment glow enabled', { exact: true }).check();
    await range(p.getByLabel('Adjustment glow strength', { exact: true }), .06);
    await range(p.getByLabel('Adjustment strength', { exact: true }), 90);
    await p.getByLabel('Move adjustment earlier', { exact: true }).click();
    // Real source/grade pictures, not settings text, occupy the paired viewer.
    await p.getByLabel(`Assign ${grade.name} to Viewer 2`, { exact: true }).click();
    await p.getByLabel('Assign MainIn to Viewer 1', { exact: true }).click();
    await seek(p, 2);
    await p.getByTestId('flow-ab-monitor').screenshot({ path: stamp('source-grade-ab.png') });
    // Camera-like move stays in the existing main-video transform key channel.
    await p.getByTestId('dock-tab-comp_rig').click();
    await p.getByTestId('studio-comp-workbench').getByText('Main Programme', { exact: true }).click();
    await p.getByLabel('Motion driver target property', { exact: true }).selectOption('scale');
    for (const [time, value] of [[0,1], [2.5,1], [6.5,1.035], [7.5,1]]) {
      await seek(p, time); await p.getByTestId('comp-add-keyframe-playhead').click();
      await p.getByLabel('Selected keyframe value', { exact: true }).fill(String(value));
    }
    graded = await save(p, 'final-authored');
    fs.writeFileSync(stamp('scene-execution.json'), JSON.stringify({ projectId: graded.id, canonicalHash: hash(graded.snapshot.studioDocument),
      localRecipeAppliedThroughUI: true, modelInferenceInvoked: false, layers: graded.snapshot.overlays.length,
      cuts: graded.snapshot.timeline.length, twoSources: new Set(graded.snapshot.timeline.map(c => c.sourceStoragePath || c.storagePath)).size,
      matteMode: 'luma_inverted', perspectivePlane: true, sourceGrade: true, nativeCameraKeys: true }, null, 2));
    // Place the dark evidence-stage artwork below all foreground evidence.
    // Native Composite ordering controls are used by the ordinary inspector.
    await backup(p, 'Editable Project');
    await p.screenshot({ path: stamp('scene-actions-in-studio.png') });
  } finally { await stop(); }
}

async function render(p, raw = false) {
  const timeline = p.getByTestId('dock-tab-timeline'); if (await timeline.isVisible()) await timeline.click();
  const consent = (async () => {
    const modal = p.getByRole('dialog', { name: 'Studio export', exact: true });
    await modal.waitFor({ timeout: 600000 });
    await modal.getByRole('button', { name: /^Approve / }).click();
  })();
  await Promise.all([h.render(p, raw ? 'native-raw-source' : 'native-motion-flow'), consent]);
  await backup(p, raw ? 'Raw Project' : 'Editable Project');
}
async function polish(p) {
  await p.getByTestId('studio-mode-fxflow').click();
  const before = await save(p, 'before-polish');
  const titleLayer = before.snapshot.overlays.find(o => o.name === 'study-label');
  const labels = before.snapshot.overlays.filter(o => ['time-video', 'time-real'].includes(o.name));
  const plan = { format: 'autopromote-scene-actions', version: 1, projectId: before.id,
    baseRevision: before.snapshot.studioDocument.revision, name: 'Investigative composition refinement', actions: [
      { type: 'remove_keys', targetId: titleLayer.id, property: 'scale' },
      { type: 'keys', targetId: titleLayer.id, keys: [{ property: 'scale', time: 0, value: .48, easing: 'linear' }] },
      ...labels.map(layer => ({ type: 'keys', targetId: layer.id, keys: [{ property: 'y', time: layer.startTime, value: 79, easing: 'linear' }] })),
    ] };
  fs.writeFileSync(stamp('polish-scene-actions.json'), JSON.stringify(plan, null, 2));
  const panel = p.getByTestId('studio-scene-actions');
  if (!await panel.evaluate(el => el.open)) await panel.locator('summary').click();
  await panel.getByLabel('Scene action plan', { exact: true }).setInputFiles(stamp('polish-scene-actions.json'));
  await panel.getByRole('button', { name: 'Apply reviewed scene actions', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: 'Scene actions applied' }).waitFor();
  await p.getByTestId('dock-tab-comp_rig').click();
  await p.getByTestId('studio-comp-workbench').getByText('Main Programme', { exact: true }).click();
  await p.getByLabel('Motion driver target property', { exact: true }).selectOption('scale');
  for (const [time, value] of [[0,1], [2.5,1], [6.5,1.035], [7.5,1]]) {
    await seek(p, time); await p.getByTestId('comp-add-keyframe-playhead').click();
    await p.getByLabel('Selected keyframe value', { exact: true }).fill(String(value));
  }
  const after = await save(p, 'polished');
  assert.equal(after.snapshot.motionKeyframes.filter(k => k.targetId === 'main-video').length, 4);
  assert.equal(after.snapshot.motionKeyframes.filter(k => k.targetId === titleLayer.id && k.property === 'scale').length, 1);
  const rig = after.snapshot.overlays.find(o => o.isNullRig);
  await p.getByTestId(`comp-layer-row-${rig.id}`).locator('.ap-comp-layer-title').click();
  await seek(p, 11);
  const rotateBefore = await save(p, 'rotation-before');
  const control = p.getByLabel(`Rotate ${rig.name}`, { exact: true }); await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  await p.evaluate(() => {
    const frames = [], changes = [], start = performance.now(); let raf;
    const observer = new MutationObserver(() => changes.push(performance.now()-start));
    const stage = document.querySelector('[data-testid="hook-preview-frame"]');
    observer.observe(stage,{subtree:true,attributes:true,attributeFilter:['style']});
    const tick = time => {frames.push(time);raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);
    window.__stopRigInteraction = () => {observer.disconnect();cancelAnimationFrame(raf);return {elapsedMs:performance.now()-start,frames,changes}};
  });
  await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();
  for (let i=1;i<=24;i++) { await p.mouse.move(box.x+box.width/2+i,box.y+box.height/2+i*.25);await p.waitForTimeout(16); }
  await p.mouse.up();
  const interaction = await p.evaluate(() => window.__stopRigInteraction());
  const rotated = await save(p, 'rotation-after');
  assert.notEqual(rotated.snapshot.overlays.find(o=>o.id===rig.id).rotation,rotateBefore.snapshot.overlays.find(o=>o.id===rig.id).rotation);
  await p.getByTestId('studio-undo-button').click();
  const restored=await save(p,'rotation-undone');assert.equal(decisions(restored.snapshot.studioDocument),decisions(rotateBefore.snapshot.studioDocument));
  fs.writeFileSync(stamp('rig-interaction.json'),JSON.stringify({...interaction,rotationChanged:true,singleUndoRestoredExactDocument:true,scope:'Measured real canvas rotation interaction; no 60fps claim'},null,2));
  await backup(p, 'Editable Project');
  await seek(p, 11); await p.getByTestId('hook-preview-frame').screenshot({ path: stamp('polished-clock-stage.png') });
}
async function cinematic(p) {
  const initial=await save(p, 'raw-before-duplicate');
  if(!initial.snapshot.overlays.length) {
    await p.getByRole('button', {name:'Duplicate',exact:true}).click();
    title = 'Motion & Flow — Evidence Reconstruction';
    await p.getByLabel('Project name',{exact:true}).fill(title);
  }
  await save(p,'new-cinematic-project');
  const stop = await recording(p);
  try {
    if (!initial.snapshot.overlays.length) {
      await q.tool(p,'Graphics');
      const graphics=p.getByTestId('studio-graphics-import');
      if (!await graphics.evaluate(el=>el.open)) await graphics.locator('summary').click();
      await p.getByLabel('Graphics composition file',{exact:true}).setInputFiles(stamp('cinematic.graphics.json'));
      await graphics.getByRole('status').filter({hasText:'imported'}).waitFor();
    }
    await p.getByTestId('studio-mode-fxflow').click();
    await seek(p,0);if(!initial.snapshot.overlays.some(o=>o.isNullRig)) await p.getByTestId('comp-add-null-rig').click();
    let saved=await save(p,'cinematic-rig');
    const byName=name=>saved.snapshot.overlays.find(o=>o.name===name);
    const rig=saved.snapshot.overlays.find(o=>o.isNullRig);
    const clocks=['Reconstructed video clock','Broken studio clock'];
    const parentNames=[...clocks,'Evidence callout contour','Evidence title matte'];
    for(const name of parentNames) await p.getByLabel(`Parent layer for ${name}`,{exact:true}).selectOption(rig.id);
    await p.getByLabel('Track matte mode for Evidence callout contour',{exact:true}).selectOption('luma_inverted');
    await p.getByLabel('Track matte source for Evidence callout contour',{exact:true}).selectOption(byName('Evidence title matte').id);
    // Author actual four-corner projections through Composite, on both dials.
    for(let i=0;i<clocks.length;i++) {
      await q.tool(p,'Composite');await p.getByText('Composite target',{exact:true}).locator('..').locator('select').selectOption(byName(clocks[i]).id);
      const perspective=p.getByTestId('studio-perspective-inspector');
      if (!await perspective.evaluate(el=>el.open)) await perspective.locator('summary').click();
      await perspective.getByRole('button',{name:i?'Tilt plane right':'Tilt plane left',exact:true}).click();
    }
    await p.getByTestId('studio-mode-fxflow').click();
    await seek(p,2.5);
    const panel=p.getByTestId('studio-scene-actions');
    if(!await panel.evaluate(el=>el.open)) await panel.locator('summary').click();
    if (!saved.snapshot.overlays.some(o=>o.name==='Evidence recording plane')) {
      await panel.getByLabel('Scene evidence source',{exact:true}).selectOption(saved.snapshot.projectMedia[0].id);
      await panel.getByRole('button',{name:'Build evidence scene plan',exact:true}).click();
      await panel.getByRole('button',{name:'Apply reviewed scene actions',exact:true}).click();
      await panel.getByRole('status').filter({hasText:'Scene actions applied'}).waitFor();
    }
    saved=await save(p,'cinematic-plane');
    const plane=byName('Evidence recording plane');
    const actions=[];
    const channel=(id,property,poses)=>{
      actions.push({type:'remove_keys',targetId:id,property});
      actions.push({type:'keys',targetId:id,keys:poses.map(([time,value])=>({property,time,value,easing:'bezier',curve:[.22,1,.36,1]}))});
    };
    channel(plane.id,'x',[[2.5,112],[3.3,70],[6.65,69],[7,82]]);
    channel(plane.id,'y',[[2.5,57],[3.3,46],[6.65,45],[7,44]]);
    channel(plane.id,'scale',[[2.5,.55],[3.3,.9],[6.65,.94],[7,1.05]]);
    channel(plane.id,'rotation',[[2.5,-7],[3.3,-1],[6.65,0],[7,2]]);
    channel(plane.id,'perspectiveProgress',[[2.5,100],[3.3,95],[6.65,55],[7,20]]);
    channel('main-video','scale',[[0,1],[2.1,1],[3.1,1.045],[7,1.11],[7.8,1],[8.4,1],[9,1.08],[12.8,1.06],[14.7,1]]);
    channel('main-video','x',[[0,50],[2.1,50],[3.1,49.5],[7,48],[7.8,50],[8.4,50],[11,52],[14.7,50]]);
    channel(rig.id,'x',[[8.4,49],[11.4,51],[14.5,50]]);
    channel(rig.id,'y',[[8.4,53],[11.4,50],[14.5,49]]);
    channel(rig.id,'scale',[[8.4,.93],[11.4,1.03],[14.5,1.06]]);
    channel(rig.id,'rotation',[[8.4,-.8],[11.4,.35],[14.5,0]]);
    for(let i=0;i<clocks.length;i++) {
      const id=byName(clocks[i]).id,a=i?9.35:8.6,x=i?77:24;
      channel(id,'x',[[a,i?94:8],[a+.85,x],[13.9,x],[14.5,i?89:12]]);
      channel(id,'scale',[[a,.72],[a+.85,1],[13.9,1.02],[14.5,1.06]]);
      channel(id,'perspectiveProgress',[[a,100],[a+.85,85],[12.8,40],[14.5,75]]);
    }
    channel(byName('Evidence title matte').id,'x',[[10.1,50],[11.6,50],[13.5,52],[14.5,50]]);
    actions.push({type:'move_layer',targetId:plane.id,beforeId:byName('copy-looked').id});
    const plan={format:'autopromote-scene-actions',version:1,projectId:saved.id,
      baseRevision:saved.snapshot.studioDocument.revision,name:'Spatial evidence choreography',actions};
    fs.writeFileSync(stamp('spatial-scene-actions.json'),JSON.stringify(plan,null,2));
    await panel.getByLabel('Scene action plan',{exact:true}).setInputFiles(stamp('spatial-scene-actions.json'));
    await panel.getByRole('button',{name:'Apply reviewed scene actions',exact:true}).click();
    if(await panel.getByRole('status').filter({hasText:'Scene plan is stale'}).count()) {
      const fresh=await save(p,'cinematic-plan-refreshed');plan.baseRevision=fresh.snapshot.studioDocument.revision;
      fs.writeFileSync(stamp('spatial-scene-actions.json'),JSON.stringify(plan,null,2));
      await panel.getByLabel('Scene action plan',{exact:true}).setInputFiles(stamp('spatial-scene-actions.json'));
      await panel.getByRole('button',{name:'Apply reviewed scene actions',exact:true}).click();
    }
    await panel.getByRole('status').filter({hasText:'Scene actions applied'}).waitFor();
    // Draw-on is authored with the ordinary Motion inspector, not a baked asset.
    await q.tool(p,'Motion');
    const transform=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await transform.count()) await transform.click();
    await p.getByLabel('Target layer',{exact:true}).selectOption(byName('Evidence callout contour').id);
    for(const [time,value] of [[10.1,0],[11.1,40],[12.2,100],[14.45,100]]) {
      await seek(p,time);const input=p.getByLabel('Stroke end',{exact:true});await input.fill(String(value));await input.blur();
      const add=p.getByRole('button',{name:'Add stroke end key at playhead',exact:true});if(await add.count()) await add.click();
    }
    await p.screenshot({path:stamp('native-path-controls.png')});
    // Finish the existing grade node through its actual controls.
    await p.getByTestId('studio-mode-fxflow').click();await seek(p,0);
    await p.getByTestId('comp-add-adjustment-layer').click();saved=await save(p,'cinematic-grade-added');
    const grade=saved.snapshot.adjustmentLayers.at(-1);await p.getByTestId('dock-tab-node_flow').click();
    await p.getByTestId(`flow-node-Adjustment:${grade.id}`).click();
    await range(p.getByLabel('Adjustment exposure',{exact:true}),-.08);
    await range(p.getByLabel('Adjustment contrast',{exact:true}),1.08);
    await range(p.getByLabel('Adjustment saturation',{exact:true}),.9);
    await p.getByLabel('Adjustment LUT',{exact:true}).setInputFiles(path.join(baseFolder,'investigative.cube'));
    saved=await save(p,'cinematic-authored');await backup(p,'Editable Project');
    fs.writeFileSync(stamp('cinematic-execution.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),
      layers:saved.snapshot.overlays.length,keys:saved.snapshot.motionKeyframes.length,vectorContours:1,maskedTitleGroups:2,
      projectedMovingMediaPlanes:3,drawOnAuthoredThroughMotionUI:true,modelInferenceInvoked:false},null,2));
    for(const time of [3.5,5,9.5,11.5,13]) {await seek(p,time);await p.getByTestId('hook-preview-frame').screenshot({path:stamp(`design-${time}.png`)});}
  } finally {await stop();}
}
async function dialogue(p) {
  let saved = await save(p, 'dialogue-before');
  assert.equal(saved.snapshot.overlays.length, 0, 'Start with a new duplicate of the retained raw project.');
  const stop = await recording(p);
  try {
    await q.tool(p, 'Graphics');
    const graphics = p.getByTestId('studio-graphics-import');
    if (!await graphics.evaluate(el => el.open)) await graphics.locator('summary').click();
    await p.getByLabel('Graphics composition file', { exact: true }).setInputFiles(stamp('dialogue.graphics.json'));
    await graphics.getByRole('status').filter({ hasText: 'imported' }).waitFor();
    saved = await save(p, 'dialogue-graphics');
    const actions = [{ type: 'media_plane', id: 'recording', name: 'Synchronized recording plane',
      sourceMediaId: saved.snapshot.projectMedia[0].id, sourceStart: 2.5, startTime: 2.5, duration: 4.9,
      perspective: { version: 1, corners: [[0,5],[98,0],[98,100],[0,95]] },
      transform: { x: 50, y: 50, scale: 100/70, opacity: 1 } }];
    const channel = (id, property, rows) => actions.push({ type: 'keys', targetId: id,
      keys: rows.map(([time,value]) => ({ property,time,value,easing:'bezier',curve:[.22,1,.36,1] })) });
    channel('recording', 'x', [[2.5,50],[3.35,59],[6.55,59],[7.4,50]]);
    channel('recording', 'y', [[2.5,50],[3.35,46],[6.55,46],[7.4,50]]);
    channel('recording', 'scale', [[2.5,100/70],[3.35,1.12],[6.55,1.12],[7.4,100/70]]);
    channel('recording', 'perspectiveProgress', [[2.5,0],[3.35,100],[6.55,100],[7.4,0]]);
    channel('main-video', 'x', [[0,50],[8.08,50],[8.7,51],[13.95,51],[14.7,50]]);
    channel('main-video', 'scale', [[0,1],[1.9,1.025],[2.5,1],[7.4,1],[8.08,1],[8.7,1.025],[13.95,1.025],[14.7,1]]);
    actions.push({type:'move_layer',targetId:'recording',beforeId:saved.snapshot.overlays.find(o=>o.name==='Time observed').id});
    const plan = { format:'autopromote-scene-actions',version:1,projectId:saved.id,
      baseRevision:saved.snapshot.studioDocument.revision,name:'Spoken-cue recording reconstruction',actions };
    fs.writeFileSync(stamp('dialogue-scene-actions.json'),JSON.stringify(plan,null,2));
    await p.getByTestId('studio-mode-fxflow').click();
    const panel=p.getByTestId('studio-scene-actions');
    if(!await panel.evaluate(el=>el.open)) await panel.locator('summary').click();
    await panel.getByLabel('Scene action plan',{exact:true}).setInputFiles(stamp('dialogue-scene-actions.json'));
    await panel.getByRole('button',{name:'Apply reviewed scene actions',exact:true}).click();
    await panel.getByRole('status').filter({hasText:'Scene actions applied'}).waitFor();
    saved=await save(p,'dialogue-spatial');
    const waveform=saved.snapshot.overlays.find(o=>o.name==='Original voice amplitude');
    await p.getByTestId('dock-tab-comp_rig').click();
    await p.getByTestId(`comp-layer-row-${waveform.id}`).locator('.ap-comp-layer-title').click();
    await q.tool(p,'B-roll');await p.getByRole('button',{name:'Stretch',exact:true}).click();
    await q.tool(p,'Motion');
    const transform=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await transform.count())await transform.click();
    await p.getByLabel('Target layer',{exact:true}).selectOption(waveform.id);
    for(const [time,value] of [[9.451333,0],[11.071333,100]]) {
      await seek(p,time);const input=p.getByLabel('Stroke end',{exact:true});await input.fill(String(value));await input.blur();
      const add=p.getByRole('button',{name:'Add stroke end key at playhead',exact:true});if(await add.count())await add.click();
    }
    saved=await save(p,'dialogue-authored');await backup(p,'Editable Project');
    assert(saved.snapshot.overlays.every(o=>!/clock/i.test(o.name)));
    assert.equal(saved.snapshot.overlays.find(o=>o.name==='Synchronized recording plane').sourceStartTime,2.5);
    assert.equal(saved.snapshot.overlays.find(o=>o.name==='Original voice amplitude').mediaFit,'stretch');
    fs.writeFileSync(stamp('dialogue-authoring.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),
      layers:saved.snapshot.overlays.length,keys:saved.snapshot.motionKeyframes.length,clockGraphics:0,
      actualNativeUI:true,sourceWordTimeMethod:'Local CPU recognition estimates; human listening unqualified',
      synchronizedPlaneSourceStart:2.5,paidGenerationCalls:0,creativeStatus:'INTERNAL_COMPOSITION_REVIEW'},null,2));
    await reviewStills(p);
  } finally {await stop();}
}
async function videoTexture(p) {
  const stop=await recording(p);
  try{
    let saved=await save(p,'texture-before');
    await p.getByTestId('studio-mode-fxflow').click();
    const panel=p.getByTestId('studio-scene-actions');if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
    const old=saved.snapshot.overlays.find(o=>o.name==='Synchronized recording plane');
    const plan={format:'autopromote-scene-actions',version:1,projectId:saved.id,baseRevision:saved.snapshot.studioDocument.revision,
      name:'Replace recording surface with editable 3D scene',actions:[{type:'remove_keys',targetId:old.id,property:'opacity'},
        {type:'keys',targetId:old.id,keys:[{property:'opacity',time:2.5,value:0,easing:'linear'}]}]};
    fs.writeFileSync(stamp('replace-plane-actions.json'),JSON.stringify(plan,null,2));
    await panel.getByLabel('Scene action plan',{exact:true}).setInputFiles(stamp('replace-plane-actions.json'));
    await panel.getByRole('button',{name:'Apply reviewed scene actions',exact:true}).click();
    await panel.getByRole('status').filter({hasText:'Scene actions applied'}).waitFor();
    await seek(p,2.5);await q.tool(p,'Motion');await p.getByRole('button',{name:'3D Motion',exact:true}).click();
    await p.getByTitle('Add Recording Plane at playhead',{exact:true}).click();
    const controls=p.getByTestId('studio-3d-panel');
    await controls.getByLabel('End (s)',{exact:true}).fill('7.4');
    await controls.getByLabel('3D video texture source',{exact:true}).selectOption(saved.snapshot.projectMedia[0].id);
    await controls.getByLabel('Texture source start (s)',{exact:true}).fill('2.5');
    await controls.getByRole('button',{name:'Advanced',exact:true}).click();
    for(const [time,values] of [[2.5,{X:50,Y:50,Z:0,Scale:1.37,'Rotate Y':0}],
      [3.35,{X:68,Y:50,Z:0,Scale:.95,'Rotate Y':-12}],
      [6.65,{X:68,Y:50,Z:.2,Scale:.95,'Rotate Y':-10}],
      [7.4,{X:50,Y:50,Z:0,Scale:1.37,'Rotate Y':0}]]){
      await seek(p,time);
      for(const [label,value] of Object.entries(values))await controls.getByLabel(label==='X'?'X (%)':label==='Y'?'Y (%)':label,{exact:true}).fill(String(value));
      await controls.getByRole('button',{name:/Add pose keyframe at/}).click();
    }
    await controls.getByLabel('Camera motion',{exact:true}).fill('.6');
    saved=await save(p,'texture-authored');await backup(p,'Editable Project');
    const scene=saved.snapshot.threeDScenes[0];assert.equal(scene.assetSourceStart,2.5);assert.equal(scene.keyframes.length,4);
    await seek(p,4);
    await p.screenshot({path:stamp('native-3d-authoring.png')});
    await controls.getByRole('button',{name:'Generate HQ 3D Preview',exact:true}).click();
    await controls.getByLabel('HQ 3D preview',{exact:true}).waitFor({timeout:600000});
    saved=await save(p,'texture-preview-completed');await backup(p,'Editable Project');
    fs.writeFileSync(stamp('native-3d-authoring.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),
      scene:saved.snapshot.threeDScenes[0],normalStudioUI:true,sourceIn:2.5,modelCalls:0,gpuJobs:0},null,2));
  }finally{await stop();}
}
async function openWorld(p) {
  const files=['City','Footsteps','Open trail','Autumn','Coast','Summit'];
  await p.locator('.creator-studio-dropzone input[type=file]').setInputFiles(stamp(`open-world-sources/${files[0]}.mp4`));
  await p.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:180000});
  await h.rail(p);await pause(p);await p.getByLabel('Project name',{exact:true}).fill(title);
  const stop=await recording(p);
  try{
    await q.tool(p,'Reframe');await p.getByTestId('reframe-aspect-16-9').click();await p.getByTestId('reframe-preserve-frame').click();
    const rounded=p.getByLabel('Rounded main footage',{exact:true});if(await rounded.count()&&await rounded.isChecked())await rounded.uncheck();
    for(const name of files.slice(1)){
      await h.rail(p);await p.getByTestId('project-media-import-input').setInputFiles(stamp(`open-world-sources/${name}.mp4`));
      const card=p.locator('.studio-media-card').filter({has:p.locator('strong',{hasText:name+'.mp4'})});
      await card.getByRole('button',{name:'Preview '+name+'.mp4',exact:true}).click();
      await card.getByRole('button',{name:'Add to sequence',exact:true}).click({timeout:90000});
    }
    await q.tool(p,'Sound');await p.getByLabel('Use voice repair on export',{exact:true}).uncheck();
    await save(p,'open-world-raw');await backup(p,'Raw Project');
    await seek(p,0);await q.tool(p,'Graphics');
    const graphics=p.getByTestId('studio-graphics-import');if(!await graphics.evaluate(el=>el.open))await graphics.locator('summary').click();
    await p.getByLabel('Graphics composition file',{exact:true}).setInputFiles(stamp('open-world.graphics.json'));
    await graphics.getByRole('status').filter({hasText:'imported'}).waitFor();
    await q.tool(p,'Sound');
    await p.getByLabel('Use voice repair on export',{exact:true}).uncheck();
    await p.getByTestId('background-sound-input').setInputFiles(path.join(root,'reports/studio-break-loop-depth-20261015/assets/Break-loop-score-master.wav'));
    const duck=p.getByLabel('Duck under speech',{exact:true});if(await duck.count()&&await duck.isChecked())await duck.uncheck();
    await range(p.getByText('Background volume',{exact:true}).locator('..').locator('..').locator('input'),55);
    await range(p.getByLabel('Music fade in',{exact:true}),1.2);await range(p.getByLabel('Music fade out',{exact:true}),2.5);
    let saved=await save(p,'open-world-assembly');await backup(p,'Editable Project');
    await seek(p,5.5);await q.tool(p,'Motion');await p.getByRole('button',{name:'3D Motion',exact:true}).click();
    await p.getByTitle('Add Recording Plane at playhead',{exact:true}).click();
    const controls=p.getByTestId('studio-3d-panel');
    await controls.getByLabel('End (s)',{exact:true}).fill('8.8');
    await controls.getByLabel('3D video texture source',{exact:true}).selectOption(saved.snapshot.projectMedia[0].id);
    await controls.getByLabel('Texture source start (s)',{exact:true}).fill('5.5');
    await controls.getByRole('button',{name:'Advanced',exact:true}).click();
    for(const [time,values] of [[5.5,{X:50,Y:50,Z:0,Scale:1.37,'Rotate Y':0}],
      [6.15,{X:64,Y:47,Z:0,Scale:.98,'Rotate Y':-17}],
      [8.15,{X:64,Y:47,Z:.2,Scale:.98,'Rotate Y':-10}],
      [8.8,{X:50,Y:50,Z:0,Scale:1.37,'Rotate Y':0}]]){
      await seek(p,time);for(const [label,value]of Object.entries(values))await controls.getByLabel(label==='X'?'X (%)':label==='Y'?'Y (%)':label,{exact:true}).fill(String(value));
      await controls.getByRole('button',{name:/Add pose keyframe at/}).click();
    }
    await controls.getByLabel('Camera motion',{exact:true}).fill('.6');
    saved=await save(p,'open-world-authored');await backup(p,'Editable Project');
    await controls.getByRole('button',{name:'Generate HQ 3D Preview',exact:true}).click();
    await Promise.race([controls.getByLabel('HQ 3D preview',{exact:true}).waitFor({timeout:600000}),
      controls.getByRole('alert').waitFor({timeout:600000}).then(async()=>{throw Error(await controls.getByRole('alert').innerText());})]);
    saved=await save(p,'open-world-3d-completed');await backup(p,'Editable Project');
    fs.writeFileSync(stamp('native-3d-authoring.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),
      scene:saved.snapshot.threeDScenes[0],normalStudioUI:true,sourceIn:5.5,modelCalls:0,gpuJobs:0},null,2));
  }finally{await stop();}
}
async function textureRig(p) {
  const stop=await recording(p);
  try{
    await q.tool(p,'Motion');await p.getByRole('button',{name:'3D Motion',exact:true}).click();
    const controls=p.getByTestId('studio-3d-panel');await controls.getByRole('button',{name:'Advanced',exact:true}).click();
    for(const [time,values]of [[5.5,{'X (%)':50,'Y (%)':50,Z:0,Scale:1.37,'Rotate Y':0}],
      [6.15,{'X (%)':64,'Y (%)':47,Z:0,Scale:.98,'Rotate Y':-17}],
      [8.15,{'X (%)':64,'Y (%)':47,Z:.2,Scale:.98,'Rotate Y':-10}],
      [8.8,{'X (%)':50,'Y (%)':50,Z:0,Scale:1.37,'Rotate Y':0}]]){
      await seek(p,time);for(const [label,value]of Object.entries(values))await controls.getByLabel(label==='X'?'X (%)':label==='Y'?'Y (%)':label,{exact:true}).fill(String(value));
      await controls.getByRole('button',{name:/Add pose keyframe at/}).click();
    }
    await controls.getByLabel('Camera motion',{exact:true}).fill('.6');
    let saved=await save(p,'open-world-authored');await backup(p,'Editable Project');
    await controls.getByRole('button',{name:'Generate HQ 3D Preview',exact:true}).click();
    await controls.getByLabel('HQ 3D preview',{exact:true}).waitFor({timeout:600000});
    saved=await save(p,'open-world-3d-completed');await backup(p,'Editable Project');
    fs.writeFileSync(stamp('native-3d-authoring.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),
      scene:saved.snapshot.threeDScenes[0],normalStudioUI:true,sourceIn:5.5,modelCalls:0,gpuJobs:0},null,2));
  }finally{await stop();}
}
async function texturePreview(p){
  await q.tool(p,'Motion');await p.getByRole('button',{name:'3D Motion',exact:true}).click();
  const controls=p.getByTestId('studio-3d-panel'),stop=await recording(p);
  try{
    await controls.getByRole('button',{name:/^(Generate HQ 3D Preview|Retry HQ 3D Preview)$/}).click();
    await Promise.race([controls.getByLabel('HQ 3D preview',{exact:true}).waitFor({timeout:600000}),
      controls.getByRole('alert').waitFor({timeout:600000}).then(async()=>{throw Error(await controls.getByRole('alert').innerText());})]);
    const saved=await save(p,'open-world-3d-completed');await backup(p,'Editable Project');
    fs.writeFileSync(stamp('native-3d-authoring.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),
      scene:saved.snapshot.threeDScenes[0],normalStudioUI:true,sourceIn:5.5,modelCalls:0,gpuJobs:0},null,2));
  }finally{await stop();}
}
async function texturePolish(p){
  const stop=await recording(p);
  try{
    await q.tool(p,'Graphics');const graphics=p.getByTestId('studio-graphics-import');
    if(!await graphics.evaluate(el=>el.open))await graphics.locator('summary').click();
    await p.getByLabel('Graphics composition file',{exact:true}).setInputFiles(stamp('departure.graphics.json'));
    await graphics.getByRole('status').filter({hasText:'imported'}).waitFor();
    const before=await save(p,'before-departure-refinement');
    const path=before.snapshot.overlays.find(o=>o.name==='Journey path');
    await p.getByTestId('studio-mode-fxflow').click();
    const plan={format:'autopromote-scene-actions',version:1,projectId:before.id,baseRevision:before.snapshot.studioDocument.revision,
      name:'Make the departure plane legible',actions:[{type:'keys',targetId:'main-video',keys:[[0,1],[5.5,1],[6.15,.16],[8.15,.16],[8.8,1]].map(([time,value])=>({property:'opacity',time,value,easing:'bezier',curve:[.22,1,.36,1]}))}]};
    fs.writeFileSync(stamp('departure.scene-actions.json'),JSON.stringify(plan,null,2));
    const actions=p.getByTestId('studio-scene-actions');if(!await actions.evaluate(el=>el.open))await actions.locator('summary').click();
    await actions.getByLabel('Scene action plan',{exact:true}).setInputFiles(stamp('departure.scene-actions.json'));
    await actions.getByRole('button',{name:'Apply reviewed scene actions',exact:true}).click();
    await actions.getByRole('status').filter({hasText:'Scene actions applied'}).waitFor();
    await p.getByTestId('dock-tab-comp_rig').click();
    await p.getByTestId(`comp-layer-row-${path.id}`).locator('.ap-comp-layer-title').click();
    await q.tool(p,'B-roll');await p.getByRole('button',{name:'Stretch',exact:true}).click();
    await q.tool(p,'Motion');const transform=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await transform.count())await transform.click();
    await p.getByLabel('Target layer',{exact:true}).selectOption(path.id);
    for(const [time,value]of [[5.5,0],[6.8,100]]){
      await seek(p,time);await p.getByLabel('Stroke end',{exact:true}).fill(String(value));
      await p.getByLabel('Stroke end',{exact:true}).press('Enter');
      const add=p.getByRole('button',{name:'Add stroke end key at playhead',exact:true});if(await add.isVisible())await add.click();
    }
    await q.tool(p,'Motion');await p.getByRole('button',{name:'3D Motion',exact:true}).click();
    const controls=p.getByTestId('studio-3d-panel');await controls.getByRole('button',{name:'Advanced',exact:true}).click();
    for(const [time,values]of [[6.166666,{'X (%)':64,'Y (%)':47,Z:0,Scale:.75,'Rotate Y':-17}],
      [8.166665,{'X (%)':64,'Y (%)':47,Z:.2,Scale:.75,'Rotate Y':-10}]]){
      await seek(p,time);for(const [label,value]of Object.entries(values))await controls.getByLabel(label,{exact:true}).fill(String(value));
      await controls.getByRole('button',{name:/Add pose keyframe at/}).click();
    }
    await save(p,'departure-refined');await backup(p,'Editable Project');
  }finally{await stop();}
  await texturePreview(p);
}
async function textureRecover(p){
  await q.tool(p,'Motion');await p.getByRole('button',{name:'3D Motion',exact:true}).click();
  const controls=p.getByTestId('studio-3d-panel'),stop=await recording(p);
  try{
    const invalid={...JSON.parse(fs.readFileSync(stamp('completed-3d-preview-receipt.json'))),sceneHash:'0'.repeat(64)};
    fs.writeFileSync(stamp('mismatched-3d-preview-receipt.json'),JSON.stringify(invalid));
    await controls.getByLabel('Restore 3D preview receipt',{exact:true}).setInputFiles(stamp('mismatched-3d-preview-receipt.json'));
    await controls.getByRole('alert').filter({hasText:'different scene settings'}).waitFor();
    await controls.getByLabel('Restore 3D preview receipt',{exact:true}).setInputFiles(stamp('completed-3d-preview-receipt.json'));
    await controls.getByRole('alert').filter({hasText:'different scene settings'}).waitFor({state:'hidden',timeout:30000});
    await Promise.race([controls.getByLabel('HQ 3D preview',{exact:true}).waitFor({timeout:30000}),
      controls.getByRole('alert').waitFor({timeout:30000}).then(async()=>{throw Error(await controls.getByRole('alert').innerText());})]);
    const saved=await save(p,'open-world-3d-completed');await backup(p,'Editable Project');
    fs.writeFileSync(stamp('native-3d-authoring.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),scene:saved.snapshot.threeDScenes[0],normalStudioUI:true,existingCompletedJobRecovered:true,sourceIn:5.5,modelCalls:0,gpuJobs:0},null,2));
  }finally{await stop();}
}
async function textureShade(p){
  const stop=await recording(p);
  try{
    await q.tool(p,'Graphics');const graphics=p.getByTestId('studio-graphics-import');
    if(!await graphics.evaluate(el=>el.open))await graphics.locator('summary').click();
    await p.getByLabel('Graphics composition file',{exact:true}).setInputFiles(stamp('departure-shade.graphics.json'));
    await graphics.getByRole('status').filter({hasText:'imported'}).waitFor();
    const before=await save(p,'before-shade-optimization'),shade=before.snapshot.overlays.find(o=>o.name==='Departure shade');
    const plan={format:'autopromote-scene-actions',version:1,projectId:before.id,baseRevision:before.snapshot.studioDocument.revision,name:'Use a native timed shade layer',
      actions:[{type:'remove_keys',targetId:'main-video',property:'opacity'},
        {type:'move_layer',targetId:shade.id,beforeId:before.snapshot.overlays.find(o=>o.name==='Light falloff').id}]};
    fs.writeFileSync(stamp('departure-shade.scene-actions.json'),JSON.stringify(plan,null,2));
    await p.getByTestId('studio-mode-fxflow').click();const actions=p.getByTestId('studio-scene-actions');if(!await actions.evaluate(el=>el.open))await actions.locator('summary').click();
    await actions.getByLabel('Scene action plan',{exact:true}).setInputFiles(stamp('departure-shade.scene-actions.json'));
    await actions.getByRole('button',{name:'Apply reviewed scene actions',exact:true}).click();await actions.getByRole('status').filter({hasText:'Scene actions applied'}).waitFor();
    const saved=await save(p,'shade-optimized');await backup(p,'Editable Project');
    assert.equal(saved.snapshot.motionKeyframes.filter(k=>k.targetId==='main-video'&&k.property==='opacity').length,0);
  }finally{await stop();}
}
async function canonicalTextureSave(p){
  await q.tool(p,'Motion');await p.getByRole('button',{name:'3D Motion',exact:true}).click();
  const controls=p.getByTestId('studio-3d-panel');
  assert.equal(await controls.getByLabel('Texture source start (s)',{exact:true}).inputValue(),'5.5');
  const saved=await save(p,'canonical-video-texture');await backup(p,'Editable Project');
  const scene=saved.snapshot.threeDScenes[0],layer=saved.snapshot.studioDocument.layers.find(l=>l.layerId===scene.id);
  for(const key of ['assetType','assetSourceStart','assetAspect','assetContentHash'])assert.equal(layer.parameters[key],scene[key]);
  assert.equal(scene.assetType,'video');assert.equal(scene.assetSourceStart,5.5);
  fs.writeFileSync(stamp('canonical-video-texture.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),
    sourceIn:5.5,sourceHash:scene.assetContentHash,canonicalVideoFieldsRetained:true,normalNativeSave:true,jobId:scene.hqPreviewJobId},null,2));
}
async function reviewStills(p) {
  await p.getByTestId('studio-mode-fxflow').click();
  await p.getByTestId('studio-comp-workbench').getByText('Main Programme',{exact:true}).click();
  await p.getByTestId('dock-tab-timeline').click();
  for(const time of textureVariant?[0,2.5,4,5.5,6.5,8.2,9,11,19,29,33,42,55,59.5]:[0,2.5,3.7,5.2,6.25,7.4,8.9,10.9,12.9,14,15.25]) {
    await seek(p,time);
    await p.waitForFunction(t=>{const v=document.querySelector('[data-testid="studio-after-video"]');
      const c=document.querySelector('[data-testid="studio-program-canvas"]');
      return v&&!v.seeking&&v.readyState>=2&&Math.abs(Number(c?.dataset.programmeTime)-t)<1/24;
    },time,{timeout:15000});
    await p.getByTestId('hook-preview-frame').screenshot({path:stamp(`composition-${time}.png`)});
    if (dialogueVariant && time === 10.9) fs.writeFileSync(stamp('vector-preview-geometry.json'),JSON.stringify(await p.locator('[data-studio-layer-id]').evaluateAll(nodes=>nodes.filter(el=>el.querySelector('img[src^="data:image/svg"]')).map(el=>{
      const img=el.querySelector('img'),s=getComputedStyle(img),box=el.getBoundingClientRect(),i=img.getBoundingClientRect();
      return {id:el.dataset.studioLayerId,layer:{width:box.width,height:box.height},image:{width:i.width,height:i.height},fit:s.objectFit,src:img.src};
    })),null,2));
  }
}
async function settleDialogue(p) {
  const before=await save(p,'dialogue-before-framing');
  const rows={x:[[0,50],[8.08,50],[8.7,51],[13.95,51],[14.7,50]],
    scale:[[0,1],[1.9,1.025],[2.5,1],[7.4,1],[8.08,1],[8.7,1.025],[13.95,1.025],[14.7,1]]};
  const actions=Object.entries(rows).flatMap(([property,values])=>[
    {type:'remove_keys',targetId:'main-video',property},
    {type:'keys',targetId:'main-video',keys:values.map(([time,value])=>({property,time,value,easing:'bezier',curve:[.22,1,.36,1]}))}
  ]);
  const plan={format:'autopromote-scene-actions',version:1,projectId:before.id,baseRevision:before.snapshot.studioDocument.revision,name:'Preserve full presenter framing',actions};
  fs.writeFileSync(stamp('dialogue-framing-actions.json'),JSON.stringify(plan,null,2));
  const stop=await recording(p);
  try{
    await p.getByTestId('studio-mode-fxflow').click();const panel=p.getByTestId('studio-scene-actions');
    if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
    await panel.getByLabel('Scene action plan',{exact:true}).setInputFiles(stamp('dialogue-framing-actions.json'));
    await panel.getByRole('button',{name:'Apply reviewed scene actions',exact:true}).click();
    await panel.getByRole('status').filter({hasText:'Scene actions applied'}).waitFor();
    const saved=await save(p,'dialogue-framing');await backup(p,'Editable Project');
    const receipt=JSON.parse(fs.readFileSync(stamp('dialogue-authoring.json')));receipt.canonicalHash=hash(saved.snapshot.studioDocument);
    receipt.framingReviewed=true;fs.writeFileSync(stamp('dialogue-authoring.json'),JSON.stringify(receipt,null,2));
    await reviewStills(p);
  }finally{await stop();}
}
async function review(p) {
  // Completed projects can reopen showing their finished movie. Select the
  // existing live-edit control before measuring the editable graph.
  await q.tool(p, 'Export');
  const live = p.getByRole('button', { name:'Show Live Edit', exact:true });
  if (await live.isVisible()) await live.click();
  assert.equal(await p.getByTestId('hook-preview-frame').evaluate(el=>el.classList.contains('has-rendered-output')),false);
  await p.getByTestId('studio-mode-fxflow').click();
  await p.getByTestId('studio-comp-workbench').getByText('Main Programme', { exact: true }).click();
  await p.getByTestId('dock-tab-timeline').click();
  const before = await save(p, 'review-before');
  const programmeDuration=before.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick/90000;
  const samples = [];
  for (const time of textureVariant?[0,2,5.5,6.5,8.2,9.9,10.1,15.9,16.1,23.9,24.1,30,36,42,48,54,59.9]:[0, 1.5, 3.5, 5, 6.5, 6.8, 7.5, 8.1, 9.5, 11, 12.5, 13.5, 14.5, 15.5]) {
    await seek(p, time);
    await p.waitForFunction(t=>{
      const video=document.querySelector('[data-testid="studio-after-video"]');
      const canvas=document.querySelector('[data-testid="studio-program-canvas"]');
      return video && !video.seeking && video.readyState>=2 && Math.abs(Number(canvas?.dataset.programmeTime)-t)<1/24;
    },time,{timeout:10000});
    await p.getByTestId('hook-preview-frame').screenshot({ path: stamp(`preview-${time.toFixed(2)}.png`) });
    samples.push({ requested: time, ...await p.getByTestId('hook-preview-frame').evaluate(frame => ({
      sourceTime: frame.querySelector('[data-testid="studio-after-video"]')?.currentTime,
      programmeTime: frame.querySelector('[data-testid="studio-program-canvas"]')?.dataset.programmeTime,
      layers: [...frame.querySelectorAll('[data-studio-layer-id]')].map(el => ({ id: el.dataset.studioLayerId,
        programmeTime: el.dataset.programmeTime, left: el.style.left, top: el.style.top, opacity: getComputedStyle(el).opacity,
        rotation: el.style.getPropertyValue('--title-rotation'), scale: el.style.getPropertyValue('--title-scale'),
        text: el.textContent.slice(0, 80) })),
    })) });
  }
  fs.writeFileSync(stamp('preview-samples.json'), JSON.stringify(samples, null, 2));
  await seek(p, 0);
  await p.evaluate(() => {
    const stage = document.querySelector('[data-testid="hook-preview-frame"]');
    const samples = [], times = [], start = performance.now(); let raf;
    const observer = new MutationObserver(() => {
      const canvas = stage.querySelector('[data-testid="studio-program-canvas"]');
      const t = Number(canvas?.dataset.programmeTime);
      if (Number.isFinite(t) && t !== samples.at(-1)?.programmeTime) samples.push({ ms: performance.now()-start, programmeTime: t });
    });
    observer.observe(stage, { subtree: true, attributes: true, attributeFilter: ['data-programme-time'] });
    const tick = t => { times.push(t); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick);
    window.__stopMotionFlowPlayback = () => { observer.disconnect(); cancelAnimationFrame(raf);
      return { elapsedMs: performance.now()-start, canvasProgrammeSamples: samples, animationFrameTimes: times,
        decoderQuality: (() => { const quality = document.querySelector('[data-testid="studio-after-video"]')?.getVideoPlaybackQuality?.();
          return quality ? { totalVideoFrames: quality.totalVideoFrames, droppedVideoFrames: quality.droppedVideoFrames,
            corruptedVideoFrames: quality.corruptedVideoFrames, creationTime: quality.creationTime } : null; })() }; };
  });
  const profiler = process.env.STUDIO_MOTION_PROFILE === 'true' ? await p.context().newCDPSession(p) : null;
  if(profiler) {await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}
  const stop = await recording(p);
  await p.getByRole('button', { name: 'Play edited preview', exact: true }).click();
  await p.waitForFunction(end => {
    const canvas = document.querySelector('[data-testid="studio-program-canvas"]');
    return Number(canvas?.dataset.programmeTime) >= end-2/24;
  }, programmeDuration, { timeout: Math.max(60000,programmeDuration*4000) });
  await pause(p); const timing = await p.evaluate(() => window.__stopMotionFlowPlayback()); await stop();
  if(textureVariant)fs.copyFileSync(stamp('editing-in-studio.mp4'),stamp('live-playback-in-studio.mp4'));
  if(profiler) {const result=await profiler.send('Profiler.stop');fs.writeFileSync(stamp('preview-cpu-profile.private.json'),JSON.stringify(result.profile));await profiler.detach();}
  const after = await save(p, 'review-after'); assert.equal(decisions(after.snapshot.studioDocument), decisions(before.snapshot.studioDocument));
  fs.writeFileSync(stamp('playback.json'), JSON.stringify({ ...timing, canonicalHash: hash(after.snapshot.studioDocument),
    headlessMuted: true, modelInferenceInvoked: false, noCreativeApprovalImplied: true }, null, 2));
}
async function refineCinematic(p) {
  const before=await save(p,'before-refinement');
  const stop=await recording(p);
  try {
    const names=['study-disclosure','copy-identity','label-video','label-real'];
    for(const name of names) {
      const layer=before.snapshot.overlays.find(o=>o.name===name);
      await p.getByTestId('studio-mode-fxflow').click();await p.getByTestId('dock-tab-comp_rig').click();
      await p.getByTestId(`comp-layer-row-${layer.id}`).locator('.ap-comp-layer-title').click();
      await q.tool(p,'Graphics');await range(p.getByLabel('Title text box width',{exact:true}),90);
    }
    await q.tool(p,'Composite');
    await p.getByLabel(`${before.snapshot.adjustmentLayers[0].name} Duration`,{exact:true}).fill('15.75');
    // Sample native contour motion during the shutter; the projected media
    // plane correctly excludes this unsupported combination.
    await q.tool(p,'Motion');
    const transform=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await transform.count()) await transform.click();
    await p.getByLabel('Target layer',{exact:true}).selectOption(before.snapshot.overlays.find(o=>o.vectorShape).id);
    await p.getByLabel('Enable layer motion blur',{exact:true}).check();
    const saved=await save(p,'cinematic-refined');await backup(p,'Editable Project');
    assert.equal(saved.snapshot.adjustmentLayers[0].duration,15.75);
    assert(saved.snapshot.overlays.find(o=>o.vectorShape).motionBlur.enabled);
    await seek(p,12.5);await p.getByTestId('hook-preview-frame').screenshot({path:stamp('refined-stage.png')});
  }finally{await stop();}
}
async function exportPlayback(p) {
  const receipt=JSON.parse(fs.readFileSync(stamp('native-motion-flow/render-receipt.json')));
  const programmeDuration=textureVariant?60:15.760333333333334;
  await p.getByTestId('dock-tab-timeline').click();await q.tool(p,'Export');
  const response=p.waitForResponse(r=>new URL(r.url()).pathname===`/api/media/status/${receipt.submittedJobId}` && r.ok(),{timeout:30000});
  await p.getByLabel('Restore export receipt',{exact:true}).setInputFiles(stamp('native-motion-flow/render-receipt.json'));
  const status=await (await response).json();
  await p.getByTestId('rendered-output-ready').waitFor({timeout:30000});
  assert.equal(status.status,'completed','Normal authenticated completed-job response required');
  const output=stamp('native-motion-flow/final.mp4');
  if(fs.existsSync(output))fs.copyFileSync(output,stamp(`native-motion-flow/previous-${hash(fs.readFileSync(output))}.mp4`));
  const download=p.waitForEvent('download');
  await p.getByTestId('rendered-output-ready').getByRole('button',{name:/Download/}).click();
  const transfer=await download;await transfer.saveAs(output);assert.equal(await transfer.failure(),null);
  assert.equal(hash(fs.readFileSync(output)),receipt.outputSha256);
  assert.equal(status.result?.outputSha256||status.outputSha256,receipt.outputSha256);
  const technical=q.verifyMedia(output,{duration:programmeDuration,width:1280,height:720,fps:24,frames:Math.round(programmeDuration*24)});
  fs.writeFileSync(stamp('native-motion-flow/recovered-download.json'),JSON.stringify({projectId:receipt.projectId,
    projectHash:receipt.projectHash,outputSha256:receipt.outputSha256,submittedJobId:receipt.submittedJobId,
    normalAuthenticatedReceiptRestore:true,actualNativeDownload:true,technical},null,2));
  const showFinished=p.getByRole('button',{name:'Show Finished Video',exact:true});
  if(await showFinished.isVisible())await showFinished.click();
  await p.waitForFunction(()=>document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output'));
  const video=p.getByTestId('studio-after-video');
  await p.waitForFunction(duration=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&v.readyState>=2&&Math.abs(v.duration-duration)<.05;},programmeDuration,{timeout:30000});
  await seek(p,0);await video.evaluate(el=>{el.pause();el.currentTime=0;el.muted=true;});
  await p.waitForTimeout(250);
  await video.evaluate(el=>{
    window.__finalPlayback={maximumTime:0,ended:false,initialDuration:el.duration};
    const sample=()=>{window.__finalPlayback.maximumTime=Math.max(window.__finalPlayback.maximumTime,el.currentTime);};
    const quality=()=>{const q=el.getVideoPlaybackQuality();return{time:el.currentTime,duration:el.duration,totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames,corruptedVideoFrames:q.corruptedVideoFrames};};
    el.addEventListener('timeupdate',sample);el.addEventListener('ended',()=>{sample();window.__finalPlayback.ended=true;window.__finalPlayback.finalQuality=quality();});
    window.__readFinalPlayback=()=>({...quality(),...window.__finalPlayback.finalQuality,...window.__finalPlayback});
  });
  const stop=await recording(p);
  await p.getByRole('button',{name:'Play edited preview',exact:true}).click();
  const start=Date.now();
  await p.waitForFunction(end=>{
    return window.__finalPlayback.ended || window.__finalPlayback.maximumTime>=end-1/24;
  },programmeDuration,{timeout:Math.max(60000,programmeDuration*2000)});
  const playbackWallMs=Date.now()-start;
  const quality=await p.evaluate(()=>window.__readFinalPlayback());
  assert(quality.maximumTime>=programmeDuration-1/24,'The selected finished movie must reach its full programme duration');
  assert(Math.abs(quality.initialDuration-programmeDuration)<.05);
  await pause(p);
  await stop();
  fs.copyFileSync(stamp('editing-in-studio.mp4'),stamp('complete-export-playback-in-studio.mp4'));
  fs.writeFileSync(stamp('export-playback.json'),JSON.stringify({...quality,playbackWallMs,captureAndEncodeWallMs:Date.now()-start,
    nativeReceiptRestored:true,scope:'Finished export played through the signed-in Studio, separately from live graph preview.'},null,2));
}
async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--disable-gpu',
    ...(textureVariant?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 },
    ...(fs.existsSync(browserState) ? { storageState: browserState } : {}) });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  const p = await context.newPage(); p.setDefaultTimeout(25000);
  p.on('dialog', dialog => void dialog.accept());
  p.on('pageerror', err => console.log('BROWSER_ERROR', err.message));
  try {
    await entry(p);
    if (phase === 'author') await author(p);
    else if (phase === 'open-world') await openWorld(p);
    else {
      await open(p);
      if (phase === 'render') await render(p);
      else if (phase === 'render-raw') await render(p, true);
      else if (phase === 'finish') await finishProject(p);
      else if (phase === 'review') await review(p);
      else if (phase === 'polish') await polish(p);
      else if (phase === 'cinematic') await cinematic(p);
      else if (phase === 'dialogue') await dialogue(p);
      else if (phase === 'video-texture') await videoTexture(p);
      else if (phase === 'texture-rig') await textureRig(p);
      else if (phase === 'texture-preview') await texturePreview(p);
      else if (phase === 'texture-polish') await texturePolish(p);
      else if (phase === 'texture-recover') await textureRecover(p);
      else if (phase === 'texture-shade') await textureShade(p);
      else if (phase === 'canonical-save') await canonicalTextureSave(p);
      else if (phase === 'restore-native') {
        const expected=JSON.parse(fs.readFileSync(stamp('Editable Project.autopromote.json'))),saved=await save(p,'independent-native-restore');
        assert.equal(decisions(saved.snapshot.studioDocument),decisions(expected.snapshot.studioDocument));
        const sourceFiles=saved.snapshot.projectMedia.map(m=>({name:m.name,sha256:m.contentHash,storagePath:m.storagePath}));
        for(const source of sourceFiles)assert.equal(source.sha256,hash(fs.readFileSync(stamp('open-world-sources/'+source.name))));
        const scene=saved.snapshot.threeDScenes[0],canonical=saved.snapshot.studioDocument.layers.find(l=>l.layerId===scene.id);
        for(const key of ['assetType','assetSourceStart','assetAspect','assetContentHash'])assert.equal(canonical.parameters[key],scene[key]);
        assert.equal(scene.assetSourceStart,5.5);
        fs.writeFileSync(stamp('native-project-recovery.json'),JSON.stringify({projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),exactDecisions:true,sourceFiles,
          canonicalVideoFieldsRetained:true,normalNativeBackupRestore:true,independentBrowser:true,scope:'Ordinary native backup with reauthorized owned media; source proxies are supplied separately. No claim of offline or deleted-storage recovery.'},null,2));
      }
      else if(phase==='sampling-playback'){
        const audit=stamp('scene-sampling-audit-20261101/full-playback');fs.mkdirSync(audit,{recursive:true});
        await q.tool(p,'Export');
        const live=p.getByRole('button',{name:'Show Live Edit',exact:true});
        await live.waitFor({state:'visible',timeout:30000});await live.click();
        await p.getByTestId('studio-program-canvas').waitFor({state:'visible'});
        await p.getByTestId('studio-mode-fxflow').click();
        await p.getByTestId('studio-comp-workbench').getByText('Main Programme',{exact:true}).click();
        await p.getByTestId('dock-tab-timeline').click();await seek(p,0);
        await p.evaluate(()=>{
          const start=performance.now(),frames=[],scene=[];
          const observer=new MutationObserver(()=>{
            const c=document.querySelector('[data-testid="studio-program-canvas"]'),time=Number(c?.dataset.programmeTime);
            if(Number.isFinite(time)&&time!==frames.at(-1)?.programmeTime){
              frames.push({programmeTime:time,ms:performance.now()-start});
              if(time>=5.5&&time<8.8)scene.push({programmeTime:time,...document.querySelector('[data-testid="studio-3d-preview"]')?.dataset});
            }
          });
          observer.observe(document.querySelector('[data-testid="hook-preview-frame"]'),{subtree:true,attributes:true,attributeFilter:['data-programme-time']});
          window.__finishSamplingPlayback=()=>{observer.disconnect();return {elapsedMs:performance.now()-start,frames,scene};};
        });
        const stop=await recording(p,audit);
        try{
          await p.getByRole('button',{name:'Play edited preview',exact:true}).click();
          await p.waitForFunction(()=>Number(document.querySelector('[data-testid="studio-program-canvas"]')?.dataset.programmeTime)>=60-2/24,undefined,{timeout:180000});
          await pause(p);const result=await p.evaluate(()=>window.__finishSamplingPlayback());
          fs.writeFileSync(path.join(audit,'playback.json'),JSON.stringify({...result,headless:true,muted:true,softwareWebGL:true,
            realTime24FpsQualified:false,wholePictureParityQualified:false},null,2));
          await p.getByTestId('hook-preview-frame').screenshot({path:path.join(audit,'after-playback.png')});
        }finally{await stop();}
      }
      else if(['sampling-audit','scene-sampling-audit'].includes(phase)){
        const audit=stamp(phase==='scene-sampling-audit'?'scene-sampling-audit-20261101':'sampling-audit-20261101');fs.mkdirSync(audit,{recursive:true});
        await q.tool(p,'Export');
        const live=p.getByRole('button',{name:'Show Live Edit',exact:true});
        // A completed project reconnects its retained render asynchronously.
        // Wait for that real control before switching; an earlier hidden
        // canvas is not a measurement of the live edit.
        await live.waitFor({state:'visible',timeout:30000});await live.click();
        await p.getByTestId('studio-program-canvas').waitFor({state:'visible'});
        assert.equal(await p.getByTestId('hook-preview-frame').evaluate(el=>el.classList.contains('has-rendered-output')),false);
        const requests=[];
        p.on('response',async response=>{if(new URL(response.url()).pathname.endsWith('/studio-assets/source-frame')){
          const {image,...result}=await response.json().catch(()=>({}));requests.push({status:response.status(),...result});
          fs.writeFileSync(path.join(audit,'requests.json'),JSON.stringify(requests,null,2));
        }});
        await p.getByTestId('studio-mode-fxflow').click();
        await p.getByTestId('studio-comp-workbench').getByText('Main Programme',{exact:true}).click();
        const samples=[],canvas=p.getByTestId('studio-program-canvas');
        const stopAuditRecording=phase==='scene-sampling-audit'?await recording(p,audit):async()=>{};
        try{
        const state=()=>canvas.evaluate(el=>({programmeTime:el.dataset.programmeTime,sampling:el.dataset.sourceSampling,
          sourceFrameIndex:el.dataset.sourceFrameIndex,busy:el.getAttribute('aria-busy'),width:el.width,height:el.height}));
        for(const time of [6.5,8.2,10.1,15.9]){
          await seek(p,time);const initial=await state();
          samples.push({requested:time,initial});fs.writeFileSync(path.join(audit,'sampling.json'),JSON.stringify(samples,null,2));
          await p.getByTestId('hook-preview-frame').screenshot({path:path.join(audit,`initial-${time.toFixed(2)}.png`)});
          const start=Date.now();
          await p.waitForFunction(()=>{const c=document.querySelector('[data-testid="studio-program-canvas"]');return c?.dataset.sourceSampling==='accurate-paused'&&c.getAttribute('aria-busy')!=='true';},undefined,{timeout:30000});
          if(phase==='scene-sampling-audit'&&time<9){
            await p.waitForFunction(()=>document.querySelector('[data-testid="studio-3d-preview"]')?.dataset.textureSampling==='accurate-paused',undefined,{timeout:30000});
            samples.at(-1).scene=await p.getByTestId('studio-3d-preview').evaluate(el=>({...el.dataset}));
          }
          await p.waitForTimeout(100);
          await p.getByTestId('hook-preview-frame').screenshot({path:path.join(audit,`settled-${time.toFixed(2)}.png`)});
          Object.assign(samples.at(-1),{settled:await state(),settleWaitMs:Date.now()-start});
        }
        fs.writeFileSync(path.join(audit,'sampling.json'),JSON.stringify(samples,null,2));
        if(phase==='scene-sampling-audit'){
          await seek(p,5.6);
          await p.getByRole('button',{name:'Play edited preview',exact:true}).click();
          const transport=[];
          for(let index=0;index<12;index++){
            await p.waitForTimeout(150);
            transport.push(await p.getByTestId('studio-3d-preview').evaluate(el=>({...el.dataset})));
          }
          await pause(p);
          fs.writeFileSync(path.join(audit,'transport.json'),JSON.stringify(transport,null,2));
          assert(transport.some(row=>row.textureTransport==='playing'),'Texture transport must actually play');
          assert(new Set(transport.map(row=>row.textureSourceTime)).size>5,'Texture must present moving source frames');
          // Transport may cross the short scene's out-point while headless
          // capture is slow. Seek back into it before inspecting paused parity.
          await seek(p,6.5);
          await p.waitForFunction(()=>document.querySelector('[data-testid="studio-3d-preview"]')?.dataset.textureSampling==='accurate-paused',undefined,{timeout:30000});
          await p.getByTestId('hook-preview-frame').screenshot({path:path.join(audit,'paused-after-play.png')});
          const reopened=await save(p,'sampling-audit-reopened');
          const expected=JSON.parse(fs.readFileSync(stamp('Editable Project.autopromote.json')));
          assert.equal(decisions(reopened.snapshot.studioDocument),decisions(expected.snapshot.studioDocument));
          await backup(p,'scene-sampling-audit-20261101/Editable Project');
          fs.writeFileSync(path.join(audit,'project-preservation.json'),JSON.stringify({
            projectId:reopened.id,exactCanonicalDecisions:true,canonicalDecisionHash:decisions(reopened.snapshot.studioDocument),
            normalSave:true,nativeBackupDownloaded:true,sourceFiles:reopened.snapshot.projectMedia.map(m=>({name:m.name,sha256:m.contentHash})),
          },null,2));
        }
        }finally{await stopAuditRecording();}
      }
      else if (phase === 'stills') await reviewStills(p);
      else if (phase === 'settle-dialogue') await settleDialogue(p);
      else if (phase === 'refine') await refineCinematic(p);
      else if (phase === 'export-playback') await exportPlayback(p);
      else if (phase === 'portable') {
        const saved=await save(p,'portable-reopened');
        const expected=JSON.parse(fs.readFileSync(stamp('Portable Project.autopromote.json')));
        assert.equal(decisions(saved.snapshot.studioDocument),decisions(expected.snapshot.studioDocument));
        const restoredFiles=await p.evaluate(title=>new Promise((resolve,reject)=>{
          const opening=indexedDB.open('autopromote-viral-studio');opening.onerror=()=>reject(opening.error);
          opening.onsuccess=()=>{const db=opening.result,q=db.transaction('projects','readonly').objectStore('projects').getAll();
            q.onsuccess=async()=>{const record=q.result.find(x=>x.name===title);db.close();
              const inspect=async m=>({name:m.name,bytes:m.file?.size,
                sha256:m.file?[...new Uint8Array(await crypto.subtle.digest('SHA-256',await m.file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join(''):null});
              resolve({sourceFiles:await Promise.all(record.snapshot.projectMedia.map(inspect)),
                artworkFiles:await Promise.all(record.snapshot.overlays.filter(o=>o.type==='image').map(inspect))});};};
        }),title);
        const {sourceFiles,artworkFiles}=restoredFiles;
        for(const file of sourceFiles) assert.equal(file.sha256,hash(fs.readFileSync(textureVariant?stamp('open-world-sources/'+file.name):source(file.name))));
        if(dialogueVariant){
          const packaging=JSON.parse(fs.readFileSync(stamp('portable-packaging.json')));
          assert.equal(artworkFiles.length,packaging.artwork.length);
          for(const item of artworkFiles)assert.equal(item.sha256,packaging.artwork.find(a=>a.name===item.name)?.sha256);
        }
        fs.writeFileSync(stamp('portable-restore.json'),JSON.stringify({projectId:saved.id,exactDecisions:true,sourceFiles,artworkFiles,normalNativeBackupRestore:true},null,2));
      }
      else if (phase === 'inspect') { console.log((await p.locator('body').innerText()).slice(-7000)); await p.screenshot({ path: stamp('inspect.png') }); }
    }
  } catch (err) {
    await p.screenshot({ path: stamp(`failure-${Date.now()}.png`) }).catch(() => {});
    fs.writeFileSync(stamp(`failure-${Date.now()}.txt`), err.stack + '\n' + await p.locator('body').innerText());
    try { await save(p, 'interrupted'); await backup(p, 'Interrupted Project'); } catch (_) {}
    throw err;
  } finally { await context.storageState({ path: browserState }).catch(() => {}); await context.close(); await browser.close(); }
}
module.exports = { entry, open, pause, seek, range, save, backup, render, folder, title, decisions };
if (require.main === module) main().catch(err => { console.error(err.stack); process.exitCode = 1; });
