#!/usr/bin/env node
// Record the actual signed-in schedule dashboard, excluding the account header.
// This is source capture only; Studio owns all subsequent creative editing.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
assert(process.env.STUDIO_SCHEDULE_OPENING_DIR, 'Choose a new source capture directory');
const folder = path.resolve(root, process.env.STUDIO_SCHEDULE_OPENING_DIR);
fs.mkdirSync(folder, {recursive:true});
const output = path.join(folder, 'dashboard-opening.mp4');
assert(!fs.existsSync(output), 'Preserve the existing capture');
const scratch = fs.mkdtempSync('/dev/shm/autopromote-dashboard-opening-');
const { hash } = require('../../src/creativeTemplates/contract');
const policy = require('../../config/daily-studio.json');
async function main() {
  require('../creative-templates/proof-storage').requireProofSpace(folder);
  const browser = await chromium.launch({channel:'chromium',headless:true,
    args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1']});
  const context = await browser.newContext({storageState:path.join(root,policy.authState),
    viewport:{width:1920,height:1080},timezoneId:policy.timezone});
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  const writes = [];
  page.on('request',r=>{
    if (new URL(r.url()).pathname.startsWith('/api/content/') &&
        ['POST','PUT','PATCH','DELETE'].includes(r.method())) writes.push(r.url());
  });
  try {
    await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Queue',exact:true}).click();
    await page.locator('.schedule-detail').waitFor();
    await page.getByLabel('Queue period',{exact:true}).selectOption('all');
    await page.locator('.schedule-loading').waitFor({state:'hidden'});
    await page.locator('.schedule-view-timezone select').selectOption(policy.timezone);
    const posts = JSON.parse(fs.readFileSync(path.join(root,
      'reports/daily-studio/2026-10-17/platform-packages.json'))).posts;
    const title = posts.find(p=>p.storyId==='sound-alignment'&&p.platform==='youtube').title;
    const card = page.locator('.schedule-calendar-card').filter({hasText:title}).first();
    await card.click();
    const video = page.locator('.schedule-detail video').first();
    await video.waitFor(); await video.scrollIntoViewIfNeeded();
    if (await video.evaluate(v=>v.paused)) await video.press('Space');
    await page.waitForFunction(()=>{
      const v=document.querySelector('.schedule-detail video');return v&&v.readyState>=2&&v.currentTime>.05;
    });
    await page.locator('.schedule-kpis').scrollIntoViewIfNeeded();
    const clip = {x:288,y:80,width:1600,height:1000};
    const initial = await video.evaluate(v=>({time:v.currentTime,width:v.videoWidth,height:v.videoHeight,muted:v.muted}));
    const frames=[]; const started=Date.now();
    while(Date.now()-started<8500) {
      const name=String(frames.length).padStart(6,'0')+'.jpg';
      const data=await page.screenshot({type:'jpeg',quality:88,clip});
      fs.writeFileSync(path.join(scratch,name),data);
      frames.push({name,time:(Date.now()-started)/1000,bytes:data.length});
    }
    assert(frames.length>8);assert(frames.reduce((n,f)=>n+f.bytes,0)<128*1024**2);
    const concat=path.join(scratch,'frames.ffconcat');
    fs.writeFileSync(concat,'ffconcat version 1.0\n'+frames.map((f,i)=>
      `file '${f.name}'\nduration ${Math.max(.001,(frames[i+1]?.time??8.6)-f.time)}\n`).join('')+
      `file '${frames.at(-1).name}'\n`);
    execFileSync('ffmpeg',['-nostdin','-v','error','-y','-safe','0','-i',concat,
      '-t','8','-vf','fps=24','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',output]);
    fs.copyFileSync(path.join(scratch,frames[0].name),path.join(folder,'dashboard-opening.jpg'));
    const terminal=await video.evaluate(v=>({time:v.currentTime,ended:v.ended,paused:v.paused}));
    assert.equal(writes.length,0);
    fs.writeFileSync(path.join(folder,'opening-receipt.json'),JSON.stringify({capturedAt:new Date().toISOString(),
      nativeSignedInDashboard:true,nativeScheduleWrites:writes,clip,initial,terminal,frames:frames.length,
      captureFps:frames.length/8.5,movieFps:24,captureDoesNotEstablishSmoothness:true,
      seconds:8,sourceSha256:hash(fs.readFileSync(output)),accountHeaderExcluded:true},null,2));
    for(const f of frames) fs.unlinkSync(path.join(scratch,f.name));
    fs.unlinkSync(concat);fs.rmdirSync(scratch);
    console.log('Eight-second actual schedule dashboard opening recorded; zero schedule writes.');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
