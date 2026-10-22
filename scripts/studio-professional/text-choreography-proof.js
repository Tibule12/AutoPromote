#!/usr/bin/env node
// Normal real-auth Studio entry, controls, render and backup; read-only graph
// inspection only. The graphics file is imported through the user-facing UI.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../.."),
  report = path.join(root, "reports/studio-text-choreography-20261018"),
  folder = path.join(report, "proof");
Object.assign(process.env, {
  STUDIO_TEMPLATE_PROOF_DIR: folder,
  STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_EXPECTED_WIDTH: "1280",
  STUDIO_QA_EXPECTED_HEIGHT: "720",
  STUDIO_QA_EXPORT_FPS: "24",
  STUDIO_QA_NATIVE_DOWNLOAD_METHOD: "playwright",
  STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS: "1800000",
  STUDIO_QA_TIMELINE_HEIGHT: "520",
  STUDIO_QA_HIDE_MEDIA: "1",
});
const h = require("../creative-templates/studio-proof"),
  q = require("../../test/e2e/playwright/studio-stability/run");
const { pause, seek, range, recording } = require("./kinetic-type-proof");
const { hash } = require("../../src/creativeTemplates/contract");
const name = "Make them look twice — editable text choreography · 20261018";
const decisions = doc => {
  const { revision, journal, idempotency, ...rest } = doc;
  return hash(rest);
};
async function media(page) {
  const show = page.getByRole("button", { name: "Show media", exact: true });
  if (await show.isVisible()) {
    await show.focus();
    await page.keyboard.press("Enter");
  }
  const head = page.locator(".studio-project-rail__head");
  await head.waitFor({ timeout: 90000 });
  if (!(await head.evaluate(e => e.open))) {
    await head.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
  }
}
async function open(page) {
  const projects = page.getByRole("region", { name: "Saved Studio projects", exact: true });
  await projects.waitFor({ timeout: 90000 });
  await projects.getByRole("button", { name, exact: true }).click();
  await page.getByTestId("studio-pro-timeline").waitFor({ timeout: 90000 });
  await pause(page);
  await media(page);
}
async function sample(page, times, label) {
  await q.tool(page, "Motion");
  await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
  const pathToggle = page.getByRole("button", { name: "⤳ Motion path", exact: true });
  if ((await pathToggle.getAttribute("aria-pressed")) === "true") await pathToggle.click();
  await page.getByTestId("hook-preview-frame").click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(100);
  await page.keyboard.press("Escape");
  await pause(page);
  const observations = [];
  for (const time of times) {
    await seek(page, time);
    await page.waitForTimeout(250);
    await page.evaluate(() => document.fonts.ready);
    const frame = page.getByTestId("hook-preview-frame");
    await frame.locator("img").evaluateAll(es => Promise.all(es.map(e => e.decode())));
    await frame.screenshot({ path: path.join(folder, `${label}-${time}.png`) });
    const titles = await frame
      .locator(".draggable-overlay")
      .evaluateAll(es =>
        es
          .filter(e => e.querySelector(".studio-animated-text"))
          .map(e => ({
            layerId: e.getAttribute("data-studio-layer-id"),
            units: [...e.querySelectorAll("[data-text-unit]")].map(g => ({
              index: Number(g.getAttribute("data-text-unit")),
              transform: g.getAttribute("transform"),
              opacity: Number(g.getAttribute("opacity")),
            })),
          }))
      );
    observations.push({ time, frame: await frame.boundingBox(), titles });
  }
  const saved = await h.save(page, `${label}-binding`);
  fs.writeFileSync(
    path.join(folder, `${label}-samples.json`),
    JSON.stringify(
      { projectId: saved.id, canonicalHash: hash(saved.snapshot.studioDocument), observations },
      null,
      2
    )
  );
}
async function edit(page) {
  assert(!fs.existsSync(path.join(folder, "native-edit.json")), "Preserve the completed edit");
  const projects = page.getByRole("region", { name: "Saved Studio projects", exact: true });
  await projects.waitFor({ timeout: 90000 });
  if (await projects.getByRole("button", { name, exact: true }).count()) await open(page);
  else {
    await page
      .locator(".creator-studio-dropzone input[type=file]")
      .setInputFiles(path.join(report, "assets/Midnight-source.mp4"));
    await page
      .getByRole("button", { name: "Open Creator Studio", exact: true })
      .click({ timeout: 360000 });
    await h.rail(page);
    await pause(page);
    await page.getByLabel("Project name", { exact: true }).fill(name);
  }
  await q.tool(page, "Reframe");
  await page.getByTestId("reframe-aspect-16-9").click();
  await page.getByTestId("reframe-preserve-frame").click();
  const rounded = page.getByLabel("Rounded main footage", { exact: true });
  if ((await rounded.count()) && (await rounded.isChecked())) await rounded.uncheck();
  await q.tool(page, "Sound");
  await page.getByLabel("Use voice repair on export", { exact: true }).uncheck();
  const initial = await h.save(page, "opened-source");
  if (!initial.snapshot.overlays.length) {
    await q.tool(page, "Graphics");
    const panel = page.getByTestId("studio-graphics-import");
    if (!(await panel.evaluate(e => e.open))) await panel.locator("summary").click();
    await page
      .getByLabel("Graphics composition file", { exact: true })
      .setInputFiles(path.join(report, "assets/make-them-look-twice.graphics.json"));
    await panel.getByRole("status").waitFor();
    assert(
      (await panel.getByRole("status").innerText()).includes("imported."),
      await panel.innerText()
    );
    const imported = await h.save(page, "imported");
    assert.equal(imported.snapshot.overlays.length, 51);
    assert.equal(imported.snapshot.overlays.filter(l => l.textAnimator).length, 10);
    await page.getByTestId("studio-undo-button").click();
    assert.equal((await h.save(page, "import-undone")).snapshot.overlays.length, 0);
    await page.getByTestId("studio-redo-button").click();
    assert.equal(
      decisions((await h.save(page, "import-redone")).snapshot.studioDocument),
      decisions(imported.snapshot.studioDocument)
    );
  }
  await q.tool(page, "Sound");
  if (!initial.snapshot.musicTrack)
    await page
      .getByTestId("background-sound-input")
      .setInputFiles(path.join(report, "assets/Make-them-look-twice-original-score.wav"));
  for (const label of ["Keep original audio", "Duck under speech", "Loop for the full clip"]) {
    const input = page.getByLabel(label, { exact: false });
    if (await input.isChecked()) await input.uncheck();
  }
  await range(
    page
      .locator(".inspector-range")
      .filter({ hasText: "Background volume" })
      .locator("input[type=range]"),
    85
  );
  await range(page.getByLabel("Music fade in", { exact: true }), 0.04);
  await range(page.getByLabel("Music fade out", { exact: true }), 0.35);
  await q.tool(page, "Graphics");
  const selectHero = async () =>
    page
      .locator(".title-layer-list button")
      .filter({ has: page.locator("strong", { hasText: /^EVERY LETTER\./ }) })
      .click();
  await selectHero();
  await seek(page, 23);
  const stop = await recording(page);
  try {
    const baseline = await h.save(page, "before-native-edit");
    const draft = page.getByLabel("Starting rotation", { exact: true });
    await draft.fill("");
    await draft.pressSequentially("-120", { delay: 30 });
    await draft.blur();
    const changed = await h.save(page, "native-negative-rotation");
    assert.equal(
      changed.snapshot.overlays.find(l => l.name.startsWith("Hero 5")).textAnimator.fromRotation,
      -120
    );
    await page.getByTestId("studio-undo-button").click();
    assert.equal(
      decisions((await h.save(page, "native-undo")).snapshot.studioDocument),
      decisions(baseline.snapshot.studioDocument)
    );
    await page.getByTestId("studio-redo-button").click();
    assert.equal(
      decisions((await h.save(page, "native-redo")).snapshot.studioDocument),
      decisions(changed.snapshot.studioDocument)
    );
    await page.getByTestId("studio-undo-button").click();
    await selectHero();
    await page
      .getByLabel("Title text", { exact: true })
      .fill("EVERY LETTER.\nA DIFFERENT\nPERSONALITY.");
    const copy = await h.save(page, "copy-edit");
    assert.equal(copy.snapshot.overlays.length, 51);
    assert.equal(copy.snapshot.overlays.filter(l => l.textAnimator).length, 10);
    await page.getByTestId("studio-undo-button").click();
    assert.equal(
      decisions((await h.save(page, "copy-undone")).snapshot.studioDocument),
      decisions(baseline.snapshot.studioDocument)
    );
    await selectHero();
    await page.getByRole("button", { name: "Rebuild entrance keys", exact: true }).click();
    const rebuilt = await h.save(page, "entrance-rebuilt");
    const hero = rebuilt.snapshot.overlays.find(l => l.name.startsWith("Hero 5"));
    assert.equal(
      rebuilt.snapshot.motionKeyframes.filter(
        k => k.targetId === hero.id && k.property === "textProgress"
      ).length,
      2
    );
    await page.getByTestId("studio-undo-button").click();
    assert.equal(
      decisions((await h.save(page, "entrance-undone")).snapshot.studioDocument),
      decisions(baseline.snapshot.studioDocument)
    );
    await selectHero();
    const timeline = page.getByTestId("studio-pro-timeline");
    await timeline.getByRole("button", { name: "Sequence tracks", exact: true }).click();
    const row = timeline.getByTestId("pro-track-row-graphics");
    await row.getByRole("button", { name: "Lock track", exact: true }).click();
    assert(await page.getByLabel("Starting rotation", { exact: true }).isDisabled());
    await row.getByRole("button", { name: "Unlock track", exact: true }).click();
    await seek(page, 24);
    await page.screenshot({ path: path.join(folder, "native-text-controls.png") });
    await q.tool(page, "Motion");
    await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
    await page.getByLabel("Target layer", { exact: true }).selectOption(hero.id);
    const progress = page.getByLabel("Text progress", { exact: true });
    await progress.fill("42");
    await progress.blur();
    const midpoint = await h.save(page, "progress-midpoint");
    assert(
      midpoint.snapshot.motionKeyframes.some(
        k => k.targetId === hero.id && k.property === "textProgress" && k.value === 42
      )
    );
    await page.getByTestId("studio-undo-button").click();
    await timeline.getByRole("button", { name: "Composition layers", exact: true }).click();
    const show = timeline.getByRole("button", { name: "Show motion keyframes", exact: true });
    if (await show.count()) await show.click();
    await page.screenshot({ path: path.join(folder, "native-progress-timeline.png") });
  } finally {
    await stop();
  }
  await sample(
    page,
    [0, 1.7, 2.3, 3.5, 5.8, 10.8, 16.8, 22.8, 28.8, 34.8, 40.8, 43, 46.8, 53.8, 58],
    "pre-final"
  );
  const saved = await h.save(page, "final-edit");
  await page.reload();
  await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
  await open(page);
  const reopened = await h.save(page, "reopened");
  assert.equal(hash(saved.snapshot.studioDocument), hash(reopened.snapshot.studioDocument));
  fs.writeFileSync(
    path.join(folder, "native-edit.json"),
    JSON.stringify(
      {
        projectId: reopened.id,
        canonicalHash: hash(reopened.snapshot.studioDocument),
        layers: reopened.snapshot.overlays.length,
        textAnimators: 10,
        editableCopy: true,
        nativeProgressAndSettingsHistory: true,
        trackLock: true,
        exactColdReopen: true,
        graphInjection: false,
        authBypass: false,
        paidJobs: 0,
      },
      null,
      2
    )
  );
  console.log("Native text choreography, copy/history/lock/progress and exact cold reopen pass.");
}
async function backup(page) {
  const saved = await h.save(page, "delivery"),
    receipt = JSON.parse(fs.readFileSync(path.join(folder, "film/render-receipt.json")));
  assert.equal(hash(saved.snapshot.studioDocument), receipt.projectHash);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project backup", exact: true }).click();
  const file = path.join(folder, "Make-them-look-twice.autopromote.json");
  await (await download).saveAs(file);
  fs.chmodSync(file, 0o600);
  fs.writeFileSync(
    path.join(folder, "backup-receipt.json"),
    JSON.stringify(
      {
        projectId: saved.id,
        canonicalHash: receipt.projectHash,
        backupSha256: hash(fs.readFileSync(file)),
        nativeDownload: true,
      },
      null,
      2
    )
  );
}
async function viewWithSoundTour(page) {
  const tour = (async () => {
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v && !v.paused && v.currentTime >= 18 && v.currentTime < 24;
    }, undefined, { timeout: 120000 });
    const timeline = page.getByTestId("studio-pro-timeline");
    await timeline.getByRole("button", { name: "Sequence tracks", exact: true }).click();
    await q.tool(page, "Sound");
    await timeline.getByTestId("pro-track-row-music").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(folder, "native-score-in-matching-timeline.png") });
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.currentTime >= 24);
    await timeline.getByRole("button", { name: "Composition layers", exact: true }).click();
    fs.writeFileSync(path.join(folder, "native-sound-tour.json"), JSON.stringify({ normalUiOnly: true, musicLaneRevealed: true, returnedToComposition: true, playbackUninterrupted: true }, null, 2));
  })();
  const results = await Promise.allSettled([require("../creative-templates/materials-editing-proof").view(page, "film"), tour]);
  for (const result of results) if (result.status === "rejected") throw result.reason;
}
async function restore() {
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: ["--mute-audio", "--host-resolver-rules=MAP localhost 127.0.0.2"],
  });
  const context = await browser.newContext({
    storageState: path.join(root, require("../../config/daily-studio.json").authState),
    viewport: { width: 1600, height: 1200 },
  });
  const page = await context.newPage();
  let jobs = 0;
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/media/process") jobs++;
  });
  try {
    await page.goto("http://localhost:5000/");
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false
    );
    const file = path.join(folder, "Make-them-look-twice.autopromote.json");
    await page.getByLabel("Restore project backup", { exact: true }).setInputFiles(file);
    await open(page);
    const saved = await h.save(page, "fresh-restored"),
      original = JSON.parse(fs.readFileSync(file));
    assert.equal(hash(saved.snapshot.studioDocument), hash(original.snapshot.studioDocument));
    assert.equal(jobs, 0);
    await q.tool(page, "Graphics");
    await page.locator(".title-layer-list button").filter({ has: page.locator("strong", { hasText: /^MAKE THEM/ }) }).click();
    const hero = saved.snapshot.overlays.find(l => l.textAnimator);
    await page.getByLabel("Title text", { exact: true }).fill("Unsupported emoji 👋");
    assert.equal(await page.getByLabel("Title text", { exact: true }).inputValue(), hero.text);
    assert.equal(decisions((await h.save(page, "restore-unsupported-copy-rejected")).snapshot.studioDocument), decisions(saved.snapshot.studioDocument));
    await page.screenshot({ path: path.join(folder, "independent-restored-controls.png") });
    await page.getByRole("button", { name: "Remove text animator", exact: true }).click();
    const removed = await h.save(page, "restore-animator-removed");
    const plain = removed.snapshot.overlays.find(l => l.id === hero.id);
    assert.equal(plain.textAnimator, undefined);
    assert.equal(plain.textProgress, undefined);
    assert(!removed.snapshot.motionKeyframes.some(k => k.targetId === hero.id && k.property === "textProgress"));
    assert.equal(plain.text, hero.text);
    await page.getByRole("button", { name: "Animate this title", exact: true }).click();
    const enabled = await h.save(page, "restore-native-enabled");
    assert.equal(enabled.snapshot.overlays.find(l => l.id === hero.id).textAnimator.version, 1);
    assert.equal(enabled.snapshot.motionKeyframes.filter(k => k.targetId === hero.id && k.property === "textProgress").length, 2);
    assert.equal(enabled.snapshot.overlays.length, saved.snapshot.overlays.length);
    await page.getByTestId("studio-undo-button").click();
    assert.equal(decisions((await h.save(page, "restore-enable-undone")).snapshot.studioDocument), decisions(removed.snapshot.studioDocument));
    await page.getByTestId("studio-undo-button").click();
    assert.equal(decisions((await h.save(page, "restore-remove-undone")).snapshot.studioDocument), decisions(saved.snapshot.studioDocument));
    await page.getByTestId("studio-redo-button").click();
    assert.equal(decisions((await h.save(page, "restore-remove-redone")).snapshot.studioDocument), decisions(removed.snapshot.studioDocument));
    await page.getByTestId("studio-undo-button").click();
    assert.equal(decisions((await h.save(page, "restore-final-decisions")).snapshot.studioDocument), decisions(saved.snapshot.studioDocument));
    fs.writeFileSync(
      path.join(folder, "fresh-restore-receipt.json"),
      JSON.stringify(
        {
          projectId: saved.id,
          canonicalHash: hash(saved.snapshot.studioDocument),
          exactNativeIndependentRestore: true,
          nativeRemoveAndHistory: true,
          nativeEnableFromPlainCopy: true,
          unsupportedCopyRejectedBeforeMutation: true,
          restoreHashObservedBeforeNewHistoryRevisions: true,
          textAnimators: saved.snapshot.overlays.filter(l => l.textAnimator).length,
          renderJobs: jobs,
          authBypass: false,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}
async function main() {
  const action = process.argv[2] || "edit";
  if (action === "restore") return restore();
  const context = await chromium.launchPersistentContext(
    path.join(root, "reports/studio-keyframe-selection-20261015/proof/browser-profile.private"),
    {
      channel: "chromium",
      headless: true,
      args: [
        "--mute-audio",
        "--disk-cache-size=16777216",
        "--host-resolver-rules=MAP localhost 127.0.0.2",
      ],
      viewport: { width: 1920, height: 1440 },
      acceptDownloads: true,
    }
  );
  const page = context.pages()[0];
  page.setDefaultTimeout(60000);
  let jobs = 0;
  page.on("pageerror", e =>
    fs.appendFileSync(path.join(folder, "runtime-errors.private.log"), e.stack + "\n", {
      mode: 0o600,
    })
  );
  page.on("request", r => {
    if (r.method() !== "POST") return;
    const p = new URL(r.url()).pathname;
    if (p === "/api/media/process") jobs++;
    assert(
      !/studio-3d-preview|studio-capabilities\/requests|publisher\/schedule|platform\/post/.test(p)
    );
  });
  try {
    await page.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
    assert(!(await page.evaluate(() => !!window.__E2E_BYPASS)));
    if (action === "edit") await edit(page);
    else {
      await open(page);
      if (action === "preserve-interrupted-export") {
        assert(!fs.existsSync(path.join(folder, "interrupted-export.json")), "Interrupted attempt already preserved");
        const original = await h.save(page, "interrupted-export-project");
        fs.copyFileSync(path.join(folder, "native-edit.json"), path.join(folder, "native-edit-before-interruption.json"));
        await page.getByLabel("Project name", { exact: true }).fill("Make them look twice — stopped local export · 20261018");
        await h.save(page, "stopped-project-retained");
        await page.getByRole("button", { name: "Duplicate", exact: true }).first().click();
        await page.waitForFunction(() => document.querySelector('[aria-label="Project name"]')?.value.endsWith(" copy"));
        await page.getByLabel("Project name", { exact: true }).fill(name);
        const saved = await h.save(page, "persistent-delivery-project");
        assert.notEqual(saved.id, original.id);
        assert.equal(saved.snapshot.overlays.filter(l => l.textAnimator).length, 10);
        fs.writeFileSync(path.join(folder, "interrupted-export.json"), JSON.stringify({
          jobId: "viral_06696a5d74a3cb45eecd2162d419e33003a9e9e98e194b75200aa5f629dfcee6",
          oldProjectId: original.id, newProjectId: saved.id, at: new Date().toISOString(),
          oldLocalApiAndWorkerAndBrowserAbsent: true, completedOutput: false, staleServerRecordPreserved: true,
          normalDuplicateUsedForNewAttempt: true, originalAssetsAndDecisionsRetained: true,
          persistentUserServicesUsedForNextAttempt: true,
        }, null, 2));
        const native = JSON.parse(fs.readFileSync(path.join(folder, "native-edit.json")));
        fs.writeFileSync(path.join(folder, "native-edit.json"), JSON.stringify({ ...native, projectId: saved.id, canonicalHash: hash(saved.snapshot.studioDocument), normalRecoveryDuplicate: true }, null, 2));
      } else if (action === "preserve-observer") {
        await page
          .getByLabel("Project name", { exact: true })
          .fill("Make them look twice — retained observer selection take · 20261018");
        await h.save(page, "observer-take-preserved");
        console.log("Original observer project retained under its own name.");
      } else if (action === "repair-observer") {
        const original = JSON.parse(
          fs.readFileSync(path.join(folder, "before-native-edit-project.private.json"))
        );
        let current = await h.save(page, "observer-current");
        for (
          let i = 0;
          i < 3 &&
          decisions(current.snapshot.studioDocument) !==
            decisions(original.snapshot.studioDocument);
          i++
        ) {
          await page.getByTestId("studio-undo-button").click();
          current = await h.save(page, `observer-recovered-${i}`);
        }
        assert.equal(
          decisions(current.snapshot.studioDocument),
          decisions(original.snapshot.studioDocument)
        );
        console.log(
          "Normal Undo restores the original composition after observer selection mistake."
        );
      } else if (action === "render") await h.render(page, "film");
      else if (action === "recover") await h.recover(page, "film");
      else if (action === "preview")
        await sample(
          page,
          [
            0, 0.5, 1.5, 2, 3.5, 5.5, 10.5, 16.5, 22.5, 28.5, 34.5, 40.5, 43, 46.5,
            53.5, 58,
          ],
          "clean-pre-final"
        );
      else if (action === "delivery") {
        await q.tool(page, "Export");
        await page.getByTestId("rendered-output-ready").waitFor({ timeout: 90000 });
        const live = page.getByRole("button", { name: "Show Live Edit", exact: true });
        if (await live.isVisible()) await live.click();
        await sample(
          page,
          [
            0, 0.5, 1.5, 2, 3.5, 5.5, 10.5, 16.5, 22.5, 28.5, 34.5, 40.5, 43, 46.5,
            53.5, 58,
          ],
          "paired-live"
        );
        await backup(page);
        const timeline = page.getByTestId("studio-pro-timeline");
        await timeline.getByRole("button", { name: "Composition layers", exact: true }).click();
        const at = timeline.getByRole("button", { name: "At playhead", exact: true });
        if ((await at.getAttribute("aria-pressed")) !== "true") await at.click();
        await viewWithSoundTour(page);
      } else throw Error("Unknown action");
    }
    assert.equal(jobs, action === "render" ? 1 : 0);
  } catch (e) {
    await page
      .screenshot({ path: path.join(folder, `${action}-failure-${Date.now()}.png`) })
      .catch(() => {});
    throw e;
  } finally {
    await context.close();
  }
}
main().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
