#!/usr/bin/env node
// Present an actual recording and its same-clock movie through native Studio.
// Configuration describes normal inspector edits; it never replaces project state.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
assert(process.env.STUDIO_PRESENTATION_CONFIG, "Provide an explicit presentation config");
const config = JSON.parse(fs.readFileSync(process.env.STUDIO_PRESENTATION_CONFIG));
const folder = path.resolve(root, config.folder);
fs.mkdirSync(folder, { recursive: true });
Object.assign(process.env, {
  STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_TIMELINE_HEIGHT: "430",
  STUDIO_QA_HIDE_MEDIA: "1",
});
const { pause, seek, range } = require("../studio-professional/kinetic-type-proof");
Object.assign(process.env, {
  STUDIO_QA_EXPORT_RESOLUTION: "source",
  STUDIO_QA_EXPECTED_WIDTH: String(config.width),
  STUDIO_QA_EXPECTED_HEIGHT: String(config.height),
  STUDIO_QA_EXPORT_FPS: "24",
});
const h = require("../creative-templates/studio-proof");
const q = require("../../test/e2e/playwright/studio-stability/run");
const { chromium } = require("playwright");
const { hash } = require("../../src/creativeTemplates/contract");
const read = file => JSON.parse(fs.readFileSync(file));
async function backup(page, file) {
  await h.rail(page);
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project backup", exact: true }).click();
  await (await waiting).saveAs(path.join(folder, file));
  fs.chmodSync(path.join(folder, file), 0o600);
}
async function keyframes(page, label, poses) {
  const timeline = page.getByTestId("studio-pro-timeline");
  await timeline.getByRole("button", { name: "Sequence tracks", exact: true }).click();
  const show = timeline.getByRole("button", { name: "Show motion keyframes", exact: true });
  if (await show.isVisible()) await show.click();
  const expand = timeline.getByRole("button", { name: `Expand ${label} keyframes`, exact: true });
  if (await expand.isVisible()) await expand.click();
  for (const { time, ...properties } of poses) {
    await seek(page, time);
    for (const [property, value] of Object.entries(properties)) {
      const input = page.getByLabel(`${label} ${property} value`, { exact: true });
      await input.fill(String(value));
      await input.press("Enter");
      await input.blur();
      const add = timeline.getByRole("button", {
        name: `Add ${label} ${property} keyframe at playhead`, exact: true,
      });
      if (await add.isVisible()) await add.click();
    }
  }
}
function verifyKeys(saved, targetId, poses) {
  for (const { time, ...properties } of poses)
    for (const [property, value] of Object.entries(properties)) {
      const key = saved.snapshot.motionKeyframes.find(k => k.targetId === targetId &&
        k.property === property && Math.abs(k.time - time) < 1 / 90000);
      assert(key && Math.abs(key.value - value) < .001, `${targetId} ${property} ${time}`);
    }
}
async function main() {
  const action = process.argv[2] || "prepare";
  assert(["prepare", "all", "render", "recover"].includes(action));
  if (["prepare", "all"].includes(action)) assert(!fs.existsSync(path.join(folder, "native-edit.json")),
    "Preserve the prepared presentation; use render/recover");
  const browser = await chromium.launch({ channel: "chromium", headless: true,
    args: ["--mute-audio", "--host-resolver-rules=MAP localhost 127.0.0.1"] });
  const context = await browser.newContext({
    storageState: path.join(root, require("../../config/daily-studio.json").authState),
    viewport: { width: 1920, height: 1200 }, acceptDownloads: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  let submissions = 0;
  const publishingWrites = [];
  page.on("request", r => {
    const p = new URL(r.url()).pathname;
    if (p === "/api/media/process" && r.method() === "POST") submissions++;
    if (p.startsWith("/api/content/") && ["POST", "PUT", "PATCH", "DELETE"].includes(r.method()))
      publishingWrites.push(p);
  });
  try {
    await page.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    if (["prepare", "all"].includes(action)) {
      let prepared;
      if (config.preparedProjectBackup) {
        await page.waitForFunction(() =>
          document.querySelector('[aria-label="Restore project backup"]')?.disabled === false);
        await page.getByLabel("Restore project backup", { exact: true })
          .setInputFiles(path.join(root, config.preparedProjectBackup));
        const sourceName = read(path.join(root, config.preparedProjectBackup)).name;
        await page.getByRole("button", { name: sourceName, exact: true }).click();
        await h.rail(page); await pause(page);
        if (config.duplicateOnRestore) {
          await page.getByRole("button", { name: "Duplicate", exact: true }).first().click();
          await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(" copy"));
          await page.getByLabel("Project name", { exact: true }).fill(config.projectName);
        }
        if (config.additionalGraphics) {
          await seek(page, 0);
          await page.waitForFunction(({width,height}) => {
            const video = document.querySelector('[data-testid="studio-after-video"]');
            return video && video.readyState >= 2 && video.videoWidth === width && video.videoHeight === height;
          }, {width:config.width,height:config.height}, {timeout:90000});
          await q.tool(page, "Graphics");
          const importer = page.getByTestId("studio-graphics-import");
          if (!await importer.evaluate(e => e.open)) await importer.locator("summary").click();
          await page.getByLabel("Graphics composition file", { exact: true }).setInputFiles(path.join(root, config.additionalGraphics));
          await importer.getByRole("status").waitFor();
          const status = await importer.getByRole("status").innerText();
          assert(status.includes("imported."), status);
          if (config.moveAddedLayerBehindVideo) {
            await q.tool(page, "Motion");
            await page.getByRole("button", { name:"Logo & layers", exact:true }).click();
            await page.getByRole("button", { name:`Move ${config.moveAddedLayerBehindVideo} down`, exact:true }).click();
          }
          const amended = await h.save(page, "additional-graphics");
          const backdrop = amended.snapshot.overlays.find(o => o.name === config.moveAddedLayerBehindVideo);
          const result = amended.snapshot.overlays.find(o => o.type === "video");
          assert(backdrop && result);
          assert(amended.snapshot.compositionOrder.indexOf(backdrop.id) < amended.snapshot.compositionOrder.indexOf(result.id));
        }
        if (config.voiceSource) {
          await q.tool(page, "Sound");
          const start = page.getByLabel(`Start for ${path.basename(config.voiceSource)}`, { exact: true });
          await start.fill("0"); await start.blur();
        }
        prepared = await h.save(page, "prepared-resumed");
      } else {
      if (config.sourceProjectBackup) {
        await page.waitForFunction(() =>
          document.querySelector('[aria-label="Restore project backup"]')?.disabled === false);
        await page.getByLabel("Restore project backup", { exact: true })
          .setInputFiles(path.join(root, config.sourceProjectBackup));
        await page.getByRole("button", { name: config.projectName, exact: true }).click();
        await h.rail(page); await pause(page);
        verifyKeys(await h.save(page, "source-resumed"), "main-video", config.camera);
      } else {
      if (config.sequenceBackup) {
        const sequenceFile = path.join(root, config.sequenceBackup);
        const sequence = read(sequenceFile);
        await page.waitForFunction(() => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false);
        await page.getByLabel("Restore project backup", { exact: true }).setInputFiles(sequenceFile);
        await page.getByRole("button", { name: sequence.name, exact: true }).click();
        await h.rail(page); await pause(page);
        const restoredSequence = await h.save(page, "sequence-restored");
        assert.equal(hash(restoredSequence.snapshot.studioDocument), hash(sequence.snapshot.studioDocument));
      } else {
      await page.locator(".creator-studio-dropzone input").setInputFiles(path.join(root, config.source));
      await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
      await h.rail(page); await pause(page);
      await page.getByLabel("Project name", { exact: true }).fill(config.projectName);
      await page.getByRole("tab", { name: "Media", exact: true }).click();
      const card = page.locator(".studio-media-card").filter({ has: page.getByRole("button", {
        name: `Preview ${path.basename(config.source)}`, exact: true,
      }) });
      await card.getByText("Saved · ready to edit", { exact: true }).waitFor({ timeout: 120000 });
      await card.getByRole("button", { name: "Replace entire sequence", exact: true }).click();
      await q.tool(page, "Color");
      const rounded = page.getByLabel("Rounded main footage", { exact: true });
      if (await rounded.isChecked()) await rounded.uncheck();
      await seek(page, config.sourceStart + (config.sourceDuration || config.duration));
      await page.getByTestId("pro-quick-trim-end").click();
      if (config.sourceStart > 0) {
        await seek(page, config.sourceStart);
        await page.getByTestId("pro-quick-trim-start").click();
      }
      const source = await h.save(page, "source-trimmed");
      assert.equal(source.snapshot.timeline.length, 1);
      assert(Math.abs(source.snapshot.timeline[0].startRequest - config.sourceStart) < 1 / 90000);
      assert.equal(source.snapshot.mainFrame.enabled, false);
      assert.equal(source.snapshot.smartCrop, false);
      console.log("Original recording loaded with its exact native trim.");
      let programmeEnd = config.sourceDuration || config.duration;
      for (const [index, clip] of (config.appendClips || []).entries()) {
        await h.rail(page);
        await page.getByRole("tab", { name: "Media", exact: true }).click();
        await page.getByTestId("project-media-import-input").setInputFiles(path.join(root, clip.file));
        const scene = page.locator(".studio-media-card").filter({ has: page.getByRole("button", {
          name: `Preview ${path.basename(clip.file)}`, exact: true,
        }) });
        await scene.getByText("Saved · ready to edit", { exact: true }).waitFor({ timeout: 120000 });
        await scene.getByRole("button", { name: "Add to sequence", exact: true }).click();
        await seek(page, programmeEnd + clip.duration);
        await page.getByTestId("pro-quick-trim-end").click();
        programmeEnd += clip.duration;
        const appended = await h.save(page, `scene-${index + 1}`);
        assert.equal(appended.snapshot.timeline.length, index + 2);
      }
      assert(Math.abs(programmeEnd - config.duration) < 1 / 90000);
      }
      await backup(page, "SEQUENCE.autopromote.json");
      await seek(page, 0);
      await page.waitForFunction(({ width, height }) => {
        const video = document.querySelector('[data-testid="studio-after-video"]');
        return video && video.readyState >= 2 && video.videoWidth === width && video.videoHeight === height;
      }, { width: config.width, height: config.height }, { timeout: 90000 });
      await q.tool(page, "Graphics");
      const importer = page.getByTestId("studio-graphics-import");
      if (!await importer.evaluate(e => e.open)) await importer.locator("summary").click();
      await page.getByLabel("Graphics composition file", { exact: true })
        .setInputFiles(path.join(root, config.graphics));
      await importer.getByRole("status").waitFor();
      const importedStatus = await importer.getByRole("status").innerText();
      assert(importedStatus.includes("imported."), importedStatus);
      const graphics = await h.save(page, "graphics-imported");
      await page.getByTestId("studio-undo-button").click();
      assert.equal((await h.save(page, "graphics-undone")).snapshot.overlays.length, 0);
      await page.getByTestId("studio-redo-button").click();
      assert.equal((await h.save(page, "graphics-redone")).snapshot.overlays.length,
        graphics.snapshot.overlays.length);
      await q.tool(page, "Motion");
      await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
      await keyframes(page, "Source video", config.camera);
      const camera = await h.save(page, "source-focus");
      verifyKeys(camera, "main-video", config.camera);
      console.log("Native timeline focus keys saved.");
      }
      await seek(page, 0);
      await q.tool(page, "B-roll");
      await page.getByTestId("broll-video-input").setInputFiles(path.join(root, config.movie));
      const start = page.locator(".inspector-time-grid").getByLabel("Start", { exact: true });
      await start.fill(String(config.resultStart || 0)); await start.blur();
      await page.getByLabel("B-roll duration", { exact: true })
        .fill(String((config.resultDuration || config.duration) - (config.resultStart || 0)));
      await page.getByLabel("B-roll duration", { exact: true }).press("Enter");
      await range(page.getByLabel("B-roll source start", { exact: true }), 0);
      await page.getByRole("button", { name: "Picture-in-picture", exact: true }).click();
      await page.getByRole("button", { name: "Keep original", exact: true }).click();
      const uploaded = await h.save(page, "result-imported");
      const video = uploaded.snapshot.overlays.find(o => o.type === "video");
      assert(video);
      await q.tool(page, "Motion");
      await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
      await page.locator(".inspector-select-field").filter({ hasText: "Target layer" })
        .locator("select").first().selectOption(video.id);
      for (const [label, value] of [["width", 100], ["height", 90]]) {
        const input = page.getByLabel(`Motion layer ${label}`, { exact: true });
        await input.fill(String(value)); await input.blur();
      }
      await keyframes(page, video.name || video.file.name, config.result);
      prepared = await h.save(page, "prepared");
      verifyKeys(prepared, video.id, config.result);
      if (config.voiceSource) {
        const voiceFile = path.join(root, config.voiceSource);
        const deadline = Date.now() + 120000;
        while (!fs.existsSync(path.join(path.dirname(voiceFile), "narration-receipt.json")) && Date.now() < deadline)
          await page.waitForTimeout(500);
        await q.tool(page, "Sound");
        await page.getByTestId("voiceover-recording-input").setInputFiles(voiceFile);
        const voiceStart = page.getByLabel(`Start for ${path.basename(voiceFile)}`, { exact: true });
        await voiceStart.fill("0"); await voiceStart.blur();
        const originalAudio = page.getByRole("checkbox", { name: /^Keep original audio/ });
        if (await originalAudio.isChecked()) await originalAudio.uncheck();
        await page.getByTestId("background-sound-input").setInputFiles(path.join(root, config.soundSource));
        const duck = page.getByLabel(/Duck under speech/);
        if (config.musicDucking === false) {
          if (await duck.isChecked()) await duck.uncheck();
        } else if (!await duck.isChecked()) await duck.check();
        const loop = page.getByLabel(/Loop for the full clip/);
        if (!await loop.isChecked()) await loop.check();
        await range(page.locator(".inspector-range").filter({ hasText: "Background volume" })
          .locator("input[type=range]"), config.musicVolume ?? 15);
        prepared = await h.save(page, "narrated");
      }
      }
      verifyKeys(prepared, "main-video", config.camera);
      const result = prepared.snapshot.overlays.find(o => o.type === "video");
      assert(result && result.width === 100 && result.height === 90);
      assert(Math.abs(result.startTime - (config.resultStart || 0)) < 1 / 90000);
      verifyKeys(prepared, result.id, config.result);
      if (config.voiceSource) {
        assert.equal(prepared.snapshot.voiceovers.length, 1);
        assert.equal(prepared.snapshot.voiceovers[0].startTime, 0);
      }
      if (config.duplicateBeforeBackup) {
        const authored = prepared;
        await page.getByRole("button", { name: "Duplicate", exact: true }).first().click();
        await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(" copy"));
        await page.getByLabel("Project name", { exact: true }).fill(config.projectName);
        prepared = await h.save(page, "delivery-copy");
        assert.notEqual(prepared.id, authored.id);
        assert.deepEqual(prepared.snapshot.motionKeyframes, authored.snapshot.motionKeyframes);
        assert.equal(prepared.snapshot.overlays.length, authored.snapshot.overlays.length);
        console.log("Native delivery duplicate preserves the edit with a compact version history.");
      }
      await backup(page, "PRESENTATION-before-export.autopromote.json");
      await page.reload();
      await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
      await page.getByRole("button", { name: config.projectName, exact: true }).click();
      await h.rail(page); await pause(page);
      const reopened = await h.save(page, "cold-reopened");
      assert.equal(hash(prepared.snapshot.studioDocument), hash(reopened.snapshot.studioDocument));
      await q.tool(page, "Export");
      await page.locator("body").click({ position: { x: 1, y: 1 } });
      await page.keyboard.press("Escape");
      for (const time of config.poses) {
        await seek(page, time);
        await page.getByTestId("hook-preview-frame")
          .screenshot({ path: path.join(folder, `live-${time}.png`) });
      }
      fs.writeFileSync(path.join(folder, "native-edit.json"), JSON.stringify({
        projectId: reopened.id, canonicalHash: hash(reopened.snapshot.studioDocument),
        source: config.source, movie: config.movie, sourceStart: config.sourceStart,
        sourceSha256: hash(fs.readFileSync(path.join(root, config.source))),
        resultSha256: hash(fs.readFileSync(path.join(root, config.movie))),
        cameraKeys: config.camera.length * 3, resultKeys: config.result.length * 4,
        totalKeys: reopened.snapshot.motionKeyframes.length,
        nativeControlsOnly: true, graphInjection: false, exactColdReopen: true,
        importUndoRedo: true, originalFullRecordingPreserved: true,
        sameClockResultInsert: true, publishingWrites,
        status: "ACTUAL_POSES_READY_FOR_REVIEW",
      }, null, 2));
      assert.equal(submissions, 0);
      console.log("Native full-result / whole-Studio / timeline-focus presentation ready for review.");
    }
    if (action !== "prepare") {
      const edit = read(path.join(folder, "native-edit.json"));
      if (action === "all") {
        const deadline = Date.now() + 15 * 60 * 1000;
        while (!fs.existsSync(path.join(folder, "visual-review.json")) && Date.now() < deadline)
          await page.waitForTimeout(1000);
      }
      const review = read(path.join(folder, "visual-review.json"));
      assert(review.accepted && review.canonicalHash === edit.canonicalHash);
      if (action !== "all") {
      await page.waitForFunction(() =>
        document.querySelector('[aria-label="Restore project backup"]')?.disabled === false);
      await page.getByLabel("Restore project backup", { exact: true })
        .setInputFiles(path.join(folder, "PRESENTATION-before-export.autopromote.json"));
      await page.getByRole("button", { name: config.projectName, exact: true }).click();
      await h.rail(page); await pause(page);
      assert.equal(hash((await h.save(page, "reviewed")).snapshot.studioDocument), edit.canonicalHash);
      }
      if (["render", "all"].includes(action)) {
        assert(!fs.existsSync(path.join(folder, `${config.output}-render-request.private.json`)),
          "Accepted request exists; recover that job instead");
        await h.render(page, config.output);
      } else {
        const completed = read(path.join(folder, config.output, "native-render-completed.json"));
        const identity = { projectId: completed.projectId, projectHash: completed.projectHash,
          submittedJobId: completed.submittedJobId, outputSha256: completed.serverOutputSha256 };
        const file = path.join(folder, "observed-completion-identity.json");
        fs.writeFileSync(file, JSON.stringify(identity), { mode: 0o600 });
        await q.tool(page, "Export");
        await page.getByLabel("Restore export receipt", { exact: true }).setInputFiles(file);
        await page.getByTestId("rendered-output-ready").waitFor({ timeout: 120000 });
        await h.recover(page, config.output);
      }
      await require("../creative-templates/materials-editing-proof").view(page, config.output);
      await backup(page, "PRESENTATION.autopromote.json");
      const receipt = read(path.join(folder, config.output, "render-receipt.json"));
      const finalBackup = read(path.join(folder, "PRESENTATION.autopromote.json"));
      assert.equal(hash(finalBackup.snapshot.studioDocument), receipt.projectHash);
      assert.deepEqual(finalBackup.snapshot.motionKeyframes,
        read(path.join(folder, `${config.output}-render-request.private.json`))
          .options.viralData.editor_timeline.motion_keyframes);
      assert.equal(submissions, ["render", "all"].includes(action) ? 1 : 0);
      fs.writeFileSync(path.join(folder, "delivery.json"), JSON.stringify({ ...edit,
        status: "EXPORTED_NATIVE_PLAYBACK_VERIFIED", canonicalHashBeforeMaterialization: edit.canonicalHash,
        canonicalHash: receipt.projectHash, outputSha256: receipt.outputSha256,
        submittedJobId: receipt.submittedJobId, scheduled: false, gpuJobs: 0,
        movie: path.relative(root, path.join(folder, config.output, "final.mp4")),
      }, null, 2));
      console.log("Presentation exported, fully decoded and played beside its editable native timeline.");
    }
    assert.equal(publishingWrites.length, 0);
  } catch (error) {
    await page.screenshot({ path: path.join(folder, `failure-${Date.now()}.png`) }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
