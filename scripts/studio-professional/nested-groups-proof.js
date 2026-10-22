#!/usr/bin/env node
// Normal signed-in Studio controls, saved canonical edits and owned CPU export.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const folder = path.resolve(__dirname, '../../reports/studio-professional-nested-groups-20261014/proof');
process.env.STUDIO_TEMPLATE_PROOF_DIR = folder;
Object.assign(process.env, { STUDIO_QA_EXPECTED_WIDTH: '720', STUDIO_QA_EXPECTED_HEIGHT: '1280',
  STUDIO_QA_EXPORT_FPS: '24', STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright' });
const { chromium } = require('playwright'), { hash } = require('../../src/creativeTemplates/contract');
const h = require('../creative-templates/studio-proof'), q = require('../../test/e2e/playwright/studio-stability/run');
const baseline = 'Layer order — artwork between motion · 20261014';
const names = { nested: 'Nested groups — shared canvas transforms · 20261014' };
const decisions = doc => { const { revision, journal, ...content } = doc; return hash(content); };
async function range(input, value) {
  await input.evaluate((el, next) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(next));
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value);
}
async function pause(page) {
  const button = page.getByRole('button', { name: 'Pause comparison', exact: true }); if (await button.isVisible()) await button.click();
  await page.locator('video,audio').evaluateAll(es => es.forEach(el => { el.muted = true; el.pause(); }));
}
async function seek(page, time) {
  await pause(page); await range(page.getByLabel('Edited output position', { exact: true }), time);
  await page.waitForFunction(t => { const v = document.querySelector('[data-testid="studio-after-video"]');
    return v && !v.seeking && v.readyState >= 3 && Math.abs(v.currentTime-t) < .001; }, time);
  await page.waitForTimeout(300); await pause(page);
}
async function number(page, label, value) {
  const input = page.getByLabel(label, { exact: true }); await input.fill(String(value)); await input.press('Tab');
}
async function expand(page, label) {
  const timeline = page.getByTestId('studio-pro-timeline');
  const toggle = timeline.getByRole('button', { name: 'Show motion keyframes', exact: true }); if (await toggle.isVisible()) await toggle.click();
  const row = timeline.getByRole('button', { name: `Expand ${label} keyframes`, exact: true }); if (await row.isVisible()) await row.click();
  const resize = page.getByRole('separator', { name: 'Resize timeline', exact: true }); await resize.focus();
  for (let i=0;i<20;i++) await resize.press('ArrowUp');
}
async function bound(page) {
  const record = await h.save(page, 'bounded');
  assert.equal(record.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick, 270000);
  assert(!record.snapshot.threeDScenes?.length && !record.snapshot.subjectVfxScenes?.length);
  assert.equal(record.snapshot.motionScenes.length, 2);
  const storage = require('../creative-templates/proof-storage'); storage.MAX_CAPTURE_BYTES = 64 * 1024 ** 2;
  storage.requireProofSpace = directory => { assert.equal(path.resolve(directory), folder);
    const s=fs.statfsSync(folder), free=s.bavail*s.bsize; assert(free>=1024**3, 'Three-second CPU proof reserves1GiB');return free; };
}
async function edit(page, variant) {
  assert(!await page.getByRole('button', {name:names[variant],exact:true}).count(), 'Preserve prior native edit');
  await page.getByRole('button',{name:baseline,exact:true}).click();await h.rail(page);
  await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name',{exact:true}).fill(names[variant]);await pause(page);
  const original=await h.save(page,'nested-original'),image=original.snapshot.overlays.find(o=>o.type==='image');
  const low=original.snapshot.motionScenes.find(s=>s.text==='LOWER MOTION'),high=original.snapshot.motionScenes.find(s=>s.text==='UPPER MOTION');
  assert(image&&low&&high);assert.equal(original.snapshot.compoundClips?.length||0,0);
  await q.tool(page,'Composite');
  const groupPanel=page.getByRole('region',{name:'Graphic groups',exact:true});
  const choose=async label=>groupPanel.getByRole('checkbox',{name:`Group selection ${label}`,exact:true}).check();
  await choose(low.name||low.text);await choose(image.name||image.text||'Visual layer');
  await groupPanel.getByRole('button',{name:'Group selected layers',exact:true}).click();
  for(const [field,value] of Object.entries({x:-8,y:5,scale:.85,rotation:-12,opacity:.8})) await number(page,`Group 1 ${field}`,value);
  await choose('Group 1');await choose(high.name||high.text);
  await groupPanel.getByRole('button',{name:'Group selected layers',exact:true}).click();
  for(const [field,value] of Object.entries({x:12,y:-4,scale:1.1,rotation:18,opacity:.9})) await number(page,`Group 2 ${field}`,value);
  const changed=await h.save(page,'nested-changed');
  const groups=changed.snapshot.compoundClips.filter(g=>g.kind==='graphic_group');assert.equal(groups.length,2);
  assert.deepEqual(groups[0].layerIds,[low.id,image.id]);assert.deepEqual(groups[1].layerIds,[groups[0].id,high.id]);
  assert.deepEqual(changed.snapshot.motionKeyframes,original.snapshot.motionKeyframes);
  await page.getByTestId('studio-undo-button').click();const undone=await h.save(page,'nested-undone');
  assert.notEqual(decisions(undone.snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
  await page.getByTestId('studio-redo-button').click();const redone=await h.save(page,'nested-redone');
  assert.equal(decisions(redone.snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
  // Root and nested sibling moves, reset and remove use the same history graph.
  for(const label of ['Bring Group 2 forward','Bring Group 1 forward in Group 2','Reset Group 1 transform','Remove Group 1 transform']) {
    await page.getByRole('button',{name:label,exact:true}).click();const temporary=await h.save(page,`nested-${label.toLowerCase().replaceAll(' ','-')}-temporary`);
    assert.notEqual(decisions(temporary.snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
    await page.getByTestId('studio-undo-button').click();const restored=await h.save(page,`nested-${label.toLowerCase().replaceAll(' ','-')}-restored`);
    assert.equal(decisions(restored.snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
  }
  await number(page,'Group 1 scale',3);assert.equal(await page.getByLabel('Group 1 scale',{exact:true}).getAttribute('aria-invalid'),'true');
  const rejected=await h.save(page,'nested-rejected-scale');assert.equal(decisions(rejected.snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
  await number(page,'Group 1 scale',.85);await page.screenshot({path:path.join(folder,'nested-native-groups.png')});
  const saved=await h.save(page,'nested-saved');await page.reload();
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name:names[variant],exact:true}).click();await h.rail(page);await pause(page);
  const reopened=await h.save(page,'nested-reopened');assert.equal(hash(reopened.snapshot.studioDocument),hash(saved.snapshot.studioDocument));
  fs.writeFileSync(path.join(folder,'nested-native-edit.json'),JSON.stringify({projectId:reopened.id,
    canonicalHash:hash(reopened.snapshot.studioDocument),order:reopened.snapshot.compositionOrder,groups,imageId:image.id,
    childKeysPreserved:true,undo:true,redo:true,rootAndNestedOrder:true,resetAndRemoveHistory:true,invalidScaleRejected:true,
    saveColdReopen:true,gpuJobs:0,noMocks:true},null,2));
}
async function capture(page,variant) {
  // Paused parity captures the owned live edit. A completed-output UI card is
  // not a prerequisite; the retained receipt/bytes bind the independent final.
  await q.tool(page,'Export');
  const live=page.getByRole('button',{name:'Show Live Edit',exact:true});if(await live.isVisible())await live.click();
  await page.getByRole('separator',{name:'Resize timeline',exact:true}).focus();await page.keyboard.press('Escape');
  const record=await h.save(page,`${variant}-live`),receipt=JSON.parse(fs.readFileSync(path.join(folder,variant,'render-receipt.json')));
  assert.equal(hash(record.snapshot.studioDocument),receipt.projectHash);assert.equal(record.id,receipt.projectId);
  const samples=[];
  for(const [index,time] of [.5,1,1.5,2.5].entries()) {
    await seek(page,time);
    await page.waitForFunction(()=>document.querySelector('[data-testid="studio-program-canvas"]')?.dataset.sourceSampling==='accurate-paused');
    const stage=page.getByTestId('hook-preview-frame');await stage.screenshot({path:path.join(folder,variant,`live-${index}.png`)});
    const layers=await stage.evaluate(el=>[...el.querySelectorAll('.draggable-overlay, .studio-motion-canvas')].map(e=>({
      kind:e.classList.contains('studio-motion-canvas')?'motion':'overlay',id:e.querySelector('[data-motion-id]')?.dataset.motionId,
      zIndex:Number(getComputedStyle(e).zIndex),box:e.getBoundingClientRect().toJSON()})));
    const groups=await stage.locator('[data-studio-group-id]').count();assert.equal(groups,2);
    const sampling=await page.getByTestId('studio-program-canvas').evaluate(c=>({mode:c.dataset.sourceSampling,sourceContentHash:c.dataset.sourceContentHash,frameIndex:Number(c.dataset.sourceFrameIndex)}));
    assert.equal(sampling.frameIndex,Math.round(time*24));
    samples.push({time,sampling,layers});
  }
  fs.writeFileSync(path.join(folder,variant,'native-live.json'),JSON.stringify({projectId:record.id,canonicalHash:receipt.projectHash,samples},null,2));
}
async function main() {
  const action=process.argv[2]||'edit',variant=process.argv[3]||'nested';assert(names[variant]);
  const context=await chromium.launchPersistentContext(path.join(folder,'browser-profile.private'),{channel:'chromium',headless:true,
    args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1'],viewport:{width:1600,height:1770},acceptDownloads:true});
  const page=context.pages()[0];page.setDefaultTimeout(45000);let renders=0,gpuRequests=0;
  page.on('request',req=>{const p=new URL(req.url()).pathname;if(p==='/api/media/process')renders++;if(p.includes('studio-3d-preview')&&req.method()==='POST')gpuRequests++;});
  try {
    await page.goto('http://localhost:5000/?studioProfessionalSession=nested-groups');await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
    assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
    if(action==='edit') await edit(page,variant);
    else {
      await page.getByRole('button',{name:names[variant],exact:true}).click();await h.rail(page);await pause(page);await bound(page);
      if(action==='history') {
        // Keep the delivered render/project hash unchanged; exercise the final
        // naming repair on a normal native diagnostic duplicate.
        await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
        await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
        await page.getByLabel('Project name',{exact:true}).fill('Nested groups — final build history validation · 20261014');
        const saved=await h.save(page,'final-build-before');await q.tool(page,'Composite');
        const originalHash=decisions(saved.snapshot.studioDocument),checks=[];
        for(const label of ['Bring Group 2 forward','Bring Group 1 forward in Group 2']) {
          await page.getByRole('button',{name:label,exact:true}).click();
          const tag=label.toLowerCase().replaceAll(' ','-'),changed=await h.save(page,`final-build-${tag}`);
          assert.notEqual(decisions(changed.snapshot.studioDocument),originalHash);
          await page.getByTestId('studio-undo-button').click();const restored=await h.save(page,`final-build-${tag}-undone`);
          assert.equal(decisions(restored.snapshot.studioDocument),originalHash);checks.push(tag);
        }
        await page.getByRole('button',{name:'Remove Group 1 transform',exact:true}).click();await h.save(page,'final-build-removed-inner');
        await page.getByRole('checkbox',{name:'Group selection ORDER',exact:true}).check();
        await page.getByRole('button',{name:'Group selected layers',exact:true}).click();
        const created=await h.save(page,'final-build-unique-name'),groups=created.snapshot.compoundClips.filter(g=>g.kind==='graphic_group');
        assert.deepEqual(groups.map(g=>g.name),['Group 2','Group 3']);
        await page.getByTestId('studio-undo-button').click();await h.save(page,'final-build-create-undone');
        await page.getByTestId('studio-undo-button').click();const restored=await h.save(page,'final-build-reopened');
        assert.equal(decisions(restored.snapshot.studioDocument),originalHash);
        fs.writeFileSync(path.join(folder,'final-build-native-history.json'),JSON.stringify({projectId:restored.id,
          canonicalDecisionsHash:originalHash,canonicalHash:hash(restored.snapshot.studioDocument),checks,
          uniqueNamesAfterRemoval:true,exactDecisionsRestored:true,gpuJobs:0},null,2));
      } else if(action==='render') await h.render(page,variant);
      else if(action==='preview') await capture(page,variant);
      else if(action==='view') {
        const saved=await h.save(page,`${variant}-view`),image=saved.snapshot.overlays.find(o=>o.type==='image');
        await expand(page,image.name||image.text||'Visual layer');
        await require('../creative-templates/materials-editing-proof').view(page,variant);
        fs.rmSync(path.join(folder,variant,'studio-recording-frames'),{recursive:true,force:true});
      } else throw Error('Unknown nested-group proof action');
    }
    assert.equal(renders,action==='render'?1:0);assert.equal(gpuRequests,0);
    console.log(`Native ${variant} ${action} passed; ${renders} CPU exports, zero GPU jobs.`);
  } catch(error) {
    await page.screenshot({path:path.join(folder,`${variant}-${action}-failure.png`)}).catch(()=>{});
    fs.writeFileSync(path.join(folder,`${variant}-${action}-failure.json`),JSON.stringify({error:error.message,qualified:false}));
    console.error((await page.locator('body').innerText()).slice(-1000));throw error;
  } finally {await context.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
