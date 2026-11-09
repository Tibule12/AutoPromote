// Finished tutorials are assembled through the actual signed-in Studio.
// Only original source artwork, unaltered recordings and preset speech enter it.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const story = process.argv[2], phase = process.argv[3] || 'prepare';
assert(['product', 'transition', 'logo'].includes(story));
const folder = path.join(__dirname, 'proof', story, process.env.STUDIO_MOTION_TAKE || '', 'tutorial',process.env.STUDIO_TUTORIAL_REVISION||'');
const plan = JSON.parse(fs.readFileSync(path.join(folder, 'lesson-plan.json')));
Object.assign(process.env, { STUDIO_TEMPLATE_PROOF_DIR: folder, STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_EXPORT_FPS: '24', STUDIO_QA_EXPORT_RESOLUTION: 'source',
  STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright', STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS: '1800000',
  STUDIO_QA_UPLOAD_BUDGET_MS: '600000', STUDIO_QA_TIMELINE_HEIGHT: '430', STUDIO_QA_HIDE_MEDIA: '1' });
const { pause, seek, range,recording } = require('../../scripts/studio-professional/kinetic-type-proof');
Object.assign(process.env, { STUDIO_QA_EXPECTED_WIDTH: '720', STUDIO_QA_EXPECTED_HEIGHT: '1280' });
const h = require('../../scripts/creative-templates/studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const { hash } = require('../../src/creativeTemplates/contract');
const backupFile = path.join(folder, 'FINAL-TUTORIAL.autopromote.json');
const write = (file, data) => fs.writeFileSync(path.join(folder, file), JSON.stringify(data, null, 2)+'\n', { mode: 0o600 });
async function backup(page) {
  const versions = page.getByLabel('Include saved versions in backup', { exact: true });
  if (await versions.isChecked()) await versions.uncheck();
  const wait = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
  await (await wait).saveAs(backupFile);
}
async function transform(page, id, fields) {
  await q.tool(page, 'Motion'); await page.getByRole('button', { name: 'Transform keyframes', exact: true }).click();
  await page.getByLabel('Target layer', { exact: true }).selectOption(id);
  for (const [label, value] of Object.entries(fields)) {
    const input = ['width', 'height', 'anchor X', 'anchor Y', 'duration', 'in point'].includes(label)
      ? page.getByLabel('Motion layer '+label, { exact: true }) : page.getByRole('spinbutton', { name: label, exact: true });
    await input.fill(String(value)); await input.blur();
  }
}
async function addVideo(page, row) {
  assert(fs.existsSync(row.file), 'Wait for the actual native result before preparing its tutorial.');
  const before = await h.save(page, 'before-'+row.id);
  await seek(page, row.start); await q.tool(page, 'B-roll');
  await page.getByTestId('broll-video-input').setInputFiles(row.file);
  let layer;
  for (let i = 0; i < 60 && !layer; i++) {
    const saved = await h.save(page, 'loading-'+row.id);
    layer = saved.snapshot.overlays.find(l => l.type === 'video' && !before.snapshot.overlays.some(old => old.id === l.id));
    if (!layer) await page.waitForTimeout(500);
  }
  assert(layer, 'Source did not finish loading.');
  assert(row.sourceStart+row.duration<=Number(layer.sourceDuration)+.15,
    `Actual source is too short for ${row.id}; do not show an empty tutorial interval.`);
  const at = page.locator('.inspector-time-grid').getByLabel('Start', { exact: true });
  await at.fill(String(row.start)); await at.blur();
  const duration = page.getByLabel('B-roll duration', { exact: true }); await duration.fill(String(row.duration)); await duration.press('Enter');
  await range(page.getByLabel('B-roll source start', { exact: true }), row.sourceStart);
  await page.getByRole('button', { name: 'Picture-in-picture', exact: true }).click();
  await page.getByRole('button', { name: 'Keep original', exact: true }).click();
  const camera = row.camera === 'result'
    ? { width: 70, height: 70, 'anchor X': 50, 'anchor Y': 50, X: 48, Y: 52, Scale: 1 }
    : row.camera === 'preview'
      ? { width: 100, height: 38.671875, 'anchor X': 48.8, 'anchor Y': 41.5, X: 48, Y: 46, Scale: 2.1 }
      : { width: 100, height: 38.671875, 'anchor X': 89.5, 'anchor Y': row.anchorY || (process.env.STUDIO_MOTION_TAKE ? 45 : 43), X: 46, Y: 44, Scale: process.env.STUDIO_MOTION_TAKE ? 3.6 : 3.4 };
  await transform(page, layer.id, { duration: row.duration, 'in point': row.start, ...camera });
  // A real transform pose makes the canonical media keys own the camera.
  // Otherwise the legacy CSS B-roll entrance replaces its anchor/scale.
  await seek(page,row.start);
  await page.getByRole('button',{name:/^◆ Add transform keyframe at/}).click();
  if(row.followLowerSettings){
    await seek(page,row.start+4.2);await page.getByRole('button',{name:/^◆ Add transform keyframe at/}).click();
    await seek(page,row.start+4.6);await transform(page,layer.id,{Y:16});
    await page.getByRole('button',{name:/^◆ Add transform keyframe at/}).click();
  }
  const saved = await h.save(page, 'placed-'+row.id);
  const actual = saved.snapshot.overlays.find(l => l.id === layer.id);
  assert(Math.abs(actual.startTime-row.start) < 1/24 && Math.abs(actual.duration-row.duration) < 1/24);
  console.log(`${story}: placed actual ${row.id} (${row.duration.toFixed(2)}s)`);
}
async function prepare(page) {
  assert(!fs.existsSync(path.join(folder, 'native-edit.json')), 'Preserve the prepared edit.');
  await page.locator('.viral-studio-entry-panel input[type=file][accept="video/*"]').setInputFiles(path.join(folder, 'blank-stage.mp4'));
  await page.getByRole('button', { name: 'Open Creator Studio', exact: true }).click({ timeout: 120000 });
  await h.rail(page); await pause(page);
  await page.getByLabel('Project name', { exact: true }).fill(plan.name);
  await q.tool(page, 'Reframe'); await page.getByTestId('reframe-aspect-9-16').click();
  const reframe = page.getByTestId('auto-reframe-toggle'); if (await reframe.isChecked()) await reframe.uncheck();
  await q.tool(page, 'Color'); const rounded = page.getByLabel('Rounded main footage', { exact: true });
  if (await rounded.isChecked()) await rounded.uncheck();
  for (const row of plan.rows){
    if(story==='logo'&&row.id==='component-build'){
      await addVideo(page,{...row,id:row.id+'-button',duration:4,anchorY:process.env.STUDIO_MOTION_TAKE?45:64});
      await addVideo(page,{...row,id:row.id+'-preview',start:row.start+4,sourceStart:row.sourceStart+4,duration:row.duration-4,camera:'preview'});
    }else await addVideo(page,{...row,...(story==='logo'&&row.id==='component-keys'&&!process.env.STUDIO_MOTION_TAKE?{anchorY:64}:{}),
      ...(row.id==='ellipse-mask'?{anchorY:62}:{}),
      ...(story==='logo'&&row.id==='logo-import'&&!process.env.STUDIO_MOTION_TAKE?{followLowerSettings:true}:{}),
      ...(story==='logo'&&row.id==='original-lockup'?{camera:'preview'}:{})});
  }
  await q.tool(page, 'Graphics'); const importer = page.getByTestId('studio-graphics-import');
  if (!await importer.evaluate(e => e.open)) await importer.locator('summary').click();
  await page.getByLabel('Graphics composition file', { exact: true }).setInputFiles(path.join(folder, 'lesson-labels.graphics.json'));
  await importer.getByRole('status').filter({ hasText: 'imported.' }).waitFor();
  for(const text of [story==='product'?'BUILD A':plan.rows[0].title,plan.rows.at(-1).title,'Make your version','Synthetic preset narration']){
    await page.locator('.title-layer-list button').filter({has:page.locator('strong',{hasText:text.split('\n')[0]})}).first().click();
    await page.getByLabel('Title background color',{exact:true}).fill('#15151e');
  }
  await q.tool(page, 'Sound');
  await page.getByTestId('voiceover-recording-input').setInputFiles(path.join(folder, 'narration.mp3'));
  const start = page.getByLabel('Start for narration.mp3', { exact: true }); await start.fill('0'); await start.blur();
  const repair = page.getByLabel('Use voice repair on export', { exact: true }); if (await repair.isChecked()) await repair.uncheck();
  const original = page.getByRole('checkbox', { name: /^Keep original audio/ }); if (await original.isChecked()) await original.uncheck();
  await q.tool(page, 'Export'); await page.getByLabel('Export frame rate', { exact: true }).selectOption('24');
  // Larger actual recordings can exceed the bounded 20 MB portable package.
  // Render the live File-bearing native edit first, then back up owned URLs.
  const saved = await h.save(page, 'prepared');
  write('native-edit.json', { projectId: saved.id, canonicalHash: hash(saved.snapshot.studioDocument),
    duration: plan.duration, nativeControlsOnly: true, graphInjection: false, externalFinalCompositing: false,
    camera: 'Native B-roll anchors enlarge actual recorded controls; mattes isolate the inspector.',
    sourceArt: 'Original sample artwork imported separately, animated in the retained native source project.',
    narration: plan.narration, ownerApproved: false, scheduled: false });
  for (const row of plan.rows) {
    await seek(page, row.start+Math.min(3,row.duration/2));
    await page.waitForTimeout(700);
    await page.getByTestId('hook-preview-frame').screenshot({ path: path.join(folder, `native-${row.id}.png`) });
  }
  if(story==='logo')for(const [id,time] of [['lower-logo-settings',14],['curve-value',43],['assembly-preview',28]]){
    await seek(page,time);await page.waitForTimeout(700);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'native-'+id+'.png')});
  }
  console.log(story+': native preview frames ready for picture review.');
  if(process.env.STUDIO_QA_BACKUP_BEFORE_RENDER==='1')await backup(page);
}
(async () => {
  const original = JSON.parse(fs.readFileSync('/home/tibule12/.local/share/autopromote-qa/session/studio-session.private.json'));
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio','--disk-cache-size=16777216',
    `--host-resolver-rules=MAP localhost ${process.env.STUDIO_QA_LOOPBACK||'127.0.0.35'}`,'--no-proxy-server','--disable-quic','--disable-http2'] });
  const context = await browser.newContext({ storageState: { ...original, origins: original.origins.map(o => ({ ...o,
    indexedDB: (o.indexedDB||[]).filter(d => d.name !== 'autopromote-viral-studio') })) }, viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('dialog', d => d.accept());
  let submissions = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/process' && request.method()==='POST') submissions++; });
  page.on('response', async response => { if (new URL(response.url()).pathname === '/api/media/process' && response.ok()) {
    const job = await response.json(); write('accepted.json', { jobId: job.jobId||job.job_id, resubmissionAllowed: false });
    write('accepted-session.private.json', await context.storageState({ indexedDB: true }));
  }});
  try {
    await page.goto('http://localhost:5000/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click({ timeout: 90000 });
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (['all','prepare'].includes(phase)) await prepare(page);
    else {
      await page.waitForFunction(() => document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);
      const restoreFile=phase==='recover'?path.join(folder,'final-accepted-pending.autopromote.json'):backupFile;
      await page.getByLabel('Restore project backup', { exact: true }).setInputFiles(restoreFile);
      const restoredName=JSON.parse(fs.readFileSync(restoreFile)).name;
      await page.getByRole('region', { name: 'Saved Studio projects', exact: true }).getByRole('button', { name: restoredName, exact: true }).click();
      await h.rail(page); await pause(page);
    }
    if(phase==='recover'){
      const observed=JSON.parse(fs.readFileSync(path.join(folder,'actual-accepted-status.private.json')));
      const accepted=JSON.parse(fs.readFileSync(path.join(folder,'accepted.json')));
      assert.equal(observed.http,200);assert.equal(observed.data.status,'completed');
      assert.equal(observed.data.jobId,accepted.jobId);
      const pending=JSON.parse(fs.readFileSync(path.join(folder,'final-accepted-pending.json')));
      const current=await h.save(page,'completed-recovery-source');
      assert.equal(hash(current.snapshot.studioDocument),pending.projectHash);
      const identity={projectId:current.id,projectHash:pending.projectHash,submittedJobId:accepted.jobId,
        outputSha256:observed.data.result.outputSha256};
      assert(/^[a-f0-9]{64}$/.test(identity.outputSha256));
      const identityFile=path.join(folder,'actual-observed-export-identity.json');write('actual-observed-export-identity.json',identity);
      await q.tool(page,'Export');
      await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(identityFile);
      await page.getByTestId('rendered-output-ready').waitFor({timeout:90000});
      await h.recover(page,'final');await backup(page);assert.equal(submissions,0);
      write((story==='transition'?'correct-source-render':'render')+'-observation.json',{
        completedBy:'Native recovery of the original accepted job after its browser observer expired.',
        acceptedJobId:accepted.jobId,submissions:0,ownerApproved:false,scheduled:false,realAuth:true});
    }
    if(phase==='source-restore'){
      const expected=JSON.parse(fs.readFileSync(path.join(folder,'final-accepted-pending.json')));
      const current=await h.save(page,'source-only-independently-restored');
      assert.equal(hash(current.snapshot.studioDocument),expected.projectHash);assert.equal(submissions,0);
      await seek(page,2.5);await page.screenshot({path:path.join(folder,'source-only-independently-restored.png')});
      write('source-only-independent-restore.json',{nativeLayeredBackupRestored:true,canonicalHash:expected.projectHash,
        submissions:0,originalHttpJobStillFailed:true,completedReceiptRecoveryClaimed:false,ownerApproved:false,scheduled:false});
    }
    if(phase==='revise-render'){
      const stop=await recording(page);
      try{
        await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
        await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
        await page.getByLabel('Project name',{exact:true}).fill(plan.name);
        const initial=await h.save(page,'revision-start');
        for(const layer of initial.snapshot.overlays.filter(l=>l.type==='video'&&Number(l.scale)>3)){
          await seek(page,layer.startTime);await transform(page,layer.id,{Scale:3.65});
          await page.getByRole('button',{name:/^◆ Add transform keyframe at/}).click();
        }
      }finally{await stop()}
      const saved=await h.save(page,'prepared');await backup(page);
      write('native-edit.json',{projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),duration:plan.duration,
        nativeControlsOnly:true,graphInjection:false,ownerApproved:false,scheduled:false,
        revision:'A duplicated native finishing project uses the current renderer and a slightly tighter control camera. Earlier completed wide-camera outputs are retained and rejected.'});
      await q.tool(page,'Export');
      for(const row of plan.rows){await seek(page,row.start+Math.min(3,row.duration/2));await page.waitForTimeout(1000);
        await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'native-'+row.id+'.png')});}
      console.log(story+': corrected native camera revision ready for picture review.');
    }
    if(phase==='correct-source-render'){
      assert.equal(story,'transition');
      const stop=await recording(page);
      try{
        const saved=await h.save(page,'source-correction-before');
        const layer=saved.snapshot.overlays.find(l=>l.type==='video'&&l.name==='polish-editing-in-studio.mp4');assert(layer);
        await page.getByTestId('timeline-layer-'+layer.id).locator('button[title]').first().click();
        await q.tool(page,'B-roll');
        await range(page.getByLabel('B-roll source start',{exact:true}),9);
        await seek(page,139.8333333333);await page.waitForTimeout(1600);
        await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'corrected-native-refinement.png')});
      }finally{await stop()}
      const current=await h.save(page,'source-corrected');await backup(page);
      write('source-correction.json',{nativeSourceStart:9,canonicalHash:hash(current.snapshot.studioDocument),
        reason:'Skip the setup and typography adjustments; show the recorded circular-wipe fade that the narration describes.',ownerApproved:false});
    }
    if (['all','render','revise-render','correct-source-render'].includes(phase)) {
      assert(!fs.existsSync(path.join(folder,'accepted.json')), 'Recover the accepted job; never resubmit it.');
      const currentReview=await h.save(page,'ready-for-render-review');
      write('ready-for-render-review.json',{canonicalHash:hash(currentReview.snapshot.studioDocument),ownerApproved:false});
      if(phase==='render'){
        for(const row of plan.rows){await seek(page,row.start+Math.min(3,row.duration/2));await page.waitForTimeout(500);
          await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'cold-native-'+row.id+'.png')});}
      }
      const gate=path.join(folder,'agent-picture-review.json'),until=Date.now()+1800000;
      while(!fs.existsSync(gate)&&Date.now()<until)await page.waitForTimeout(1000);
      assert(fs.existsSync(gate),'No agent picture review; preserve the source and do not render.');
      const reviewed=JSON.parse(fs.readFileSync(gate)),current=await h.save(page,'picture-reviewed');
      assert.equal(reviewed.canonicalHash,hash(current.snapshot.studioDocument));
      if(fs.existsSync(backupFile))fs.copyFileSync(backupFile,path.join(folder,'PRE-RENDER-SAFE-'+Date.now()+'.autopromote.json'));
      await h.render(page,'final'); await backup(page);
    }
    if (['all','view'].includes(phase)) {
      if (phase==='view') { await q.tool(page,'Export');
        await page.getByLabel('Restore export receipt', { exact: true }).setInputFiles(path.join(folder,'final/render-receipt.json')); }
      await require('../../scripts/creative-templates/materials-editing-proof').view(page,'final');
    }
    if (phase==='restore') {
      const saved = await h.save(page,'independently-restored'), receipt=JSON.parse(fs.readFileSync(path.join(folder,'final/render-receipt.json')));
      assert.equal(hash(saved.snapshot.studioDocument), receipt.projectHash);
      await q.tool(page,'Export'); await page.getByLabel('Restore export receipt', { exact: true }).setInputFiles(path.join(folder,'final/render-receipt.json'));
      const ready=page.getByTestId('rendered-output-ready'); await ready.waitFor({timeout:90000});
      const wait=page.waitForEvent('download'); await ready.getByRole('button',{name:/Download/}).click();
      const file=path.join(folder,'cold-restored.mp4'); await (await wait).saveAs(file);
      assert.equal(hash(fs.readFileSync(file)),receipt.outputSha256); assert.equal(submissions,0);
      write('independent-restore.json',{nativeBackupRestored:true,exactCanonicalHash:receipt.projectHash,
        nativeOwnedDownloadSha256:receipt.outputSha256,freshBrowserContext:true,submissions:0});
    }
    write(phase+'-observation.json',{submissions,ownerApproved:false,scheduled:false,realAuth:true});
    console.log(story+': tutorial phase complete — '+phase);
  } catch(error) {
    write('failure-'+Date.now()+'.json',{phase,message:error.message,submissions});
    await page.screenshot({path:path.join(folder,'failure-'+Date.now()+'.png')}).catch(()=>{});
    await backup(page).catch(()=>{}); throw error;
  } finally { await context.close(); await browser.close(); }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
