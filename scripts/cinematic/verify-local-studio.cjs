#!/usr/bin/env node
/* Real editor controls and real CPU renders; no request fulfilment/mocked media. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "../..");
const review = path.join(ROOT, "reports/cinematic-evidence-20261031/review");
const userDataDir = path.join(ROOT, "reports/cinematic-evidence-20261031/private-local/qa-browser");
const base = "http://127.0.0.1:6341";
const previewOnly = process.env.CINEMATIC_VERIFY_PREVIEW_ONLY === "true";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let currentContext;
async function project(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open("autopromote-viral-studio", 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    return new Promise((resolve, reject) => { const req = db.transaction("projects").objectStore("projects").getAll(); req.onsuccess = () => resolve(req.result.sort((a, b) => b.updatedAt - a.updatedAt)[0]); req.onerror = () => reject(req.error); });
  });
}
async function save(page) {
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Find a tool, effect or workflow…").fill("Save project checkpoint");
  await page.getByRole("button", { name: /Save project checkpoint/ }).click();
  await page.waitForTimeout(1300);
  const stored = await project(page);
  assert(stored?.snapshot?.studioDocument, "Native canonical document must be saved");
  return stored;
}
async function openPanel(page) {
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: "Cinematic scene", exact: true }).click();
}
async function render(page, quality) {
  const responsePromise = page.waitForResponse(response => response.url() === base + "/api/cinematic/jobs" && response.request().method() === "POST");
  await page.getByRole("button", { name: quality === "export" ? "Render scene export · 720p" : "Render scene preview · 360p", exact: true }).click();
  const response = await responsePromise;
  const initial = await response.json();
  assert(response.ok(), JSON.stringify(initial));
  console.log("Submitted actual " + quality + " job " + initial.id);
  let state = initial, lastReport = 0;
  const end = Date.now() + 3650 * 1000;
  while (!["completed", "failed", "cancelled"].includes(state.status)) {
    if (Date.now() > end) throw new Error("Render verification deadline exceeded");
    await sleep(2000);
    state = await page.evaluate(async id => (await fetch(`/api/cinematic/jobs/${id}`)).json(), initial.id);
    if (Date.now() - lastReport > 30000) { console.log(quality, state.status, state.frame || 0, Math.round(100 * (state.progress || 0)) + "%"); lastReport = Date.now(); }
  }
  assert.equal(state.status, "completed", state.error);
  await page.waitForTimeout(2000);
  return state;
}
async function main() {
  fs.mkdirSync(review, { recursive: true });
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true,
    viewport: { width: 1680, height: 1050 }, args: ["--mute-audio"] });
  currentContext = context;
  const page = context.pages()[0] || await context.newPage();
  const violations = [], errors = [];
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.hostname !== "127.0.0.1") {
      violations.push(url.origin); return route.abort();
    }
    return route.continue();
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole("button", { name: "Motion", exact: true }).waitFor();
  await page.getByRole("button", { name: "After", exact: true }).click();
  const pause = page.getByRole("button", { name: "Pause edited preview", exact: true });
  if (await pause.count()) await pause.click();
  await openPanel(page);
  if (!await page.getByLabel("Cinematic scene", { exact: true }).count()) await page.getByRole("button", { name: "Apply Director clock plan", exact: true }).click();
  // This is the verifier's dedicated synthetic profile, never a customer store.
  // Reset the deliberate edit from an interrupted earlier verification.
  if (await page.getByLabel("Clock A", { exact: true }).inputValue() !== "02:17:36") {
    await page.getByLabel("Clock A", { exact: true }).fill("02:17:36");
    await page.locator(".cinematic-heading").click();
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: path.join(review, "editable-scene.png") });
  const before = await save(page);
  assert(before.snapshot.threeDScenes.some(scene => scene.sceneType === "cinematic_evidence"));
  const preview = await render(page, "preview");
  await page.screenshot({ path: path.join(review, "preview-completed.png") });
  const exported = previewOnly ? null : await render(page, "export");
  const saved = await save(page);
  fs.writeFileSync(path.join(review, "editable-project.json"), JSON.stringify(saved, null, 2));
  const scene = saved.snapshot.threeDScenes.find(item => item.sceneType === "cinematic_evidence");
  if (exported) assert.equal(scene.localExport.jobId, exported.id);
  assert.equal(scene.hqPreviewJobId, preview.id);
  const originalCinematic = JSON.stringify(scene.cinematic);
  await page.reload();
  await openPanel(page);
  const reopened = await project(page);
  assert.equal(JSON.stringify(reopened.snapshot.threeDScenes.find(item => item.id === scene.id).cinematic), originalCinematic);
  const reading = page.getByLabel("Clock A", { exact: true });
  await reading.fill("03:15:00");
  await page.locator(".cinematic-heading").click();
  await page.waitForTimeout(1000);
  await page.getByText("Preview needs rendering for this revision.", { exact: false }).waitFor();
  await page.getByRole("button", { name: /Undo/ }).click();
  await page.waitForTimeout(700);
  assert.equal(await reading.inputValue(), scene.cinematic.content.clockA);
  await page.getByRole("button", { name: /Redo/ }).click();
  await page.waitForTimeout(700);
  assert.equal(await reading.inputValue(), "03:15:00");
  await page.getByRole("button", { name: /Undo/ }).click();
  await page.waitForTimeout(700);
  assert.equal(await reading.inputValue(), scene.cinematic.content.clockA);
  await page.waitForTimeout(4200);
  const autosavedUndo = await project(page);
  assert.equal(JSON.stringify(autosavedUndo.snapshot.threeDScenes.find(item => item.id === scene.id).cinematic), originalCinematic,
    "Undo must replace an older edit's pending autosave");
  await page.reload(); await openPanel(page);
  assert.equal(await page.getByLabel("Clock A", { exact: true }).inputValue(), scene.cinematic.content.clockA);
  await page.screenshot({ path: path.join(review, "cold-reopen.png") });
  const reused = await render(page, previewOnly ? "preview" : "export");
  assert.equal(reused.id, (exported || preview).id);
  assert.equal(reused.reused, true);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download rendered preview · 360p", exact: true }).click();
  const download = await downloadEvent;
  const downloadPath = path.join(review, "downloaded-scene-preview.mp4");
  await download.saveAs(downloadPath);
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(downloadPath)).digest("hex"), preview.outputSha256);
  assert.deepEqual(violations, [], "No request may access a production/external origin");
  assert.deepEqual(errors, [], "No browser runtime errors");
  const result = { version: 1, actualEditor: "frontend/src/components/ViralClipStudio.js", realAccount: false,
    firebaseAccess: false, previewOnly, preview, exported, reused: reused.id, saveReopen: true, undoRedo: true,
    autosavedUndoColdReopen: true, nativePreviewDownloadSha256: preview.outputSha256, violations, browserErrors: errors,
    limitations: ["Isolated local shell; real customer/account/cloud integration unqualified", "Scene-interval export only", "Processed preview; real-time playback smoothness unqualified"] };
  fs.writeFileSync(path.join(review, previewOnly ? "studio-preview-verification.json" : "studio-verification.json"), JSON.stringify(result, null, 2));
  await context.close();
  console.log(`Actual Studio scene add/preview/${previewOnly ? "preview-only" : "export"}/save/cold-reopen/cache reuse verified`);
}
main().catch(async error => { console.error(error); if (currentContext) await currentContext.close(); process.exitCode = 1; });
