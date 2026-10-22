#!/usr/bin/env node
// Fresh signed-in native restore, without rendering or publishing again.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
assert(process.env.STUDIO_PRESENTATION_CONFIG);
const config = JSON.parse(fs.readFileSync(process.env.STUDIO_PRESENTATION_CONFIG));
const recoverCurrent = process.argv[2] === "recover-current-backup";
const proof = path.resolve(root, config.folder), folder = path.join(proof,
  recoverCurrent ? "current-backup-recovery" : "backup-restore");
fs.mkdirSync(folder, { recursive: true });
process.env.STUDIO_KINETIC_PROOF_DIR = folder;
const { pause, seek } = require("../studio-professional/kinetic-type-proof");
const h = require("../creative-templates/studio-proof");
const { chromium } = require("playwright");
const { hash } = require("../../src/creativeTemplates/contract");
async function main() {
  const receipt = JSON.parse(fs.readFileSync(path.join(proof, config.output, "render-receipt.json")));
  const backup = path.join(proof, recoverCurrent
    ? `${config.output}-project.private.json` : "PRESENTATION.autopromote.json");
  const browser = await chromium.launch({ channel: "chromium", headless: true,
    args: ["--mute-audio", "--host-resolver-rules=MAP localhost 127.0.0.1"] });
  const context = await browser.newContext({
    storageState: path.join(root, require("../../config/daily-studio.json").authState),
    viewport: { width: 1920, height: 1200 },
  });
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  const writes = [];
  page.on("request", r => {
    const url = new URL(r.url());
    if (r.method() === "POST" && url.pathname === "/api/media/process") writes.push("render");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) && url.pathname.startsWith("/api/content/")) writes.push("publishing");
  });
  try {
    await page.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    await page.waitForFunction(() => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false);
    await page.getByLabel("Restore project backup", { exact: true }).setInputFiles(backup);
    await page.getByRole("button", { name: config.projectName, exact: true }).click();
    await h.rail(page); await pause(page);
    const restored = await h.save(page, "restored");
    assert.equal(restored.id, receipt.projectId);
    assert.equal(hash(restored.snapshot.studioDocument), receipt.projectHash);
    for (const layer of restored.snapshot.overlays.filter(o => ["video", "image"].includes(o.type)))
      assert(layer.sourceStoragePath || layer.storagePath, "Current media must remain owned after export");
    assert.equal(restored.snapshot.voiceovers[0].startTime, 0);
    const sampleTime = Math.max(.5, (config.resultStart || 0) + .5);
    await seek(page, sampleTime);
    const overlay = page.getByTestId(/^broll-preview-/).first();
    await overlay.waitFor();
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid^="broll-preview-"]');
      return v && v.readyState >= 2 && !v.seeking;
    });
    const media = await overlay.evaluate(v => ({ width: v.videoWidth, height: v.videoHeight,
      time: v.currentTime, duration: v.duration, paused: v.paused }));
    assert(media.width > 0 && media.height > 0);
    assert(Math.abs(media.time - (sampleTime - (config.resultStart || 0))) < .03);
    assert(media.paused);
    let recoveredBackup = null;
    if (recoverCurrent) {
      // Recover the exact actually saved, fully owned post-export record through
      // normal Restore. Download its current-only portable backup via the UI.
      const include = page.getByLabel("Include saved versions in backup", { exact:true });
      await include.waitFor();
      if (await include.isChecked()) await include.uncheck();
      const pending = page.waitForEvent("download");
      await page.getByRole("button", {name:"Download project backup",exact:true}).click();
      recoveredBackup = path.join(proof,"PRESENTATION.autopromote.json");
      await (await pending).saveAs(recoveredBackup);
      fs.chmodSync(recoveredBackup,0o600);
      const current = JSON.parse(fs.readFileSync(recoveredBackup));
      assert.equal(hash(current.snapshot.studioDocument),receipt.projectHash);
      assert.equal(current.id,receipt.projectId);
      assert.equal(current.versions.length,0);
    }
    assert.equal(writes.length, 0);
    fs.writeFileSync(path.join(folder, "receipt.json"), JSON.stringify({
      projectId: restored.id, canonicalHash: receipt.projectHash,
      backupSha256: hash(fs.readFileSync(backup)), exactFreshNativeRestore: true,
      motionKeys: restored.snapshot.motionKeyframes.length, media, ownedMediaChecks: true,
      inputKind:recoverCurrent ? "Actual saved fully owned record" : "Normal downloaded project backup",
      recoveredBackup,
      renderOrPublishingWrites: writes, wholePredictiveParityQualified: false,
    }, null, 2));
    console.log("Fresh native backup restore: exact final graph, owned media and paused result decoder pass.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
