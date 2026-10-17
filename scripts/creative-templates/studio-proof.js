#!/usr/bin/env node
// Exercise the normal authenticated App. No routes, identities or worker
// responses are mocked. Artifacts stay in the ignored private proof directory.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const q = require('../../test/e2e/playwright/studio-stability/run');
const { hash } = require('../../src/creativeTemplates/contract');
const root = path.resolve(__dirname, '../..');
const sourceFolder = path.join(root, 'reports/model-capability-runtime-v1-20261009/proof/launch-template');
const folder = process.env.STUDIO_TEMPLATE_PROOF_DIR ? path.resolve(root, process.env.STUDIO_TEMPLATE_PROOF_DIR) : sourceFolder;
fs.mkdirSync(folder, { recursive: true });

const instances = {
  ember: { headline: 'RAISE\nTHE RITUAL', featureOne: 'PRECISION.\nIN EVERY POUR.', featureTwo: 'CRAFTED FOR\nYOUR EVERYDAY.',
    callToAction: 'Discover the collection', brandColour: '#ffb15a',
    hookFootage: 'coffee-beans-falling-into-a-coffee-pot-4985.mp4',
    productFootage: 'coffee-maker-making-coffee-3578.mp4', detailFootage: 'tamping-coffee-for-a-coffee-maker-3572.mp4' },
  velo: { headline: 'OWN\nTHE ROAD', featureOne: 'FIND YOUR\nNEXT HORIZON.', featureTwo: 'BUILT FOR\nTHE OPEN ROAD.',
    callToAction: 'Find your next ride', brandColour: '#baff38',
    hookFootage: 'cyclist-in-the-park-2002.mp4', productFootage: 'tour-along-the-coast-4062.mp4',
    detailFootage: 'two-mountain-bikers-jumping-off-ramps-in-a-forest-44330.mp4' },
  onda: { headline: 'FEEL\nEVERY NOTE', featureOne: 'YOUR WORLD.\nYOUR SOUND.', featureTwo: 'PRESS PLAY.\nLET GO.',
    callToAction: 'Find your sound', brandColour: '#bc80ff',
    hookFootage: 'woman-listening-to-music-in-a-dark-room-4284.mp4',
    productFootage: 'woman-takes-her-headphones-to-listen-to-music-51134.mp4', detailFootage: 'close-up-view-of-man-dancing-with-headphones-51764.mp4' },
};
async function records(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('autopromote-viral-studio', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result;
      const query = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      query.onsuccess = () => { db.close(); resolve(query.result); };
    };
  }));
}
async function rail(page) {
  // Saved-project entry resolves owned source media before mounting the editor.
  // Wait for that actual entry instead of selecting a hidden/stale dashboard rail.
  await page.getByTestId('studio-pro-timeline').waitFor({ timeout: 90000 });
  const show = page.getByRole('button', { name: 'Show media', exact: true });
  if (await show.isVisible()) await show.click();
  const head = page.locator('.studio-project-rail__head');
  if (!await head.evaluate(e => e.open)) await head.locator(':scope > summary').click();
}
async function save(page, name) {
  await rail(page); await page.getByTestId('studio-save-project').click();
  await page.waitForFunction(() => document.querySelector('.studio-project-save-state')?.textContent.includes('Saved locally'));
  const title = await page.getByLabel('Project name', { exact: true }).inputValue();
  // Select in the browser before crossing Playwright's serialization boundary.
  // Saved sessions may contain many large checkpoint graphs; transferring all
  // of them on every Save slowed native proof work without checking more scope.
  const record = await page.evaluate(title => new Promise((resolve, reject) => {
    const request = indexedDB.open('autopromote-viral-studio', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result;
      const query = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      query.onerror = () => { db.close(); reject(query.error); };
      query.onsuccess = () => { const selected = query.result.find(p => p.name === title);
        db.close(); resolve(selected); };
    };
  }), title);
  assert(record?.snapshot?.studioDocument, 'Missing native saved document');
  fs.writeFileSync(path.join(folder, `${name}-project.private.json`), JSON.stringify(record, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(folder, `${name}-document.json`), JSON.stringify(record.snapshot.studioDocument, null, 2));
  return record;
}
async function apply(page, name) {
  const data = instances[name]; assert(data, 'Unknown QA bindings');
  await rail(page);
  if (name !== 'ember') {
    await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  }
  await page.getByLabel('Project name', { exact: true }).fill(`Launch Template · ${name.toUpperCase()} · v1`);
  const panel = page.getByTestId('launch-template-panel');
  if (!await panel.evaluate(e => e.open)) await panel.locator('summary').click();
  for (const [key, label] of Object.entries({ headline: 'Launch headline', featureOne: 'Feature one', featureTwo: 'Feature two', callToAction: 'Launch CTA', brandColour: 'Launch colour' }))
    await panel.getByLabel(label, { exact: true }).fill(data[key]);
  for (const slot of ['hookFootage', 'productFootage', 'detailFootage', 'logo', 'music']) {
    const file = slot === 'logo' ? `${name}-logo.png` : slot === 'music' ? 'launch-pulse-original.wav' : data[slot];
    if (slot === 'music' && await panel.getByLabel('Select music', { exact: true }).locator('option').filter({ hasText: file }).count()) {
      await panel.getByLabel('Select music', { exact: true }).selectOption({ label: file });
      continue;
    }
    await panel.getByLabel(`Upload ${slot}`, { exact: true }).setInputFiles(path.join(sourceFolder, file));
    await page.waitForFunction(() => !document.querySelector('[data-testid="launch-template-panel"] button').disabled, undefined, { timeout: 90000 });
    const status = await panel.getByRole('status').innerText(); assert(status.endsWith(' saved.'), status);
    console.log(`Saved owned ${name} ${slot}`);
  }
  if (name !== 'ember') for (const slot of ['hookFootage', 'productFootage', 'detailFootage'])
    await panel.getByLabel(`${slot} in-point`, { exact: true }).fill(name === 'velo' ? '0.5' : slot === 'productFootage' ? '0' : '1');
  await panel.getByRole('button', { name: 'Apply launch template', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="launch-template-panel"] [role=status]')?.textContent.includes('applied'));
  await page.locator('video,audio').evaluateAll(es => es.forEach(e => { e.muted = true; e.pause(); }));
  const record = await save(page, name);
  console.log(JSON.stringify({ applied: true, projectId: record.id, clips: record.snapshot.timeline.length,
    templateRef: record.snapshot.creativeTemplateInstance.templateRef }));
}
async function render(page, name) {
  require('./proof-storage').requireProofSpace(folder);
  const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
  if (await pause.isVisible()) await pause.click();
  const record = await save(page, name), events = [];
  const startedAt = new Date().toISOString(); let submittedJobId, terminal;
  const done = new Promise(resolve => { terminal = resolve; });
  page.on('response', async response => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/media/')) return;
    if (url.pathname === '/api/media/process' || url.pathname.startsWith('/api/media/status/')) {
      const data = await response.json().catch(() => ({}));
      events.push({ path: url.pathname, status: response.status(), jobStatus: data.status });
      if (url.pathname === '/api/media/process') {
        submittedJobId = data.jobId || data.job_id;
        if (!response.ok()) terminal({ status: 'failed', error: data.message || data.code });
        else if (submittedJobId && ['completed', 'failed'].includes(data.status)) terminal(data);
      } else if (submittedJobId && url.pathname.endsWith(`/${submittedJobId}`) && ['completed', 'failed'].includes(data.status)) terminal(data);
    }
  });
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/media/process')
      fs.writeFileSync(path.join(folder, `${name}-render-request.private.json`), request.postData(), { mode: 0o600 });
  });
  await q.tool(page, 'Export');
  await page.getByLabel('Export resolution', { exact: true }).selectOption(process.env.STUDIO_QA_EXPORT_RESOLUTION || '720p');
  await page.getByLabel('Export frame rate', { exact: true }).selectOption(process.env.STUDIO_QA_EXPORT_FPS || '24');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /^Render (Final Clip|Again)$/ }).click();
  const acknowledgedUntil = Date.now() + 120000;
  while (!submittedJobId && Date.now() < acknowledgedUntil) {
    const failure = page.getByTestId('studio-export-error');
    if (await failure.isVisible()) throw new Error(await failure.innerText());
    await page.waitForTimeout(250);
  }
  assert(submittedJobId, `Render was not accepted by the API: ${(await page.locator('body').innerText()).slice(-1600)}`);
  let renderTimeout, result;
  try {
    result = await Promise.race([done, new Promise((_, reject) => {
      renderTimeout = setTimeout(() => reject(new Error('Render exceeded its 12-minute CPU budget')), 720000);
    })]);
  } catch (error) {
    // The observer deadline does not cancel the accepted worker job. Retain
    // its actual post-upload graph and portable native backup before closing.
    try {
      const pending = await save(page, `${name}-accepted-pending`);
      fs.writeFileSync(path.join(folder, `${name}-accepted-pending.json`), JSON.stringify({
        submittedJobId, startedAt, projectId: pending.id,
        projectHash: hash(pending.snapshot.studioDocument),
        observerError: error.message, resubmissionAllowed: false,
      }, null, 2));
      const waiting = page.waitForEvent('download', { timeout: 30000 });
      await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
      await (await waiting).saveAs(path.join(folder, `${name}-accepted-pending.autopromote.json`));
    } catch (checkpointError) { console.warn('Accepted-job checkpoint:', checkpointError.message); }
    throw error;
  } finally { clearTimeout(renderTimeout); }
  assert.equal(result.status, 'completed', result.error || 'Render failed');
  // Export materializes newly imported local audio into owned Storage media.
  // Preserve both observations rather than binding the film to pre-upload refs.
  const materializedRecord = await save(page, name);
  assert.equal(materializedRecord.id, record.id);
  fs.mkdirSync(path.join(folder, name), { recursive: true });
  fs.writeFileSync(path.join(folder, name, 'native-render-completed.json'), JSON.stringify({
    startedAt, completedAt: new Date().toISOString(), submittedJobId, events,
    serverOutputSha256: result.result?.outputSha256,
    projectId: record.id, projectHash: hash(materializedRecord.snapshot.studioDocument),
    projectHashBeforeMediaUpload: hash(record.snapshot.studioDocument),
    templateRef: record.snapshot.creativeTemplateInstance?.templateRef || null }, null, 2));
  await downloadCompleted(page, name, materializedRecord, result, { startedAt, submittedJobId, events,
    projectHashBeforeMediaUpload: hash(record.snapshot.studioDocument) });
}
async function downloadCompleted(page, name, record, result, metadata) {
  const { startedAt, submittedJobId, events } = metadata;
  const ready = page.getByTestId('rendered-output-ready'); await ready.waitFor({ timeout: 30000 });
  const destination = path.join(folder, name); fs.mkdirSync(destination, { recursive: true });
  const output = path.join(destination, 'final.mp4');
  if (fs.existsSync(output)) fs.renameSync(output, path.join(destination, `previous-${hash(fs.readFileSync(output))}.mp4`));
  if (process.env.STUDIO_QA_NATIVE_DOWNLOAD_METHOD === 'playwright') {
    const downloaded = page.waitForEvent('download', { timeout: 120000 });
    await ready.getByRole('button', { name: /Download/ }).click();
    const download = await downloaded;
    await download.saveAs(output);
    assert.equal(await download.failure(), null, 'Native download failed');
  } else {
  const cdp = await page.context().newCDPSession(page);
  const { targetInfo } = await cdp.send('Target.getTargetInfo'); let guid;
  const downloaded = new Promise((resolve, reject) => {
    cdp.on('Browser.downloadWillBegin', event => { guid = event.guid; });
    cdp.on('Browser.downloadProgress', event => {
      if (event.guid !== guid) return;
      if (event.state === 'completed') resolve(event);
      if (event.state === 'canceled') reject(new Error('Native download canceled'));
    });
  });
  await cdp.send('Browser.setDownloadBehavior', { browserContextId: targetInfo.browserContextId,
    behavior: 'allowAndName', downloadPath: destination, eventsEnabled: true });
  await ready.getByRole('button', { name: /Download/ }).click();
  let downloadTimeout;
  let download;
  try {
    download = await Promise.race([downloaded, new Promise((_, reject) => {
      downloadTimeout = setTimeout(() => reject(new Error(
        'Native download exceeded its two-minute budget; the completed-job receipt is retained'
      )), 120000);
    })]);
  } finally {
    clearTimeout(downloadTimeout);
  }
  fs.renameSync(download.filePath || path.join(destination, guid), output);
  await cdp.detach();
  }
  const portrait = record.snapshot.reframeAspect === '9:16';
  const duration = record.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick / 90000;
  const width = Number(process.env.STUDIO_QA_EXPECTED_WIDTH || (portrait ? 720 : 1280));
  const height = Number(process.env.STUDIO_QA_EXPECTED_HEIGHT || (portrait ? 1280 : 720));
  const fps = Number(process.env.STUDIO_QA_EXPORT_FPS || 24);
  assert([width, height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 8192));
  assert([24, 25, 30, 50, 60].includes(fps));
  if (process.env.STUDIO_QA_EXPORT_RESOLUTION === 'source')
    assert(process.env.STUDIO_QA_EXPECTED_WIDTH && process.env.STUDIO_QA_EXPECTED_HEIGHT,
      'Source export checks require independently declared source dimensions');
  const technical = q.verifyMedia(output, { duration, width,
    // FFmpeg's encoder stop rounds this fractional duration to the nearest
    // delivery frame. A separate real-FFmpeg clock reproduction confirms it;
    // still require the exact count and the existing one-frame duration bound.
    height, fps, frames: Math.round(duration * fps) });
  const outputSha256 = hash(fs.readFileSync(output));
  const serverOutputSha256 = result.result?.outputSha256;
  assert.equal(outputSha256, serverOutputSha256, 'Downloaded bytes differ from the owned completed job');
  const receipt = { startedAt, finishedAt: new Date().toISOString(), projectId: record.id,
    projectHash: hash(record.snapshot.studioDocument), templateRef: record.snapshot.creativeTemplateInstance?.templateRef || null,
    submittedJobId, outputSha256, serverOutputSha256,
    ...(fs.existsSync(path.join(folder, `${name}-render-request.private.json`))
      ? { requestBytesSha256: hash(fs.readFileSync(path.join(folder, `${name}-render-request.private.json`))) }
      : { requestBodyRecovery: 'The earlier observer timed out during upload. Owned request/project recovery and completed-job status are retained.' }),
    events, technical, ...(metadata.recovered ? { recoveredThroughNativeSavedEntry: true } : {}),
    ...(metadata.projectHashBeforeMediaUpload ? { projectHashBeforeMediaUpload: metadata.projectHashBeforeMediaUpload } : {}),
    actualNativeDownload: true, noMocks: true, authBypass: false, gpuJobs: 0,
    creativeReview: 'pending actual moving/sound review and founder approval' };
  fs.writeFileSync(path.join(destination, 'render-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ output, outputSha256: receipt.outputSha256, projectId: record.id }));
}
async function recover(page, name) {
  const record = await save(page, `${name}-completed-edit`);
  let completed;
  const events = [];
  const observe = async response => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/media/viral-render-attempt/')) return;
    const data = await response.json().catch(() => ({}));
    events.push({ path: url.pathname, status: response.status(), jobStatus: data.status });
    if (response.ok() && data.status === 'completed') completed = data;
  };
  page.on('response', observe);
  await page.reload();
  await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
  await page.getByRole('button', { name: record.name, exact: true }).click();
  await rail(page);
  await q.tool(page, 'Export');
  await page.getByTestId('rendered-output-ready').waitFor({ timeout: 120000 });
  assert(completed?.jobId, 'Native owned completed-job recovery was not observed');
  page.off('response', observe);
  const current = await save(page, name);
  fs.mkdirSync(path.join(folder, name), { recursive: true });
  fs.writeFileSync(path.join(folder, name, 'owned-completed-job.private.json'), JSON.stringify(completed, null, 2), { mode: 0o600 });
  await downloadCompleted(page, name, current, completed, {
    startedAt: completed.createdAt || null, submittedJobId: completed.jobId, events, recovered: true,
  });
}
async function main() {
  const [action, name = 'ember'] = process.argv.slice(2);
  const browser = await chromium.connectOverCDP(process.env.STUDIO_QA_CDP_URL || 'http://127.0.0.1:9233');
  try {
    const session = await browser.newBrowserCDPSession();
    assert((await session.send('Browser.getVersion')).userAgent.includes('HeadlessChrome'));
    const sessionMarker = process.env.STUDIO_TEMPLATE_SESSION || 'studioTemplateSession';
    const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes(sessionMarker));
    assert(page && !await page.evaluate(() => !!window.__E2E_BYPASS));
    page.setDefaultTimeout(25000);
    if (action === 'apply') await apply(page, name);
    else if (action === 'render') await render(page, name);
    else if (action === 'recover') await recover(page, name);
    else if (action === 'save') await save(page, name);
    else console.log((await page.locator('body').innerText()).slice(-6500));
  } finally { await browser.close(); }
}
if (require.main === module) main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
module.exports = { instances, records, rail, save, apply, render, recover };
