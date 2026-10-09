#!/usr/bin/env node
// Inspect decoded delivery pixels and real headless/muted native playback.
const { chromium } = require('playwright');
const fs = require('fs/promises'), path = require('path');
const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const { root } = require('./proof');
const { hash } = require('../../src/modelRuntime/contract');

async function main() {
  const target = path.join(root, 'logo-ident');
  const kind = process.argv[2] || 'final';
  if (!['final', 'combined'].includes(kind)) throw Error('Use final | combined');
  const expectedFrames = kind === 'final' ? 102 : 283;
  const expectedDuration = kind === 'final' ? 4.25 : 283 / 24;
  const prefix = kind === 'final' ? '' : 'combined-';
  const delivery = path.join(target, kind, 'final.mp4');
  const bytes = await fs.readFile(delivery);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', delivery], { encoding: 'utf8' }));
  const video = probe.streams.find(s => s.codec_type === 'video');
  const audio = probe.streams.find(s => s.codec_type === 'audio');
  assert.equal(video.width, 1280);
  assert.equal(video.height, 720);
  assert.equal(Number(video.nb_frames), expectedFrames);
  assert(Math.abs(Number(video.duration) - expectedDuration) < 1 / 24);
  assert(audio && Number(audio.sample_rate) === 48000);
  const hashes = execFileSync('ffmpeg', ['-v', 'error', '-i', delivery, '-an', '-f', 'framemd5', 'pipe:1'], { encoding: 'utf8' })
    .split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
  assert.equal(hashes.length, expectedFrames);
  assert(new Set(hashes).size > expectedFrames * .9, 'Delivery must contain changing rendered pictures');
  const sheetFilter = kind === 'final' ? 'fps=4,scale=480:270,tile=3x6' : 'fps=2,scale=480:270,tile=4x6';
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', delivery, '-vf', sheetFilter, '-frames:v', '1', path.join(target, prefix + 'decoded-contact-sheet.png')]);
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const receipt = { startedAt: new Date().toISOString(), sha256: hash(bytes),
    width: video.width, height: video.height, duration: Number(video.duration), fps: 24,
    decodedFrames: hashes.length, distinctFrameHashes: new Set(hashes).size,
    nativePlayback: { headless: true, muted: true }, samples: [],
    scope: 'Actual private delivery decode/playback. Visual judgment is recorded after inspecting the decoded images. No authenticated Studio or creative approval claim.' };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    await page.setContent(`<body style="margin:0;background:#000"><video muted controls style="width:1280px;height:720px" src="http://127.0.0.1:6021/factory-media/logo-ident/${kind}/final.mp4"></video></body>`);
    await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
    await page.evaluate(() => document.querySelector('video').play());
    for (const time of kind === 'final' ? [.35, 1.1, 2.05, 2.65, 3.75] : [.5, 2, 4, 6.5, 8.5, 10.5, 11.5]) {
      await page.waitForFunction(t => document.querySelector('video').currentTime >= t, time, { timeout: 15000 });
      receipt.samples.push(await page.evaluate(() => { const v = document.querySelector('video'); return { currentTime: v.currentTime, error: v.error?.code || null, totalFrames: v.getVideoPlaybackQuality().totalVideoFrames }; }));
      await page.locator('video').screenshot({ path: path.join(target, `${prefix}native-playback-${time}.png`) });
    }
    await page.waitForFunction(() => document.querySelector('video').ended, null, { timeout: 15000 });
    receipt.nativePlayback.after = await page.evaluate(() => { const v = document.querySelector('video'), q = v.getVideoPlaybackQuality(); return { ended: v.ended, error: v.error?.code || null, totalVideoFrames: q.totalVideoFrames, droppedVideoFrames: q.droppedVideoFrames }; });
    assert(receipt.nativePlayback.after.ended && !receipt.nativePlayback.after.error);
    receipt.status = 'DECODE_AND_NATIVE_PLAYBACK_PASS';
  } finally {
    await browser.close();
    await fs.writeFile(path.join(target, prefix + 'delivery-verification.json'), JSON.stringify(receipt, null, 2));
  }
  console.log(JSON.stringify({ status: receipt.status, sha256: receipt.sha256, frames: receipt.decodedFrames, distinctFrames: receipt.distinctFrameHashes }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
