// All animation is authored with ordinary signed-in Studio controls.
// Source artwork import is the public Graphics interchange, never graph injection.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const story = process.argv[2], phase = process.argv[3] || 'all';
assert(['product', 'transition', 'logo'].includes(story));
const folder = path.join(__dirname, 'proof', story, process.env.STUDIO_MOTION_TAKE || '');
const direction = JSON.parse(fs.readFileSync(path.join(folder, 'direction.json')));
Object.assign(process.env, { STUDIO_TEMPLATE_PROOF_DIR: folder, STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_EXPORT_FPS: '24', STUDIO_QA_EXPORT_RESOLUTION: 'source',
  STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright', STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS: '1200000',
  STUDIO_QA_UPLOAD_BUDGET_MS: '300000', STUDIO_QA_TIMELINE_HEIGHT: '430', STUDIO_QA_HIDE_MEDIA: '1' });
const ramCapture = process.env.STUDIO_MOTION_TAKE ? fs.mkdtempSync('/dev/shm/studio-visible-controls-') : null;
if(ramCapture)process.env.STUDIO_KINETIC_PROOF_DIR=ramCapture;
const { pause, seek, range, recording: capture } = require('../../scripts/studio-professional/kinetic-type-proof');
async function recording(page){
  require('../../scripts/creative-templates/proof-storage').requireProofSpace(folder);
  const stop=await capture(page);return async()=>{await stop();if(ramCapture){
    for(const name of fs.readdirSync(ramCapture)){
      fs.cpSync(path.join(ramCapture,name),path.join(folder,name),{recursive:true});
      if(['editing-in-studio.mp4','editing-recording.json'].includes(name))fs.unlinkSync(path.join(ramCapture,name));
    }
  }};
}
const show = async field => { await field.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest'}));await field.page().waitForTimeout(220); };
Object.assign(process.env, { STUDIO_QA_EXPECTED_WIDTH: '720', STUDIO_QA_EXPECTED_HEIGHT: '1280' });
const h = require('../../scripts/creative-templates/studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const { hash } = require('../../src/creativeTemplates/contract');
const write = (file, value) => fs.writeFileSync(path.join(folder, file), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const backupFile = path.join(folder, 'MOTION-RESULT.autopromote.json');
async function backup(page) {
  const versions = page.getByLabel('Include saved versions in backup', { exact: true });
  if (await versions.isChecked()) await versions.uncheck();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
  await (await waiting).saveAs(backupFile);
}
async function motionTarget(page, id) {
  await q.tool(page, 'Motion');
  await page.getByRole('button', { name: 'Transform keyframes', exact: true }).click();
  await show(page.getByLabel('Target layer', { exact: true }));
  await page.getByLabel('Target layer', { exact: true }).selectOption(id);
}
async function animate(page, layer, poses) {
  await motionTarget(page, layer.id);
  for (const { time, easing, ...values } of poses) {
    await seek(page, time);
    for (const [label, value] of Object.entries(values)) {
      if (label === 'Opacity') {
        const input=page.locator('label.inspector-range').filter({ has: page.locator('b', { hasText: /^Opacity$/ }) }).locator('input[type=range]');await show(input);await range(input, value);
      } else {
        const input = page.getByRole('spinbutton', { name: label, exact: true });
        await show(input);await input.fill(String(value)); await input.blur();
      }
    }
    const add=page.getByRole('button', { name: /^◆ Add transform keyframe at/ });await show(add);await add.click();
    // The native transport is frame-quantized. Observe its actual authored time.
    const current = await h.save(page, 'authoring-current');
    const key = current.snapshot.motionKeyframes.filter(k => k.targetId === layer.id && k.property === 'x')
      .sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time))[0];
    assert(key && Math.abs(key.time - time) <= 1 / 24);
    const curve=page.getByLabel(`Transform pose at ${key.time.toFixed(2)} seconds easing`, { exact: true });await show(curve);await curve.selectOption(easing || 'ease_out');
    await page.waitForTimeout(350);
  }
}
async function titleChoreography(page, copy, start) {
  await q.tool(page, 'Graphics');
  await page.locator('.title-layer-list button').filter({ has: page.locator('strong', { hasText: copy }) }).first().click();
  const at = page.getByLabel('Title start time', { exact: true }); await at.fill(String(start)); await at.blur();
  const duration = page.getByLabel('Title duration', { exact: true }); await duration.fill(String(direction.duration - start)); await duration.blur();
  await page.getByRole('button', { name: 'Animate this title', exact: true }).click();
  await page.getByLabel('Animate text by', { exact: true }).selectOption('word');
  await page.getByLabel('Text animation order', { exact: true }).selectOption('forward');
  await page.getByLabel('Text settling curve', { exact: true }).selectOption('ease_out');
  for (const [label, value] of [['Stagger', 38], ['Letter travel Y (em)', .8], ['Starting scale', 1],
    ['Starting rotation', 0], ['Starting opacity', 0], ['Starting spread', .04]]) {
    const field = page.getByLabel(label, { exact: true });await show(field); await field.fill(String(value)); await field.blur();
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: 'Rebuild entrance keys', exact: true }).click();
}
async function prepare(page) {
  assert(!fs.existsSync(path.join(folder, 'native-edit.json')), 'Preserve the current native edit.');
  await page.locator('.viral-studio-entry-panel input[type=file][accept="video/*"]').setInputFiles(path.join(folder, 'blank-stage.mp4'));
  await page.getByRole('button', { name: 'Open Creator Studio', exact: true }).click({ timeout: 120000 });
  await h.rail(page); await pause(page);
  await page.getByLabel('Project name', { exact: true }).fill(direction.projectName);
  await q.tool(page, 'Reframe'); await page.getByTestId('reframe-aspect-9-16').click();
  const crop = page.getByTestId('auto-reframe-toggle'); if (await crop.isChecked()) await crop.uncheck();
  await q.tool(page, 'Color');
  const rounded = page.getByLabel('Rounded main footage', { exact: true }); if (await rounded.isChecked()) await rounded.uncheck();
  await q.tool(page, 'Sound');
  const repair = page.getByLabel('Use voice repair on export', { exact: true }); if (await repair.isChecked()) await repair.uncheck();
  await q.tool(page, 'Graphics');
  const stopRecording = await recording(page), origin = Date.now(), steps = [];
  async function step(id, minimumSeconds, fn) {
    const from = Date.now(); await fn();
    await page.waitForTimeout(Math.max(500, minimumSeconds * 1000 - (Date.now() - from)));
    const image = `teaching-${id}.png`; await page.screenshot({ path: path.join(folder, image) });
    const geometry = await page.evaluate(() => {
      const frame = document.querySelector('[data-testid=hook-preview-frame]')?.getBoundingClientRect();
      return { viewport: { width: innerWidth, height: innerHeight }, preview: frame ? { x: frame.x, y: frame.y, width: frame.width, height: frame.height } : null };
    });
    steps.push({ id, start: (from - origin) / 1000, end: (Date.now() - origin) / 1000, image, geometry });
    write('teaching-progress.json', { steps, noGraphInjection: true });
    console.log(story + ': native action complete — ' + id);
  }
  try {
    if (story === 'logo') {
      await step('logo-import', 15, async () => {
        const panel = page.getByTestId('studio-logo-motion');
        if (!await panel.evaluate(e => e.open)) await panel.locator('summary').click();
        await show(page.getByLabel('Logo motion image', { exact: true }));await page.getByLabel('Logo motion image', { exact: true }).setInputFiles(path.join(folder, 'AutoPromote-Gradient-Tech-Logo.png'));
        await panel.getByRole('status').filter({ hasText: 'selected.' }).waitFor();
        await show(panel.getByRole('checkbox', { name: 'Separate left symbol from wordmark', exact: true }));await panel.getByRole('checkbox', { name: 'Separate left symbol from wordmark', exact: true }).check();
        await page.getByLabel('Logo symbol width', { exact: true }).fill('28');
        await page.getByLabel('Logo motion duration', { exact: true }).fill('14');
      });
      await step('component-build', 15, async () => {
        await show(page.getByRole('button', { name: 'Build editable logo motion', exact: true }));await page.getByRole('button', { name: 'Build editable logo motion', exact: true }).click();
        await page.getByTestId('studio-logo-motion').getByRole('status').filter({ hasText: 'Logo motion created.' }).waitFor();
        await seek(page, 3);
      });
      await step('component-keys', 22, async () => {
        const current = await h.save(page, 'logo-built');
        const layer = current.snapshot.overlays.find(l => l.name === 'Construction / symbol ribbon 2'); assert(layer);
        await motionTarget(page, layer.id);
        const key = current.snapshot.motionKeyframes.find(k => k.targetId === layer.id && k.property === 'y'); assert(key);
        await show(page.getByLabel('Curve keyframe', { exact: true }));await page.getByLabel('Curve keyframe', { exact: true }).selectOption(key.id);
        await show(page.getByLabel('Selected motion key value', { exact: true }));await page.getByLabel('Selected motion key value', { exact: true }).fill(String(key.value - 3));
        await page.getByLabel('Selected motion key value', { exact: true }).blur();
        await page.waitForTimeout(1500);
        await page.getByTestId('studio-undo-button').click();
        await page.waitForTimeout(1500); await page.getByTestId('studio-redo-button').click();
        await seek(page, .8); await page.waitForTimeout(1500); await seek(page, 2.4);
      });
      await step('original-lockup', 15, async () => {
        const current = await h.save(page, 'logo-keys');
        await motionTarget(page, current.snapshot.overlays.find(l => l.name === 'Mark / original gradient wordmark').id);
        await seek(page, 9); await page.waitForTimeout(1800);
        await seek(page, 11.5);
      });
    } else {
      await step('source-import', 12, async () => {
        const panel = page.getByTestId('studio-graphics-import');
        if (!await panel.evaluate(e => e.open)) await panel.locator('summary').click();
        await page.getByLabel('Graphics composition file', { exact: true }).setInputFiles(path.join(folder, 'source-art.graphics.json'));
        await panel.getByRole('status').filter({ hasText: 'imported.' }).waitFor();
      });
      const initial = await h.save(page, 'static-source-art');
      for (const [index, plan] of direction.nativeMotionPoses.entries()) {
        await step('motion-' + index, index === 0 ? 19 : 14, async () => {
          const layer = initial.snapshot.overlays.find(l => l.name === plan.layer); assert(layer, plan.layer);
          await animate(page, layer, plan.poses);
        });
      }
      if (story === 'transition') await step('ellipse-mask', 14, async () => {
        const core = initial.snapshot.overlays.find(l => l.name === 'Listening core');
        await q.tool(page, 'Composite');
        await page.getByText('Composite target', { exact: true }).locator('..').locator('select').selectOption(core.id);
        await page.getByRole('checkbox', { name: /Enable mask/ }).check();
        await page.getByRole('button', { name: 'ellipse', exact: true }).click();
        await seek(page, 3);
      });
      await step('editable-type', 22, async () => {
        await titleChoreography(page, story === 'product' ? 'FRESH.' : 'HEAR', .55);
        await seek(page, 1.25); await page.waitForTimeout(1800); await seek(page, 3);
      });
    }
    await step('timeline-review', 20, async () => {
      await q.tool(page, 'Export');
      await page.getByTestId('studio-pro-timeline').getByRole('button', { name: 'Fit entire timeline', exact: true }).click();
      await seek(page, 0);
      await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
      await page.waitForTimeout(direction.duration * 1000 + 200); await pause(page);
    });
  } finally {
    await stopRecording();
    write('teaching-actions.json', { wallClockOrigin: origin, steps, actualNativeControls: true,
      sourceArtworkImportedThenAnimatedThroughInspectors: story !== 'logo', graphInjection: false });
  }
  await q.tool(page, 'Export');
  await page.getByLabel('Export frame rate', { exact: true }).selectOption('24');
  const saved = await h.save(page, 'prepared'); await backup(page);
  write('native-edit.json', { projectId: saved.id, canonicalHash: hash(saved.snapshot.studioDocument),
    overlays: saved.snapshot.overlays.length, motionKeys: saved.snapshot.motionKeyframes.length,
    allMotionAuthoredThroughNativeControls: true, graphInjection: false, ownerApproved: false });
  for (const time of story === 'transition' ? [.75, 2, 4, 7.5, 8.5, 10, 13] : [.25, .75, 1.5, 3, 6, 9]) {
    await seek(page, time); await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(folder, `native-${time}.png`) });
  }
}
async function polish(page) {
  assert(!fs.existsSync(path.join(folder, 'polished.json')), 'The polished edit already exists.');
  fs.copyFileSync(backupFile, path.join(folder, 'PRE-POLISH.autopromote.json'));
  for (const file of ['editing-in-studio.mp4', 'editing-recording.json'])
    fs.renameSync(path.join(folder, file), path.join(folder, 'initial-' + file));
  const stop = await recording(page), started = Date.now();
  const actions = [];
  async function action(id, fn) {
    const from = (Date.now() - started) / 1000; await fn(); await page.waitForTimeout(1500);
    actions.push({ id, start: from, end: (Date.now() - started) / 1000 });
  }
  async function remove(names) {
    await q.tool(page, 'Motion'); await page.getByRole('button', { name: 'Logo & layers', exact: true }).click();
    for (const name of names) await page.getByRole('button', { name: 'Delete ' + name, exact: true }).click();
  }
  async function title(oldText, copy, scale, x, y) {
    await q.tool(page, 'Graphics');
    await page.locator('.title-layer-list button').filter({ has: page.locator('strong', { hasText: oldText }) }).first().click();
    await page.getByLabel('Title text', { exact: true }).fill(copy);
    await range(page.getByLabel('Title size', { exact: true }), scale);
    const saved = await h.save(page, 'polish-title');
    const layer = saved.snapshot.overlays.find(l => l.text === copy); assert(layer);
    await motionTarget(page, layer.id); await seek(page, 3);
    for (const [label, value] of [['X', x], ['Y', y]]) {
      const field = page.getByRole('spinbutton', { name: label, exact: true }); await field.fill(String(value)); await field.blur();
    }
  }
  try {
    if (story === 'product') {
      await action('remove-small-label', () => remove(['Small edition']));
      await action('headline-fit', () => title('FRESH.', 'FRESH.\nBY DESIGN.', 1.02, 48, 24));
      await action('clear-source-label', () => title('Illustrated product study', 'ILLUSTRATED\nPRODUCT STUDY', .5, 48, 70));
    } else if (story === 'transition') {
      await action('remove-small-label', () => remove(['Opening label']));
      await action('opening-headline-fit', () => title('HEAR', 'HEAR\nTHE SPACE.', 1.02, 48, 24));
      await action('second-headline-fit', () => title('SAME FORM.', 'SAME FORM.\nNEW FEEL.', 1.0, 48, 24));
      await action('clear-the-reveal', async () => {
        const saved = await h.save(page, 'before-wipe-refine');
        const layer = saved.snapshot.overlays.find(l => l.name === 'Circular wipe');
        await animate(page, layer, [{ time: 9.4, X: 50, Y: 51, Scale: .58, Rotate: 0, Opacity: 1 },
          { time: 9.8, X: 50, Y: 51, Scale: .58, Rotate: 0, Opacity: 0 },
          { time: 14.8, X: 50, Y: 51, Scale: .58, Rotate: 0, Opacity: 0 }]);
      });
    } else {
      await action('keep-the-original-mark', () => remove(['Stage / midnight', 'Stage / violet atmosphere',
        'Momentum / forward route 1', 'Momentum / forward route 2', 'Momentum / forward route 3',
        'Assembly / impact ring', 'Stage / light resolve', 'Lockup / accent rule',
        'Lockup / Create. Publish. Move forward.']));
      await action('contrast-stage', async () => {
        const pkg = { format: 'autopromote-graphics', version: 1, name: 'Light contrast stage', width: 720, height: 1280, duration: 14,
          layers: [{ id: 'light-stage', name: 'Light contrast stage', type: 'artwork',
            svg: '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"><rect width="720" height="1280" fill="#F5F2FF"/></svg>',
            x: 50, y: 50, width: 100, height: 100, scale: 1, rotation: 0, opacity: 1, startTime: 0, duration: 14, keys: [] }], groups: [] };
        const file = path.join(folder, 'contrast-stage.graphics.json'); fs.writeFileSync(file, JSON.stringify(pkg));
        await q.tool(page, 'Graphics'); const importer = page.getByTestId('studio-graphics-import');
        if (!await importer.evaluate(e => e.open)) await importer.locator('summary').click();
        await page.getByLabel('Graphics composition file', { exact: true }).setInputFiles(file);
        await importer.getByRole('status').filter({ hasText: 'imported.' }).waitFor();
        await q.tool(page, 'Composite');
        for (let i = 0; i < 9; i++) {
          const back = page.getByRole('button', { name: 'Send Light contrast stage backward', exact: true });
          if (await back.isDisabled()) break; await back.click();
        }
      });
    }
    await action('review-the-refinement', async () => { await q.tool(page, 'Export'); await seek(page, 0);
      await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
      await page.waitForTimeout(direction.duration * 1000 + 200); await pause(page); });
  } finally {
    await stop();
    for (const file of ['editing-in-studio.mp4', 'editing-recording.json']) {
      fs.renameSync(path.join(folder, file), path.join(folder, 'polish-' + file));
      fs.renameSync(path.join(folder, 'initial-' + file), path.join(folder, file));
    }
    write('polish-actions.json', { actions, nativeControls: true, graphInjection: false });
  }
  const saved = await h.save(page, 'polished'); await backup(page);
  write('polished.json', { canonicalHash: hash(saved.snapshot.studioDocument), ownerApproved: false });
  await q.tool(page, 'Export');
  for (const time of [1.5, 3, 6, 10, 13]) { await seek(page, time);
    await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(folder, `polished-${time}.png`) }); }
}
(async () => {
  const sessionFile=path.join(__dirname,'fresh-session.private.json');
  const original = JSON.parse(fs.readFileSync(fs.existsSync(sessionFile)?sessionFile:'/home/tibule12/.local/share/autopromote-qa/session/studio-session.private.json'));
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--disk-cache-size=16777216', '--host-resolver-rules=MAP localhost 127.0.0.36', '--no-proxy-server', '--disable-quic', '--disable-http2'] });
  const context = await browser.newContext({ storageState: { ...original, origins: original.origins.map(o => ({ ...o,
    indexedDB: (o.indexedDB || []).filter(d => d.name !== 'autopromote-viral-studio') })) }, viewport: { width: 1600, height: Number(process.env.STUDIO_QA_VIEWPORT_HEIGHT || 1100) }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('dialog', d => d.accept());
  let submissions = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/media/process' && r.method() === 'POST') submissions++; });
  page.on('response', async response => {
    if (new URL(response.url()).pathname === '/api/media/process' && response.ok()) {
      const job = await response.json(); write('accepted.json', { jobId: job.jobId || job.job_id, resubmissionAllowed: false });
      write('accepted-session.private.json', await context.storageState({ indexedDB: true }));
    }
  });
  try {
    await page.goto('http://localhost:5000/', { waitUntil: 'domcontentloaded' });
    // Let ordinary Firebase refresh the saved token, then reload so the profile
    // provider reads the valid token instead of retaining its first401 fallback.
    await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).waitFor({timeout:90000});
    await page.waitForTimeout(12000);await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/users/profile'&&r.ok(),{timeout:30000}),page.reload({waitUntil:'domcontentloaded'})]);
    fs.writeFileSync(sessionFile,JSON.stringify(await context.storageState({indexedDB:true})),{mode:0o600});
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click({ timeout: 90000 });
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (['all', 'prepare'].includes(phase)) await prepare(page);
    else {
      await page.waitForFunction(() => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false);
      await page.getByLabel('Restore project backup', { exact: true }).setInputFiles(backupFile);
      await page.getByRole('region', { name: 'Saved Studio projects', exact: true }).getByRole('button', { name: JSON.parse(fs.readFileSync(backupFile)).name, exact: true }).click();
      await h.rail(page); await pause(page);
    }
    if(phase==='teach-focus')await require('./focus-controls.cjs')(page,{folder,h,q,seek,range,recording,backup,motionTarget});
    if(phase==='frame-fit'){
      const stop=await recording(page);
      try{
        await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
        await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
        await page.getByLabel('Project name',{exact:true}).fill('ZEST / phone-safe motion / 20261029');
        const initial=await h.save(page,'framing-before');
        for(const layer of initial.snapshot.overlays.filter(l=>l.type==='image')){
          const keys=initial.snapshot.motionKeyframes.filter(k=>k.targetId===layer.id&&k.property==='y');
          if(!keys.length)continue;
          await motionTarget(page,layer.id);
          for(const key of keys){
            await seek(page,key.time);
            const selector=page.getByLabel('Curve keyframe',{exact:true});await show(selector);await selector.selectOption(key.id);
            const value=page.getByLabel('Selected motion key value',{exact:true});await show(value);await value.fill(String(key.value-3));await value.blur();
          }
        }
        await q.tool(page,'Graphics');await page.locator('.title-layer-list button').filter({has:page.locator('strong',{hasText:'FRESH.'})}).first().click();
        await range(page.getByLabel('Title size',{exact:true}),1.15);
        const current=await h.save(page,'framing-title');const title=current.snapshot.overlays.find(l=>l.type==='text'&&l.text.includes('FRESH.'));assert(title);
        await motionTarget(page,title.id);await seek(page,0);const y=page.getByRole('spinbutton',{name:'Y',exact:true});await show(y);await y.fill('21');await y.blur();
      }finally{await stop()}
      await h.save(page,'phone-safe');await backup(page);await q.tool(page,'Export');
      for(const time of [.25,.75,1.5,3,6,9]){await seek(page,time);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'phone-safe-'+time+'.png')});}
    }
    if (phase === 'polish') await polish(page);
    if (['all', 'render', 'export-teach'].includes(phase)) {
      assert(!fs.existsSync(path.join(folder, 'accepted.json')), 'Recover the accepted job; do not resubmit.');
      let stopExport,exportOrigin,completedAt;
      if(phase==='export-teach'){
        for(const file of ['editing-in-studio.mp4','editing-recording.json'])if(fs.existsSync(path.join(folder,file)))fs.renameSync(path.join(folder,file),path.join(folder,'authoring-'+file));
        await q.tool(page,'Export');stopExport=await recording(page);exportOrigin=Date.now();
        page.on('response',async response=>{if(new URL(response.url()).pathname.startsWith('/api/media/status/')&&response.ok()){const data=await response.json().catch(()=>({}));if(data.status==='completed')completedAt=(Date.now()-exportOrigin)/1000;}});
        await page.waitForTimeout(4000);
      }
      try{await h.render(page, 'result'); await backup(page);if(stopExport)await page.waitForTimeout(7000);}
      finally{if(stopExport){await stopExport();for(const file of ['editing-in-studio.mp4','editing-recording.json'])fs.renameSync(path.join(folder,file),path.join(folder,'export-'+file));write('actual-export-screen.json',{completedAt,seconds:(Date.now()-exportOrigin)/1000,actualNativeExport:true,waitingWillBeDisclosedAsRemoved:true});}}
    }
    if (['all', 'view'].includes(phase)) {
      if (phase === 'view') {
        await q.tool(page, 'Export'); await page.getByLabel('Restore export receipt', { exact: true }).setInputFiles(path.join(folder, 'result/render-receipt.json'));
      }
      process.env.STUDIO_TEMPLATE_PROOF_DIR=folder;
      await require('../../scripts/creative-templates/materials-editing-proof').view(page, 'result');
    }
    if(phase==='restore'){
      const current=await h.save(page,'independently-restored'),receipt=JSON.parse(fs.readFileSync(path.join(folder,'result/render-receipt.json')));
      assert.equal(hash(current.snapshot.studioDocument),receipt.projectHash);
      await q.tool(page,'Export');await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.join(folder,'result/render-receipt.json'));
      const ready=page.getByTestId('rendered-output-ready');await ready.waitFor({timeout:90000});const waiting=page.waitForEvent('download');await ready.getByRole('button',{name:/Download/}).click();
      const file=path.join(folder,'cold-restored.mp4');await(await waiting).saveAs(file);assert.equal(hash(fs.readFileSync(file)),receipt.outputSha256);assert.equal(submissions,0);
      write('independent-restore.json',{canonicalHash:receipt.projectHash,outputSha256:receipt.outputSha256,freshBrowser:true,submissions:0});
    }
    write('session.private.json', await context.storageState({ indexedDB: true }));
    console.log(story + ': phase complete — ' + phase);
  } catch (error) {
    write(`failure-${Date.now()}.json`, { phase, message: error.message, submissions });
    await page.screenshot({ path: path.join(folder, `failure-${Date.now()}.png`) }).catch(() => {});
    await backup(page).catch(() => {}); throw error;
  } finally { await context.close(); await browser.close(); if(ramCapture&&fs.existsSync(ramCapture)){
    for(const name of fs.readdirSync(ramCapture))fs.cpSync(path.join(ramCapture,name),path.join(folder,name),{recursive:true});
    fs.rmSync(ramCapture,{recursive:true});
  } }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
