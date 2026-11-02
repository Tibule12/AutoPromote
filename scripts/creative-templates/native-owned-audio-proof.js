#!/usr/bin/env node
// Native authenticated imports/edit/history/save/export/reopen. No injected
// sources, auth bypass, patched UI or direct render calls. CPU worker only.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const h = require('./studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const m = require('./materials-editing-proof');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const state = process.env.STUDIO_QA_STORAGE_STATE;
const originalName = 'VELO — SFX value curve · 20261011';
const newName = 'VELO — owned audio · 20261012';
const materials = path.resolve('reports/model-capability-runtime-v1-20261009/proof/launch-template/materials-editing-20261010/materials');
const decisions = document => { const { revision, journal, ...content } = document; return hash(content); };
async function range(input, value) {
  await input.evaluate((el, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(next));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: state, viewport: { width: 1600, height: 1400 }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  const apiJobs = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/process') apiJobs.push('native-render'); });
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=owned-audio');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: originalName, exact: true }).click();
    await h.rail(page);
    const original = await h.save(page, 'original');
    await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
    await page.getByLabel('Project name', { exact: true }).fill(newName);
    await q.tool(page, 'Sound');
    await page.getByTestId('background-sound-input').setInputFiles(path.join(materials, 'mixkit-music-369.mp3'));
    await range(page.locator('label.inspector-range').filter({ hasText: 'Background volume' }).locator('input'), 34);
    const duck = page.getByRole('checkbox', { name: /Duck under speech/ });
    if (await duck.isChecked()) await duck.uncheck();
    await h.save(page, 'before-cue');
    await page.getByTestId('sound-effect-input').setInputFiles(path.join(materials, 'mixkit-sfx-2918.wav'));
    await page.getByTestId('sound-effect-start').fill('0.3');
    await page.getByTestId('sound-effect-duration').fill('0.9');
    await page.waitForTimeout(600);
    await range(page.getByTestId('sound-effect-volume'), 12);
    await page.waitForTimeout(600);
    const edited = await h.save(page, 'edited');
    const cue = edited.snapshot.soundEffects.at(-1);
    assert.equal(edited.snapshot.soundEffects.length, original.snapshot.soundEffects.length+1);
    await page.getByTestId('studio-undo-button').click();
    const undone = await h.save(page, 'undone');
    assert.equal(undone.snapshot.soundEffects.at(-1).volume, .8);
    await page.getByTestId('studio-redo-button').click();
    const redone = await h.save(page, 'redone');
    assert.equal(decisions(redone.snapshot.studioDocument), decisions(edited.snapshot.studioDocument));
    assert.notEqual(redone.id, original.id);
    console.log('Native duplicated project, new music/cue and meaningful history verified.');
    await h.render(page, 'owned-audio');
    const materialized = await h.save(page, 'owned-audio');
    const imported = materialized.snapshot.soundEffects.find(effect => effect.id === cue.id);
    for (const [source, file] of [[materialized.snapshot.musicTrack, 'mixkit-music-369.mp3'], [imported, 'mixkit-sfx-2918.wav']]) {
      assert.equal(source.contentHash, hash(fs.readFileSync(path.join(materials, file))));
      assert(source.ownerUid && source.storagePath && source.sourceStoragePath === source.storagePath);
      assert(!source.file);
    }
    const receipt = JSON.parse(fs.readFileSync(path.join(folder, 'owned-audio/render-receipt.json')));
    assert.equal(receipt.projectHash, hash(materialized.snapshot.studioDocument));
    await page.reload();
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: newName, exact: true }).click();
    const reopened = await h.save(page, 'reopened');
    assert.equal(hash(reopened.snapshot.studioDocument), receipt.projectHash);
    const reopenedCue = reopened.snapshot.soundEffects.find(effect => effect.id === cue.id);
    assert.equal(reopenedCue.contentHash, imported.contentHash);
    assert.equal(reopenedCue.ownerUid, imported.ownerUid);
    assert.equal(reopened.snapshot.musicTrack.contentHash, materialized.snapshot.musicTrack.contentHash);
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), state);
    await m.view(page, 'owned-audio');
    const laneBounds = await page.evaluate(() => {
      const bounds = document.querySelector('.pro-timeline-scroll').getBoundingClientRect();
      return ['video','graphics','motion','broll','originalAudio','music','sfx'].map(track => {
        const r = document.querySelector(`[data-testid="pro-track-row-${track}"]`)?.getBoundingClientRect();
        return { track, fullyVisible: Boolean(r && r.top >= bounds.top && r.bottom <= bounds.bottom) };
      });
    });
    assert(laneBounds.every(row => row.fullyVisible), 'Native audio lanes clipped');
    const frames = path.join(folder, 'owned-audio/studio-recording-frames');
    const names = fs.readdirSync(frames).filter(name => name.endsWith('.jpg')).sort();
    for (const [index, label] of [[0,'start'],[Math.floor(names.length/2),'middle'],[names.length-1,'end']])
      fs.copyFileSync(path.join(frames,names[index]),path.join(folder,`owned-audio/studio-${label}.jpg`));
    const scratchBytes = fs.readdirSync(frames).reduce((sum,name)=>sum+fs.statSync(path.join(frames,name)).blocks*512,0);
    fs.rmSync(frames,{recursive:true});
    const retainedOriginal = (await h.records(page)).find(project => project.id === original.id);
    assert.equal(hash(retainedOriginal.snapshot.studioDocument), hash(original.snapshot.studioDocument));
    fs.writeFileSync(path.join(folder, 'native-owned-audio-receipt.json'), JSON.stringify({
      at: new Date().toISOString(), projectId: reopened.id, canonicalHash: receipt.projectHash,
      originalProjectPreserved: true, originalHash: hash(original.snapshot.studioDocument),
      importedCueHash: imported.contentHash, musicHash: materialized.snapshot.musicTrack.contentHash,
      nativeImportEditUndoRedo: true, nativeSaveColdReopen: true, renderAndSavedHashesMatch: true,
      nativeRenderJobs: apiJobs.length, newGpuJobs: 0, outputHash: receipt.outputSha256,
      laneBounds, recordingScratchBytesReleased: scratchBytes,
      scope: 'Real private duplicated Studio project, native owned audio imports and history, actual CPU render/download/full decode/cold reopen/full movie plus editable timeline. Existing two legacy cue hashes are not backfilled; no billing/public/creative qualification.',
    }, null, 2)+'\n');
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), state);
    console.log('Owned audio hash/bindings survived native render/save/cold reopen and complete Studio timeline playback.');
  } catch (error) {
    await page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(folder, 'failure.json'), JSON.stringify({ error: error.message, nativeJobs: apiJobs.length }, null, 2)+'\n');
    throw error;
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
