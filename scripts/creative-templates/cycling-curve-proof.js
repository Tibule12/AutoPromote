#!/usr/bin/env node
// Ordinary signed-in Studio controls only: edit the actual selected key,
// preserve the original, exercise history/reopen, and optionally CPU-export.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const h = require('./studio-proof');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const state = '/home/tibule12/.local/share/autopromote-qa/session/studio-cycling-keyframes-final.private.json';
const retained = '/home/tibule12/.local/share/autopromote-qa/session/studio-cycling-curves.private.json';
const name = 'VELO — value graph · 20261011';
const audioRetained = '/home/tibule12/.local/share/autopromote-qa/session/studio-cycling-audio-curve.private.json';
const audioName = 'VELO — SFX value curve · 20261011';
const decisions = document => { const { revision, journal, ...content } = document; return hash(content); };
async function main() {
  const action = process.argv[2] || 'edit'; fs.mkdirSync(folder, { recursive: true });
  assert(['edit','audio','audio-film','audio-render','audio-view','inspect','render','view'].includes(action));
  const audioDelivery = ['audio-render','audio-view'].includes(action);
  const selectedName = audioDelivery ? audioName : name;
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: action === 'edit' ? state : audioDelivery ? audioRetained : retained,
    acceptDownloads: true, viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  let renders = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/process') renders++; });
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=value-graph');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: action === 'edit' ? 'VELO — keyframe timeline · 20261011' : selectedName, exact: true }).click();
    await h.rail(page); assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (action === 'audio' || action === 'audio-film') {
      const q = require('../../test/e2e/playwright/studio-stability/run');
      const pause = page.getByRole('button',{name:'Pause comparison',exact:true});
      if (await pause.isVisible()) await pause.click();
      const original = await h.save(page,'audio-original');
      if (action === 'audio-film') {
        await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
        await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
        await page.getByLabel('Project name',{exact:true}).fill(audioName);
      }
      const before = await h.save(page,'audio-before');
      const backup = page.waitForEvent('download');
      await page.getByRole('button', {name:'Download project backup',exact:true}).click();
      const downloaded = await backup;
      await downloaded.saveAs(path.join(folder,'VELO-value-graph.autopromote.json'));
      fs.chmodSync(path.join(folder,'VELO-value-graph.autopromote.json'),0o600);
      assert.equal(await downloaded.failure(),null);
      assert.equal(hash(JSON.parse(fs.readFileSync(path.join(folder,'VELO-value-graph.autopromote.json'))).snapshot.studioDocument),hash(before.snapshot.studioDocument));
      await q.tool(page,'Sound');
      await page.getByLabel('Automation source',{exact:true}).selectOption('sfx');
      const keys = before.snapshot.audioKeyframes.sfx;
      assert(keys.length>1,'No authored SFX gain interval');
      const key = keys.at(-1);
      await page.getByLabel('Curve keyframe',{exact:true}).selectOption(key.id);
      await page.getByLabel('Selected audio key easing',{exact:true}).selectOption('bezier');
      await page.waitForTimeout(600);
      const baseline = await h.save(page,'audio-curve-baseline');
      const originalCurve = baseline.snapshot.audioKeyframes.sfx.find(item=>item.id===key.id).curve || [.33,0,.67,1];
      const next = Number(originalCurve[0])===.12 ? .14 : .12;
      await page.getByLabel('Bezier Time 1',{exact:true}).fill(String(next));
      if (action === 'audio-film') {
        await page.getByLabel('Bezier Value 1',{exact:true}).fill('1');
        await page.getByLabel('Bezier Time 2',{exact:true}).fill('0.2');
        await page.getByLabel('Bezier Value 2',{exact:true}).fill('0.95');
      }
      await page.waitForTimeout(600);
      const edited = await h.save(page,'audio-curve-edited');
      assert.equal(edited.snapshot.audioKeyframes.sfx.find(item=>item.id===key.id).curve[0],next);
      const historySteps = action === 'audio-film' ? 4 : 1;
      for (let i=0;i<historySteps;i++) {
        await page.getByTestId('studio-undo-button').click(); await page.waitForTimeout(600);
      }
      const undone = await h.save(page,'audio-curve-undone');
      assert.equal(decisions(undone.snapshot.studioDocument),decisions(baseline.snapshot.studioDocument));
      for (let i=0;i<historySteps;i++) {
        await page.getByTestId('studio-redo-button').click(); await page.waitForTimeout(600);
      }
      const redone = await h.save(page,'audio-curve-redone');
      assert.equal(decisions(redone.snapshot.studioDocument),decisions(edited.snapshot.studioDocument));
      await page.getByRole('img',{name:'volume value curve',exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(folder,'native-sfx-gain-curve.png')});
      if (action === 'audio-film') {
        await page.reload();
        await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
        await page.getByRole('button',{name:audioName,exact:true}).click();
        const reopened = await h.save(page,'audio-reopened');
        assert.equal(hash(reopened.snapshot.studioDocument),hash(redone.snapshot.studioDocument));
        assert.equal(hash((await h.records(page)).find(item=>item.id===original.id).snapshot.studioDocument),hash(original.snapshot.studioDocument));
        assert.equal(renders,0);
        saveAuthenticatedState(await context.storageState({indexedDB:true}),audioRetained);
        fs.writeFileSync(path.join(folder,'native-audio-film-lifecycle.json'),JSON.stringify({
          at:new Date().toISOString(),projectId:reopened.id,canonicalHash:hash(reopened.snapshot.studioDocument),
          originalId:original.id,originalPreserved:true,keyId:key.id,
          before:key,after:reopened.snapshot.audioKeyframes.sfx.find(item=>item.id===key.id),
          nativeFourHandles:true,undo:true,redo:true,coldReopened:true,renderJobs:0,gpuJobs:0,noMocks:true,
        },null,2));
        console.log('Native SFX curve project/history/cold-reopen passed; original preserved.');return;
      }
      // Restore both temporary edits with native history; the finished film's
      // original decisions and exact project identity stay intact.
      await page.getByTestId('studio-undo-button').click(); await page.waitForTimeout(600);
      if (decisions(baseline.snapshot.studioDocument)!==decisions(before.snapshot.studioDocument)) {
        await page.getByTestId('studio-undo-button').click(); await page.waitForTimeout(600);
      }
      const restored = await h.save(page,'audio-restored');
      assert.equal(decisions(restored.snapshot.studioDocument),decisions(before.snapshot.studioDocument));
      assert.equal(renders,0);
      fs.writeFileSync(path.join(folder,'native-audio-curve.json'),JSON.stringify({at:new Date().toISOString(),
        projectId:before.id, beforeHash:hash(before.snapshot.studioDocument), restoredHash:hash(restored.snapshot.studioDocument),
        decisionsRestored:true,keyId:key.id,source:'sfx',nativeBezierEdit:true,undo:true,redo:true,
        renderJobs:0,gpuJobs:0,noMocks:true,scope:'Temporary native SFX curve edit/history; no new audio-curve movie or whole-mix listening qualification.'},null,2));
      console.log('Native SFX value graph/Bezier/history passed; finished-film decisions restored.');return;
    }
    if (action === 'inspect') {
      const record = (await h.records(page)).find(item => item.name === name);
      const key = record.snapshot.motionKeyframes.find(item => item.property === 'y' && item.curve?.[0] === .17);
      const layer = record.snapshot.overlays.find(item => item.id === key.targetId);
      const timeline = page.getByTestId('studio-pro-timeline');
      await timeline.getByRole('button', { name: 'Show motion keyframes', exact: true }).click();
      await timeline.getByRole('button', { name: `Expand ${layer.name || layer.text || 'Visual layer'} keyframes`, exact: true }).first().click();
      const resize = page.getByRole('separator', { name: 'Resize timeline' }); await resize.focus();
      for (let i=0; i<9; i++) await resize.press('ArrowUp');
      await page.getByTestId(`motion-timeline-key-${key.id}`).click();
      await page.getByRole('img', { name: 'y value curve', exact: true }).scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-testid="studio-after-video"]');
        return video?.readyState >= 3 && !video.seeking;
      });
      await page.getByText('Loading edited preview…', {exact:true}).waitFor({state:'hidden'});
      await page.screenshot({path:path.join(folder,'native-value-curve-and-ready-timeline.png')});
      assert.equal(hash((await h.records(page)).find(item=>item.id===record.id).snapshot.studioDocument),hash(record.snapshot.studioDocument));
      assert.equal(renders,0); console.log('Ready native source, selected key value graph and full timeline inspected.'); return;
    }
    if (action === 'render' || action === 'audio-render') {
      await h.render(page, audioDelivery ? 'audio-curve' : 'curve'); assert.equal(renders, 1);
      saveAuthenticatedState(await context.storageState({ indexedDB: true }), audioDelivery ? audioRetained : retained); return;
    }
    if (action === 'view' || action === 'audio-view') {
      await require('./materials-editing-proof').view(page, audioDelivery ? 'audio-curve' : 'curve'); assert.equal(renders, 0);
      if (audioDelivery) {
        await h.rail(page);
        const backupEvent = page.waitForEvent('download');
        await page.getByRole('button',{name:'Download project backup',exact:true}).click();
        const backup = await backupEvent;
        const file = path.join(folder,'audio-curve','VELO-SFX-value-curve.autopromote.json');
        await backup.saveAs(file);fs.chmodSync(file,0o600);
        assert.equal(await backup.failure(),null);
        const canonicalHash = hash(JSON.parse(fs.readFileSync(file)).snapshot.studioDocument);
        const render = JSON.parse(fs.readFileSync(path.join(folder,'audio-curve','render-receipt.json')));
        assert.equal(canonicalHash,render.projectHash);
        fs.writeFileSync(path.join(folder,'audio-curve','native-backup-download.json'),JSON.stringify({
          at:new Date().toISOString(),projectId:render.projectId,canonicalHash,
          sha256:hash(fs.readFileSync(file)),nativeDownload:true,privatePermissions:'0600',
          renderJobs:renders,gpuJobs:0,noMocks:true,
        },null,2));
      }
      saveAuthenticatedState(await context.storageState({ indexedDB: true }), audioDelivery ? audioRetained : retained); return;
    }
    const original = await h.save(page, 'original');
    await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
    await page.getByLabel('Project name', { exact: true }).fill(name);
    const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
    if (await pause.isVisible()) await pause.click();
    const before = await h.save(page, 'before'); assert.notEqual(original.id, before.id);
    const layer = before.snapshot.overlays.find(item => before.snapshot.motionKeyframes.some(key =>
      key.targetId === item.id && key.property === 'y' && key.time > 0 && key.time < 2));
    assert(layer, 'No real animated title layer');
    const keys = before.snapshot.motionKeyframes.filter(key => key.targetId === layer.id && key.property === 'y').sort((a,b) => a.time-b.time);
    const key = keys.find((item, index) => index > 0 && item.value !== keys[index-1].value && item.time < 2);
    assert(key, 'No changing motion interval');
    const timeline = page.getByTestId('studio-pro-timeline');
    await timeline.getByRole('button', { name: 'Show motion keyframes', exact: true }).click();
    await timeline.getByRole('button', { name: `Expand ${layer.name || layer.text || 'Visual layer'} keyframes`, exact: true }).first().click();
    await page.getByTestId(`motion-timeline-key-${key.id}`).click();
    await page.getByLabel('Curve keyframe', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Curve keyframe', { exact: true }).inputValue(), key.id);
    await page.getByLabel('Selected motion key easing', { exact: true }).selectOption('bezier');
    await page.getByLabel('Bezier Time 1', { exact: true }).fill('0.15');
    await page.getByLabel('Bezier Value 1', { exact: true }).fill('0.05');
    await page.getByLabel('Bezier Time 2', { exact: true }).fill('0.35');
    await page.getByLabel('Bezier Value 2', { exact: true }).fill('1.1');
    await page.getByLabel('Selected motion key value', { exact: true }).fill(String(Number(key.value) + .5));
    await page.waitForTimeout(600);
    const edited = await h.save(page, 'edited');
    const changed = edited.snapshot.motionKeyframes.find(item => item.id === key.id);
    assert.deepEqual(changed.curve, [.15, .05, .35, 1.1]); assert.equal(changed.value, Number(key.value)+.5);
    for (const sibling of before.snapshot.motionKeyframes.filter(item => item.id !== key.id))
      assert.deepEqual(edited.snapshot.motionKeyframes.find(item => item.id === sibling.id), sibling);
    await page.getByRole('button', { name: 'Bezier handle 1', exact: true }).press('ArrowRight');
    await page.waitForTimeout(600);
    const nudged = await h.save(page, 'nudged');
    assert.equal(nudged.snapshot.motionKeyframes.find(item => item.id === key.id).curve[0], .17);
    await page.getByTestId('studio-undo-button').click(); await page.waitForTimeout(600);
    const undone = await h.save(page, 'undone'); assert.equal(decisions(undone.snapshot.studioDocument), decisions(edited.snapshot.studioDocument));
    await page.getByTestId('studio-redo-button').click(); await page.waitForTimeout(600);
    const redone = await h.save(page, 'redone'); assert.equal(decisions(redone.snapshot.studioDocument), decisions(nudged.snapshot.studioDocument));
    const resize = page.getByRole('separator', { name: 'Resize timeline' }); await resize.focus();
    for (let i=0; i<10; i++) await resize.press('ArrowUp');
    await page.getByTestId(`motion-timeline-key-${key.id}`).click();
    await page.getByRole('img', { name: 'y value curve', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(folder, 'native-value-curve-and-timeline.png') });
    await page.reload();
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    const reopened = await h.save(page, 'reopened'); assert.equal(hash(reopened.snapshot.studioDocument), hash(redone.snapshot.studioDocument));
    const preserved = (await h.records(page)).find(item => item.id === original.id);
    assert.equal(hash(preserved.snapshot.studioDocument), hash(original.snapshot.studioDocument)); assert.equal(renders,0);
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), retained);
    fs.writeFileSync(path.join(folder, 'native-curve-lifecycle.json'), JSON.stringify({ at:new Date().toISOString(),
      projectId:reopened.id, canonicalHash:hash(reopened.snapshot.studioDocument), originalId:original.id,
      originalPreserved:true, keyId:key.id, property:key.property, before:key, after:reopened.snapshot.motionKeyframes.find(item=>item.id===key.id),
      nativeValue:true, nativeFourHandles:true, nativeGraph:true, keyboardHandle:true,
      siblingKeysUnchanged:true, undo:true, redo:true, save:true, coldReopened:true,
      renderJobs:renders, gpuJobs:0, noMocks:true, fullAfterEffectsEquivalence:false },null,2));
    console.log('Native selected-key value/four-handle graph/history/cold-reopen passed.');
  } catch(error) {
    await page.screenshot({path:path.join(folder,'curve-failure.png')}).catch(()=>{}); throw error;
  } finally { await browser.close(); }
}
main().catch(error=>{ console.error(error.message);process.exitCode=1; });
