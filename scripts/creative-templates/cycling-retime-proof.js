#!/usr/bin/env node
// Native, owned duplicate/edit/save/reopen/export. Keep source and completed
// snapshots separate; no project/auth/model/output injection.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const q = require('../../test/e2e/playwright/studio-stability/run');
const h = require('./studio-proof');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const session = '/home/tibule12/.local/share/autopromote-qa/session';
const originalName = 'VELO — SFX envelope · 20261011';
const name = 'VELO — speed ramp · 20261011';
const sourceState = path.join(session, 'studio-cycling-retime-source.private.json');
const finalState = path.join(session, 'studio-cycling-retime-final.private.json');
async function range(locator, value) {
  await locator.evaluate((el, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(value));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function main() {
  const action = process.argv[2] || 'create';
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: action === 'create'
    ? path.join(session, 'studio-cycling-sfx-envelope-source.private.json')
    : action === 'view' ? finalState : sourceState, acceptDownloads: true,
    viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  let renders = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/process') renders++; });
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=cycling-retime');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: action === 'create' ? originalName : name, exact: true }).click();
    await h.rail(page);
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (action === 'create') {
      const original = await h.save(page, 'original');
      await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
      await page.getByLabel('Project name', { exact: true }).fill(name);
      const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
      if (await pause.isVisible()) await pause.click();
      await q.tool(page, 'Pacing');
      for (const [time, speed] of [[7, 1], [8, 2], [9, 1]]) {
        // The programme seek is displayed in delivery seconds at global speed.
        // Restore the neutral fader before seeking the next programme key.
        await range(page.getByLabel(/Fine speed/), 1);
        await range(page.getByLabel('Edited output position', { exact: true }), time);
        await page.waitForFunction(() => {
          const v = document.querySelector('[data-testid="studio-after-video"]');
          return v && !v.seeking && v.readyState >= 3;
        });
        if (await pause.isVisible()) await pause.click();
        await range(page.getByLabel(/Fine speed/), speed);
        await page.getByRole('button', { name: /Add .* point at/ }).click();
        await page.locator('.speed-ramp-card select[aria-label="Speed point easing"]').last().selectOption('linear');
        console.log(`Added native ${speed}x point at ${time}s.`);
      }
      const edited = await h.save(page, 'cycling');
      assert.notEqual(edited.id, original.id);
      const keys = edited.snapshot.speedKeyframes.map(({ time, value, easing }) => ({ time, value, easing }));
      assert.equal(keys.length, 3);
      for (const [i, [time, value]] of [[7, 1], [8, 2], [9, 1]].entries()) {
        assert(Math.abs(keys[i].time - time) < .05, 'Native speed key is outside its requested frame');
        assert.equal(keys[i].value, value); assert.equal(keys[i].easing, 'linear');
      }
      const retained = (await h.records(page)).find(record => record.id === original.id);
      assert.equal(hash(retained.snapshot.studioDocument), hash(original.snapshot.studioDocument));
      const resize = page.getByRole('separator', { name: 'Resize timeline' }); await resize.focus();
      for (let i = 0; i < 12; i++) await resize.press('ArrowUp');
      await page.getByTestId('studio-pro-timeline').getByRole('button', { name: 'Fit entire timeline', exact: true }).click();
      await page.screenshot({ path: path.join(folder, 'native-speed-controls-and-timeline.png') });
      await page.reload();
      await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
      await page.getByRole('button', { name, exact: true }).click();
      const reopened = await h.save(page, 'cycling');
      assert.equal(hash(reopened.snapshot.studioDocument), hash(edited.snapshot.studioDocument));
      assert.equal(renders, 0);
      saveAuthenticatedState(await context.storageState({ indexedDB: true }), sourceState);
      fs.writeFileSync(path.join(folder, 'native-retime-edit.json'), JSON.stringify({
        at: new Date().toISOString(), projectId: edited.id, canonicalHash: hash(edited.snapshot.studioDocument),
        originalId: original.id, originalPreserved: true, keys, nativeControls: true, coldReopened: true,
        templateRef: edited.snapshot.creativeTemplateInstance.templateRef,
        sourceTrimsUnchanged: JSON.stringify(original.snapshot.timeline) === JSON.stringify(edited.snapshot.timeline),
        noMocks: true, renderJobs: renders, gpuJobs: 0, creativeApproval: false,
      }, null, 2));
    } else if (action === 'render') {
      await h.render(page, 'cycling'); assert.equal(renders, 1);
      saveAuthenticatedState(await context.storageState({ indexedDB: true }), finalState);
    } else if (action === 'view') {
      await require('./materials-editing-proof').view(page, 'cycling'); assert.equal(renders, 0);
      saveAuthenticatedState(await context.storageState({ indexedDB: true }), finalState);
    } else throw new Error('Unknown action');
  } catch (error) {
    // Retain the actual completed-job/browser cache even if post-download
    // verification fails. Never lose recovery solely because a proof fails.
    if (action === 'render' && fs.existsSync(path.join(folder, 'cycling', 'native-render-completed.json'))) {
      saveAuthenticatedState(await context.storageState({ indexedDB: true }), finalState);
    }
    await page.screenshot({ path: path.join(folder, `${action}-failure.png`) }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
