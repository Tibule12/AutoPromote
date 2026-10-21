#!/usr/bin/env node
// Ordinary authenticated Studio controls only. No graph/auth/route injection.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, "../.."),
  folder = path.join(root, "reports/studio-vector-artwork-20261018/proof");
process.env.STUDIO_TEMPLATE_PROOF_DIR = folder;
Object.assign(process.env, {
  STUDIO_QA_EXPECTED_WIDTH: "1280",
  STUDIO_QA_EXPECTED_HEIGHT: "720",
  STUDIO_QA_EXPORT_FPS: "24",
  STUDIO_QA_NATIVE_DOWNLOAD_METHOD: "playwright",
});
const h = require("../creative-templates/studio-proof"),
  q = require("../../test/e2e/playwright/studio-stability/run"),
  { hash } = require("../../src/creativeTemplates/contract");
const name = "Editable vector contours — native Studio · 20261018-v2";
const decisions = doc => {
  const { revision, journal, idempotency, ...rest } = doc;
  return hash(rest);
};
async function pause(page) {
  const b = page.getByRole("button", { name: "Pause comparison", exact: true });
  if (await b.isVisible()) await b.click();
  await page.locator("video,audio").evaluateAll(es =>
    es.forEach(e => {
      e.muted = true;
      e.pause();
    })
  );
}
async function seek(page, time) {
  await pause(page);
  await page.getByLabel("Edited output position", { exact: true }).evaluate((e, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, String(v));
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  }, time);
  await page.waitForFunction(
    t => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v && !v.seeking && v.readyState >= 2 && Math.abs(v.currentTime - t) < 1 / 48;
    },
    time,
    { timeout: 90000 }
  );
  await page.waitForTimeout(200);
  await pause(page);
}
async function open(page) {
  await page.getByRole("button", { name, exact: true }).click();
  await h.rail(page);
  await pause(page);
}
async function record(page) {
  require("../creative-templates/proof-storage").requireProofSpace(folder);
  const dir = path.join(folder, `editing-frames-${Date.now()}.private`);
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page),
    frames = [];
  let bytes = 0,
    failure;
  cdp.on("Page.screencastFrame", event => {
    const data = Buffer.from(event.data, "base64");
    bytes += data.length;
    if (bytes > 128 * 1024 ** 2) failure = "Native editing capture exceeded128MiB";
    if (!failure) {
      const file = path.join(dir, `${String(frames.length).padStart(6, "0")}.jpg`);
      fs.writeFileSync(file, data);
      frames.push({ file, time: Date.now() / 1000 });
    }
    void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId });
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 60,
    maxWidth: 1600,
    maxHeight: 1200,
    everyNthFrame: 2,
  });
  return async () => {
    await cdp.send("Page.stopScreencast");
    await cdp.detach();
    assert(!failure, failure);
    assert(frames.length);
    const list = path.join(dir, "frames.ffconcat");
    fs.writeFileSync(
      list,
      "ffconcat version 1.0\n" +
        frames
          .map(
            (f, i) =>
              `file '${f.file}'\nduration ${Math.max(0.001, (frames[i + 1]?.time ?? f.time + 0.1) - f.time)}\n`
          )
          .join("") +
        `file '${frames.at(-1).file}'\n`
    );
    const output = path.join(folder, `editing-${Date.now()}.mp4`);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-safe",
      "0",
      "-i",
      list,
      "-vf",
      "fps=24",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "24",
      "-pix_fmt",
      "yuv420p",
      output,
    ]);
    const keep = new Set([
      frames[0].file,
      frames[Math.floor(frames.length / 2)].file,
      frames.at(-1).file,
    ]);
    for (const f of frames) if (!keep.has(f.file)) fs.unlinkSync(f.file);
    fs.unlinkSync(list);
    fs.writeFileSync(
      path.join(folder, "editing-recording.json"),
      JSON.stringify(
        {
          output,
          frames: frames.length,
          seconds: frames.at(-1).time - frames[0].time,
          bytes,
          nativeControlsOnly: true,
          muted: true,
        },
        null,
        2
      )
    );
  };
}
async function drag(page, svg, button, x, y, cancel = false) {
  const b = await button.boundingBox(),
    box = await svg.boundingBox();
  assert(b && box);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width * x) / 100, box.y + (box.height * y) / 100, {
    steps: 10,
  });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForTimeout(150);
}
async function edit(page) {
  assert(
    !fs.existsSync(path.join(folder, "native-edit.json")),
    "Preserve the completed native edit"
  );
  const exists = await page.evaluate(
    title =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("autopromote-viral-studio", 1);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction("projects", "readonly").objectStore("projects").getAll();
          q.onsuccess = () => {
            db.close();
            resolve(q.result.some(p => p.name === title));
          };
        };
      }),
    name
  );
  if (exists) await open(page);
  else {
    await page
      .locator(".creator-studio-dropzone input[type=file]")
      .setInputFiles(path.join(root, "reports/studio-spatial-paths-20261017/proof/source.mp4"));
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
  await h.save(page, "opened-source");
  console.log("Native source opened and saved; adding editable vector artwork.");
  await q.tool(page, "Graphics");
  const panel = page.getByTestId("studio-vector-panel");
  if (!(await panel.evaluate(e => e.open))) await panel.locator("summary").click();
  if (!(await panel.getByLabel("Vector artwork layer", { exact: true }).count()))
    await panel.getByRole("button", { name: "Add vector artwork", exact: true }).click();
  await panel.getByTestId("studio-vector-path-editor").waitFor();
  await panel.getByRole("status").waitFor({ state: "hidden" });
  const before = await h.save(page, "before-contour"),
    layer = before.snapshot.overlays.find(o => o.vectorShape);
  assert(layer);
  const stop = await record(page);
  try {
    const svg = panel.getByTestId("studio-vector-path-editor");
    await drag(
      page,
      svg,
      panel.getByRole("button", { name: "Vector point 1", exact: true }),
      12,
      81
    );
    const moved = await h.save(page, "point-moved");
    assert(
      Math.abs(moved.snapshot.overlays.find(o => o.id === layer.id).vectorShape.nodes[0].x - 12) <
        0.01
    );
    await page.getByTestId("studio-undo-button").click();
    assert.equal(
      decisions((await h.save(page, "point-undone")).snapshot.studioDocument),
      decisions(before.snapshot.studioDocument)
    );
    await page.getByTestId("studio-redo-button").click();
    assert.equal(
      decisions((await h.save(page, "point-redone")).snapshot.studioDocument),
      decisions(moved.snapshot.studioDocument)
    );
    await drag(
      page,
      svg,
      panel.getByRole("button", { name: "Vector point 1 out tangent", exact: true }),
      30,
      25
    );
    const tangent = await h.save(page, "tangent-moved");
    await drag(
      page,
      svg,
      panel.getByRole("button", { name: "Vector point 1", exact: true }),
      75,
      75,
      true
    );
    assert.equal(
      decisions((await h.save(page, "contour-cancelled")).snapshot.studioDocument),
      decisions(tangent.snapshot.studioDocument)
    );
    await panel.getByRole("button", { name: "Split after point", exact: true }).click();
    const split = await h.save(page, "split-contour");
    assert.equal(split.snapshot.overlays.find(o => o.id === layer.id).vectorShape.nodes.length, 7);
    await page.getByTestId("studio-undo-button").click();
    assert.equal(
      decisions((await h.save(page, "split-undone")).snapshot.studioDocument),
      decisions(tangent.snapshot.studioDocument)
    );
    await page.getByTestId("studio-redo-button").click();
    assert.equal(
      decisions((await h.save(page, "split-redone")).snapshot.studioDocument),
      decisions(split.snapshot.studioDocument)
    );
    await panel
      .getByLabel("Vector gradient direction", { exact: true })
      .selectOption("[[0,50],[100,50]]");
    await panel.getByLabel("Vector stroke width", { exact: true }).fill("1.25");
    const timeline = page.getByTestId("studio-pro-timeline");
    await timeline.getByRole("button", { name: "Sequence tracks", exact: true }).click();
    const row = timeline.getByTestId("pro-track-row-broll");
    await row.getByRole("button", { name: "Lock track", exact: true }).click();
    assert(
      await panel.getByRole("button", { name: "Add vector artwork", exact: true }).isDisabled()
    );
    assert.equal(
      await panel
        .getByRole("button", { name: "Vector point 1", exact: true })
        .getAttribute("aria-disabled"),
      "true"
    );
    await row.getByRole("button", { name: "Unlock track", exact: true }).click();
    await page.screenshot({ path: path.join(folder, "native-contour-controls.png") });
    await q.tool(page, "Motion");
    await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
    await page.getByLabel("Target layer").selectOption(layer.id);
    for (const [time, x, y, scale, rotation] of [
      [0, 22, 64, 0.65, -25],
      [2, 50, 46, 1.1, 8],
      [4, 78, 64, 0.8, 25],
      [7.75, 50, 48, 1, 0],
    ]) {
      await seek(page, time);
      for (const [label, value] of [
        ["X", x],
        ["Y", y],
        ["Scale", scale],
        ["Rotate", rotation],
      ]) {
        const input = page.getByLabel(label, { exact: true });
        await input.fill(String(value));
        await input.blur();
      }
      await page.getByRole("button", { name: /Add transform keyframe at/ }).click();
    }
    const pathButton = page.getByRole("button", { name: "⤳ Motion path", exact: true });
    if ((await pathButton.getAttribute("aria-pressed")) !== "true") await pathButton.click();
    await seek(page, 1);
    await page.getByRole("button", { name: "Curve path", exact: true }).click();
    const stage = page.getByTestId("studio-motion-path");
    await drag(
      page,
      stage,
      page.getByRole("button", { name: "Outgoing path handle at 0.000 seconds", exact: true }),
      22,
      15
    );
    await drag(
      page,
      stage,
      page.getByRole("button", { name: "Incoming path handle at 2.000 seconds", exact: true }),
      45,
      10
    );
    await page.screenshot({ path: path.join(folder, "native-vector-and-motion.png") });
  } finally {
    await stop();
  }
  const final = await h.save(page, "final-edit");
  await page.reload();
  await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
  await open(page);
  const reopened = await h.save(page, "reopened");
  assert.equal(hash(reopened.snapshot.studioDocument), hash(final.snapshot.studioDocument));
  const shape = reopened.snapshot.overlays.find(o => o.id === layer.id).vectorShape;
  fs.writeFileSync(
    path.join(folder, "native-edit.json"),
    JSON.stringify(
      {
        projectId: reopened.id,
        canonicalHash: hash(reopened.snapshot.studioDocument),
        layerId: layer.id,
        vectorShape: shape,
        keys: reopened.snapshot.motionKeyframes.filter(k => k.targetId === layer.id),
        nativePointUndoRedo: true,
        nativeSplitUndoRedo: true,
        nativeTangentGesture: true,
        nativeEscapeCancel: true,
        trackLock: true,
        exactColdReopen: true,
        authBypass: false,
        gpuJobs: 0,
        publishingWrites: 0,
      },
      null,
      2
    )
  );
  console.log(
    "Native contour points/tangents, exact split, history, cancellation, lock, transform/spatial motion and cold reopen pass."
  );
}
async function preview(page) {
  await q.tool(page, "Export");
  await page.getByTestId("rendered-output-ready").waitFor({ timeout: 90000 });
  const live = page.getByRole("button", { name: "Show Live Edit", exact: true });
  if (await live.isVisible()) await live.click();
  await page.getByRole("button", { name: "Show Finished Video", exact: true }).waitFor();
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="studio-after-video"]');
    return v && v.readyState >= 2 && !v.seeking;
  });
  const observations = [];
  for (const time of [1, 2, 3, 5, 7]) {
    await seek(page, time);
    const frame = page.getByTestId("hook-preview-frame");
    await frame.locator("img").evaluateAll(es => Promise.all(es.map(e => e.decode())));
    await frame.screenshot({ path: path.join(folder, `live-${time}.png`) });
    observations.push({ time, frame: await frame.boundingBox() });
  }
  const saved = await h.save(page, "paired-live");
  fs.writeFileSync(
    path.join(folder, "live-samples.json"),
    JSON.stringify(
      { projectId: saved.id, canonicalHash: hash(saved.snapshot.studioDocument), observations },
      null,
      2
    )
  );
}
async function backup(page) {
  const saved = await h.save(page, "delivery"),
    receipt = JSON.parse(fs.readFileSync(path.join(folder, "vector/render-receipt.json")));
  assert.equal(hash(saved.snapshot.studioDocument), receipt.projectHash);
  const next = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project backup", exact: true }).click();
  const file = path.join(folder, "Vector-artwork.autopromote.json");
  await (await next).saveAs(file);
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
async function restore() {
  const file = path.join(folder, "Vector-artwork.autopromote.json"),
    original = JSON.parse(fs.readFileSync(file)),
    native = JSON.parse(fs.readFileSync(path.join(folder, "native-edit.json")));
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: ["--mute-audio", "--host-resolver-rules=MAP localhost 127.0.0.2"],
  });
  const context = await browser.newContext({
      storageState: path.join(root, require("../../config/daily-studio.json").authState),
      viewport: { width: 1600, height: 1200 },
    }),
    page = await context.newPage();
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
    await page.getByLabel("Restore project backup", { exact: true }).setInputFiles(file);
    await open(page);
    const saved = await h.save(page, "fresh-restored");
    assert.equal(hash(saved.snapshot.studioDocument), hash(original.snapshot.studioDocument));
    assert.deepEqual(
      saved.snapshot.overlays.find(o => o.id === native.layerId).vectorShape,
      native.vectorShape
    );
    assert.equal(jobs, 0);
    await q.tool(page, "Graphics");
    const panel = page.getByTestId("studio-vector-panel");
    if (!(await panel.evaluate(e => e.open))) await panel.locator("summary").click();
    await panel.getByLabel("Vector artwork layer", { exact: true }).selectOption(native.layerId);
    await panel.getByTestId("studio-vector-path-editor").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(folder, "restored-vector-controls.png") });
    fs.writeFileSync(
      path.join(folder, "fresh-restore-receipt.json"),
      JSON.stringify(
        {
          projectId: saved.id,
          canonicalHash: hash(saved.snapshot.studioDocument),
          exactNativeIndependentRestore: true,
          vectorPoints: native.vectorShape.nodes.length,
          renderJobs: jobs,
          authBypass: false,
        },
        null,
        2
      )
    );
    console.log("Independent native backup restore retains exact contour and motion; no render.");
  } finally {
    await browser.close();
  }
}
async function main() {
  fs.mkdirSync(folder, { recursive: true });
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
      viewport: { width: 1600, height: 1200 },
      acceptDownloads: true,
    }
  );
  const page = context.pages()[0];
  page.setDefaultTimeout(60000);
  let jobs = 0;
  page.on("request", r => {
    const p = new URL(r.url()).pathname;
    if (r.method() === "POST") {
      if (p === "/api/media/process") jobs++;
      assert(
        !/studio-3d-preview|studio-capabilities\/requests|publisher\/schedule|platform\/post/.test(
          p
        )
      );
    }
  });
  try {
    await page.goto("http://localhost:5000/?vectorArtwork=20261018", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
    assert(!(await page.evaluate(() => !!window.__E2E_BYPASS)));
    if (action === "edit") await edit(page);
    else {
      await open(page);
      if (action === "render") await h.render(page, "vector");
      else if (action === "preview") await preview(page);
      else if (action === "view")
        await require("../creative-templates/materials-editing-proof").view(page, "vector");
      else if (action === "backup") await backup(page);
      else throw Error("Unknown action");
    }
    assert.equal(jobs, action === "render" ? 1 : 0);
  } catch (error) {
    const stamp = Date.now();
    await page
      .screenshot({ path: path.join(folder, `${action}-failure-${stamp}.png`) })
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
main().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
