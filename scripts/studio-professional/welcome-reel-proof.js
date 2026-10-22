#!/usr/bin/env node
// Native signed-in Studio controls + public Graphics v1. No state/graph injection.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../.."),
  report = path.join(root, "reports/welcome-studio-reel-20261021"),
  folder = path.join(report, "proof"),
  media = path.join(root, "reports/welcome-real-workflow-20261021/media");
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
const title = "FROM THE FRAME — welcome Studio film · 20261021";
const poses = [
  {
    file: "studio.mp4",
    start: 3.7,
    duration: 6.3,
    source: 31.8,
    w: 75,
    h: 100,
    x: 50,
    y: 50,
    keys: [
      [3.7, 50, 50, 1.35, 0],
      [5.1, 50, 50, 1, 1],
      [6.2, 50, 50, 1, 1],
      [7.25, 50, 9, 1.5, 1],
      [8.2, 50, 9, 1.5, 1],
      [9.5, 50, 50, 1, 1],
    ],
  },
  {
    file: "film.mp4",
    start: 0,
    duration: 5.45,
    source: 28,
    w: 100,
    h: 100,
    x: 50,
    y: 50,
    keys: [
      [0, 50, 50, 1.12, 1],
      [0.85, 50, 50, 1, 1],
      [3.7, 50, 50, 1, 1],
      [5.1, 45.16, 36.04, 0.5097, 1],
      [5.4, 45.16, 36.04, 0.5097, 0],
    ],
  },
  {
    file: "breakdown.mp4",
    start: 10,
    duration: 5.5,
    source: 10,
    w: 31.640625,
    h: 100,
    x: 75,
    y: 50,
    keys: [
      [10, 75, 80, 0.6, 0],
      [10.8, 75, 50, 0.88, 1],
      [14.65, 75, 50, 0.88, 1],
      [15.5, 50, 50, 0.45, 0],
    ],
  },
  ...["linkedin", "youtube", "instagram", "tiktok", "facebook", "reddit"].map((p, i) => ({
    file: `destination-${p}.png`,
    start: 15.65 + i * 0.13,
    duration: 21.4 - (15.65 + i * 0.13),
    w: 24,
    h: 34.1,
    x: [19, 50, 81][i % 3],
    y: i < 3 ? 41 : 78,
    keys: [
      [15.65 + i * 0.13, 50, 55, 0.2, 0],
      [16.45 + i * 0.13, [19, 50, 81][i % 3], i < 3 ? 41 : 78, 1, 1],
      [20.9, [19, 50, 81][i % 3], i < 3 ? 41 : 78, 1, 1],
      [21.4, 50, 50, 0.5, 0],
    ],
  })),
  {
    file: "queue.mp4",
    start: 21.4,
    duration: 4.1,
    source: 0,
    w: 87,
    h: 86.2,
    x: 50,
    y: 52,
    keys: [
      [21.4, 50, 55, 0.85, 0],
      [22.1, 50, 52, 1, 1],
      [25.1, 50, 52, 1, 1],
      [25.5, 50, 52, 1.12, 0],
    ],
  },
  {
    file: path.join(root, "reports/welcome-studio-scroll-20261021/media/logo.mp4"),
    start: 25.5,
    duration: 2.5,
    source: 7.2,
    w: 70,
    h: 70,
    x: 50,
    y: 52,
    keys: [
      [25.5, 50, 52, 0.88, 0],
      [26, 50, 52, 1, 1],
      [28, 50, 52, 1, 1],
    ],
  },
];
async function motion(page, id) {
  await q.tool(page, "Motion");
  await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
  if (id) await page.getByLabel("Target layer", { exact: true }).selectOption(id);
}
async function fill(page, label, value) {
  const e = page.getByLabel(label, { exact: true });
  await e.fill(String(value));
  await e.blur();
}
async function spin(page, label, value) {
  const e = page.getByRole("spinbutton", { name: label, exact: true });
  await e.fill(String(value));
  await e.blur();
}
async function backup(page) {
  await h.rail(page);
  const versions = page.getByLabel("Include saved versions in backup", { exact: true });
  if (await versions.isChecked()) await versions.uncheck();
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project backup", exact: true }).click();
  await (await d).saveAs(path.join(folder, "FROM-THE-FRAME.autopromote.json"));
  fs.chmodSync(path.join(folder, "FROM-THE-FRAME.autopromote.json"), 0o600);
}
async function entry(page) {
  await page.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Viral Clip Studio", exact: true })
    .click({ timeout: 120000 });
  assert(!(await page.evaluate(() => !!window.__E2E_BYPASS)));
}
async function open(page, name = title) {
  await page
    .getByRole("region", { name: "Saved Studio projects", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
  await h.rail(page);
  await pause(page);
}
async function capture(page) {
  for (const t of [1.2, 4.4, 5.2, 7.6, 9.3, 11.3, 16.2, 17.8, 20.3, 22.8, 26.8]) {
    await seek(page, t);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    await page
      .getByTestId("hook-preview-frame")
      .screenshot({ path: path.join(folder, `live-${t}.png`) });
  }
}
async function author(page) {
  await page
    .locator(".creator-studio-dropzone input[type=file]")
    .setInputFiles(path.join(report, "assets/blank.mp4"));
  await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
  await h.rail(page);
  await pause(page);
  await fill(page, "Project name", title);
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
  for (const [i, item] of poses.entries()) {
    await seek(page, item.start);
    await q.tool(page, "B-roll");
    await page
      .getByTestId(item.file.endsWith(".png") ? "visual-image-input" : "broll-video-input")
      .setInputFiles(path.isAbsolute(item.file) ? item.file : path.join(media, item.file));
    await page.waitForFunction(
      name =>
        document.querySelector(".inspector-selected-asset strong")?.textContent.trim() === name,
      path.basename(item.file)
    );
    await page.getByRole("button", { name: "Picture-in-picture", exact: true }).click();
    if (!item.file.endsWith(".png")) {
      await page.getByRole("button", { name: "Keep original", exact: true }).click();
      await range(page.getByLabel("B-roll source start", { exact: true }), item.source);
    }
    await motion(page);
    const target = page.getByLabel("Target layer", { exact: true });
    await target.selectOption({ label: path.basename(item.file) });
    const id = await target.inputValue();
    assert(id && !id.includes("main"));
    for (const [label, value] of [
      ["Motion layer in point", item.start],
      ["Motion layer duration", item.duration],
      ["Motion layer width", item.w],
      ["Motion layer height", item.h],
    ])
      await fill(page, label, value);
    await spin(page, "X", item.x);
    await spin(page, "Y", item.y);
    await spin(page, "Scale", 1);
    for (const [t, x, y, s, o] of item.keys) {
      await seek(page, t);
      await page.getByRole("button", { name: /^◆ Add transform keyframe at/ }).click();
      await spin(page, "X", x);
      await spin(page, "Y", y);
      await spin(page, "Scale", s);
      await range(
        page
          .locator(".inspector-range")
          .filter({ has: page.locator("b", { hasText: /^Opacity$/ }) })
          .locator("input[type=range]"),
        o
      );
      await page
        .getByLabel(
          `Transform pose at ${Number(await page.getByLabel("Edited output position", { exact: true }).inputValue()).toFixed(2)} seconds easing`,
          { exact: true }
        )
        .selectOption("ease_in_out");
    }
    const checkpoint = await h.save(page, `media-${i + 1}`);
    const actual = checkpoint.snapshot.overlays.find(l => l.id === id);
    assert.equal(actual.width, item.w);
    assert.equal(actual.height, item.h);
    console.log(
      `Native media layer ${i + 1}/${poses.length}: ${path.basename(item.file)} · dimensions verified`
    );
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
    .setInputFiles(path.join(report, "assets/score.mp3"));
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
  await range(page.getByLabel("Music fade in", { exact: true }), 0.1);
  await range(page.getByLabel("Music fade out", { exact: true }), 1.1);
  for (const [time, name, duration, volume] of [
    [3.7, "Airy whoosh", 0.65, 25],
    [10, "Reverse pull", 0.55, 20],
    [15.65, "Pop", 0.2, 15],
    [21.4, "Airy whoosh", 0.65, 23],
    [25.5, "Glass chime", 0.8, 22],
  ]) {
    await seek(page, time);
    await page
      .locator(".sound-effect-preset")
      .filter({ has: page.locator("strong", { hasText: new RegExp(`^${name}$`) }) })
      .click();
    await page.getByTestId("sound-effect-start").fill(String(time));
    await page.getByTestId("sound-effect-duration").fill(String(duration));
    await range(page.getByTestId("sound-effect-volume"), volume);
    await range(page.getByTestId("sound-effect-fade-out"), 0.12);
  }
  await seek(page, 0);
  const saved = await h.save(page, "authored");
  await entry(page);
  await open(page);
  const cold = await h.save(page, "cold-reopened");
  assert.equal(hash(saved.snapshot.studioDocument), hash(cold.snapshot.studioDocument));
  await capture(page);
  fs.writeFileSync(
    path.join(folder, "native-edit.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        projectId: cold.id,
        canonicalHash: hash(cold.snapshot.studioDocument),
        seconds: 28,
        nativeControlsOnly: true,
        authBypass: false,
        graphInjection: false,
        exactColdReopen: true,
        layers: cold.snapshot.overlays.length,
        keys: cold.snapshot.motionKeyframes.length,
        source:
          "One existing native restaurant film, its complete matching Studio recording, exact scheduled portrait version, actual six destination/Queue captures and chosen native logo finish",
      },
      null,
      2
    )
  );
  console.log("Native film paused for visual review.");
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
      "--remote-debugging-port=9847",
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
        until = Date.now() + 30 * 60000;
      while (!fs.existsSync(review) && Date.now() < until) await page.waitForTimeout(1000);
      const v = JSON.parse(fs.readFileSync(review));
      assert(
        v.accepted &&
          v.canonicalHash ===
            JSON.parse(fs.readFileSync(path.join(folder, "native-edit.json"))).canonicalHash
      );
      await h.render(page, "film");
      await require("../creative-templates/materials-editing-proof").view(page, "film");
      await backup(page);
    } else if (action === "restore") {
      await page.waitForFunction(
        () => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false
      );
      await page
        .getByLabel("Restore project backup", { exact: true })
        .setInputFiles(path.join(folder, "FROM-THE-FRAME.autopromote.json"));
      const b = JSON.parse(fs.readFileSync(path.join(folder, "FROM-THE-FRAME.autopromote.json")));
      await open(page, b.name);
      const r = await h.save(page, "fresh-restored");
      assert.equal(hash(r.snapshot.studioDocument), hash(b.snapshot.studioDocument));
      fs.writeFileSync(
        path.join(folder, "fresh-restore.json"),
        JSON.stringify(
          {
            canonicalHash: hash(r.snapshot.studioDocument),
            exactIndependentRestore: true,
            backupSha256: hash(
              fs.readFileSync(path.join(folder, "FROM-THE-FRAME.autopromote.json"))
            ),
          },
          null,
          2
        )
      );
    } else throw Error("Unknown action");
    assert.equal(submissions, action === "all" ? 1 : 0);
    assert.equal(writes, 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(folder, `${action}-browser-verification.json`),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          submissions,
          publishingWrites: writes,
          errors,
          normalAuthenticatedUi: true,
        },
        null,
        2
      )
    );
  } catch (e) {
    await page.screenshot({ path: path.join(folder, `failure-${Date.now()}.png`) }).catch(() => {});
    fs.writeFileSync(
      path.join(folder, "failure.private.txt"),
      (await page.locator("body").innerText()).slice(-19000),
      { mode: 0o600 }
    );
    console.error(e.stack);
    console.error(
      "Native browser retained on CDP 9847 for ordinary UI recovery; no render resubmission."
    );
    await page.waitForTimeout(30 * 60 * 1000);
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
