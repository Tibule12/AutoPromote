#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
async function main() {
  const folder = path.resolve("reports/vfx-l40s-20261006/cinematic/playback");
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto("http://127.0.0.1:3095/landing/autopromote-vfx-review.mp4");
    await page.waitForFunction(() => document.querySelector("video")?.readyState >= 3);
    const media = await page.evaluate(() => ({ duration: document.querySelector("video").duration, width: document.querySelector("video").videoWidth, height: document.querySelector("video").videoHeight }));
    assert.equal(media.width, 1920); assert.equal(media.height, 1080); assert(Math.abs(media.duration - 13) < .05);
    const seeks = [];
    for (const time of [1.1, 3.7, 6.1, 7.1, 8.8, 11.4, 12.6]) {
      await page.evaluate(time => new Promise((resolve, reject) => {
        const video = document.querySelector("video");
        video.pause();
        let frame;
        const limit = setTimeout(() => { if (frame) video.cancelVideoFrameCallback(frame); reject(new Error("Sought video frame was not presented")); }, 10000);
        const finish = () => { clearTimeout(limit); requestAnimationFrame(() => requestAnimationFrame(resolve)); };
        if (video.requestVideoFrameCallback) {
          const presented = (_now, metadata) => {
            if (Math.abs(metadata.mediaTime - time) > .08) { frame = video.requestVideoFrameCallback(presented); return; }
            finish();
          };
          frame = video.requestVideoFrameCallback(presented);
        } else video.addEventListener("seeked", finish, { once: true });
        video.currentTime = time;
      }), time);
      await page.waitForFunction(time => { const video = document.querySelector("video"); return !video.seeking && Math.abs(video.currentTime - time) < .04 && video.readyState >= 3; }, time);
      await page.screenshot({ path: path.join(folder, `frame-${time}.png`) });
      seeks.push(time);
    }
    await page.evaluate(() => { const video = document.querySelector("video"); video.currentTime = 0; return video.play(); });
    await page.waitForFunction(() => document.querySelector("video").currentTime > .5 && !document.querySelector("video").paused);
    fs.writeFileSync(path.join(folder, "receipt.json"), JSON.stringify({ status: "PASS", media, seeks, playback: true, scope: "Actual final GPU render served locally; visual review is separate" }, null, 2));
    console.log(JSON.stringify({ status: "PASS", seeks: seeks.length, media }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
