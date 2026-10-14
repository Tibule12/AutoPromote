#!/usr/bin/env node
// Normal signed-in Studio controls, saved canonical edits and owned CPU export.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const folder = path.resolve(__dirname, '../../reports/studio-professional-layer-order-20261014/proof');
process.env.STUDIO_TEMPLATE_PROOF_DIR = folder;
Object.assign(process.env, { STUDIO_QA_EXPECTED_WIDTH: '720', STUDIO_QA_EXPECTED_HEIGHT: '1280',
  STUDIO_QA_EXPORT_FPS: '24', STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright' });
const { chromium } = require('playwright'), { hash } = require('../../src/creativeTemplates/contract');
const h = require('../creative-templates/studio-proof'), q = require('../../test/e2e/playwright/studio-stability/run');
const baseline = 'Image effects — shared shadow, glow and blur · 20261013';
const names = { 'motion-front': 'Layer order — motion above artwork · 20261014',
  between: 'Layer order — artwork between motion · 20261014' };
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
  if (await page.getByRole('button', { name: names[variant], exact: true }).count()) {
    assert(!fs.existsSync(path.join(folder, `${variant}-native-edit.json`)), 'Preserve completed edit');
    await page.getByRole('button', { name: names[variant], exact: true }).click(); await h.rail(page);
  } else {
    await page.getByRole('button', { name: variant === 'between' ? names['motion-front'] : baseline, exact: true }).click(); await h.rail(page);
    await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
    await page.getByLabel('Project name', { exact: true }).fill(names[variant]);
  }
  await pause(page); const original = await h.save(page, `${variant}-original`);
  const image=original.snapshot.overlays.find(o=>o.type==='image');assert(image);
  if (variant === 'motion-front' && original.snapshot.motionScenes.length === 0) {
    await q.tool(page, 'Motion');
    await page.getByRole('button',{name:'Logo & layers',exact:true}).click();
    await page.getByText('Target layer', {exact:true}).locator('..').locator('select').selectOption(image.id);
    await page.getByRole('checkbox',{name:'Enable layer glow',exact:true}).uncheck();
    await page.getByRole('checkbox',{name:'Enable layer shadow',exact:true}).uncheck();
    await range(page.getByRole('slider',{name:/^Layer blur/}),0);
    await seek(page,0); await q.tool(page,'Motion'); await page.getByRole('button',{name:'Motion + sound',exact:true}).click();
    for (const scene of [{ preset:'Number reveal', text:'LOWER MOTION', x:50,y:56,scale:.6,color:'#00ccff' },
      { preset:'Impact title',text:'UPPER MOTION',x:65,y:67,scale:.3,color:'#ffb800' }]) {
      await page.getByRole('button',{name:`Add ${scene.preset}`,exact:true}).click();
      await page.getByLabel('Motion headline',{exact:true}).fill(scene.text);
      await page.getByLabel('Motion sound',{exact:true}).selectOption('none');
      await page.getByLabel('Motion accent',{exact:true}).fill(scene.color);
      for(const [label,value] of [['Motion start',0],['Motion duration',3],['Start X',scene.x],['End X',scene.x],
        ['Start Y',scene.y],['End Y',scene.y],['Start scale',scene.scale],['End scale',scene.scale]]) await number(page,label,value);
    }
  }
  if (variant === 'motion-front') {
    const prepared=await h.save(page,'prepared');assert.equal(prepared.snapshot.motionScenes.length,2);
    if (!prepared.snapshot.overlays.some(o=>o.text==='ORDER')) {
      await q.tool(page,'Graphics');await page.getByRole('button',{name:/Headline/}).click();
      await page.getByLabel('Title text',{exact:true}).fill('ORDER');
      await number(page,'Title start time',0);await number(page,'Title duration',3);
    }
    await q.tool(page,'Composite');
    const front=page.getByRole('region',{name:'Layer stack',exact:true}).getByRole('button',{name:'Bring ORDER forward',exact:true});
    for(let i=0;i<3&&await front.isEnabled();i++) await front.click();
  } else if (variant === 'between') {
    await q.tool(page,'Composite');
    const row=page.getByRole('region',{name:'Layer stack',exact:true}).locator(`[data-layer-id="${image.id}"]`);
    await row.getByRole('button',{name:/Bring .* forward/}).click();
  }
  const changed=await h.save(page,`${variant}-ordered`);
  assert.equal(changed.snapshot.studioDocument.compatibility.layerComposition,'ordered_flat_layers');
  assert.equal(changed.snapshot.motionScenes.length,2);
  const ids=changed.snapshot.compositionOrder;
  const low=changed.snapshot.motionScenes.find(s=>s.text==='LOWER MOTION').id;
  const high=changed.snapshot.motionScenes.find(s=>s.text==='UPPER MOTION').id;
  const title=changed.snapshot.overlays.find(o=>o.text==='ORDER').id;
  assert.deepEqual(ids,variant==='between'?[low,image.id,high,title]:[image.id,low,high,title]);
  await page.getByTestId('studio-undo-button').click(); const undone=await h.save(page,`${variant}-undone`);
  assert.notEqual(decisions(undone.snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
  await page.getByTestId('studio-redo-button').click();const redone=await h.save(page,`${variant}-redone`);
  assert.equal(decisions(redone.snapshot.studioDocument),decisions(changed.snapshot.studioDocument));
  await page.screenshot({path:path.join(folder,`${variant}-native-stack.png`)});
  const saved=await h.save(page,`${variant}-saved`);
  await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name:names[variant],exact:true}).click();await h.rail(page);await pause(page);
  const reopened=await h.save(page,`${variant}-reopened`);assert.equal(hash(reopened.snapshot.studioDocument),hash(saved.snapshot.studioDocument));
  fs.writeFileSync(path.join(folder,`${variant}-native-edit.json`),JSON.stringify({projectId:reopened.id,
    canonicalHash:hash(reopened.snapshot.studioDocument),order:ids,imageId:image.id,lowMotionId:low,highMotionId:high,titleId:title,
    undo:true,redo:true,saveColdReopen:true,gpuJobs:0,noMocks:true},null,2));
}
async function capture(page,variant) {
  await q.tool(page,'Export'); await page.getByTestId('rendered-output-ready').waitFor({timeout:90000});
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
    const z=layers.map(l=>l.zIndex).sort((a,b)=>a-b);assert.deepEqual(z,[100,101,102,103]);
    const sampling=await page.getByTestId('studio-program-canvas').evaluate(c=>({mode:c.dataset.sourceSampling,sourceContentHash:c.dataset.sourceContentHash,frameIndex:Number(c.dataset.sourceFrameIndex)}));
    assert.equal(sampling.frameIndex,Math.round(time*24));
    samples.push({time,sampling,layers});
  }
  fs.writeFileSync(path.join(folder,variant,'native-live.json'),JSON.stringify({projectId:record.id,canonicalHash:receipt.projectHash,samples},null,2));
}
async function main() {
  const action=process.argv[2]||'edit',variant=process.argv[3]||'motion-front';assert(names[variant]);
  const context=await chromium.launchPersistentContext(path.join(folder,'browser-profile.private'),{channel:'chromium',headless:true,
    args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1'],viewport:{width:1600,height:1770},acceptDownloads:true});
  const page=context.pages()[0];page.setDefaultTimeout(45000);let renders=0,gpuRequests=0;
  page.on('request',req=>{const p=new URL(req.url()).pathname;if(p==='/api/media/process')renders++;if(p.includes('studio-3d-preview')&&req.method()==='POST')gpuRequests++;});
  try {
    await page.goto('http://localhost:5000/?studioProfessionalSession=layer-order');await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
    assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
    if(action==='edit') await edit(page,variant);
    else {
      await page.getByRole('button',{name:names[variant],exact:true}).click();await h.rail(page);await pause(page);await bound(page);
      if(action==='render') await h.render(page,variant);
      else if(action==='preview') await capture(page,variant);
      else if(action==='view') {
        const saved=await h.save(page,`${variant}-view`),image=saved.snapshot.overlays.find(o=>o.type==='image');
        await expand(page,image.name||image.text||'Visual layer');
        await require('../creative-templates/materials-editing-proof').view(page,variant);
        fs.rmSync(path.join(folder,variant,'studio-recording-frames'),{recursive:true,force:true});
      } else throw Error('Unknown layer-order proof action');
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
