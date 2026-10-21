#!/usr/bin/env node
// Real signed-in Studio authoring/export. UI interactions only; graph reads are
// read-only evidence. No route, authentication or render-result substitution.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../.."),
  report = path.join(root, "reports/studio-logo-design-20261018"),
  folder = path.join(report, "proof");
Object.assign(process.env, {
  STUDIO_TEMPLATE_PROOF_DIR: folder,
  STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_EXPECTED_WIDTH: "1280",
  STUDIO_QA_EXPECTED_HEIGHT: "720",
  STUDIO_QA_EXPORT_FPS: "24",
  STUDIO_QA_NATIVE_DOWNLOAD_METHOD: "playwright",
  STUDIO_QA_TIMELINE_HEIGHT: "520",
  STUDIO_QA_HIDE_MEDIA: "1",
});
const h = require("../creative-templates/studio-proof"),
  q = require("../../test/e2e/playwright/studio-stability/run"),
  { pause, seek, range, recording } = require("./kinetic-type-proof"),
  { hash } = require("../../src/creativeTemplates/contract");
const name = "AutoPromote — vector logo design study · 20261018";
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
  await head.waitFor();
  if (!(await head.evaluate(e => e.open))) {
    await head.locator("summary").focus();
    await page.keyboard.press("Enter");
  }
}
async function open(page) {
  await page
    .getByRole("region", { name: "Saved Studio projects", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
  await h.rail(page);
  await pause(page);
}
async function sample(page, times, label) {
  await q.tool(page, "Motion");
  await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
  const toggle = page.getByRole("button", { name: "⤳ Motion path", exact: true });
  if ((await toggle.getAttribute("aria-pressed")) === "true") await toggle.click();
  await page.getByTestId("hook-preview-frame").click({ position: { x: 8, y: 8 } });
  await page.keyboard.press("Escape");
  for (const t of times) {
    await seek(page, t);
    await page
      .getByTestId("hook-preview-frame")
      .locator("img")
      .evaluateAll(es => Promise.all(es.map(e => e.decode())));
    await page
      .getByTestId("hook-preview-frame")
      .screenshot({ path: path.join(folder, `${label}-${t}.png`) });
  }
}
async function masters(page, label) {
  await q.tool(page, "Graphics");
  const panel = page.getByTestId("studio-logo-design-panel");
  for (const variant of ["colour", "light", "dark"]) {
    await panel.getByLabel("Export logo variant", { exact: true }).selectOption(variant);
    for (const format of ["SVG", "PNG"]) {
      const event = page.waitForEvent("download");
      await panel.getByRole("button", { name: `Download logo ${format}`, exact: true }).click();
      await (
        await event
      ).saveAs(path.join(report, "assets", `${label}-${variant}.${format.toLowerCase()}`));
      await panel.getByRole("status").waitFor({ state: "hidden" });
    }
  }
}
async function backup(page) {
  await media(page);
  const saved = await h.save(page, "delivery");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project backup", exact: true }).click();
  const file = path.join(folder, "AutoPromote-logo-design.autopromote.json");
  await (await event).saveAs(file);
  fs.chmodSync(file, 0o600);
  const receipt = JSON.parse(fs.readFileSync(path.join(folder, "film/render-receipt.json")));
  assert.equal(hash(saved.snapshot.studioDocument), receipt.projectHash);
  fs.writeFileSync(
    path.join(folder, "backup-receipt.json"),
    JSON.stringify(
      { projectId: saved.id, canonicalHash: receipt.projectHash, nativeBackup: true },
      null,
      2
    )
  );
}
async function edit(page) {
  assert(
    !fs.existsSync(path.join(folder, "native-edit.json")),
    "Preserve existing selected design"
  );
  await page
    .locator(".creator-studio-dropzone input[type=file]")
    .setInputFiles(path.join(report, "assets/logo-canvas.mp4"));
  await page
    .getByRole("button", { name: "Open Creator Studio", exact: true })
    .click({ timeout: 360000 });
  await h.rail(page);
  await pause(page);
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await q.tool(page, "Reframe");
  await page.getByTestId("reframe-aspect-16-9").click();
  await page.getByTestId("reframe-preserve-frame").click();
  const round = page.getByLabel("Rounded main footage", { exact: true });
  if ((await round.count()) && (await round.isChecked())) await round.uncheck();
  await q.tool(page, "Sound");
  await page.getByLabel("Use voice repair on export", { exact: true }).uncheck();
  await page
    .getByTestId("background-sound-input")
    .setInputFiles(path.join(report, "assets/original-score-excerpt.wav"));
  for (const label of ["Keep original audio", "Duck under speech", "Loop for the full clip"]) {
    const input = page.getByLabel(label, { exact: false });
    if (await input.isChecked()) await input.uncheck();
  }
  await range(
    page
      .locator(".inspector-range")
      .filter({ hasText: "Background volume" })
      .locator("input[type=range]"),
    60
  );
  await range(page.getByLabel("Music fade in", { exact: true }), 0.02);
  await range(page.getByLabel("Music fade out", { exact: true }), 0.3);
  await h.save(page, "blank-canvas");
  await q.tool(page, "Graphics");
  const panel = page.getByTestId("studio-logo-design-panel");
  const stop = await recording(page);
  try {
    await panel.getByLabel("Logo brand name", { exact: true }).fill("AutoPromote");
    const before = await panel
      .getByTestId("studio-logo-design-preview")
      .locator("img")
      .getAttribute("src");
    await panel.getByRole("button", { name: /Orbit Interlocking/ }).click();
    const other = await panel
      .getByTestId("studio-logo-design-preview")
      .locator("img")
      .getAttribute("src");
    assert.notEqual(before, other);
    await panel.getByRole("button", { name: /Flow Ribbon/ }).click();
    await panel.getByLabel("Logo letter spacing", { exact: true }).fill("1.5");
    await panel.getByLabel("Animate logo assembly", { exact: true }).check();
    await panel.screenshot({ path: path.join(folder, "logo-workshop-controls.png") });
    await panel.getByRole("button", { name: "Add logo to timeline", exact: true }).click();
    await panel.getByRole("status").waitFor({ state: "hidden" });
    const added = await h.save(page, "logo-added");
    assert.equal(added.snapshot.overlays.length, 14);
    assert(added.snapshot.overlays.every(l => l.vectorShape));
    assert.equal(added.snapshot.motionKeyframes.length, 112);
    assert(added.snapshot.overlays.some(l => l.vectorShape.contours?.length > 1));
    await page.getByTestId("studio-undo-button").click();
    assert.equal((await h.save(page, "logo-add-undone")).snapshot.overlays.length, 0);
    await page.getByTestId("studio-redo-button").click();
    assert.equal(
      decisions((await h.save(page, "logo-add-redone")).snapshot.studioDocument),
      decisions(added.snapshot.studioDocument)
    );
    await seek(page, 3.5);
    await q.tool(page, "Graphics");
    const vectors = page.getByTestId("studio-vector-panel");
    if (!(await vectors.evaluate(e => e.open))) await vectors.locator("summary").click();
    const letter = added.snapshot.overlays.find(l => l.name.endsWith("letter o"));
    assert.equal(letter.vectorShape.contours.length, 2);
    await vectors.getByLabel("Vector artwork layer", { exact: true }).selectOption(letter.id);
    await vectors.getByLabel("Vector contour", { exact: true }).selectOption("1");
    await vectors.getByLabel("Selected vector point", { exact: true }).selectOption("0");
    await vectors.getByRole("button", { name: "Vector point 1", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await vectors.getByRole("status").waitFor({ state: "hidden" });
    const moved = await h.save(page, "counter-edited"),
      glyph = moved.snapshot.overlays.find(l => l.id === letter.id);
    assert.equal(
      glyph.vectorShape.contours[1].nodes[0].x,
      letter.vectorShape.contours[1].nodes[0].x + 0.1
    );
    assert.deepEqual(glyph.vectorShape.contours[0], letter.vectorShape.contours[0]);
    await page.getByTestId("studio-undo-button").click();
    assert.equal(
      decisions((await h.save(page, "counter-undone")).snapshot.studioDocument),
      decisions(added.snapshot.studioDocument)
    );
    await page.getByTestId("studio-redo-button").click();
    assert.equal(
      decisions((await h.save(page, "counter-redone")).snapshot.studioDocument),
      decisions(moved.snapshot.studioDocument)
    );
    await page.screenshot({ path: path.join(folder, "native-letter-counter-controls.png") });
    const timeline = page.getByTestId("studio-pro-timeline");
    await timeline.getByRole("button", { name: "Sequence tracks", exact: true }).click();
    const row = timeline.getByTestId("pro-track-row-graphics");
    await row.getByRole("button", { name: "Lock track", exact: true }).click();
    assert(
      await panel.getByRole("button", { name: "Add logo to timeline", exact: true }).isDisabled()
    );
    await row.getByRole("button", { name: "Unlock track", exact: true }).click();
    await masters(page, "AutoPromote-flow");
    await sample(page, [0, 0.5, 1, 1.5, 2.5, 5.5, 7.5], "pre-final");
  } finally {
    await stop();
  }
  await media(page);
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
        layers: 14,
        motionKeys: 112,
        nativeDesignCreationUndoRedo: true,
        nativeLetterCounterEditUndoRedo: true,
        normalTransparentMasterDownloads: 6,
        trackLock: true,
        exactColdReopen: true,
        graphInjection: false,
        authBypass: false,
        gpuJobs: 0,
      },
      null,
      2
    )
  );
  console.log(
    "Native logo design, counter edit/history, six master downloads, lock and exact cold reopen pass."
  );
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
    await page.waitForFunction(() => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false);
    await page
      .getByLabel("Restore project backup", { exact: true })
      .setInputFiles(path.join(folder, "AutoPromote-logo-design.autopromote.json"));
    await open(page);
    const saved = await h.save(page, "fresh-restored"),
      original = JSON.parse(
        fs.readFileSync(path.join(folder, "AutoPromote-logo-design.autopromote.json"))
      );
    assert.equal(hash(saved.snapshot.studioDocument), hash(original.snapshot.studioDocument));
    await masters(page, "restored-AutoPromote-flow");
    assert.equal(jobs, 0);
    fs.writeFileSync(
      path.join(folder, "fresh-restore-receipt.json"),
      JSON.stringify(
        {
          projectId: saved.id,
          canonicalHash: hash(saved.snapshot.studioDocument),
          exactIndependentRestore: true,
          nativeMasterReexports: 6,
          renderJobs: 0,
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
    const url = new URL(r.url()).pathname;
    if (url === "/api/media/process") jobs++;
    assert(
      !/studio-3d-preview|studio-capabilities\/requests|publisher\/schedule|platform\/post/.test(
        url
      )
    );
  });
  try {
    await page.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
    assert(!(await page.evaluate(() => !!window.__E2E_BYPASS)));
    if (action === "entry") {
      await page.getByRole("button",{name:"Start a logo design",exact:true}).click();
      await page.getByRole("button",{name:"Open Creator Studio",exact:true}).click({timeout:360000});
      await h.rail(page);await pause(page);await page.getByLabel("Project name",{exact:true}).fill("Logo canvas entry verification · 20261018");
      await q.tool(page,"Graphics");await page.getByTestId("studio-logo-design-panel").waitFor();await page.screenshot({path:path.join(folder,"native-blank-canvas-entry.png")});
      const saved=await h.save(page,"blank-logo-entry");assert.equal(saved.snapshot.overlays.length,0);
      fs.writeFileSync(path.join(folder,"blank-canvas-entry.json"),JSON.stringify({normalSignedInEntry:true,ownedSource:true,sourceSeconds:8,graphicsWorkshopVisible:true,projectId:saved.id,renderJobs:0,authBypass:false},null,2));
    }
    else if (action === "edit") await edit(page);
    else {
      await open(page);
      if (action === "render") await h.render(page, "film");
      else if (action === "recover") await h.recover(page, "film");
      else if (action === "review") {
        await media(page); const before = await h.save(page, "workshop-review-before");
        await q.tool(page,"Graphics"); const panel=page.getByTestId("studio-logo-design-panel");
        const spacing=panel.getByLabel("Logo letter spacing",{exact:true});
        await spacing.fill(""); await spacing.pressSequentially("-1.5"); await spacing.press("Enter"); assert.equal(await spacing.inputValue(),"-1.5");
        await spacing.fill("4"); await spacing.press("Escape"); assert.equal(await spacing.inputValue(),"-1.5");
        await spacing.fill("1"); await spacing.press("Enter");
        await panel.screenshot({path:path.join(folder,"logo-workshop-signed-controls.png")});
        for(const [family,layout] of [["Orbit Interlocking","stacked"],["Facet Geometric","symbol"]]) {
          await panel.getByRole("button",{name:new RegExp(family)}).click();
          await panel.getByLabel("Logo layout",{exact:true}).selectOption(layout);
          await panel.getByLabel("Logo lettering",{exact:true}).selectOption("600");
          await panel.screenshot({path:path.join(folder,`draft-${layout}-controls.png`)});
        }
        const after=await h.save(page,"workshop-review-after"); assert.equal(hash(before.snapshot.studioDocument),hash(after.snapshot.studioDocument));
      }
      else if (action === "deliver") {
        await q.tool(page, "Export");
        await page.getByTestId("rendered-output-ready").waitFor();
        const live = page.getByRole("button", { name: "Show Live Edit", exact: true });
        if (await live.isVisible()) await live.click();
        await sample(page, [0, 0.5, 1, 1.5, 2.5, 5.5, 7.5], "paired-live");
        await backup(page);
        await require("../creative-templates/materials-editing-proof").view(page, "film");
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
