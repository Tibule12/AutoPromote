#!/usr/bin/env node
// Reopen the real owned edit. All mutations use Studio's normal controls.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), zlib = require('node:zlib');
const folder = path.resolve('reports/studio-timeline-correspondence-20261015/proof');
process.env.STUDIO_KINETIC_PROOF_DIR = folder;
process.env.STUDIO_QA_TIMELINE_HEIGHT = '440';
process.env.STUDIO_QA_RENDER_DOCUMENT = path.resolve('reports/studio-break-the-loop-20261015/proof/break-the-loop-completed-edit-document.json');
const { pause, seek, recording } = require('./kinetic-type-proof');
const { chromium } = require('playwright'), h = require('../creative-templates/studio-proof');
const { hash } = require('../../src/creativeTemplates/contract');
const name = 'BREAK THE LOOP — authored motion';
const decisions = doc => { const { revision, journal, idempotency, ...rest } = doc; return hash(rest); };
async function save(page, label) {
  const record = await h.save(page, label);
  // Retain exact read-only receipts without repeatedly storing inline artwork.
  for (const suffix of ['project.private.json', 'document.json']) {
    const file = path.join(folder, `${label}-${suffix}`); const raw = fs.readFileSync(file);
    fs.writeFileSync(`${file}.gz`, zlib.gzipSync(raw), { mode: 0o600 }); fs.unlinkSync(file);
  }
  return record;
}
async function open(page) {
  await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click(); await h.rail(page); await pause(page);
}
async function height(page) {
  const separator = page.getByRole('separator', { name: 'Resize timeline' }); await separator.focus();
  for (let i = 0; i < 40; i++) { const current = Number(await separator.getAttribute('aria-valuenow'));
    if (Math.abs(current - 440) < 24) break; await separator.press(current < 440 ? 'ArrowUp' : 'ArrowDown'); }
}
async function restoreMovie(page) {
  const checked = await save(page, 'verified-control-edit');
  const downloadPending = page.waitForEvent('download');
  await page.getByRole('button', {name:'Download project backup',exact:true}).click();
  const download=await downloadPending, backup=path.join(folder,'TIMELINE-CONTROL-VERIFICATION.autopromote.json');
  await download.saveAs(backup);fs.chmodSync(backup,0o600);
  assert.equal(hash(JSON.parse(fs.readFileSync(backup)).snapshot.studioDocument),hash(checked.snapshot.studioDocument));
  const detail=page.locator('.studio-saved-projects');
  if(!await detail.evaluate(el=>el.open)) await detail.locator(':scope > summary').click();
  const duplicatePath=path.join(folder,'control-verification-copy-project.private.json.gz');
  let duplicate;
  if(fs.existsSync(duplicatePath)) {
    duplicate=JSON.parse(zlib.gunzipSync(fs.readFileSync(duplicatePath)));
    await page.locator('.studio-saved-projects strong').filter({hasText:/^BREAK THE LOOP — timeline control verification$/}).click();
    await h.rail(page);await pause(page);
  } else {
    await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
    await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
    await page.getByLabel('Project name',{exact:true}).fill('BREAK THE LOOP — timeline control verification');
    duplicate=await save(page,'control-verification-copy');
  }
  assert.notEqual(duplicate.id,checked.id);
  // Both a native duplicate and downloaded backup retain the verified edit
  // before the exact movie-bound backup is restored through ownership checks.
  if(!await detail.evaluate(el=>el.open)) await detail.locator(':scope > summary').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:`Delete ${name}`,exact:true}).click();
  await page.getByRole('button',{name:`Delete ${name}`,exact:true}).waitFor({state:'hidden'});
  await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.resolve('reports/studio-break-the-loop-20261015/proof/BREAK-THE-LOOP.autopromote.json'));
  await page.getByRole('button',{name,exact:true}).waitFor({timeout:120000});
  await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);
  const restored=await save(page,'movie-bound-restored');
  assert.equal(hash(restored.snapshot.studioDocument),'74342256ad1eb1f82baa68482772cb7b1ee8ff72efc163cfddca52b42d867817');
  await page.reload();await open(page);
  await page.locator('.after-preview-loading').waitFor({state:'hidden',timeout:90000});
  const stable=await save(page,'movie-bound-reopened');
  assert.equal(hash(stable.snapshot.studioDocument),hash(restored.snapshot.studioDocument));
  await require('../../test/e2e/playwright/studio-stability/run').tool(page,'Export');
  await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.resolve('reports/studio-break-the-loop-20261015/proof/break-the-loop/render-receipt.json'));
  await page.getByTestId('rendered-output-ready').waitFor({timeout:120000});
  fs.writeFileSync(path.join(folder,'native-restore.json'),JSON.stringify({preservedControlVerificationProjectId:duplicate.id,
    preservedControlVerificationHash:hash(checked.snapshot.studioDocument),normalProjectBackupDownload:true,
    normalOwnedProjectBackupRestore:true,normalExportReceiptRestore:true,restoredMovieDocumentHash:hash(restored.snapshot.studioDocument),
    renderSubmissions:0,backupSha256:hash(fs.readFileSync(backup))},null,2));
  return restored;
}
async function main() {
  const shm = fs.statfsSync('/dev/shm'); assert(shm.bavail * shm.bsize > 1024 ** 3);
  const context = await chromium.launchPersistentContext(path.resolve('reports/studio-keyframe-selection-20261015/proof/browser-profile.private'), {
    ignoreDefaultArgs:['--disable-dev-shm-usage'], channel:'chromium', headless:true,
    args:['--mute-audio','--disk-cache-size=16777216','--host-resolver-rules=MAP localhost 127.0.0.1'],
    viewport:{width:1920,height:1200},acceptDownloads:true });
  const page = context.pages()[0]; page.setDefaultTimeout(60000); let submissions = 0;
  page.on('request', request => { if(new URL(request.url()).pathname === '/api/media/process') submissions++; });
  try {
    await page.goto('http://localhost:5000/?studioTimelineCorrespondence=20261015',{waitUntil:'domcontentloaded'});
    await open(page); assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
    if(process.argv[2]==='receipt-view') {
      await require('../../test/e2e/playwright/studio-stability/run').tool(page,'Export');
      const before=await save(page,'before-export-receipt');console.log('Receipt input document',hash(before.snapshot.studioDocument));
      page.on('pageerror',error=>console.log('Page error',error.message));
      await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.resolve('reports/studio-break-the-loop-20261015/proof/break-the-loop/render-receipt.json'));
      await page.waitForTimeout(2500);
      fs.writeFileSync(path.join(folder,'receipt-ui.private.txt'),await page.locator('body').innerText(),{mode:0o600});
      await page.screenshot({path:path.join(folder,'receipt-ui.png')});
      console.log('Receipt feedback',await page.locator('.clip-inspector-feedback').allTextContents());
      await page.getByTestId('rendered-output-ready').waitFor({timeout:30000});
      await height(page);await page.getByTestId('studio-pro-timeline').getByRole('button',{name:'At playhead',exact:true}).click();
      await require('../creative-templates/materials-editing-proof').view(page,'break-the-loop');
      assert.equal(submissions,0);console.log('Exact original movie recovered through native receipt and played completely.');return;
    }
    if(process.argv[2]==='restore-view') {
      const restored=await restoreMovie(page);await height(page);
      await page.getByTestId('studio-pro-timeline').getByRole('button',{name:'At playhead',exact:true}).click();
      await require('../creative-templates/materials-editing-proof').view(page,'break-the-loop');
      assert.equal(submissions,0);console.log('Exact movie-bound project restored through native controls; complete playback passed.');return;
    }
    const baseline = await save(page, 'baseline');
    const originalDocument = JSON.parse(fs.readFileSync(process.env.STUDIO_QA_RENDER_DOCUMENT));
    assert.equal(hash(originalDocument), '74342256ad1eb1f82baa68482772cb7b1ee8ff72efc163cfddca52b42d867817');
    assert.equal(decisions(baseline.snapshot.studioDocument), decisions(originalDocument));
    const timeline = page.getByTestId('studio-pro-timeline'); await height(page);
    assert.equal(await timeline.getByRole('button',{name:'Composition layers',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await timeline.locator('[data-layer-id]').count(),60);
    const word = baseline.snapshot.overlays.find(layer=>layer.text==='MAKE'); assert(word);
    await seek(page,9.9);
    const stop = await recording(page);
    try {
      await timeline.getByRole('button',{name:'Select MAKE layer clip',exact:true}).click();
      await timeline.getByRole('button',{name:'Select MAKE layer clip',exact:true}).press('Shift+ArrowRight');
      const moved = await save(page,'moved');
      const delta = moved.snapshot.overlays.find(layer=>layer.id===word.id).startTime - word.startTime; assert(delta>0);
      const oldKeys = baseline.snapshot.motionKeyframes.filter(key=>key.targetId===word.id);
      for(const key of oldKeys) assert(Math.abs(moved.snapshot.motionKeyframes.find(item=>item.id===key.id).time-key.time-delta)<.00002);
      await page.getByTestId('studio-undo-button').click(); assert.equal(decisions((await save(page,'move-undone')).snapshot.studioDocument),decisions(baseline.snapshot.studioDocument));
      await page.getByTestId('studio-redo-button').click(); assert.equal(decisions((await save(page,'move-redone')).snapshot.studioDocument),decisions(moved.snapshot.studioDocument));
      await page.getByTestId('studio-undo-button').click();
      await timeline.getByRole('button',{name:'Expand MAKE keyframes',exact:true}).click();
      const x=timeline.getByLabel('MAKE x value',{exact:true}); const original=await x.inputValue();
      await x.evaluate(el => { window.__propertyInputEvents=[]; for(const type of ['focus','input','change','blur']) el.addEventListener(type,event=>window.__propertyInputEvents.push({type:event.type,value:el.value,connected:el.isConnected})); });
      await x.fill('70'); console.log('After fill', await x.inputValue()); await page.waitForTimeout(200); console.log('Settled fill', await x.inputValue()); await x.press('Tab'); await page.waitForTimeout(500);
      console.log('Native field events', await page.evaluate(()=>window.__propertyInputEvents), await page.locator('.clip-inspector-feedback').allTextContents());
      console.log('Native property replacement committed', original, await x.inputValue());
      assert.notEqual(decisions((await save(page,'property-edited')).snapshot.studioDocument),decisions(baseline.snapshot.studioDocument));
      await page.getByTestId('studio-undo-button').click();
      await timeline.getByRole('button',{name:'Collapse MAKE keyframes',exact:true}).click();
      await timeline.getByRole('button',{name:'At playhead',exact:true}).click();
      const samples=[];
      for(const time of [1.8,4.6,6.8,9.9,12.7,18]) {
        await seek(page,time); await page.waitForTimeout(400);
        const actual=await timeline.locator('[data-layer-id]').evaluateAll(rows=>rows.map(row=>({id:row.dataset.layerId,start:Number(row.dataset.effectiveStart),end:Number(row.dataset.effectiveEnd),label:row.querySelector('.pro-layer-name').textContent})));
        for(const row of actual) assert(time>=row.start && time<row.end,`${row.label} is outside the playhead`);
        await page.getByTestId('viral-studio-workspace').screenshot({path:path.join(folder,`correspondence-${time}.png`)});
        samples.push({time,rows:actual});
      }
      fs.writeFileSync(path.join(folder,'timed-layers.json'),JSON.stringify(samples,null,2));
    } finally { await stop(); }
    const final=await save(page,'final');assert.equal(decisions(final.snapshot.studioDocument),decisions(baseline.snapshot.studioDocument));
    await page.reload();await open(page);const reopened=await save(page,'reopened');
    assert.equal(hash(final.snapshot.studioDocument),hash(reopened.snapshot.studioDocument));
    fs.writeFileSync(path.join(folder,'native-edit.json'),JSON.stringify({projectId:reopened.id,canonicalHash:hash(reopened.snapshot.studioDocument),sameEditDecisionsAsMovie:true,distinctLayerAndGroupRows:60,nativeLayerMoveWithKeysUndoRedo:true,nativeInlinePropertyEditUndo:true,exactColdReopen:true,nativeTimingFilterSamples:6,nativeControlsOnly:true,renderSubmissions:0},null,2));
    const movieBound=await restoreMovie(page);
    await height(page);await timeline.getByRole('button',{name:'At playhead',exact:true}).click();
    const retry=page.getByRole('button',{name:'Retry status check',exact:true});if(await retry.isVisible()) await retry.click();
    await require('../creative-templates/materials-editing-proof').view(page,'break-the-loop');
    assert.equal(submissions,0);
    fs.writeFileSync(path.join(folder,'native-timeline.json'),JSON.stringify({projectId:movieBound.id,canonicalHash:hash(movieBound.snapshot.studioDocument),editedCanonicalHash:hash(reopened.snapshot.studioDocument),
      originalMovieCanonicalHash:hash(originalDocument),sameEditDecisionsAsMovie:true,
      distinctLayerAndGroupRows:60,nativeLayerMoveWithKeysUndoRedo:true,nativeInlinePropertyEditUndo:true,
      exactColdReopen:true,nativeTimingFilterSamples:6,fullSameMoviePlayback:true,renderSubmissions:0,
      nativeControlsOnly:true,graphInjection:false,headless:true,muted:true,gpuJobs:0},null,2));
    console.log('Native layer edits/history, timing samples, cold reopen and complete same-movie playback pass.');
  } catch(error) { await page.screenshot({path:path.join(folder,`failure-${Date.now()}.png`)}).catch(()=>{});throw error; }
  finally { await context.close(); }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
