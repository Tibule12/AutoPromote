#!/usr/bin/env node
// Every edit is an ordinary signed-in Studio control or graphics import.
// Public delivery is only the final film; timeline recordings remain private.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const run = path.resolve(
  process.env.STUDIO_SCHEDULE_TREATMENT_DIR ||
    path.join(root, "reports/daily-studio/2026-10-17/schedule-tour/creative-v1")
);
const folder = path.join(run, "proof");
fs.mkdirSync(folder, { recursive: true });
Object.assign(process.env, {
  STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_TIMELINE_HEIGHT: "430",
  STUDIO_QA_HIDE_MEDIA: "1",
});
const { pause, seek, range } = require("../studio-professional/kinetic-type-proof");
Object.assign(process.env, {
  STUDIO_QA_EXPORT_RESOLUTION: "source",
  STUDIO_QA_EXPECTED_WIDTH: "1600",
  STUDIO_QA_EXPECTED_HEIGHT: "1000",
  STUDIO_QA_EXPORT_FPS: "24",
});
const h = require("../creative-templates/studio-proof");
const q = require("../../test/e2e/playwright/studio-stability/run");
const { chromium } = require("playwright");
const { hash } = require("../../src/creativeTemplates/contract");
const design = JSON.parse(fs.readFileSync(path.join(run, "design.json")));
const read = file => JSON.parse(fs.readFileSync(file));
const decisionHash = doc => {
  const { revision: _revision, journal: _journal, idempotency: _idempotency, ...decisions } = doc;
  return hash(decisions);
};
async function open(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
  await h.rail(page);
  await pause(page);
}
async function backup(page, file) {
  await h.rail(page);
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project backup", exact: true }).click();
  await (await waiting).saveAs(file);
  fs.chmodSync(file, 0o600);
}
async function recover(page) {
  // This file is an observation of the original owned terminal job, not a
  // manufactured acknowledgement. The ordinary receipt control rechecks it.
  const completed = read(path.join(folder, "observed-completion.private.json"));
  assert.equal(completed.status, "completed");
  const packaged = path.join(folder, "IN-CONTROL-before-export.autopromote.json");
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Restore project backup"]')?.disabled === false);
  await page.getByLabel("Restore project backup", { exact: true }).setInputFiles(packaged);
  await open(page, design.projectName);
  const restored = await h.save(page, "recovery-restored");
  const original = read(path.join(folder, "native-edit.json"));
  assert.equal(restored.id, original.projectId);
  assert.equal(hash(restored.snapshot.studioDocument), original.canonicalHash);
  const request = read(path.join(folder, `${design.output}-render-request.private.json`));
  assert.deepEqual(request.options.viralData.editor_timeline.motion_keyframes,
    restored.snapshot.motionKeyframes, "Recover the exact authored key tuples");
  const identity = { projectId: restored.id, projectHash: original.canonicalHash,
    submittedJobId: completed.jobId,
    outputSha256: completed.result?.outputSha256 || completed.outputSha256 };
  const identityFile = path.join(folder, "observed-completion-identity.json");
  fs.writeFileSync(identityFile, JSON.stringify(identity), { mode: 0o600 });
  await q.tool(page, "Export");
  await page.getByLabel("Restore export receipt", { exact: true }).setInputFiles(identityFile);
  await page.getByTestId("rendered-output-ready").waitFor({ timeout: 120000 });
  await h.recover(page, design.output);
  await require("../creative-templates/materials-editing-proof").view(page, design.output);
  await backup(page, path.join(folder, "IN-CONTROL.autopromote.json"));
  const receipt = read(path.join(folder, design.output, "render-receipt.json"));
  assert.equal(receipt.projectHash, original.canonicalHash);
  fs.writeFileSync(path.join(folder, "delivery.json"), JSON.stringify({ ...original,
    status: "EXPORTED_NATIVE_PLAYBACK_VERIFIED", canonicalHash: receipt.projectHash,
    movie: path.relative(root, path.join(folder, design.output, "final.mp4")),
    movieSha256: receipt.outputSha256, submittedJobId: receipt.submittedJobId,
    recoveredSameAcceptedJob: true, exactPreMaterializationGraphRecovered: true,
    nativeCompletePlayback: true, publicTimelineRecording: false, scheduled: false,
    gpuJobs: 0, providerPublicationClaimed: false,
  }, null, 2));
  console.log("Same accepted schedule film recovered, decoded and played in native Studio.");
}
async function main() {
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: ["--mute-audio", "--host-resolver-rules=MAP localhost 127.0.0.1"],
  });
  const context = await browser.newContext({
    storageState: path.join(root, require("../../config/daily-studio.json").authState),
    viewport: { width: 1920, height: 1200 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  let renders = 0;
  const publishingWrites = [];
  page.on("request", request => {
    const p = new URL(request.url()).pathname;
    if (p === "/api/media/process" && request.method() === "POST") renders++;
    if (
      p.startsWith("/api/content/") &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())
    )
      publishingWrites.push(p);
  });
  try {
    await page.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
    assert(!(await page.evaluate(() => !!window.__E2E_BYPASS)));
    if (process.argv[2] === "recover") {
      await recover(page);
      assert.equal(renders, 0);
      assert.equal(publishingWrites.length, 0);
      return;
    }
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false
    );
    await page
      .getByLabel("Restore project backup", { exact: true })
      .setInputFiles(path.join(root, design.source));
    const original = read(path.join(root, design.source));
    await open(page, original.name);
    await page.getByRole("button", { name: "Duplicate", exact: true }).first().click();
    await page.waitForFunction(() =>
      document.querySelector('[aria-label="Project name"]')?.value.endsWith(" copy")
    );
    await page.getByLabel("Project name", { exact: true }).fill(design.projectName);
    const base = await h.save(page, "duplicated");
    assert.notEqual(base.id, original.id);
    assert.equal(base.snapshot.voiceovers.length, 1);
    assert.equal(base.snapshot.overlays.length, 0);
    assert.equal(base.snapshot.mainFrame.enabled, false);
    assert.equal(base.snapshot.smartCrop, false);
    await seek(page, 0);
    await q.tool(page, "Graphics");
    const importer = page.getByTestId("studio-graphics-import");
    if (!(await importer.evaluate(element => element.open)))
      await importer.locator("summary").click();
    await page
      .getByLabel("Graphics composition file", { exact: true })
      .setInputFiles(path.join(run, "assets/graphics.json"));
    await importer.getByRole("status").waitFor();
    assert(
      (await importer.getByRole("status").innerText()).includes("imported."),
      await importer.getByRole("status").innerText()
    );
    const imported = await h.save(page, "graphics-imported");
    assert.equal(imported.snapshot.overlays.length, design.layers);
    assert.equal(imported.snapshot.motionKeyframes.length, design.graphicKeys);
    await page.getByTestId("studio-undo-button").click();
    assert.equal((await h.save(page, "graphics-undone")).snapshot.overlays.length, 0);
    await page.getByTestId("studio-redo-button").click();
    assert.equal(
      decisionHash((await h.save(page, "graphics-redone")).snapshot.studioDocument),
      decisionHash(imported.snapshot.studioDocument)
    );
    console.log("Editable graphic layers imported; native Undo/Redo verified.");

    if (design.camera.length) {
      // Native source transform keys steer attention; the calendar returns to 1x.
      await q.tool(page, "Motion");
      await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
      await seek(page, 0);
      const timeline = page.getByTestId("studio-pro-timeline");
      await timeline.getByRole("button", { name: "Sequence tracks", exact: true }).click();
      const show = timeline.getByRole("button", { name: "Show motion keyframes", exact: true });
      if (await show.isVisible()) await show.click();
      const expand = timeline.getByRole("button", {
        name: "Expand Source video keyframes",
        exact: true,
      });
      if (await expand.isVisible()) await expand.click();
      for (const property of ["x", "y", "scale"])
        await timeline
          .getByRole("button", {
            name: `Add Source video ${property} keyframe at playhead`,
            exact: true,
          })
          .click();
      for (const [time, x, y, scale] of design.camera) {
        await seek(page, time);
        for (const [property, value] of Object.entries({ x, y, scale })) {
          const input = page.getByLabel(`Source video ${property} value`, { exact: true });
          await input.fill(String(value));
          await input.press("Enter");
          await input.blur();
          // An unchanged evaluated value is a no-op edit. Add its explicit hold
          // key through the native property control so the camera cannot drift.
          const add = timeline.getByRole("button", {
            name: `Add Source video ${property} keyframe at playhead`,
            exact: true,
          });
          if (await add.isVisible()) await add.click();
        }
      }
      const camera = await h.save(page, "camera-keyed");
      for (const [time, x, y, scale] of design.camera)
        for (const [property, value] of Object.entries({ x, y, scale })) {
          const key = camera.snapshot.motionKeyframes.find(
            key =>
              key.targetId === "main-video" &&
              key.property === property &&
              Math.abs(key.time - time) < 1 / 90000
          );
          assert(
            key && Math.abs(key.value - value) < 0.001,
            `Missing native camera ${property} at ${time}`
          );
        }
      console.log("Native source camera keys authored; full calendar remains at 1x.");
    }
    await q.tool(page, "Sound");
    const voiceSource = design.voiceSource
      ? path.join(root, design.voiceSource)
      : path.join(run, "narration/narration.wav");
    const voiceReady = path.join(path.dirname(voiceSource), "narration-receipt.json");
    const voiceDeadline = Date.now() + 120000;
    while (!fs.existsSync(voiceReady) && Date.now() < voiceDeadline) await page.waitForTimeout(500);
    assert(fs.existsSync(voiceReady), "Wait for the reviewed narration source receipt");
    await page.getByRole("button", { name: "Remove take", exact: true }).click();
    await page.getByTestId("voiceover-recording-input").setInputFiles(voiceSource);
    await page
      .getByLabel("Name for narration.wav", { exact: true })
      .fill("Less time posting — creator narration");
    await page
      .getByLabel("Start for Less time posting — creator narration", { exact: true })
      .fill("0");
    await page
      .getByTestId("background-sound-input")
      .setInputFiles(
        design.soundSource
          ? path.join(root, design.soundSource)
          : path.join(run, "assets/Original-schedule-motion.wav")
      );
    const duck = page.getByLabel(/Duck under speech/);
    if (!(await duck.isChecked())) await duck.check();
    const loop = page.getByLabel(/Loop for the full clip/);
    if (await loop.isChecked()) await loop.uncheck();
    await range(
      page
        .locator(".inspector-range")
        .filter({ hasText: "Background volume" })
        .locator("input[type=range]"),
      18
    );
    await range(page.getByLabel("Music fade in", { exact: true }), 0.15);
    await range(page.getByLabel("Music fade out", { exact: true }), 0.5);
    if (design.videoInsert) {
      const insert = design.videoInsert;
      await seek(page, insert.start);
      await q.tool(page, "B-roll");
      await page.getByTestId("broll-video-input").setInputFiles(path.join(root, insert.file));
      const startInput = page.locator(".inspector-time-grid").getByLabel("Start", { exact: true });
      await startInput.fill(String(insert.start));
      await startInput.blur();
      await page.getByLabel("B-roll duration", { exact: true }).fill(String(insert.duration));
      await page.getByLabel("B-roll duration", { exact: true }).press("Enter");
      await range(page.getByLabel("B-roll source start", { exact: true }), insert.sourceStart);
      await page.getByRole("button", { name: "Picture-in-picture", exact: true }).click();
      await page.getByRole("button", { name: "Keep original", exact: true }).click();
      const media = await h.save(page, "real-video-imported");
      const video = media.snapshot.overlays.find(layer => layer.type === "video");
      assert(video);
      await q.tool(page, "Motion");
      await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
      const target = page
        .locator(".inspector-select-field")
        .filter({ hasText: "Target layer" })
        .locator("select")
        .first();
      await target.selectOption(video.id);
      for (const [name, value] of [
        ["width", insert.width],
        ["height", insert.height],
      ]) {
        const input = page.getByLabel(`Motion layer ${name}`, { exact: true });
        await input.fill(String(value));
        await input.blur();
      }
      const t = page.getByTestId("studio-pro-timeline");
      await t.getByRole("button", { name: "Sequence tracks", exact: true }).click();
      const show = t.getByRole("button", { name: "Show motion keyframes", exact: true });
      if (await show.isVisible()) await show.click();
      const label = video.name || video.file?.name || "Visual layer";
      const expand = t.getByRole("button", { name: `Expand ${label} keyframes`, exact: true });
      if (await expand.isVisible()) await expand.click();
      for (const [property, value] of Object.entries({
        x: insert.x,
        y: insert.y,
        scale: 1,
        opacity: 1,
        rotation: 0,
      })) {
        const input = page.getByLabel(`${label} ${property} value`, { exact: true });
        await input.fill(String(value));
        await input.press("Enter");
        await input.blur();
      }
      const positioned = await h.save(page, "real-video-positioned");
      const savedVideo = positioned.snapshot.overlays.find(layer => layer.id === video.id);
      assert.equal(savedVideo.width, insert.width);
      assert.equal(savedVideo.height, insert.height);
      assert(Math.abs(savedVideo.startTime - insert.start) < 0.1);
      assert(Math.abs(savedVideo.duration - insert.duration) < 0.05);
      console.log("Actual owned finished movie placed through native B-roll controls.");
    }
    await h.rail(page);
    const before = await h.save(page, "authored");
    await page.reload();
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
    await open(page, design.projectName);
    const reopened = await h.save(page, "cold-reopened");
    assert.equal(hash(reopened.snapshot.studioDocument), hash(before.snapshot.studioDocument));
    const separator = page.getByRole("separator", { name: "Resize timeline", exact: true });
    await separator.focus();
    for (let i = 0; i < 30; i++) {
      const value = Number(await separator.getAttribute("aria-valuenow"));
      if (Math.abs(value - 430) < 24) break;
      await separator.press(value < 430 ? "ArrowUp" : "ArrowDown");
    }
    await page.keyboard.press("Escape");
    const hide = page.getByRole("button", { name: "Hide media", exact: true });
    if (await hide.isVisible()) await hide.click();
    const poses = design.poses || [
      0.15, 0.95, 2.2, 3.45, 5.2, 8.8, 11.7, 13.3, 15.9, 18.6, 22.4, 26.2, 29.7, 30.9,
    ];
    for (const time of poses) {
      await seek(page, time);
      await page
        .getByTestId("hook-preview-frame")
        .screenshot({ path: path.join(folder, `live-${time}.png`) });
    }
    await backup(page, path.join(folder, "IN-CONTROL-before-export.autopromote.json"));
    const edit = {
      projectId: reopened.id,
      canonicalHash: hash(reopened.snapshot.studioDocument),
      originalProjectPreserved: original.id,
      nativeDuplicate: true,
      graphicsImportUndoRedo: true,
      layers: design.layers,
      graphicKeys: design.graphicKeys,
      totalKeys: reopened.snapshot.motionKeyframes.length,
      cameraPoses: design.camera.length,
      nativeCameraKeys: design.camera.length > 0,
      actualScheduleCardLayers: !!design.actualCardsAndCaptions,
      nativeRealMovieInsert: !!design.videoInsert,
      originalSoundImported: true,
      originalNarrationPreservedInEarlierProject: true,
      newPainToPayoffNarration: true,
      exactColdReopen: true,
      graphInjection: false,
      publicTimelineRecording: false,
      publishingWrites,
      status: "ACTUAL_POSES_READY_FOR_REVIEW",
      poses,
    };
    fs.writeFileSync(path.join(folder, "native-edit.json"), JSON.stringify(edit, null, 2));
    assert.equal(publishingWrites.length, 0);
    console.log("Actual preview poses ready; waiting for local visual-review receipt.");
    const reviewFile = path.join(folder, "visual-review.json");
    const deadline = Date.now() + 15 * 60 * 1000;
    while (!fs.existsSync(reviewFile) && Date.now() < deadline) await page.waitForTimeout(1000);
    assert(
      fs.existsSync(reviewFile),
      "Retain edit for review; do not export an unchecked treatment"
    );
    const review = read(reviewFile);
    assert(review.accepted && review.canonicalHash === edit.canonicalHash);
    const current = await h.save(page, "reviewed");
    assert.equal(hash(current.snapshot.studioDocument), edit.canonicalHash);
    await h.render(page, design.output);
    await require("../creative-templates/materials-editing-proof").view(page, design.output);
    await backup(page, path.join(folder, "IN-CONTROL.autopromote.json"));
    const final = read(path.join(folder, "IN-CONTROL.autopromote.json"));
    const receipt = read(path.join(folder, design.output, "render-receipt.json"));
    assert.equal(hash(final.snapshot.studioDocument), receipt.projectHash);
    assert.equal(publishingWrites.length, 0);
    assert.equal(renders, 1);
    fs.writeFileSync(
      path.join(folder, "delivery.json"),
      JSON.stringify(
        {
          ...edit,
          status: "EXPORTED_NATIVE_PLAYBACK_VERIFIED",
          canonicalHash: receipt.projectHash,
          movie: path.relative(root, path.join(folder, design.output, "final.mp4")),
          movieSha256: receipt.outputSha256,
          submittedJobId: receipt.submittedJobId,
          nativeCompletePlayback: true,
          publicTimelineRecording: false,
          scheduled: false,
          gpuJobs: 0,
          providerPublicationClaimed: false,
        },
        null,
        2
      )
    );
    console.log(
      JSON.stringify({
        final: path.relative(root, path.join(folder, design.output, "final.mp4")),
        hash: receipt.outputSha256,
        timelinePublic: false,
      })
    );
  } catch (error) {
    await page.screenshot({ path: path.join(folder, `failure-${Date.now()}.png`) }).catch(() => {});
    console.error(error.stack);
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch(() => {
  process.exitCode = 1;
});
