#!/usr/bin/env node
/* Actual Studio edits, local source import and programme assembly, no fake jobs. */
const { chromium } = require("playwright");
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const crypto = require("node:crypto");
const ROOT = path.resolve(__dirname, "../.."), base = "http://127.0.0.1:6341";
const review = path.join(ROOT, "reports/cinematic-evidence-20261031/review");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
async function stored(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("autopromote-viral-studio", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return new Promise((resolve, reject) => { const request = db.transaction("projects").objectStore("projects").getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b) => b.updatedAt - a.updatedAt)[0]); request.onerror = () => reject(request.error); });
  });
}
async function command(page, name) {
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Find a tool, effect or workflow…").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
}
async function checkpoint(page) { await command(page, "Save project checkpoint"); await page.waitForTimeout(1400); return stored(page); }
async function panel(page) {
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: "Cinematic scene", exact: true }).click();
}
async function main() {
  const context = await chromium.launchPersistentContext(path.join(ROOT, "reports/cinematic-evidence-20261031/private-local/qa-browser"), {
    headless: true, args: ["--mute-audio"], viewport: { width: 1680, height: 1050 }, acceptDownloads: true,
    recordVideo: { dir: path.join(review, "programme-recordings"), size: { width: 1680, height: 1050 } },
  });
  const page = context.pages()[0], errors = [], external = [], sceneSubmissions = [];
  page.setDefaultTimeout(20000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.dismiss()); // Existing UI's two choices: append.
  page.on("request", request => { if (request.url() === base + "/api/cinematic/jobs" && request.method() === "POST") sceneSubmissions.push(request.url()); });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== base) { external.push(url.origin); return route.abort(); }
    return route.continue();
  });
  let recording;
  try {
    await page.goto(base); recording = page.video();
    await page.getByRole("button", { name: "After", exact: true }).click();
    const pause = page.getByRole("button", { name: "Pause edited preview", exact: true });
    if (await pause.count()) await pause.click();
    let project = await stored(page);
    assert(project.snapshot.threeDScenes[0].localExport, "Use the existing real 720p scene export");
    if (project.snapshot.timeline.length === 1) {
      await page.getByTestId("timeline-add-clip-input").setInputFiles("/home/tibule12/Videos/The Video I Never Recorded - Presenter Tests/Original Take 1.mp4");
      await page.getByText(/appended from the local catalogue/).waitFor();
    }
    await panel(page);
    await page.getByLabel("Programme start (s)", { exact: true }).fill("8");
    await page.locator(".cinematic-heading").click();
    await page.getByText("Current 720p scene export ready.", { exact: false }).waitFor();
    await page.getByLabel("Edited output position", { exact: true }).fill("8.5");
    project = await checkpoint(page);
    if (!project.snapshot.overlays.some(layer => layer.text === "LOCAL TEST · REPEATED SOURCE")) {
      await command(page, "Add headline at playhead");
      await page.getByLabel("Title text", { exact: true }).fill("LOCAL TEST · REPEATED SOURCE");
      await page.getByLabel("Title start time", { exact: true }).fill("8.5");
      await page.getByLabel("Title duration", { exact: true }).fill("2");
    }
    await page.getByRole("button", { name: "Composite", exact: true }).click();
    const forward = page.getByRole("button", { name: "Bring LOCAL TEST · REPEATED SOURCE forward", exact: true });
    if (await forward.isEnabled()) await forward.click();
    project = await checkpoint(page);
    assert.equal(project.snapshot.timeline.length, 2);
    assert.equal(project.snapshot.threeDScenes[0].startTime, 8);
    assert.equal(project.snapshot.compositionOrder.at(-1), project.snapshot.overlays.find(layer => layer.text === "LOCAL TEST · REPEATED SOURCE").id);
    fs.writeFileSync(path.join(review, "programme-editable-project.json"), JSON.stringify(project, null, 2));
    await page.reload(); await panel(page);
    const reopened = await stored(page);
    assert.equal(JSON.stringify(reopened.snapshot.studioDocument), JSON.stringify(project.snapshot.studioDocument));
    await page.screenshot({ path: path.join(review, "programme-before-render.png") });
    const request = page.waitForResponse(response => response.url() === base + "/api/cinematic/programmes" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Render programme · 720p", exact: true }).click();
    const response = await request, initial = await response.json(); assert(response.ok(), JSON.stringify(initial));
    let result = initial;
    for (let i = 0; i < 240 && !["completed", "failed", "cancelled"].includes(result.status); i++) {
      await sleep(500); result = await page.evaluate(async id => (await fetch(`/api/cinematic/jobs/${id}`)).json(), initial.id);
    }
    assert.equal(result.status, "completed", result.error);
    assert.equal(result.receipt.frames, 384); assert.equal(result.receipt.duration, 16);
    assert.equal(result.receipt.embeddedSceneAudioMixed, false);
    await page.getByRole("link", { name: "Download rendered programme · 720p", exact: true }).waitFor();
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download rendered programme · 720p", exact: true }).click();
    const download = await downloadEvent;
    const movie = path.join(review, "cinematic-programme-720p.mp4"); await download.saveAs(movie);
    assert.equal(hash(fs.readFileSync(movie)), result.outputSha256);
    const video = page.getByTestId("studio-after-video");
    await video.waitFor();
    await page.waitForFunction(url => document.querySelector('[data-testid="studio-after-video"]')?.src.endsWith(url), result.movieUrl);
    const stop = page.getByRole("button", { name: "Pause edited preview", exact: true });
    if (await stop.count()) await stop.click();
    await page.getByLabel("Edited output position", { exact: true }).fill("0");
    await page.getByRole("button", { name: "Play edited preview", exact: true }).click();
    await page.waitForFunction(() => { const v = document.querySelector('[data-testid="studio-after-video"]'); return v?.currentTime > 15.9; }, null, { timeout: 22000 });
    const pauseAfterPlayback = page.getByRole("button", { name: "Pause edited preview", exact: true });
    if (await pauseAfterPlayback.count()) await pauseAfterPlayback.click();
    await page.getByLabel("Edited output position", { exact: true }).fill("9.5");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(review, "programme-native-title.png") });
    await video.screenshot({ path: path.join(review, "programme-picture-title.png") });
    await page.getByLabel("Edited output position", { exact: true }).fill("12");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(review, "programme-native-clock.png") });
    assert.deepEqual(external, []); assert.deepEqual(errors, []); assert.deepEqual(sceneSubmissions, []);
    const duplicate = await page.evaluate(async document => (await fetch("/api/cinematic/programmes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document }) })).json(), project.snapshot.studioDocument);
    assert.equal(duplicate.id, result.id); assert.equal(duplicate.reused, true);
    fs.writeFileSync(path.join(review, "programme-verification.json"), JSON.stringify({ nativeSourceImport: true, coldReopenExact: true,
      nativeTitleEdit: true, nativeBringTitleForward: true, completePlayback: true, cacheReuse: true, nativeDownloadSha256: result.outputSha256,
      sourceOccurrences: 2, disclosure: "Existing eight-second source repeated explicitly for a sixteen-second local assembly test",
      sceneSubmissions: 0, externalRequests: external, browserErrors: errors, result }, null, 2));
    console.log("Actual Studio programme import/title/save/reopen/export/download/full playback/cache passed", result.id);
  } catch (error) {
    await page.screenshot({ path: path.join(review, `programme-failure-${Date.now()}.png`) }).catch(() => {});
    throw error;
  } finally {
    const file = recording && await recording.path(); await context.close();
    if (file) fs.copyFileSync(file, path.join(review, "programme-edited-in-studio.webm"));
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
