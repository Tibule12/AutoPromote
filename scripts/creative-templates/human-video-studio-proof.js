#!/usr/bin/env node
// This imports one already-generated source through the ordinary signed-in App.
// No generation submission, project injection, mocks or publishing endpoints.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const directory = path.join(root, "reports/studio-human-demo-20261017");
const folder = path.join(directory, "proof");
Object.assign(process.env, {
  STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_TIMELINE_HEIGHT: "440",
  STUDIO_QA_HIDE_MEDIA: "1",
});
const { pause, seek, recording } = require("../studio-professional/kinetic-type-proof");
const h = require("./studio-proof");
const q = require("../../test/e2e/playwright/studio-stability/run");
const { hash } = require("../../src/creativeTemplates/contract");
const { chromium } = require("playwright");
const originalName = "Creator at laptop — AI-human speech test";
const cleanDialogue = process.env.STUDIO_HUMAN_CLEAN_DIALOGUE === "1";
const name = cleanDialogue ? "Creator at laptop — original generated dialogue" : originalName;
const slug = cleanDialogue ? "human-test-clean-dialogue" : "human-test";
const decisions = doc => {
  const { revision: _revision, journal: _journal, idempotency: _idempotency, ...rest } = doc;
  return hash(rest);
};
async function open(page, title = name) {
  await page.getByRole("button", { name: title, exact: true }).click();
  await h.rail(page);
  await pause(page);
}
async function bypassRepair(page) {
  assert(cleanDialogue, "Use STUDIO_HUMAN_CLEAN_DIALOGUE=1 for the separate clean project");
  assert(
    !fs.existsSync(path.join(folder, "clean-dialogue-native-design.json")),
    "Preserve the completed correction"
  );
  await open(page, originalName);
  const original = await h.save(page, "restored-voice-original-preserved");
  await page.getByRole("button", { name: "Duplicate", exact: true }).first().click();
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Project name"]')?.value.endsWith(" copy")
  );
  await page.getByLabel("Project name", { exact: true }).fill(name);
  const stop = await recording(page);
  try {
    await q.tool(page, "Sound");
    const before = await h.save(page, "before-voice-bypass");
    await page.getByLabel("Use voice repair on export", { exact: true }).uncheck();
    const after = await h.save(page, "voice-bypass");
    assert.equal(after.snapshot.audioRestoration.enabled, false);
    await page.getByTestId("studio-undo-button").click();
    assert.equal(
      decisions((await h.save(page, "voice-bypass-undone")).snapshot.studioDocument),
      decisions(before.snapshot.studioDocument)
    );
    await page.getByTestId("studio-redo-button").click();
    assert.equal(
      decisions((await h.save(page, "voice-bypass-redone")).snapshot.studioDocument),
      decisions(after.snapshot.studioDocument)
    );
  } finally {
    await stop();
  }
  const saved = await h.save(page, "clean-dialogue-final");
  assert.notEqual(saved.id, original.id);
  await page.reload();
  await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
  await open(page);
  const reopened = await h.save(page, "clean-dialogue-reopened");
  assert.equal(hash(saved.snapshot.studioDocument), hash(reopened.snapshot.studioDocument));
  fs.writeFileSync(
    path.join(folder, "clean-dialogue-native-design.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        projectId: reopened.id,
        canonicalHash: hash(reopened.snapshot.studioDocument),
        preservedOriginalProjectId: original.id,
        preservedOriginalProjectHash: hash(original.snapshot.studioDocument),
        sourceSha256: hash(fs.readFileSync(path.join(folder, "generated-human.mp4"))),
        nativeVoiceRepairBypassUndoRedo: true,
        exactColdReopen: true,
        voiceRepairEnabled: false,
        sourceAudioMuted: false,
        editableTitles: 3,
        sourceClips: 1,
        seconds: 8,
        graphInjection: false,
        authBypass: false,
      },
      null,
      2
    )
  );
  console.log(
    "Separate clean-dialogue project saved, bypass/history and exact cold reopen passed."
  );
}
async function edit(page) {
  assert(!fs.existsSync(path.join(folder, "native-design.json")), "Preserve the completed test");
  const exists = page.getByRole("button", { name, exact: true });
  if (await exists.count()) await open(page);
  else {
    await page.locator(".creator-studio-dropzone input[type=file]").setInputFiles({
      name: "AI-creator-speech-test.mp4",
      mimeType: "video/mp4",
      buffer: fs.readFileSync(path.join(folder, "generated-human.mp4")),
    });
    console.log("Normal source upload started; waiting for its real preview validation.");
    await page
      .getByRole("button", { name: "Open Creator Studio", exact: true })
      .waitFor({ timeout: 360000 });
    await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
    await h.rail(page);
    await pause(page);
    await page.getByLabel("Project name", { exact: true }).fill(name);
    await h.save(page, "source-imported");
  }
  const initial = await h.save(page, "before-dialogue");
  assert.equal(initial.snapshot.timeline.length, 1);
  assert.equal(
    initial.snapshot.overlays.length,
    0,
    "Resume manually if an edit is already partial"
  );
  assert.equal(initial.snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick, 8 * 90000);
  assert(!initial.snapshot.muteOriginalAudio, "Keep actual generated dialogue");
  const stop = await recording(page);
  try {
    await q.tool(page, "Reframe");
    await page.getByTestId("reframe-aspect-16-9").click();
    await page.getByTestId("reframe-preserve-frame").click();
    const rounded = page.getByLabel("Rounded main footage", { exact: true });
    if ((await rounded.count()) && (await rounded.isChecked())) await rounded.uncheck();
    await q.tool(page, "Graphics");
    const panel = page.getByTestId("studio-graphics-import");
    if (!(await panel.evaluate(el => el.open))) await panel.locator("summary").click();
    await page
      .getByLabel("Graphics composition file", { exact: true })
      .setInputFiles(path.join(directory, "assets/human-test.graphics.json"));
    await panel.getByRole("status").waitFor();
    assert(
      (await panel.getByRole("status").innerText()).includes("imported."),
      await panel.getByRole("status").innerText()
    );
    const imported = await h.save(page, "dialogue-imported");
    assert.equal(imported.snapshot.overlays.length, 3);
    await page.getByTestId("studio-undo-button").click();
    assert.equal((await h.save(page, "dialogue-undone")).snapshot.overlays.length, 0);
    await page.getByTestId("studio-redo-button").click();
    assert.equal(
      decisions((await h.save(page, "dialogue-redone")).snapshot.studioDocument),
      decisions(imported.snapshot.studioDocument)
    );
    await page
      .locator(".title-layer-list button")
      .filter({ has: page.locator("strong", { hasText: /^Why am I still working\?$/ }) })
      .click();
    const before = await h.save(page, "before-subtitle-edit");
    await page.getByLabel("Title text color", { exact: true }).fill("#e5ddff");
    assert.notEqual(
      decisions((await h.save(page, "subtitle-edited")).snapshot.studioDocument),
      decisions(before.snapshot.studioDocument)
    );
    await page.getByTestId("studio-undo-button").click();
    assert.equal(
      decisions((await h.save(page, "subtitle-undone")).snapshot.studioDocument),
      decisions(before.snapshot.studioDocument)
    );
    for (const time of [0.5, 3.8, 5.9, 7.5]) {
      await seek(page, time);
      await page
        .getByTestId("hook-preview-frame")
        .screenshot({ path: path.join(folder, `live-${time}.png`) });
    }
  } finally {
    await stop();
  }
  const saved = await h.save(page, "final");
  await page.reload();
  await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
  await open(page);
  const reopened = await h.save(page, "reopened");
  assert.equal(hash(saved.snapshot.studioDocument), hash(reopened.snapshot.studioDocument));
  fs.writeFileSync(
    path.join(folder, "native-design.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        projectId: reopened.id,
        canonicalHash: hash(reopened.snapshot.studioDocument),
        sourceSha256: hash(fs.readFileSync(path.join(folder, "generated-human.mp4"))),
        sourceClips: 1,
        editableTitles: 3,
        seconds: 8,
        sourceAudioPreserved: !reopened.snapshot.muteOriginalAudio,
        nativeSourceUpload: true,
        nativeImportUndoRedo: true,
        independentSubtitleEditUndo: true,
        exactColdReopen: true,
        graphInjection: false,
        authBypass: false,
        publicRelease: false,
        generationIntegration:
          "Private Veo source generation; existing normal Studio import and CPU render",
      },
      null,
      2
    )
  );
  console.log(
    "One generated source imported, three native titles edited, history and exact cold reopen passed."
  );
}
async function backup(page) {
  const record = await h.save(page, "delivery");
  const next = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project backup", exact: true }).click();
  const download = await next;
  await download.saveAs(path.join(folder, "AI-human-speech-test.autopromote.json"));
  fs.writeFileSync(
    path.join(folder, "project-backup-receipt.json"),
    JSON.stringify(
      {
        projectId: record.id,
        canonicalHash: hash(record.snapshot.studioDocument),
        backupSha256: hash(
          fs.readFileSync(path.join(folder, "AI-human-speech-test.autopromote.json"))
        ),
        nativeDownload: true,
      },
      null,
      2
    )
  );
}
async function freshRestore() {
  assert(cleanDialogue, "Restore the selected clean-dialogue delivery");
  const backupFile = path.join(folder, "AI-human-speech-test.autopromote.json");
  const original = JSON.parse(fs.readFileSync(backupFile));
  const receipt = JSON.parse(fs.readFileSync(path.join(folder, slug, "render-receipt.json")));
  assert.equal(hash(original.snapshot.studioDocument), receipt.projectHash);
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: ["--mute-audio", "--host-resolver-rules=MAP localhost 127.0.0.1"],
  });
  const context = await browser.newContext({
    storageState: path.join(root, require("../../config/daily-studio.json").authState),
    viewport: { width: 1920, height: 1200 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const writes = [];
  page.on("request", r => {
    const p = new URL(r.url()).pathname;
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) &&
      (p === "/api/media/process" || p.startsWith("/api/content/"))
    )
      writes.push(p);
  });
  try {
    await page.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
    assert(!(await page.evaluate(() => !!window.__E2E_BYPASS)));
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false
    );
    await page.getByLabel("Restore project backup", { exact: true }).setInputFiles(backupFile);
    await open(page);
    const restored = await h.save(page, "fresh-restored-human");
    assert.equal(restored.id, original.id);
    assert.equal(hash(restored.snapshot.studioDocument), receipt.projectHash);
    assert.equal(restored.snapshot.overlays.length, 3);
    assert.equal(restored.snapshot.audioRestoration.enabled, false);
    await seek(page, 5.9);
    await page.screenshot({ path: path.join(folder, "fresh-restored-human.png") });
    assert.equal(writes.length, 0);
    fs.writeFileSync(
      path.join(folder, "fresh-restore-receipt.json"),
      JSON.stringify(
        {
          projectId: restored.id,
          canonicalHash: receipt.projectHash,
          backupSha256: hash(fs.readFileSync(backupFile)),
          exactIndependentNativeRestore: true,
          editableTitles: 3,
          voiceRepairEnabled: false,
          authBypass: false,
          renderingOrPublishingWrites: writes,
        },
        null,
        2
      )
    );
    console.log(
      "Exact selected backup restored through a separate signed-in Studio; no render or publishing writes."
    );
  } finally {
    await browser.close();
  }
}
async function main() {
  const action = process.argv[2] || "edit";
  if (action === "restore") return freshRestore();
  assert(["edit", "clean-dialogue", "render", "recover", "view", "backup"].includes(action));
  const context = await chromium.launchPersistentContext(
    path.join(root, "reports/studio-keyframe-selection-20261015/proof/browser-profile.private"),
    {
      channel: "chromium",
      headless: true,
      args: [
        "--mute-audio",
        "--disk-cache-size=16777216",
        "--host-resolver-rules=MAP localhost 127.0.0.1",
      ],
      viewport: { width: 1920, height: 1200 },
      acceptDownloads: true,
    }
  );
  const page = context.pages()[0];
  page.setDefaultTimeout(60000);
  let submissions = 0;
  page.on("request", r => {
    const p = new URL(r.url()).pathname;
    if (r.method() === "POST" && p === "/api/media/process") submissions++;
    assert(!/predictLongRunning|publisher\/schedule|platform\/post/.test(p));
  });
  try {
    await page.goto("http://localhost:5000/?humanDemo=20261017", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
    await page.getByRole("region", { name: "Saved Studio projects", exact: true }).waitFor();
    assert(!(await page.evaluate(() => !!window.__E2E_BYPASS)));
    if (action === "edit") await edit(page);
    else if (action === "clean-dialogue") await bypassRepair(page);
    else {
      await open(page);
      if (action === "render") {
        assert(
          !fs.existsSync(path.join(folder, slug, "render-receipt.json")),
          "Preserve the existing render"
        );
        await h.render(page, slug);
      } else if (action === "recover") await h.recover(page, slug);
      else if (action === "view") await require("./materials-editing-proof").view(page, slug);
      else await backup(page);
    }
    assert.equal(submissions, action === "render" ? 1 : 0);
  } catch (error) {
    fs.writeFileSync(
      path.join(folder, `${action}-failure-${Date.now()}.private.txt`),
      await page
        .locator("body")
        .innerText()
        .catch(() => "Page unavailable")
    );
    await page
      .screenshot({ path: path.join(folder, `${action}-failure-${Date.now()}.png`) })
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
if (require.main === module)
  main().catch(error => {
    console.error(error.stack);
    process.exitCode = 1;
  });
