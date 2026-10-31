#!/usr/bin/env node
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const ROOT = path.resolve(__dirname, "../..");
const review = path.join(ROOT, "reports/cinematic-evidence-20261031/review");
async function main() {
  const context = await chromium.launchPersistentContext(path.join(ROOT, "reports/cinematic-evidence-20261031/private-local/qa-browser"), {
    headless: true, args: ["--mute-audio"], viewport: { width: 1680, height: 1050 },
    recordVideo: { dir: path.join(review, "recordings"), size: { width: 1680, height: 1050 } },
  });
  try {
    const page = context.pages()[0];
    const recording = page.video();
    await page.goto("http://127.0.0.1:6341");
    await page.getByRole("button", { name: "Motion", exact: true }).click();
    await page.getByRole("button", { name: "Cinematic scene", exact: true }).click();
    await page.getByRole("button", { name: "After", exact: true }).click();
    if (await page.getByText("Preview needs rendering for this revision.", { exact: false }).count()) {
      await page.getByRole("button", { name: "Render scene preview · 360p", exact: true }).click();
      await page.getByText("Current 360p scene preview ready.", { exact: false }).waitFor({ timeout: 10000 });
      await page.keyboard.press("Control+k");
      await page.getByPlaceholder("Find a tool, effect or workflow…").fill("Save project checkpoint");
      await page.getByRole("button", { name: /Save project checkpoint/ }).click();
      await page.waitForTimeout(800);
    }
    await page.getByRole("button", { name: "Review scene movie on programme", exact: true }).click();
    const pause = page.getByRole("button", { name: "Pause edited preview", exact: true });
    if (await pause.count()) await pause.click();
    await page.getByLabel("Edited output position", { exact: true }).fill("0");
    await page.waitForTimeout(1200);
    const preview = page.getByTestId("studio-after-video");
    await preview.waitFor();
    await page.screenshot({ path: path.join(review, "native-timeline-before-playback.png") });
    const observations = [];
    await page.getByRole("button", { name: "Play edited preview", exact: true }).click();
    for (let index = 0; index < 18; index++) {
      await page.waitForTimeout(500);
      observations.push(await page.evaluate(() => {
        const clip = document.querySelector('video[aria-label="Cinematic programme preview"]') || document.querySelector('[data-testid="studio-after-video"]');
        const source = document.querySelector('[data-testid="studio-after-video"]');
        return { at: performance.now(), sceneTime: clip?.currentTime, sourceTime: source?.currentTime,
          scenePresentedFrames: clip?.getVideoPlaybackQuality?.().totalVideoFrames,
          droppedFrames: clip?.getVideoPlaybackQuality?.().droppedVideoFrames };
      }));
    }
    const stop = page.getByRole("button", { name: "Pause edited preview", exact: true });
    if (await stop.count()) await stop.click();
    await page.getByLabel("Edited output position", { exact: true }).fill("4");
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(review, "native-timeline-clock.png") });
    await preview.screenshot({ path: path.join(review, "native-preview-clock.png") });
    fs.writeFileSync(path.join(review, "playback-observations.json"), JSON.stringify({ headless: true, muted: true,
      audioInRecording: false, realTimeParityQualified: false, observations }, null, 2));
    await page.waitForTimeout(700);
    const recordingPath = await recording.path();
    await context.close();
    fs.copyFileSync(recordingPath, path.join(review, "edited-in-studio.webm"));
    console.log("Retained actual Studio timeline/full playback recording and paused preview frames");
  } finally { await context.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
