#!/usr/bin/env node
// Author a native timeline key edit in a duplicate, preserving the original.
// Separate actions export/play that exact saved edit through ordinary Studio.
// No auth/project injection, model dispatch or paid infrastructure.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const h = require('./studio-proof');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const state = '/home/tibule12/.local/share/autopromote-qa/session/studio-cycling-retime-source.private.json';
const retained = '/home/tibule12/.local/share/autopromote-qa/session/studio-cycling-keyframes.private.json';
const name = 'VELO — keyframe timeline · 20261011';
const decisions = document => { const { revision, journal, ...content } = document; return hash(content); };
async function main() {
  const action = process.argv[2] || 'edit';
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const finalState = retained.replace('.private.json', '-final.private.json');
  const context = await browser.newContext({ storageState: action === 'edit' ? state : action === 'view' ? finalState : retained,
    acceptDownloads: true, viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  let renders = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/process') renders++; });
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=keyframes');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: action === 'edit' ? 'VELO — speed ramp · 20261011' : name, exact: true }).click();
    await h.rail(page); assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (action === 'inspect') {
      const before = (await h.records(page)).find(item => item.name === name);
      const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
      if (await pause.isVisible()) await pause.click();
      const layer = before.snapshot.overlays.find(item => before.snapshot.motionKeyframes.some(key => key.targetId === item.id));
      const key = before.snapshot.motionKeyframes.find(item => item.targetId === layer.id && item.time < 5);
      const timeline = page.getByTestId('studio-pro-timeline');
      await timeline.getByRole('button', { name: 'Show motion keyframes', exact: true }).click();
      const target = timeline.getByRole('button', { name: `Expand ${layer.name || layer.text || 'Visual layer'} keyframes`, exact: true }).first();
      await target.click();
      const resize = page.getByRole('separator', { name: 'Resize timeline' }); await resize.focus();
      for (let i = 0; i < 12; i++) await resize.press('ArrowUp');
      const diamond = page.getByTestId(`motion-timeline-key-${key.id}`);
      await diamond.scrollIntoViewIfNeeded(); await diamond.click();
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-testid="studio-after-video"]');
        return video?.readyState >= 3 && !video.seeking;
      });
      await page.getByText('Loading edited preview…', { exact: true }).waitFor({ state: 'hidden' });
      const label = timeline.getByRole('button', {
        name: `Collapse ${layer.name || layer.text || 'Visual layer'} keyframes`, exact: true
      }).first().locator('strong');
      const labelMetrics = await label.evaluate(element => ({ text: element.textContent, width: element.getBoundingClientRect().width }));
      assert(labelMetrics.width > 70, 'Native layer label is still clipped into a narrow grid cell');
      await page.screenshot({ path: path.join(folder, 'native-keyframes-and-inspector.png') });
      const after = (await h.records(page)).find(item => item.id === before.id);
      assert.equal(hash(after.snapshot.studioDocument), hash(before.snapshot.studioDocument));
      assert.equal(renders, 0);
      fs.writeFileSync(path.join(folder, 'native-keyframe-inspection.json'), JSON.stringify({
        at: new Date().toISOString(), projectId: before.id, canonicalHash: hash(before.snapshot.studioDocument),
        labelMetrics, keyId: key.id, authoredTime: key.time, nativeInspector: true,
        canonicalUnchanged: true, renderJobs: renders, gpuJobs: 0, noMocks: true
      }, null, 2));
      console.log('Native expanded keyframes, readable layer labels and inspector captured without changing the edit.');
      return;
    }
    if (action !== 'edit') {
      if (action === 'render') { await h.render(page, 'keyframes'); assert.equal(renders, 1); }
      else if (action === 'view') { await require('./materials-editing-proof').view(page, 'keyframes'); assert.equal(renders, 0); }
      else throw new Error('Unknown proof action');
      saveAuthenticatedState(await context.storageState({ indexedDB: true }), finalState);
      return;
    }
    const original = await h.save(page, 'original');
    await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
    await page.getByLabel('Project name', { exact: true }).fill(name);
    const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
    if (await pause.isVisible()) await pause.click();
    const before = await h.save(page, 'before');
    assert.notEqual(before.id, original.id);
    const layer = before.snapshot.overlays.find(layer => before.snapshot.motionKeyframes.some(key => key.targetId === layer.id));
    assert(layer, 'This real project has no authored layer keys');
    const key = before.snapshot.motionKeyframes.find(key => key.targetId === layer.id && key.time < 5);
    assert(key, 'No opening animation key');
    const timeline = page.getByTestId('studio-pro-timeline');
    await timeline.getByRole('button', { name: 'Show motion keyframes', exact: true }).click();
    await timeline.getByRole('button', { name: `Expand ${layer.name || layer.text || 'Visual layer'} keyframes`, exact: true }).first().click();
    const diamond = page.getByTestId(`motion-timeline-key-${key.id}`);
    await diamond.click();
    assert.equal(await page.getByRole('button', { name: 'Transform keyframes', exact: true }).getAttribute('aria-pressed'), 'true');
    await diamond.press('Shift+ArrowRight'); await page.waitForTimeout(600);
    const edited = await h.save(page, 'edited');
    const changed = edited.snapshot.motionKeyframes.find(item => item.id === key.id);
    assert(changed.time > key.time);
    assert.equal(changed.value, key.value); assert.equal(changed.easing, key.easing);
    assert.notEqual(decisions(edited.snapshot.studioDocument), decisions(before.snapshot.studioDocument));
    await page.getByTestId('studio-undo-button').click(); await page.waitForTimeout(600);
    const undone = await h.save(page, 'undone');
    assert.equal(decisions(undone.snapshot.studioDocument), decisions(before.snapshot.studioDocument));
    await page.getByTestId('studio-redo-button').click(); await page.waitForTimeout(600);
    const redone = await h.save(page, 'redone');
    assert.equal(decisions(redone.snapshot.studioDocument), decisions(edited.snapshot.studioDocument));
    const resize = page.getByRole('separator', { name: 'Resize timeline' }); await resize.focus();
    for (let i = 0; i < 12; i++) await resize.press('ArrowUp');
    await diamond.scrollIntoViewIfNeeded(); await diamond.click();
    await page.screenshot({ path: path.join(folder, 'native-keyframes-and-inspector.png') });
    await page.reload();
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    const reopened = await h.save(page, 'reopened');
    assert.equal(hash(reopened.snapshot.studioDocument), hash(redone.snapshot.studioDocument));
    const preserved = (await h.records(page)).find(item => item.id === original.id);
    assert.equal(hash(preserved.snapshot.studioDocument), hash(original.snapshot.studioDocument));
    assert.equal(renders, 0);
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), retained);
    fs.writeFileSync(path.join(folder, 'native-keyframe-lifecycle.json'), JSON.stringify({
      at: new Date().toISOString(), projectId: reopened.id, canonicalHash: hash(reopened.snapshot.studioDocument),
      originalId: original.id, originalPreserved: true, keyId: key.id, targetId: key.targetId,
      property: key.property, beforeTime: key.time, afterTime: changed.time, unchangedValue: key.value,
      nativeSelect: true, nativeInspector: true, nativeNudge: true, undo: true, redo: true, coldReopened: true,
      renderJobs: renders, gpuJobs: 0, noMocks: true,
      scope: 'Actual authenticated timeline editing on the same canonical motion keys. This changed duplicate has not been exported; no global composition, full After Effects equivalence or creative approval.'
    }, null, 2));
    console.log('Native key selection/nudge/inspector/undo/redo/save/cold-reopen passed; original project preserved.');
  } catch (error) {
    await page.screenshot({ path: path.join(folder, 'keyframe-failure.png') }).catch(() => {}); throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
