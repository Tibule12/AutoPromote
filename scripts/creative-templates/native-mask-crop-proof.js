#!/usr/bin/env node
// Authenticated native geometric-mask/crop edit. Diagnostic, not a showcase.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const h = require('./studio-proof'), q = require('../../test/e2e/playwright/studio-stability/run');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR), state = process.env.STUDIO_QA_STORAGE_STATE;
const source = path.resolve('reports/model-capability-runtime-v1-20261009/proof/launch-template/parity-20261012/owned-small-cycling-square-320x240.mp4');
const name = 'Studio — geometric masks and animated crop · 20261013';
async function range(input, value) {
  await input.evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function pause(page) {
  const button = page.getByRole('button', { name: 'Pause comparison', exact: true });
  if (await button.isVisible()) await button.click();
}
async function main() {
  const browser = await chromium.launch({ channel: 'chromium', headless: true,
    args: ['--mute-audio', '--disk-cache-size=1048576', '--media-cache-size=1048576'] });
  const context = await browser.newContext({ storageState: state, viewport: { width: 1600, height: 1400 }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=geometric-mask-crop');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    const retained = await h.records(page);
    const originals = retained.filter(p => p.name !== name).map(p => ({ id: p.id, hash: hash(p.snapshot.studioDocument) }));
    const work = retained.find(p => p.name === name);
    if (work) await page.getByRole('button', { name, exact: true }).click();
    else {
      await page.locator('.creator-studio-dropzone input[type=file]').setInputFiles(source);
      const open = page.getByRole('button', { name: 'Open Creator Studio', exact: true });
      await open.waitFor({ timeout: 90000 }); await open.click();
    }
    await h.rail(page); await pause(page);
    if (process.env.STUDIO_QA_CAPTURE === '1') {
      const before = await h.save(page, 'aligned-before');
      await q.tool(page, 'Export');
      await page.getByRole('button', { name: 'Show Live Edit', exact: true }).click();
      const samples = [];
      for (const [index, time] of [.5, 1, 1.5].entries()) {
        await range(page.getByLabel('Edited output position', { exact: true }), time);
        await page.waitForFunction(time => {
          const v = document.querySelector('[data-testid="studio-after-video"]');
          return v && !v.seeking && v.readyState >= 3 && Math.abs(v.currentTime - time) < .001;
        }, time);
        await page.waitForTimeout(200);
        const canvas = page.getByTestId('studio-program-canvas');
        assert.equal(await canvas.getAttribute('data-programme-source'), 'source');
        const stage = page.getByTestId('hook-preview-frame');
        samples.push(await stage.evaluate((el, time) => ({ time,
          decoderTime: el.querySelector('video')?.currentTime,
          stage: { width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height },
          masks: [...el.querySelectorAll('.draggable-overlay.is-media-overlay')].map(n => ({ clip: getComputedStyle(n).clipPath }))
        }), time));
        await stage.screenshot({ path: path.join(folder, `native-${index}.png`) });
      }
      fs.writeFileSync(path.join(folder, 'native-mapped-masks.json'), JSON.stringify(samples, null, 2));
      const after = await h.save(page, 'aligned-after');
      assert.equal(hash(before.snapshot.studioDocument), hash(after.snapshot.studioDocument));
      console.log('Actual frame-clock native mask captures complete; canonical edit unchanged.');
      return;
    }
    if (process.env.STUDIO_QA_RECOVER === '1') {
      assert(work, 'Missing exact saved mask edit for native recovery');
      await h.recover(page, 'masks');
      await finishRecording(page);
      console.log('Existing exact mask job downloaded and full Studio timeline recorded; no resubmission.');
      return;
    }
    await page.getByLabel('Project name', { exact: true }).fill(name);
    await range(page.getByLabel('Edited output position', { exact: true }), 0);
    await q.tool(page, 'Reframe'); await page.getByTestId('auto-reframe-toggle').uncheck();
    await q.tool(page, 'Composite');
    await page.getByText('Composite target', { exact: true }).locator('..').locator('select').selectOption('main-video');
    await page.getByRole('checkbox', { name: /Enable mask/ }).uncheck();
    // Playwright's serialized storageState cannot preserve File payloads from
    // an interrupted QA context. Re-import the diagnostic through normal UI;
    // never inject replacement media or treat a QA fixture as app recovery.
    for (const image of work?.snapshot.overlays || []) {
      await page.getByText('Composite target', { exact: true }).locator('..').locator('select').selectOption(image.id);
      await page.locator('.overlay-delete-btn').press('Enter');
    }
    const ids = [];
    for (const [index, shape] of ['rectangle', 'ellipse', 'polygon'].entries()) {
      await range(page.getByLabel('Edited output position', { exact: true }), 0);
      await page.getByTestId('visual-image-input').setInputFiles(path.join(folder, 'diagnostic-magenta.png'));
      await q.tool(page, 'B-roll');
      await page.getByLabel('Start', { exact: true }).fill('0');
      await page.getByLabel('B-roll duration', { exact: true }).fill('2');
      await page.getByLabel('B-roll duration', { exact: true }).press('Tab');
      await page.getByRole('button', { name: 'Stretch', exact: true }).click();
      const imported = await h.save(page, `image-${index}`), image = imported.snapshot.overlays[index];
      ids.push(image.id);
      await q.tool(page, 'Motion'); await page.getByRole('button', { name: 'Transform keyframes', exact: true }).click();
      await page.getByText('Target layer', { exact: true }).locator('..').locator('select').selectOption(image.id);
      const inspector = page.getByRole('tabpanel').filter({ has: page.getByRole('heading', { name: 'Animate transform, crop and opacity', exact: true }) });
      const remove = inspector.getByRole('button', { name: /Remove transform pose at/ });
      while (await remove.count()) await remove.first().click();
      await inspector.getByLabel('X', { exact: true }).fill(String(22 + index * 28));
      await inspector.getByLabel('Y', { exact: true }).fill('50');
      await inspector.getByLabel('Scale', { exact: true }).fill('0.55');
      if (index === 0) {
        await range(page.getByRole('slider', { name: /^Crop Y/ }), 10);
        await page.getByRole('button', { name: /Add transform keyframe at/ }).click();
        await range(page.getByLabel('Edited output position', { exact: true }), 1.5);
        await range(page.getByRole('slider', { name: /^Crop X/ }), 30);
        await page.getByRole('button', { name: /Add transform keyframe at/ }).click();
      }
      await q.tool(page, 'Composite');
      await page.getByText('Composite target', { exact: true }).locator('..').locator('select').selectOption(image.id);
      await page.getByRole('checkbox', { name: /Enable mask/ }).check();
      await page.getByRole('button', { name: shape, exact: true }).click();
      if (index === 2) {
        await page.getByRole('button', { name: 'ellipse', exact: true }).click(); await page.waitForTimeout(600);
        await page.getByTestId('studio-undo-button').click();
        assert.match(await page.getByRole('button', { name: 'polygon', exact: true }).getAttribute('class'), /is-active/);
        await page.getByTestId('studio-redo-button').click();
        assert.match(await page.getByRole('button', { name: 'ellipse', exact: true }).getAttribute('class'), /is-active/);
        await page.getByRole('button', { name: 'polygon', exact: true }).click();
      }
      console.log(`Native ${shape} mask applied.`);
    }
    await q.tool(page, 'Sound');
    await page.getByTestId('background-sound-input').setInputFiles(path.resolve('reports/model-capability-runtime-v1-20261009/proof/launch-template/launch-pulse-original.wav'));
    await range(page.getByRole('slider', { name: /Background volume/ }), 15);
    const edited = await h.save(page, 'edited');
    assert.deepEqual(edited.snapshot.overlays.map(x => x.mask.shape), ['rectangle', 'ellipse', 'polygon']);
    const storedFiles = await page.evaluate(() => new Promise(resolve => {
      const request = indexedDB.open('autopromote-viral-studio', 1);
      request.onsuccess = () => { const db = request.result;
        const query = db.transaction('projects', 'readonly').objectStore('projects').getAll();
        query.onsuccess = () => { const project = query.result.find(p => p.name === 'Studio — geometric masks and animated crop · 20261013');
          const types = project.snapshot.overlays.map(x => x.file instanceof Blob); db.close(); resolve(types); };
      };
    }));
    assert(storedFiles.every(Boolean), 'Local diagnostic image bytes are absent before cold reopen');
    await page.reload(); await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click(); await h.rail(page); await pause(page);
    const reopened = await h.save(page, 'reopened'); assert.equal(hash(reopened.snapshot.studioDocument), hash(edited.snapshot.studioDocument));
    const samples = [];
    for (const [index, time] of [.4, .8, 1.3].entries()) {
      await range(page.getByLabel('Edited output position', { exact: true }), time);
      await page.waitForFunction(() => {
        const v = document.querySelector('[data-testid="studio-after-video"]');
        return v && !v.seeking && v.readyState >= 3 && v.dataset.programmeSource !== 'final';
      });
      await page.waitForTimeout(350);
      const stage = page.getByTestId('hook-preview-frame');
      samples.push(await stage.evaluate((el, time) => {
        const s = el.getBoundingClientRect();
        return { time, source: el.querySelector('video')?.dataset.programmeSource,
          stage: { width: s.width, height: s.height },
          masks: [...el.querySelectorAll('.draggable-overlay.is-media-overlay')].map(n => ({ clip: getComputedStyle(n).clipPath, transform: getComputedStyle(n).transform })) };
      }, time));
      await stage.screenshot({ path: path.join(folder, `native-${index}.png`) });
    }
    fs.writeFileSync(path.join(folder, 'native-mapped-masks.json'), JSON.stringify(samples, null, 2));
    await h.render(page, 'masks');
    const request = JSON.parse(fs.readFileSync(path.join(folder, 'masks-render-request.private.json')));
    const layers = request.options.viralData.composition_plan.layers.filter(l => ids.includes(l.id));
    assert.deepEqual(layers.map(l => l.effects.mask.shape), ['rectangle', 'ellipse', 'polygon']);
    assert(layers[0].motion_keyframes.some(k => k.property === 'cropX' && k.value === 30));
    await finishRecording(page);
    const after = await h.records(page);
    for (const original of originals) assert.equal(hash(after.find(p => p.id === original.id).snapshot.studioDocument), original.hash);
    const receipt = JSON.parse(fs.readFileSync(path.join(folder, 'masks/render-receipt.json')));
    fs.writeFileSync(path.join(folder, 'native-mask-lifecycle.json'), JSON.stringify({
      at: new Date().toISOString(), projectId: edited.id, canonicalHash: receipt.projectHash, outputHash: receipt.outputSha256,
      nativeUploadEditKeyframesUndoRedoSaveColdReopenExportDownloadTimeline: true,
      originalProjectsPreserved: true, maskShapes: ['rectangle', 'ellipse', 'polygon'], gpuJobs: 0,
      scope: 'Authored geometric masks and animated crop only; no neural segmentation, feather/inversion or public/creative qualification.'
    }, null, 2));
    console.log('Native masks/crop lifecycle, CPU final movie and full Studio timeline passed.');
  } catch (error) {
    await page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(folder, 'failure.json'), JSON.stringify({ error: error.message, qualified: false }));
    throw error;
  } finally {
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), state);
    await context.close(); await browser.close();
  }
}
async function finishRecording(page) {
    await require('./materials-editing-proof').view(page, 'masks');
    const frames = path.join(folder, 'masks/studio-recording-frames');
    const files = fs.readdirSync(frames).filter(f => f.endsWith('.jpg')).sort();
    for (const [index, label] of [[0, 'start'], [Math.floor(files.length / 2), 'middle'], [files.length - 1, 'end']])
      fs.copyFileSync(path.join(frames, files[index]), path.join(folder, 'masks', `studio-${label}.jpg`));
    fs.rmSync(frames, { recursive: true });
    const receipt = JSON.parse(fs.readFileSync(path.join(folder, 'masks/render-receipt.json')));
    fs.writeFileSync(path.join(folder, 'native-mask-lifecycle.json'), JSON.stringify({
      at: new Date().toISOString(), projectId: receipt.projectId, canonicalHash: receipt.projectHash, outputHash: receipt.outputSha256,
      nativeUploadEditKeyframesUndoRedoSaveColdReopenExportDownloadTimeline: true,
      maskShapes: ['rectangle', 'ellipse', 'polygon'], gpuJobs: 0,
      scope: 'Authored geometric masks and animated crop only; no neural segmentation, feather/inversion or public/creative qualification.'
    }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
