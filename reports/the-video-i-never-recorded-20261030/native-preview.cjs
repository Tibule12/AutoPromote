#!/usr/bin/env node
// Ordinary authenticated Studio import, controls, public graphics import and
// CPU export. No request mocking, auth bypass or project/document injection.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const report = __dirname, root = path.resolve(report, '../..'), folder = path.join(report, 'proof');
fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
Object.assign(process.env, {
  STUDIO_TEMPLATE_PROOF_DIR: folder, STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_EXPORT_RESOLUTION: '1080p', STUDIO_QA_EXPORT_FPS: '24',
  STUDIO_QA_EXPECTED_WIDTH: '1920', STUDIO_QA_EXPECTED_HEIGHT: '1080',
  STUDIO_QA_NATIVE_DOWNLOAD_METHOD: 'playwright', STUDIO_QA_TIMELINE_HEIGHT: '440',
  STUDIO_QA_HIDE_MEDIA: '1', STUDIO_QA_UPLOAD_BUDGET_MS: '300000',
});
const h = require(path.join(root, 'scripts/creative-templates/studio-proof'));
const q = require(path.join(root, 'test/e2e/playwright/studio-stability/run'));
const {pause,seek,range,recording} = require(path.join(root, 'scripts/studio-professional/kinetic-type-proof'));
const {hash} = require(path.join(root, 'src/creativeTemplates/contract'));
const session = require(path.join(root, 'scripts/creative-templates/studio-session'));
// The reused capture helper has legacy 720p defaults at module load. Restore
// this project's actual selected delivery dimensions after loading helpers.
Object.assign(process.env,{STUDIO_QA_EXPECTED_WIDTH:'1920',STUDIO_QA_EXPECTED_HEIGHT:'1080',STUDIO_QA_EXPORT_FPS:'24'});
const localState = path.join(folder, 'session.private.json');
const progressFile = path.join(folder, 'native-progress.json');
const progress = fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile)) : {};
const rawName = 'The Video I Never Recorded — verified Studio raw pilot';
const editName = 'The Video I Never Recorded — verified Studio clock study';
function done(k,v=true) { progress[k]=v; fs.writeFileSync(progressFile,JSON.stringify(progress,null,2)); }
const decisions = d => {const {revision,journal,idempotency,...rest}=d;return hash(rest);};
async function entry(p) {
  console.log('Entering exact current-source Studio build.');
  await p.goto('http://localhost:5000/background-review/?studioTemplateSession=fictional-podcast-pilot', {waitUntil:'domcontentloaded'});
  const bundle=await p.locator('script[src*="/static/js/main."]').getAttribute('src');
  const built=fs.readdirSync(path.join(folder,'verified-studio-build/static/js')).find(f=>/^main\..*\.js$/.test(f));
  assert.equal(bundle,`/background-review/static/js/${built}`,'Use the actual current-source build, not a historical Studio.');
  fs.writeFileSync(path.join(folder,'current-studio-build.json'),JSON.stringify({url:p.url(),bundle,headless:true,muted:true},null,2));
  await p.getByRole('button',{name:'Viral Clip Studio',exact:true}).click({timeout:120000});
  console.log('Signed-in current Studio entry opened.');
  assert(!await p.evaluate(()=>!!window.__E2E_BYPASS));
}
async function open(p,name) {
  await p.getByRole('region',{name:'Saved Studio projects',exact:true}).getByRole('button',{name,exact:true}).click();
  await h.rail(p);await pause(p);
}
async function backup(p,name) {
  await h.rail(p);
  const versions=p.getByLabel('Include saved versions in backup',{exact:true});
  if(await versions.count()&&await versions.isChecked())await versions.uncheck();
  const d=p.waitForEvent('download');
  await p.getByRole('button',{name:'Download project backup',exact:true}).click();
  await (await d).saveAs(path.join(folder,`${name}.autopromote.json`));
}
async function framePresenter(p) {
  await q.tool(p,'Motion');
  await p.getByRole('button',{name:'Transform keyframes',exact:true}).click();
  await p.getByLabel('Target layer',{exact:true}).selectOption('main-video');
  for(const [time,x] of [[0,50],[2.45,50],[3.15,28],[6.95,28],[7.55,50]]) {
    await seek(p,time);
    await p.getByRole('button',{name:/^◆ Add transform keyframe at/}).click();
    for(const [label,value] of [['X',x],['Y',50],['Scale',1],['Rotate',0]]) {
      const input=p.getByRole('spinbutton',{name:label,exact:true});
      if(Math.abs(Number(await input.inputValue())-value)<.00001)await input.fill(String(value===0?.1:value-.1));
      await input.fill(String(value));await input.blur();
    }
  }
}
async function importRaw(p) {
  if(progress.rawImported?.verifiedWorktree) {await open(p,rawName);return;}
  const saved=p.getByRole('region',{name:'Saved Studio projects',exact:true}).getByRole('button',{name:rawName,exact:true});
  if(await saved.count()) {
    await open(p,rawName);const r=await h.save(p,'raw-import-recovered');
    assert.equal(r.snapshot.timeline.length,1);assert.equal(r.snapshot.overlays.length,0);
    await backup(p,'RAW-PILOT');done('rawImported',{id:r.id,hash:hash(r.snapshot.studioDocument),verifiedWorktree:true});return;
  }
  assert(fs.existsSync(path.join(folder,'take-A.mp4')));
  await p.locator('.creator-studio-dropzone input[type=file]').setInputFiles(path.join(folder,'take-A.mp4'));
  console.log('Reimporting the exact retained source bytes through current Studio.');
  await p.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:300000});
  await h.rail(p);await pause(p);
  await p.getByLabel('Project name',{exact:true}).fill(rawName);
  await q.tool(p,'Reframe');await p.getByTestId('reframe-aspect-16-9').click();
  await p.getByTestId('reframe-preserve-frame').click();
  const rounded=p.getByLabel('Rounded main footage',{exact:true});
  if(await rounded.count()&&await rounded.isChecked())await rounded.uncheck();
  await q.tool(p,'Sound');await p.getByLabel('Use voice repair on export',{exact:true}).uncheck();
  const r=await h.save(p,'raw-imported');
  assert.equal(r.snapshot.timeline.length,1);
  assert.equal(r.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick,8*90000);
  assert.equal(r.snapshot.overlays.length,0);
  assert.equal(r.snapshot.audioRestoration.enabled,false);
  await backup(p,'RAW-PILOT-VERIFIED');done('rawImported',{id:r.id,hash:hash(r.snapshot.studioDocument),verifiedWorktree:true});
  console.log('Actual Google opening take imported through normal Studio controls.');
}
async function edit(p) {
  await importRaw(p);
  // The superseded root build completed its one raw export before the owner's
  // correction. Preserve that job and use exact provider bytes for comparison;
  // never resubmit the raw render after an interrupted observer.
  if(!progress.rawRendered){
    const old=JSON.parse(fs.readFileSync(path.join(folder,'old-attempt-check.json')));
    assert(old.some(r=>r.status==='completed'&&r.jobId));
    done('rawRendered',{supersededBuild:true,jobId:old.find(r=>r.jobId).jobId,nativeDownloadRecovered:false});
  }
  if(progress.edited){return;}
  if(await p.getByRole('button',{name:editName,exact:true}).count()) {
    await p.getByRole('button',{name:editName,exact:true}).click();await h.rail(p);await pause(p);
  } else {
    await p.getByRole('button',{name:'Duplicate',exact:true}).first().click();
    await p.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
    await p.getByLabel('Project name',{exact:true}).fill(editName);
  }
  await seek(p,0);await q.tool(p,'Reframe');
  await p.getByTestId('reframe-aspect-16-9').click();await p.getByTestId('reframe-preserve-frame').click();
  const before=await h.save(p,'before-graphics');
  const stop=await recording(p);
  try {
    await q.tool(p,'Graphics');const panel=p.getByTestId('studio-graphics-import');
    if(!await panel.evaluate(e=>e.open))await panel.locator('summary').click();
    await p.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.join(report,'assets/opening-clock.graphics.json'));
    await panel.getByRole('status').waitFor();
    assert((await panel.getByRole('status').innerText()).includes('imported.'),await panel.innerText());
    const after=await h.save(p,'graphics-imported');
    assert.equal(after.snapshot.overlays.length,12);
    await p.getByTestId('studio-undo-button').click();
    assert.equal(decisions((await h.save(p,'graphics-undone')).snapshot.studioDocument),decisions(before.snapshot.studioDocument));
    await p.getByTestId('studio-redo-button').click();
    assert.equal(decisions((await h.save(p,'graphics-redone')).snapshot.studioDocument),decisions(after.snapshot.studioDocument));
    await framePresenter(p);await h.save(p,'presenter-positioned');
    for(const t of [0,3.1,4.9,6.25,7.8]) {
      await seek(p,t);await q.tool(p,'Cut');await p.keyboard.press('Escape');
      await p.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});
    }
  } catch(error) {
    fs.writeFileSync(path.join(folder,'native-edit-error.json'),JSON.stringify({error:error.message},null,2));throw error;
  } finally {await stop();}
  const saved=await h.save(p,'edited');await backup(p,'CLOCK-PILOT');
  done('edited',{id:saved.id,hash:hash(saved.snapshot.studioDocument)});
  await p.reload();await p.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await open(p,editName);
  const reopened=await h.save(p,'edited-reopened');assert.equal(hash(reopened.snapshot.studioDocument),progress.edited.hash);
  done('exactColdReopen');console.log('Native import, history and exact cold reopen pass.');
}
async function main() {
  const action=process.argv[2]||'inspect';
  const b=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.40']});
  const renderState=path.join(folder,'render-session.private.json');
  const stateFile=['view','recover'].includes(action)&&fs.existsSync(renderState)?renderState:fs.existsSync(localState)?localState:session.sessionPath;
  let state=JSON.parse(fs.readFileSync(stateFile));
  // A separate empty project database is required by native Restore; it
  // refuses to replace a saved ID. Retain the real login and all original
  // session files. Only the native backup writes this new browser's project.
  if(action==='render')state={...state,origins:state.origins.map(o=>({...o,indexedDB:(o.indexedDB||[]).filter(d=>d.name!=='autopromote-viral-studio')}))};
  const c=await b.newContext({storageState:state,viewport:{width:1920,height:1200},acceptDownloads:true});
  const p=await c.newPage();p.setDefaultTimeout(40000);
  p.on('pageerror',e=>fs.appendFileSync(path.join(folder,'browser-errors.txt'),e.message+'\n'));
  try {
    await entry(p);
    if(action==='edit')await edit(p);
    else if(action==='render') {
      assert(progress.edited);assert(!progress.editedRendered,'Preserve completed preview');
      assert(!fs.existsSync(path.join(folder,'clock-pilot/native-render-completed.json')),'Recover the accepted completed job; never resubmit.');
      // Browser storage snapshots do not round-trip File instances. Restore
      // the actual native backup's embedded artwork through ordinary Studio,
      // rather than injecting blobs or submitting a duplicate provider take.
      await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,'CLOCK-PILOT.autopromote.json'));
      await p.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);
      await open(p,editName);const restored=await h.save(p,'native-backup-restored');
      assert.equal(restored.id,progress.edited.id);assert.equal(restored.snapshot.overlays.length,12);
      console.log('Native backup restored with its embedded artwork; exporting through Studio.');
      await h.render(p,'clock-pilot');await backup(p,'CLOCK-PILOT-FINAL');done('editedRendered');
    }
    else if(action==='recover') {
      const before=hash(fs.readFileSync(path.join(folder,'clock-pilot/final.mp4')));
      await open(p,editName);await h.recover(p,'clock-pilot');
      assert.equal(hash(fs.readFileSync(path.join(folder,'clock-pilot/final.mp4'))),before);
      await backup(p,'CLOCK-PILOT-FINAL');done('editedRendered');
    }
    else if(action==='view') {assert(progress.editedRendered);await open(p,editName);await require(path.join(root,'scripts/creative-templates/materials-editing-proof')).view(p,'clock-pilot');done('completeTimelinePlayback');}
    else console.log((await p.locator('body').innerText()).slice(-2400));
  } catch(e) {await p.screenshot({path:path.join(folder,`failure-${Date.now()}.png`)}).catch(()=>{});throw e;}
  finally {
    const state=await c.storageState({indexedDB:true});session.saveAuthenticatedState(state,['render','view','recover'].includes(action)?renderState:localState);
    await c.close();await b.close();
  }
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
