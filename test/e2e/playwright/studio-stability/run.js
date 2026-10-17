#!/usr/bin/env node
// Unmocked QA receipts for the normal App, authenticated API and real workers.
// Connects to a separately opened, normally signed-in Chromium. Never creates
// identities, replaces routes, injects auth, or starts a GPU instance.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const matrix = require('./matrix.json');
const root = path.resolve(__dirname, '../../../..');
const report = path.resolve(root, process.env.STUDIO_QA_REPORT || 'reports/studio-stability-20261007');
fs.mkdirSync(report, { recursive: true });
const receiptFile = path.join(report, 'results.json');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const clean = value => String(value).replace(/https?:\/\/[^\s"<>]+/g, raw => {
  try { const url = new URL(raw); return url.origin + url.pathname; } catch { return '[url]'; }
}).replace(/Bearer\s+[^\s]+/g, 'Bearer [redacted]');
const read = () => fs.existsSync(receiptFile) ? JSON.parse(fs.readFileSync(receiptFile)) : {
  schemaVersion: 1, startedAt: new Date().toISOString(), matrixSha256: sha(path.join(__dirname, 'matrix.json')),
  realAuthRequired: true, mocksAllowed: false, cases: matrix.cases.map(c => ({ id: c.id,
    capability: c.capability, testedEndToEnd: false, gpuUsed: false, status: 'BLOCKED',
    failureFound: '', fixApplied: '', retestResult: 'Not run', remainingIssue: c.initialReason,
    userFacingSeverity: 'Unqualified', attempts: [] })),
};
function write(data) {
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(receiptFile + '.new', JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(receiptFile + '.new', receiptFile);
}
function record(id, values, attempt) {
  const data = read(), row = data.cases.find(c => c.id === id);
  assert(row, `Unknown matrix case ${id}`);
  Object.assign(row, values);
  if (attempt) row.attempts.push(attempt);
  write(data);
  return row;
}
function verifyMedia(file, expected = {}) {
  const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',file], { encoding:'utf8' }));
  const video = probe.streams.find(s => s.codec_type === 'video');
  const audio = probe.streams.find(s => s.codec_type === 'audio');
  assert(video && video.width > 0 && video.height > 0, 'No decoded video stream');
  const seconds = Number(probe.format.duration);
  assert(seconds > 0, 'Invalid output duration');
  if (expected.duration !== undefined) assert(Math.abs(seconds - expected.duration) < .1, `Wrong duration ${seconds}`);
  if (expected.width) assert.equal(video.width, expected.width);
  if (expected.height) assert.equal(video.height, expected.height);
  if (expected.fps) {
    const [numerator, denominator] = video.avg_frame_rate.split('/').map(Number);
    assert.equal(numerator / denominator, expected.fps, 'Delivery frame rate differs from the selected export setting');
    if (expected.duration !== undefined) assert(
      Math.abs(Number(video.duration) - expected.duration) <= 1 / expected.fps + .000001,
      'Picture duration differs from the edit by more than one delivery frame');
  }
  if (expected.frames !== undefined) assert.equal(Number(video.nb_frames), expected.frames, 'Missing delivery video frames');
  if (expected.audio !== false) assert(audio, 'Source audio missing');
  if (audio?.duration && video.duration) assert(Math.abs(Number(audio.duration) - Number(video.duration)) < .1, 'Audio/video clocks differ');
  execFileSync('ffmpeg', ['-v','error','-i',file,'-f','null','-'], { stdio: ['ignore','pipe','pipe'] });
  let decodedAudio = null;
  if (audio) {
    // Stream duration metadata can conceal a discontinuity in AAC packet time.
    // Count actual decoded samples as well as checking the container clock.
    const frames = JSON.parse(execFileSync('ffprobe', [
      '-v','error','-select_streams','a:0','-show_frames',
      '-show_entries','frame=nb_samples','-of','json',file,
    ], {encoding:'utf8',maxBuffer:64*1024*1024})).frames;
    const samples = frames.reduce((total, frame) => total + Number(frame.nb_samples || 0), 0);
    const sampleRate = Number(audio.sample_rate);
    assert(samples > 0 && sampleRate > 0, 'Audio has no independently decoded samples');
    const decodedSeconds = samples / sampleRate;
    const largestFrame = frames.reduce((largest, frame) => Math.max(largest, Number(frame.nb_samples || 0)), 0);
    const tolerance = 2 * largestFrame / sampleRate + .002;
    assert(Math.abs(decodedSeconds - Number(video.duration || seconds)) <= tolerance,
      `Decoded audio lasts ${decodedSeconds}s despite ${audio.duration}s stream metadata`);
    decodedAudio = {samples,sampleRate,seconds:decodedSeconds,toleranceSeconds:tolerance,passed:true};
  }
  const contactSheet = file + '.frames.jpg';
  execFileSync('ffmpeg', ['-v','error','-i',file,'-vf',`fps=6/${seconds},scale=480:-2,tile=3x2`,'-frames:v','1','-y',contactSheet]);
  const result = { passed:true, sha256:sha(file), bytes:fs.statSync(file).size, seconds,
    video: { width:video.width, height:video.height, codec:video.codec_name, fps:video.avg_frame_rate,
      duration:video.duration, frameCount:video.nb_frames ? Number(video.nb_frames) : null,
      pixelFormat:video.pix_fmt, encoder:video.tags?.encoder || null }, audio:audio ? {
      codec:audio.codec_name, channels:audio.channels, sampleRate:audio.sample_rate, duration:audio.duration } : null,
    independentFullDecode:true, decodedAudio, contactSheet:path.relative(root,contactSheet),
    scope:'Technical only. Pixel and listening review are separate required evidence.' };
  fs.writeFileSync(file + '.technical.json', JSON.stringify(result,null,2));
  return result;
}
async function connect() {
  const browser = await chromium.connectOverCDP(process.env.STUDIO_QA_CDP || 'http://127.0.0.1:9229');
  try {
    // The user is working on this computer. Never let an automated QA action
    // bring a visible browser onto their screen, even if a window is minimized.
    const browserSession = await browser.newBrowserCDPSession();
    const browserInfo = await browserSession.send('Browser.getVersion');
    await browserSession.detach();
    assert(browserInfo.userAgent.includes('HeadlessChrome'), 'Studio QA requires the headless browser; no visible-window automation is allowed');
    const context = browser.contexts()[0];
    const requestedUrl = process.env.STUDIO_QA_PAGE_URL;
    const candidates = context.pages().filter(p =>
      /^http:\/\/(?:localhost|127\.0\.0\.1):5000(?:\/|$)/.test(p.url()) &&
      (!requestedUrl || p.url() === requestedUrl));
    assert.equal(candidates.length, 1, requestedUrl
      ? 'The requested Studio QA tab must match exactly one open page'
      : 'Studio QA needs exactly one app tab; set STUDIO_QA_PAGE_URL when other sessions have app tabs open');
    const page = candidates[0];
    assert(!/[?&]fixture=/.test(page.url()), 'Fixture hosts do not qualify');
    assert.equal(await page.evaluate(() => !!window.__E2E_BYPASS), false, 'Auth bypass does not qualify');
    page.setDefaultTimeout(20000);
    return { browser, context, page };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
async function inspect(page, name) {
  const folder = path.join(report, 'browser'); fs.mkdirSync(folder,{recursive:true});
  await page.screenshot({path:path.join(folder,name+'.png'),fullPage:false});
  const state = { url:clean(page.url()), text:clean(await page.locator('body').innerText()),
    controls: await page.locator('input,select,button').evaluateAll(es => es.filter(e => !!e.getClientRects().length).map(e => ({
      tag:e.tagName,type:e.type,label:e.getAttribute('aria-label'),testId:e.dataset.testid,
      text:e.tagName==='BUTTON'?e.innerText:null,placeholder:e.placeholder,
      options:e.tagName==='SELECT'?[...e.options].map(o=>({value:o.value,text:o.text})):null
    }))),
    media: await page.locator('video').evaluateAll(vs => vs.map(v=>({testId:v.dataset.testid,readyState:v.readyState,
      duration:v.duration,time:v.currentTime,paused:v.paused,error:v.error?.message}))) };
  fs.writeFileSync(path.join(folder,name+'.json'),JSON.stringify(state,null,2));
  return state;
}
async function tool(page, label) {
  const button=page.getByRole('navigation',{name:'Creative tools'}).getByRole('button',{name:label,exact:true});
  // This changes the native tool panel. A pending App navigation must not make
  // a completed click wait for unrelated network activity in a second QA tab.
  await button.click({noWaitAfter:true});
  await page.waitForFunction(label => [...document.querySelectorAll('[aria-label="Creative tools"] button')]
    .some(button => button.querySelector('strong')?.textContent.trim() === label
      && button.getAttribute('aria-pressed') === 'true'), label);
}
async function render(page, id, expected={duration:12,width:1280,height:720,audio:true}) {
  // Validate receipt ownership before touching controls or submitting paid work.
  // An unknown case must not launch a job and then mask its outcome in record().
  assert(matrix.cases.some(c => c.id === id), `Unknown matrix case ${id}`);
  const projectName=await page.locator('.studio-header-copy').innerText();
  if(expected.projectName)assert(projectName.includes(expected.projectName),'Wrong project open for this case');
  await tool(page,'Export');
  const startedAt = new Date().toISOString(), events = [], errors = [];
  let submittedJobId, completeJob, failJob;
  const terminalJob=new Promise((resolve,reject)=>{completeJob=resolve;failJob=reject;});
  // Observe this attempt's authenticated status response. The previous render's
  // "ready" card alone cannot establish that a new edit has finished rendering.
  const observe = async response => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/media/')) return;
    const item={path:url.pathname,status:response.status(),at:new Date().toISOString()};
    if(response.status()===200 && (url.pathname==='/api/media/process'||url.pathname.startsWith('/api/media/status/'))) {
      try {
        const data=await response.json();
        if(url.pathname==='/api/media/process') submittedJobId=data.jobId||data.job_id;
        else if(submittedJobId && url.pathname.endsWith('/'+submittedJobId)) {
          item.jobStatus=data.status;
          if(data.status==='completed') {
            completeJob(data);
          }
          if(data.status==='failed')failJob(new Error(clean(data.error||'Owned render job failed')));
        }
      } catch {}
    }
    if(response.status()>=400) try {
      const data=await response.json();item.code=data.code;item.error=clean(data.message||data.error||data.detail||'');
      if(url.pathname==='/api/media/process') failJob(new Error(`${item.code || 'RENDER_REJECTED'}: ${item.error} (${response.status()})`));
    } catch {}
    events.push(item);
  };
  const onError = error => errors.push(clean(error.message));
  page.on('response',observe); page.on('pageerror',onError);
  page.once('dialog',dialog=>dialog.accept());
  try {
    await page.getByLabel('Export resolution',{exact:true}).selectOption('source');
    await page.getByLabel('Export frame rate',{exact:true}).selectOption(String(expected.fps || 30));
    await page.getByLabel('Export codec',{exact:true}).selectOption('h264');
    const review = page.getByTestId('render-caption-review-copy');
    await (await review.isVisible() ? review : page.getByRole('button',{name:/^Render (Final Clip|Again)$/})).click();
    const acknowledgement = setTimeout(() => {
      if (!submittedJobId) failJob(new Error('Studio did not acknowledge a render submission within 30 seconds; inspect the recorded UI validation and requests'));
    }, 30000);
    acknowledgement.unref();
    const ready=page.getByTestId('rendered-output-ready');
    // A worker must finish within the per-capability investigation budget.
    await Promise.race([
      terminalJob,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Owned render did not reach a terminal state')),
        Math.min(25*60000,Number(process.env.STUDIO_QA_RENDER_TIMEOUT_MS||240000))).unref()),
      page.getByTestId('studio-export-error').waitFor({timeout:
        Math.min(25*60000,Number(process.env.STUDIO_QA_RENDER_TIMEOUT_MS||240000))}).then(async () => {
        throw new Error(await page.getByTestId('studio-export-error').innerText());
      }).catch(error=>{
        if(error.name==='TimeoutError')return new Promise(()=>{});
        throw error;
      }),
    ]);
    clearTimeout(acknowledgement);
    await ready.waitFor({timeout:30000});
    assert(events.some(e=>e.path==='/api/media/process'&&e.status===200),'No real render submission acknowledged');
    const folder=path.join(report,id);fs.mkdirSync(folder,{recursive:true});
    await page.getByRole('button',{name:'After',exact:true}).click();
    await page.waitForFunction(()=>{
      const video=document.querySelector('[data-testid="studio-after-video"]');
      return video && video.readyState>=3 && !video.error;
    },undefined,{timeout:30000});
    await inspect(page,id+'-rendered');
    // A CDP attachment has a different Playwright artifact directory from the
    // browser's original owner. Use Chrome's actual download event and directory
    // so the test does not mistake that harness transport issue for a product bug.
    const cdp=await page.context().newCDPSession(page);
    let downloadGuid;
    const nativeDownload=new Promise((resolve,reject)=>{
      cdp.on('Browser.downloadWillBegin',event=>{downloadGuid=event.guid;});
      cdp.on('Browser.downloadProgress',event=>{
        if(event.guid!==downloadGuid)return;
        if(event.state==='completed')resolve(event);
        if(event.state==='canceled')reject(new Error('Browser canceled the actual download'));
      });
    });
    await cdp.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:folder,eventsEnabled:true});
    const downloadPromise=page.waitForEvent('download',{timeout:120000});
    await ready.getByRole('button',{name:/Download/}).click();
    const download=await downloadPromise;
    const file=path.join(folder,'download.mp4');
    const delivered=await Promise.race([nativeDownload,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Download did not finish')),120000).unref())]);
    if(fs.existsSync(file)) {
      const previousHash=sha(file), archived=path.join(folder,`previous-${previousHash}.mp4`);
      for(const suffix of ['', '.technical.json', '.frames.jpg'])
        if(fs.existsSync(file+suffix))fs.renameSync(file+suffix,archived+suffix);
      const data=read();
      for(const row of data.cases)for(const attempt of row.attempts)
        if(attempt.output===path.relative(root,file)&&attempt.outputSha256===previousHash) {
          attempt.output=path.relative(root,archived);
          if(attempt.technical)attempt.technical.contactSheet=path.relative(root,archived+'.frames.jpg');
        }
      write(data);
    }
    fs.renameSync(path.join(folder,downloadGuid),file);
    await cdp.detach();
    const technical=verifyMedia(file,expected);
    const attempt={startedAt,finishedAt:new Date().toISOString(),projectName,realApi:true,noMocks:true,
      submittedJobId,events,errors,download:{suggestedName:download.suggestedFilename(),bytes:delivered.totalBytes,nativeCompleted:true},output:path.relative(root,file),outputSha256:technical.sha256,technical};
    record(id,{testedEndToEnd:true,status:'BLOCKED',remainingIssue:'Output produced; visual review and GPU attribution pending',retestResult:'Real render and independent full decode completed'},attempt);
    return attempt;
  } catch(error) {
    await inspect(page,id+'-failure').catch(()=>{});
    record(id,{status:'FAIL',failureFound:clean(error.message),remainingIssue:'Investigate recorded request and UI error',
      retestResult:'Failed',userFacingSeverity:'High'}, {startedAt,finishedAt:new Date().toISOString(),realApi:true,noMocks:true,events,errors,error:clean(error.message)});
    throw error;
  } finally { page.off('response',observe); page.off('pageerror',onError); }
}
async function preview(page) {
  await page.getByTestId('studio-after-video').waitFor({state:'attached'});
  const media=page.getByTestId('studio-after-video');
  await page.getByRole('button',{name:'After',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="studio-after-video"]').readyState>=3);
  const initialLane=await page.locator('[data-testid="pro-track-row-video"] .pro-track-lane').boundingBox();
  assert(initialLane,'Source timeline missing');
  await page.mouse.click(initialLane.x+initialLane.width*.1,initialLane.y+initialLane.height*.5);
  await page.waitForFunction(()=>document.querySelector('[data-testid="studio-after-video"]').currentTime<3);
  const start=await media.evaluate(v=>v.currentTime);
  if(await media.evaluate(v=>v.paused)) await page.getByRole('button',{name:'Play comparison',exact:true}).click();
  await page.waitForFunction(t=>document.querySelector('[data-testid="studio-after-video"]').currentTime>t+.3,start);
  await page.getByRole('button',{name:'Pause comparison',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="studio-after-video"]').paused);
  const lane=await page.locator('[data-testid="pro-track-row-video"] .pro-track-lane').boundingBox();
  assert(lane,'Source timeline missing');
  await page.mouse.click(lane.x+lane.width*.5,lane.y+lane.height*.5);
  await page.waitForFunction(()=>Math.abs(document.querySelector('[data-testid="studio-after-video"]').currentTime-6)<.12);
  await inspect(page,'preview-seek-six-seconds');
  record('preview',{testedEndToEnd:true,status:'BLOCKED',remainingIssue:'Presented image review pending',retestResult:'Actual play/pause/seek succeeded',userFacingSeverity:'None'}, {at:new Date().toISOString(),noMocks:true,clockAtSeek:6});
}
async function main() {
  const [command='list',id,...rest]=process.argv.slice(2);
  if(command==='list') { write(read());for(const c of matrix.cases) console.log(`${c.id}\t${c.capability}\t${c.userFlow}`);return; }
  if(command==='verify') { console.log(JSON.stringify(verifyMedia(path.resolve(root,id),rest[0]?JSON.parse(rest[0]):{}),null,2));return; }
  if(command==='classify') {
    // Evidence-backed review JSON is authored after inspecting the real files.
    const values=JSON.parse(fs.readFileSync(path.resolve(root,rest[0])));
    const row=read().cases.find(c=>c.id===id);assert(row,'Unknown case');
    if(values.status==='PASS') {
      assert(row.testedEndToEnd,'Engine-only evidence cannot pass');
      assert(values.visualReview?.passed && values.visualReview.notes,'Visual review required');
      const output=row.attempts.findLast(a=>a.output);
      if(output) { assert(output.technical?.passed);assert.equal(sha(path.resolve(root,output.output)),output.outputSha256,'Reviewed output changed'); }
      if(['audio','audio_restoration','voiceover_sfx'].includes(id)) assert(values.listeningReview?.passed,'Listening required');
      assert(values.gpuUsed===false||values.gpuEvidence,'GPU claim needs execution evidence');
    }
    console.log(JSON.stringify(record(id,values,{reviewedAt:new Date().toISOString()})));return;
  }
  if(command==='report') {
    const data=read();const escape=v=>String(v??'').replace(/\\/g,'\\\\').replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
    const gpuCell=row=>row.latestRetestDate
      ? `${row.latestRetestGpuUsed?'Yes':'No'} · ${row.latestRetestDate}${!row.latestRetestGpuUsed&&row.gpuUsed?'; prior GPU evidence retained':''}`
      : `${row.gpuUsed?'Yes':'No'} · historical`;
    const fields=['capability','testedEndToEnd','gpuUsed','status','failureFound','fixApplied','retestResult','remainingIssue','userFacingSeverity'];
    const out=['| Capability | Tested end-to-end | GPU used | PASS / FAIL / BLOCKED | Failure found | Fix applied | Retest result | Remaining issue | User-facing severity |','|---|---|---|---|---|---|---|---|---|',...data.cases.map(row=>'| '+fields.map(f=>escape(f==='gpuUsed'?gpuCell(row):row[f])).join(' | ')+' |')].join('\n')+'\n';
    fs.writeFileSync(path.join(report,'matrix.md'),out);console.log(out);return;
  }
  const {browser,page}=await connect();
  try {
    if(command==='inspect') console.log(JSON.stringify(await inspect(page,id||'current'),null,2));
    else if(command==='tool') {await tool(page,id);console.log(JSON.stringify(await inspect(page,id.toLowerCase()),null,2));}
    else if(command==='preview') await preview(page);
    else if(command==='render') console.log(JSON.stringify(await render(page,id||'final_render',rest[0]?JSON.parse(rest[0]):undefined),null,2));
    else throw new Error(`Unknown command ${command}`);
  } finally {await browser.close();}
}
module.exports={matrix,root,report,sha,record,verifyMedia,connect,inspect,tool,render,preview};
if(require.main===module) main().catch(error=>{console.error(clean(error.message));process.exitCode=1;});
