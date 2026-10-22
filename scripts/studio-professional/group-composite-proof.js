#!/usr/bin/env node
// Normal signed-in Studio controls, saved canonical edits and owned CPU export.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const folder = path.resolve(__dirname, '../../reports/studio-professional-group-composite-20261014/proof');
process.env.STUDIO_TEMPLATE_PROOF_DIR = folder;
Object.assign(process.env, { STUDIO_QA_EXPECTED_WIDTH: '720', STUDIO_QA_EXPECTED_HEIGHT: '1280',
  STUDIO_QA_EXPORT_FPS: '24', STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright' });
const { chromium } = require('playwright'), { hash } = require('../../src/creativeTemplates/contract');
const h = require('../creative-templates/studio-proof'), q = require('../../test/e2e/playwright/studio-stability/run');
const baseline = 'Group keyframes — nested transforms · 20261014';
const names = { composite: 'Group masks and blends — nested composite · 20261014' };
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
async function edit(page,variant) {
  const prefix=`${variant}-${Date.now()}`;
  assert(!fs.existsSync(path.join(folder,`${variant}-native-edit.json`)),'Preserve completed native edit');
  if(await page.getByRole('button',{name:names[variant],exact:true}).count()) {
    await page.getByRole('button',{name:names[variant],exact:true}).click();await h.rail(page);
  } else {
    await page.getByRole('button',{name:baseline,exact:true}).click();await h.rail(page);
    await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
    await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
    await page.getByLabel('Project name',{exact:true}).fill(names[variant]);
  }
  await pause(page);await q.tool(page,'Export');await page.getByLabel('Export frame rate',{exact:true}).selectOption('24');
  const original=await h.save(page,`${prefix}-original`),groups=original.snapshot.compoundClips.filter(g=>g.kind==='graphic_group');
  assert.equal(groups.length,2);const keys=original.snapshot.motionKeyframes;
  assert.equal(keys.filter(k=>groups.some(g=>g.id===k.targetId)).length,16);
  await seek(page,1);await q.tool(page,'Composite');
  await page.getByLabel('Group 1 blend mode',{exact:true}).selectOption('multiply');
  await page.getByLabel('Group 2 blend mode',{exact:true}).selectOption('screen');
  await page.getByLabel('Group 1 enable mask',{exact:true}).check();
  await page.getByLabel('Group 1 mask shape',{exact:true}).selectOption('polygon');
  const pathInput=page.getByLabel('Group 1 mask polygon path',{exact:true});
  const priorPath=await pathInput.inputValue();
  await pathInput.fill('polygon(0% 0%)');await pathInput.press('Enter');
  assert.equal(await pathInput.getAttribute('aria-invalid'),'true');
  const invalid=await h.save(page,`${prefix}-invalid`);
  assert.equal(invalid.snapshot.compoundClips[0].mask.path || 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',priorPath,'Invalid draft stays outside canonical graph');
  await pathInput.press('Escape');assert.equal(await pathInput.inputValue(),priorPath);
  await pathInput.fill('polygon(0% 0%, 75% 0%, 75% 100%, 0% 100%)');await pathInput.press('Enter');
  await range(page.getByLabel('Group 1 mask feather',{exact:true}),4);
  await page.getByLabel('Group 1 invert mask',{exact:true}).check();
  const inverted=await h.save(page,`${prefix}-inverted`);assert(inverted.snapshot.compoundClips[0].mask.inverted);
  await page.getByTestId('studio-undo-button').click();
  const unInverted=await h.save(page,`${prefix}-uninverted`);assert(!unInverted.snapshot.compoundClips[0].mask.inverted);
  await page.getByTestId('studio-redo-button').click();
  assert((await h.save(page,`${prefix}-redone`)).snapshot.compoundClips[0].mask.inverted);
  await page.getByTestId('studio-undo-button').click();
  await page.getByLabel('Group 2 enable mask',{exact:true}).check();
  await range(page.getByLabel('Group 2 mask corner radius',{exact:true}),12);
  const changed=await h.save(page,`${prefix}-changed`);
  assert.deepEqual(changed.snapshot.motionKeyframes,keys);assert.deepEqual(changed.snapshot.compoundClips.map(g=>g.transform),groups.map(g=>g.transform));
  await page.getByRole('button',{name:'Reset Group 1 mask',exact:true}).click();
  assert.deepEqual((await h.save(page,`${prefix}-reset`)).snapshot.compoundClips[0].mask,{enabled:false});
  await page.getByTestId('studio-undo-button').click();
  assert.equal(decisions((await h.save(page,`${prefix}-reset-undone`)).snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
  const timeline=page.getByTestId('studio-pro-timeline');
  const graphics=timeline.getByTestId('pro-track-row-graphics');
  await graphics.getByRole('button',{name:'Lock track',exact:true}).click();
  for(const label of ['Group 1 blend mode','Group 1 enable mask','Group 1 mask shape','Group 1 mask polygon path','Group 1 mask feather','Group 1 invert mask'])
    assert(await page.getByLabel(label,{exact:true}).isDisabled(),label);
  await graphics.getByRole('button',{name:'Unlock track',exact:true}).click();
  await page.screenshot({path:path.join(folder,`${variant}-native-properties.png`)});
  const saved=await h.save(page,`${prefix}-saved`);await page.reload();
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await page.getByRole('button',{name:names[variant],exact:true}).click();
  await h.rail(page);await pause(page);const reopened=await h.save(page,`${prefix}-reopened`);
  assert.equal(hash(reopened.snapshot.studioDocument),hash(saved.snapshot.studioDocument));
  assert.deepEqual(reopened.snapshot.motionKeyframes,keys);
  fs.writeFileSync(path.join(folder,`${variant}-native-edit.json`),JSON.stringify({projectId:reopened.id,
    canonicalHash:hash(reopened.snapshot.studioDocument),order:reopened.snapshot.compositionOrder,groups:reopened.snapshot.compoundClips,
    masterKeys:keys.filter(k=>groups.some(g=>g.id===k.targetId)),allKeysPreserved:true,posesPreserved:true,
    polygonDraftValidation:true,inversionUndoRedo:true,maskResetUndo:true,graphicsLock:true,saveColdReopen:true,gpuJobs:0,noMocks:true},null,2));
}
async function capture(page,variant) {
  // This case already owns a completed export. Wait for normal cold recovery
  // before choosing Live Edit; checking immediately can miss the late card.
  await q.tool(page,'Export');await page.getByTestId('rendered-output-ready').waitFor({timeout:90000});
  const live=page.getByRole('button',{name:'Show Live Edit',exact:true});if(await live.isVisible())await live.click();
  await page.getByRole('button',{name:'Show Finished Video',exact:true}).waitFor();
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
    const groups=await stage.locator('[data-studio-group-id]').evaluateAll(es=>es.map(e=>({id:e.dataset.studioGroupId,pose:JSON.parse(e.dataset.studioGroupPose)})));assert.equal(groups.length,2);
    const sampling=await page.getByTestId('studio-program-canvas').evaluate(c=>({mode:c.dataset.sourceSampling,sourceContentHash:c.dataset.sourceContentHash,frameIndex:Number(c.dataset.sourceFrameIndex)}));
    assert.equal(sampling.frameIndex,Math.round(time*24));
    samples.push({time,sampling,layers,groups});
  }
  fs.writeFileSync(path.join(folder,variant,'native-live.json'),JSON.stringify({projectId:record.id,canonicalHash:receipt.projectHash,samples},null,2));
}
async function main() {
  const action=process.argv[2]||'edit',variant=process.argv[3]||'composite';assert(names[variant]);
  const context=await chromium.launchPersistentContext(path.join(folder,'browser-profile.private'),{channel:'chromium',headless:true,
    args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1'],viewport:{width:1600,height:1770},acceptDownloads:true});
  const page=context.pages()[0];page.setDefaultTimeout(45000);let renders=0,gpuRequests=0;
  page.on('request',req=>{const p=new URL(req.url()).pathname;if(p==='/api/media/process')renders++;if(p.includes('studio-3d-preview')&&req.method()==='POST')gpuRequests++;});
  try {
    await page.goto('http://localhost:5000/?studioProfessionalSession=group-composite');await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
    assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
    if(action==='edit') await edit(page,variant);
    else {
      await page.getByRole('button',{name:names[variant],exact:true}).click();await h.rail(page);await pause(page);await bound(page);
      if(action==='render') await h.render(page,variant);
      else if(action==='preview') await capture(page,variant);
      else if(action==='view') {
        const saved=await h.save(page,`${variant}-view`),image=saved.snapshot.overlays.find(o=>o.type==='image');
        await expand(page,image.name||image.text||'Visual layer');
        for(const group of saved.snapshot.compoundClips.filter(g=>g.kind==='graphic_group')) {
          const row=page.getByTestId('studio-pro-timeline').getByRole('button',{name:`Expand ${group.name} keyframes`,exact:true});if(await row.count())await row.click();
        }
        await require('../creative-templates/materials-editing-proof').view(page,variant);
        fs.rmSync(path.join(folder,variant,'studio-recording-frames'),{recursive:true,force:true});
      } else throw Error('Unknown nested-group proof action');
    }
    assert.equal(renders,action==='render'?1:0);assert.equal(gpuRequests,0);
    console.log(`Native ${variant} ${action} passed; ${renders} CPU exports, zero GPU jobs.`);
  } catch(error) {
    await page.screenshot({path:path.join(folder,`${variant}-${action}-failure-${Date.now()}.png`)}).catch(()=>{});
    fs.writeFileSync(path.join(folder,`${variant}-${action}-failure-${Date.now()}.json`),JSON.stringify({error:error.message,qualified:false}));
    console.error((await page.locator('body').innerText()).slice(-1000));throw error;
  } finally {await context.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
