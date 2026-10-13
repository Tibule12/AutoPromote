#!/usr/bin/env node
// Create/edit a fresh owned project using native controls, then use the existing
// export/download and finished-film/timeline recorder. No state/auth injection.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const q = require('../../test/e2e/playwright/studio-stability/run');
const h = require('./studio-proof');
const { view } = require('./materials-editing-proof');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const originalName = 'VELO — preview switching · 20261010';
const editedName = 'VELO — SFX envelope · 20261011';
const sessionFolder = '/home/tibule12/.local/share/autopromote-qa/session';
const originalState = path.join(sessionFolder, 'studio-cycling-source.private.json');
const sourceState = path.join(sessionFolder, 'studio-cycling-sfx-envelope-source.private.json');
const finalState = path.join(sessionFolder, 'studio-cycling-sfx-envelope-final.private.json');
async function setRange(locator, value) {
  await locator.evaluate((el, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(next));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function fullTimeline(page) {
  const resize = page.getByRole('separator', { name: 'Resize timeline' });
  await resize.focus();
  for (let i = 0; i < 12; i++) await resize.press('ArrowUp');
  await page.getByTestId('studio-pro-timeline').getByRole('button', { name: 'Fit entire timeline', exact: true }).click();
}
async function main() {
  const action = process.argv[2] || 'create';
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: action === 'create' ? originalState : action === 'view' ? finalState : sourceState,
    acceptDownloads: true, viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  let submissions = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/process') submissions++; });
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=sfx-envelope');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: action === 'create' ? originalName : editedName, exact: true }).click();
    await h.rail(page);
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
    if (await pause.isVisible()) await pause.click();
    if (action === 'create') {
      const original = await h.save(page, 'original');
      assert.equal(hash(original.snapshot.studioDocument), 'b3999bdc503369988968610cf6cc46b9f17b6bf286f93038f9fa776dd1414e38');
      await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
      await page.getByLabel('Project name', { exact: true }).fill(editedName);
      await setRange(page.getByLabel('Edited output position', { exact: true }), 5);
      await q.tool(page, 'Sound');
      await page.getByLabel('Automation source').selectOption('sfx');
      console.log('Native duplicate opened; editing the SFX bus keys.');
      assert.equal(await page.locator('.automation-keyframe-list article').count(), 0);
      for (const [time, value] of [[13.5, 100], [14.25, 20], [14.5, 100]]) {
        await page.getByRole('button', { name: /Add volume keyframe at/ }).click();
        const added = page.locator('.automation-keyframe-list article').filter({ has: page.getByLabel('sfx volume at 5.00 seconds', { exact: true }) });
        assert.equal(Number(await added.locator('input[type=range]').inputValue()), 100,
          'A key outside the envelope must preserve neutral bus gain');
        await added.getByLabel('sfx volume keyframe easing', { exact: true }).selectOption('linear');
        await setRange(added.locator('input[type=range]'), value);
        await added.getByLabel('sfx keyframe time', { exact: true }).fill(String(time));
      }
      const edited = await h.save(page, 'cycling');
      assert.notEqual(edited.id, original.id);
      const keys = edited.snapshot.audioKeyframes.sfx.map(({ time, value, easing }) => ({ time, value, easing })).sort((a, b) => a.time - b.time);
      assert.deepEqual(keys, [{ time: 13.5, value: 100, easing: 'linear' }, { time: 14.25, value: 20, easing: 'linear' }, { time: 14.5, value: 100, easing: 'linear' }]);
      const retained = (await h.records(page)).find(record => record.id === original.id);
      assert.equal(hash(retained.snapshot.studioDocument), hash(original.snapshot.studioDocument));
      console.log('Three native linear keys saved; original canonical hash unchanged.');
      await fullTimeline(page);
      await page.waitForSelector('canvas[data-source-sampling="accurate-paused"]');
      await page.screenshot({ path: path.join(folder, 'edited-source-and-timeline.png') });
      // Cold reopening is native navigation using the saved canonical project.
      await page.reload();
      await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
      await page.getByRole('button', { name: editedName, exact: true }).click();
      await h.rail(page);
      const reopened = await h.save(page, 'cycling-reopened');
      assert.equal(hash(reopened.snapshot.studioDocument), hash(edited.snapshot.studioDocument));
      assert.equal(submissions, 0);
      saveAuthenticatedState(await context.storageState({ indexedDB: true }), sourceState);
      fs.writeFileSync(path.join(folder, 'native-edit.json'), JSON.stringify({
        at: new Date().toISOString(), projectId: edited.id, projectName: edited.name,
        canonicalHash: hash(edited.snapshot.studioDocument), originalProjectId: original.id,
        originalCanonicalHash: hash(original.snapshot.studioDocument), originalPreserved: true,
        keys, clips: edited.snapshot.timeline.length, graphics: edited.snapshot.overlays.length,
        soundCues: edited.snapshot.soundEffects.length, templateRef: edited.snapshot.creativeTemplateInstance.templateRef,
        nativeDuplicate: true, nativeControls: true, coldReopened: true, noMocks: true,
        renderJobs: submissions, gpuJobs: 0, creativeApproval: false,
      }, null, 2));
      console.log('Fresh canonical SFX-envelope edit saved and cold reopened; original retained.');
    } else if (action === 'render') {
      console.log('Submitting the saved native edit to the existing CPU renderer.');
      await h.render(page, 'cycling');
      assert.equal(submissions, 1);
      saveAuthenticatedState(await context.storageState({ indexedDB: true }), finalState);
    } else if (action === 'view') {
      await view(page, 'cycling');
      assert.equal(submissions, 0);
      saveAuthenticatedState(await context.storageState({ indexedDB: true }), finalState);
    } else throw new Error('Unknown proof action');
  } catch (error) {
    await page.screenshot({ path: path.join(folder, `${action}-failure.png`) }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
