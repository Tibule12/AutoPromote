#!/usr/bin/env node
// An editable native Studio composition, built with the ordinary signed-in UI.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../.."),
  report = path.join(root, "reports/welcome-studio-scroll-20261021"),
  folder = path.join(report, "proof");
Object.assign(process.env, {
  STUDIO_TEMPLATE_PROOF_DIR: folder,
  STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS: "1800000",
  STUDIO_QA_UPLOAD_BUDGET_MS: "300000",
  STUDIO_QA_NATIVE_DOWNLOAD_METHOD: "playwright",
  STUDIO_QA_TIMELINE_HEIGHT: "420",
  STUDIO_QA_HIDE_MEDIA: "1",
});
const h = require("../creative-templates/studio-proof"),
  q = require("../../test/e2e/playwright/studio-stability/run"),
  { pause, seek, range } = require("./kinetic-type-proof"),
  { hash } = require("../../src/creativeTemplates/contract");
Object.assign(process.env, {
  STUDIO_QA_EXPECTED_WIDTH: "1280",
  STUDIO_QA_EXPECTED_HEIGHT: "720",
  STUDIO_QA_EXPORT_FPS: "24",
});
const title = "Your next · welcome scroll composition · 20261021";
const layers = [
  { file: "boxing.mp4", start: 0, duration: 3, source: 0, w: 100, h: 100, x: 50, y: 50 },
  { file: "raw.mp4", start: 3, duration: 2, source: 0, w: 100, h: 100, x: 50, y: 50 },
  {
    file: "boxing-studio.mp4",
    start: 5,
    duration: 4,
    source: 0,
    w: 100,
    h: 100,
    x: 50,
    y: 50,
    fit: "contain",
  },
  { file: "boxing.mp4", start: 9, duration: 3, source: 11, w: 43, h: 43, x: 26, y: 48 },
  { file: "boxing.mp4", start: 9, duration: 3, source: 11, w: 26, h: 46.222222, x: 64, y: 48 },
  { file: "boxing.mp4", start: 9, duration: 3, source: 11, w: 18, h: 56.888889, x: 89, y: 48 },
  { file: "schedule-tour.mp4", start: 12, duration: 3, source: 18, w: 100, h: 100, x: 50, y: 50 },
  {
    file: "logo.mp4",
    start: 15,
    duration: 3,
    source: 7,
    w: 85,
    h: 85,
    x: 50,
    y: 50,
    fit: "contain",
  },
];
async function motion(page, id) {
  await q.tool(page, "Motion");
  await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
  await page.getByLabel("Target layer", { exact: true }).selectOption(id);
}
async function backup(page) {
  await h.rail(page);
  const versions = page.getByLabel("Include saved versions in backup", { exact: true });
  if (await versions.isChecked()) await versions.uncheck();
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project backup", exact: true }).click();
  await (await d).saveAs(path.join(folder, "YOUR-NEXT.autopromote.json"));
  fs.chmodSync(path.join(folder, "YOUR-NEXT.autopromote.json"), 0o600);
}
async function open(page) {
  await page
    .getByRole("region", { name: "Saved Studio projects", exact: true })
    .getByRole("button", { name: title, exact: true })
    .click();
  await h.rail(page);
  await pause(page);
}
async function entry(page) {
  await page.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Viral Clip Studio", exact: true })
    .click({ timeout: 120000 });
  assert(!(await page.evaluate(() => !!window.__E2E_BYPASS)));
}
async function author(page) {
  await page
    .locator(".creator-studio-dropzone input[type=file]")
    .setInputFiles(path.join(report, "assets/blank.mp4"));
  await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
  await h.rail(page);
  await pause(page);
  await page.getByLabel("Project name", { exact: true }).fill(title);
  await seek(page, 0);
  await q.tool(page, "Reframe");
  const auto = page.getByTestId("auto-reframe-toggle");
  if (await auto.isChecked()) {
    await auto.click();
    await page.waitForFunction(
      () => !document.querySelector("[data-testid=auto-reframe-toggle]")?.checked
    );
  }
  await q.tool(page, "Color");
  const rounded = page.getByLabel("Rounded main footage", { exact: true });
  if (await rounded.isChecked()) await rounded.uncheck();
  await q.tool(page, "Sound");
  const repair = page.getByLabel("Use voice repair on export", { exact: true });
  if (await repair.isChecked()) await repair.uncheck();
  for (const [i, item] of layers.entries()) {
    await seek(page, item.start);
    await q.tool(page, "B-roll");
    await page
      .getByTestId("broll-video-input")
      .setInputFiles(path.join(report, "media", item.file));
    const r = await h.save(page, `video-${i}-imported`),
      layer = r.snapshot.overlays.at(-1);
    assert.equal(layer.type, "video");
    await page.getByRole("button", { name: "Picture-in-picture", exact: true }).click();
    await page.getByRole("button", { name: "Keep original", exact: true }).click();
    await range(page.getByRole("slider", { name: "Frame corner curve", exact: true }), 12);
    await range(page.getByLabel("B-roll source start", { exact: true }), item.source);
    await motion(page, layer.id);
    for (const [label, value] of [
      ["Motion layer in point", item.start],
      ["Motion layer duration", item.duration],
      ["Motion layer width", item.w],
      ["Motion layer height", item.h],
    ]) {
      const input = page.getByLabel(label, { exact: true });
      await input.fill(String(value));
      await input.blur();
    }
    for (const [label, value] of [
      ["X", item.x],
      ["Y", item.y],
      ["Scale", 1],
    ]) {
      const input = page.getByRole("spinbutton", { name: label, exact: true });
      await input.fill(String(value));
      await input.blur();
    }
    await h.save(page, `video-${i}`);
    console.log(`Native story scene ${i + 1}/${layers.length}: ${item.file}`);
  }
  await q.tool(page, "Graphics");
  const panel = page.getByTestId("studio-graphics-import");
  if (!(await panel.evaluate(e => e.open))) await panel.locator("summary").click();
  await page
    .getByLabel("Graphics composition file", { exact: true })
    .setInputFiles(path.join(report, "assets/story.graphics.json"));
  await panel.getByRole("status").waitFor();
  assert((await panel.getByRole("status").innerText()).includes("imported."));
  await q.tool(page, "Sound");
  await page
    .getByTestId("background-sound-input")
    .setInputFiles(path.join(report, "assets/boxing-mix.mp3"));
  for (const label of ["Keep original audio", "Duck under speech", "Loop for the full clip"]) {
    const e = page.getByLabel(label, { exact: false });
    if (await e.isChecked()) await e.uncheck();
  }
  await range(
    page
      .locator(".inspector-range")
      .filter({ hasText: "Background volume" })
      .locator("input[type=range]"),
    60
  );
  await range(page.getByLabel("Music fade in", { exact: true }), 0.05);
  await range(page.getByLabel("Music fade out", { exact: true }), 0.6);
  await seek(page, 0);
  const saved = await h.save(page, "authored");
  await entry(page);
  await open(page);
  const cold = await h.save(page, "cold-reopened");
  assert.equal(hash(saved.snapshot.studioDocument), hash(cold.snapshot.studioDocument));
  for (const t of [0.8, 3.6, 6.2, 9.8, 12.8, 16.8]) {
    await seek(page, t);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    await page
      .getByTestId("hook-preview-frame")
      .screenshot({ path: path.join(folder, `live-${t}.png`) });
  }
  const edit = {
    at: new Date().toISOString(),
    projectId: cold.id,
    canonicalHash: hash(cold.snapshot.studioDocument),
    seconds: 18,
    nativeControlsOnly: true,
    authBypass: false,
    graphInjection: false,
    exactColdReopen: true,
    layers: cold.snapshot.overlays.length,
    videoLayers: cold.snapshot.overlays.filter(l => l.type === "video").length,
  };
  fs.writeFileSync(path.join(folder, "native-edit.json"), JSON.stringify(edit, null, 2));
  console.log("Native scroll film ready for visual review.");
}
async function main() {
  const action = process.argv[2] || "all";
  let submissions = 0,
    writes = 0;
  const errors = [];
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: [
      "--mute-audio",
      "--host-resolver-rules=MAP localhost 127.0.0.6",
      "--no-proxy-server",
      "--disable-http2",
      "--disable-quic",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=9846",
    ],
  });
  const context = await browser.newContext({
      storageState: require("../creative-templates/studio-session").sessionPath,
      viewport: { width: 1920, height: 1440 },
      acceptDownloads: true,
    }),
    page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => {
    const p = new URL(r.url()).pathname;
    if (r.method() === "POST" && p === "/api/media/process") submissions++;
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) &&
      /^\/api\/(content|publisher|platform)\//.test(p)
    )
      writes++;
  });
  page.on("response", async r => {
    if (
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/media/process" &&
      r.ok()
    )
      fs.writeFileSync(
        path.join(folder, "submission.json"),
        JSON.stringify({ at: new Date().toISOString(), response: await r.json() }, null, 2),
        { mode: 0o600 }
      );
  });
  try {
    await entry(page);
    if (action === "all") {
      assert(!fs.existsSync(path.join(folder, "submission.json")));
      await author(page);
      const review = path.join(folder, "visual-review.json"),
        until = Date.now() + 15 * 60000;
      while (!fs.existsSync(review) && Date.now() < until) await page.waitForTimeout(1000);
      const v = JSON.parse(fs.readFileSync(review));
      assert(
        v.accepted &&
          v.canonicalHash ===
            JSON.parse(fs.readFileSync(path.join(folder, "native-edit.json"))).canonicalHash
      );
      await h.render(page, "story");
      await require("../creative-templates/materials-editing-proof").view(page, "story");
      await backup(page);
      fs.copyFileSync(
        path.join(folder, "story/final.mp4"),
        path.join(report, "media/studio-story.mp4")
      );
    } else if (action === "restore") {
      await page.waitForFunction(
        () => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false
      );
      await page
        .getByLabel("Restore project backup", { exact: true })
        .setInputFiles(path.join(folder, "YOUR-NEXT.autopromote.json"));
      const restoredName = JSON.parse(
        fs.readFileSync(path.join(folder, "YOUR-NEXT.autopromote.json"))
      ).name;
      await page
        .getByRole("region", { name: "Saved Studio projects", exact: true })
        .getByRole("button", { name: restoredName, exact: true })
        .click();
      await h.rail(page);
      await pause(page);
      const r = await h.save(page, "fresh-restored"),
        b = JSON.parse(fs.readFileSync(path.join(folder, "YOUR-NEXT.autopromote.json")));
      assert.equal(hash(r.snapshot.studioDocument), hash(b.snapshot.studioDocument));
      fs.writeFileSync(
        path.join(folder, "fresh-restore.json"),
        JSON.stringify(
          {
            canonicalHash: hash(r.snapshot.studioDocument),
            exactIndependentRestore: true,
            backupSha256: hash(fs.readFileSync(path.join(folder, "YOUR-NEXT.autopromote.json"))),
          },
          null,
          2
        )
      );
    } else throw Error("Unknown action");
    assert.equal(submissions, action === "all" ? 1 : 0);
    assert.equal(writes, 0);
    assert.deepEqual(errors, []);
  } catch (e) {
    await page.screenshot({ path: path.join(folder, `failure-${Date.now()}.png`) }).catch(() => {});
    fs.writeFileSync(
      path.join(folder, "failure.private.txt"),
      (await page.locator("body").innerText()).slice(-17000),
      { mode: 0o600 }
    );
    throw e;
  } finally {
    await context.close();
    await browser.close();
  }
}
main().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
