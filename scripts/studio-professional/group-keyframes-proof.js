#!/usr/bin/env node
// Normal signed-in Studio controls, saved canonical edits and owned CPU export.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const folder = path.resolve(__dirname, '../../reports/studio-professional-group-keyframes-20261014/proof');
process.env.STUDIO_TEMPLATE_PROOF_DIR = folder;
Object.assign(process.env, { STUDIO_QA_EXPECTED_WIDTH: '720', STUDIO_QA_EXPECTED_HEIGHT: '1280',
  STUDIO_QA_EXPORT_FPS: '24', STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright' });
const { chromium } = require('playwright'), { hash } = require('../../src/creativeTemplates/contract');
const h = require('../creative-templates/studio-proof'), q = require('../../test/e2e/playwright/studio-stability/run');
const baseline = 'Nested groups — shared canvas transforms · 20261014';
const names = { animated: 'Group keyframes — nested transforms · 20261014' };
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
  assert(!fs.existsSync(path.join(folder,'animated-native-edit.json')),'Preserve completed native edit');
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
  assert.equal(groups.length,2);const groupIds=groups.map(g=>g.id),childKeys=original.snapshot.motionKeyframes.filter(k=>!groupIds.includes(k.targetId));
  assert(!original.snapshot.motionKeyframes.some(k=>groupIds.includes(k.targetId)),'Fresh diagnostic edit requires unanimated groups');
  await seek(page,0);await q.tool(page,'Composite');const panel=page.getByRole('region',{name:'Graphic groups',exact:true});
  const fields={'Group 1':{x:0,y:-1,scale:.9,rotation:4,opacity:.95},'Group 2':{y:4,rotation:5,opacity:.75}};
  for(const [name,values] of Object.entries(fields)) for(const field of Object.keys(values))
    await panel.getByRole('button',{name:`Add ${name} ${field} keyframe at playhead`,exact:true}).click();
  await seek(page,2);
  for(const [name,values] of Object.entries(fields)) for(const [field,value] of Object.entries(values)) await number(page,`${name} ${field}`,value);
  const keyed=await h.save(page,`${prefix}-keyed`);
  for(const group of groups) {
    const owner=panel.locator(`[data-group-id="${group.id}"]`);
    for(const key of keyed.snapshot.motionKeyframes.filter(k=>k.targetId===group.id&&k.time===2)) {
      await owner.getByLabel('Curve keyframe',{exact:true}).selectOption(key.id);
      await owner.getByLabel('Selected group key easing',{exact:true}).selectOption('linear');
    }
  }
  const inner=panel.locator(`[data-group-id="${groups[0].id}"]`);
  const xKey=keyed.snapshot.motionKeyframes.find(k=>k.targetId===groups[0].id&&k.property==='x'&&k.time===2);
  await inner.getByLabel('Curve keyframe',{exact:true}).selectOption(xKey.id);
  await inner.getByLabel('Selected group key easing',{exact:true}).selectOption('bezier');
  await number(page,'Bezier Time 1',.2);await number(page,'Bezier Time 2',.8);
  const changed=await h.save(page,`${prefix}-changed`);const masters=changed.snapshot.motionKeyframes.filter(k=>groupIds.includes(k.targetId));
  assert.equal(masters.length,16);assert.deepEqual(changed.snapshot.motionKeyframes.filter(k=>!groupIds.includes(k.targetId)),childKeys);
  assert.deepEqual(masters.find(k=>k.id===xKey.id).curve,[.2,0,.8,1]);
  await page.getByTestId('studio-undo-button').click();const undone=await h.save(page,`${prefix}-undone`);
  assert.notEqual(decisions(undone.snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
  await page.getByTestId('studio-redo-button').click();const redone=await h.save(page,`${prefix}-redone`);
  assert.equal(decisions(redone.snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
  await seek(page,1);await q.tool(page,'Composite');
  for(const [label,value] of [['Group 1 x',-4],['Group 1 scale',.875],['Group 1 rotation',-4],['Group 1 opacity',.875],['Group 2 y',0],['Group 2 rotation',11.5],['Group 2 opacity',.825]])
    assert(Math.abs(Number(await page.getByLabel(label,{exact:true}).inputValue())-value)<1e-6,label);
  for(const label of ['Reset Group 1 transform','Remove Group 1 transform']) {
    await panel.getByRole('button',{name:label,exact:true}).click();const temporary=await h.save(page,`${prefix}-${label.split(' ')[0]}-temporary`);
    assert(!temporary.snapshot.motionKeyframes.some(k=>k.targetId===groups[0].id));
    assert.deepEqual(temporary.snapshot.motionKeyframes.filter(k=>!groupIds.includes(k.targetId)),childKeys);
    await page.getByTestId('studio-undo-button').click();const restored=await h.save(page,`${prefix}-${label.split(' ')[0]}-restored`);
    assert.equal(decisions(restored.snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
  }
  const timeline=page.getByTestId('studio-pro-timeline');
  await timeline.getByRole('button',{name:'Show motion keyframes',exact:true}).click();
  for(const group of groups) await timeline.getByRole('button',{name:`Expand ${group.name} keyframes`,exact:true}).click();
  assert.equal(await timeline.getByLabel('Group 1 x value',{exact:true}).getAttribute('min'),'-100');
  assert(!await timeline.getByLabel('Group 1 cropX value',{exact:true}).count());
  const keyButton=timeline.getByTestId(`motion-timeline-key-${xKey.id}`);await keyButton.click();
  const before=Number(await keyButton.getAttribute('data-time'));await keyButton.press('ArrowRight');
  await page.waitForFunction(id=>Math.abs(Number(document.querySelector(`[data-testid="motion-timeline-key-${id}"]`)?.dataset.time)-2-1/24)<1e-6,xKey.id);
  const nudged=await h.save(page,`${prefix}-nudged`);assert.notEqual(decisions(nudged.snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
  await page.getByTestId('studio-undo-button').click();const restored=await h.save(page,`${prefix}-nudge-undone`);
  assert.equal(decisions(restored.snapshot.studioDocument),decisions(changed.snapshot.studioDocument));assert.equal(before,2);
  const graphics=timeline.getByTestId('pro-track-row-graphics');await graphics.getByRole('button',{name:'Lock track',exact:true}).click();
  await q.tool(page,'Composite');assert(await page.getByLabel('Group 1 x',{exact:true}).isDisabled());
  assert(await timeline.getByLabel('Group 1 x value',{exact:true}).isDisabled());
  await graphics.getByRole('button',{name:'Unlock track',exact:true}).click();await seek(page,1);
  await page.screenshot({path:path.join(folder,'animated-native-properties.png')});
  const saved=await h.save(page,`${prefix}-saved`);await page.reload();
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await page.getByRole('button',{name:names[variant],exact:true}).click();
  await h.rail(page);await pause(page);const reopened=await h.save(page,`${prefix}-reopened`);
  assert.equal(hash(reopened.snapshot.studioDocument),hash(saved.snapshot.studioDocument));
  assert.deepEqual(reopened.snapshot.motionKeyframes.filter(k=>groupIds.includes(k.targetId)),masters);
  fs.writeFileSync(path.join(folder,'animated-native-edit.json'),JSON.stringify({projectId:reopened.id,
    canonicalHash:hash(reopened.snapshot.studioDocument),order:reopened.snapshot.compositionOrder,groups:reopened.snapshot.compoundClips,
    masterKeys:masters,childKeysPreserved:true,evaluatedMidpoint:true,undo:true,redo:true,resetAndRemoveClearOwnedKeys:true,
    keyNudge:true,graphicsLock:true,propertyRows:true,saveColdReopen:true,gpuJobs:0,noMocks:true},null,2));
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
  const action=process.argv[2]||'edit',variant=process.argv[3]||'animated';assert(names[variant]);
  const context=await chromium.launchPersistentContext(path.join(folder,'browser-profile.private'),{channel:'chromium',headless:true,
    args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1'],viewport:{width:1600,height:1770},acceptDownloads:true});
  const page=context.pages()[0];page.setDefaultTimeout(45000);let renders=0,gpuRequests=0;
  page.on('request',req=>{const p=new URL(req.url()).pathname;if(p==='/api/media/process')renders++;if(p.includes('studio-3d-preview')&&req.method()==='POST')gpuRequests++;});
  try {
    await page.goto('http://localhost:5000/?studioProfessionalSession=group-keyframes');await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
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
