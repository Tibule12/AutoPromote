#!/usr/bin/env node
// Ordinary authenticated Studio controls only. No graph/auth/route injection.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, "../.."),
  folder = path.join(root, "reports/studio-vector-offset-20261018/proof");
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
const name = "Find your flow — native stroke loops · 20261018";
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
  const projects = page.getByRole("region", { name: "Saved Studio projects", exact: true });
  await projects.waitFor({ timeout: 90000 });
  await projects.getByRole("button", { name, exact: true }).click();
  await page.getByTestId("studio-pro-timeline").waitFor({ timeout: 90000 });
  await pause(page);
  const show = page.getByRole("button", { name: "Show media", exact: true });
  if (await show.isVisible()) {
    await show.focus();
    await page.keyboard.press("Enter");
  }
  await page.locator(".studio-project-rail__head").waitFor({ timeout: 90000 });
  const head = page.locator(".studio-project-rail__head");
  if (!(await head.evaluate(e => e.open))) {
    await head.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
  }
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
  await svg.scrollIntoViewIfNeeded();
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
  const layers = [];
  for (let index = 0; index < 3; index++) {
    await q.tool(page, "Graphics");
    const panel = page.getByTestId("studio-vector-panel");
    if (!(await panel.evaluate(e => e.open))) await panel.locator("summary").click();
    const current = await h.save(page, `before-ring-${index}`);
    let layer = current.snapshot.overlays.filter(o => o.vectorShape)[index];
    if (!layer) {
      await panel.getByRole("button", { name: "Add vector artwork", exact: true }).click();
      await panel.getByRole("status").waitFor({ state: "hidden" });
      layer = (await h.save(page, `ring-${index}-added`)).snapshot.overlays.filter(
        o => o.vectorShape
      )[index];
    }
    layers.push(layer.id);
    await panel.getByLabel("Vector artwork layer", { exact: true }).selectOption(layer.id);
    await panel.getByLabel("Vector stroke width", { exact: true }).fill("3");
    await panel
      .getByLabel("Vector stroke color", { exact: true })
      .fill(["#00d4ff", "#a65cff", "#ffce57"][index]);
    await panel.getByLabel("Vector fill", { exact: true }).selectOption("none");
    const points = [
        [50, 12],
        [83, 31],
        [83, 69],
        [50, 88],
        [17, 69],
        [17, 31],
      ],
      svg = panel.getByTestId("studio-vector-path-editor");
    for (let node = 0; node < 6; node++) {
      await panel
        .getByLabel("Selected vector point", { exact: true })
        .selectOption({ value: String(node) });
      await panel.getByRole("button", { name: "Corner point", exact: true }).click();
      await drag(
        page,
        svg,
        panel.getByRole("button", { name: `Vector point ${node + 1}`, exact: true }),
        ...points[node]
      );
    }
    for (let node = 0; node < 6; node++) {
      await panel
        .getByLabel("Selected vector point", { exact: true })
        .selectOption({ value: String(node) });
      await panel.getByRole("button", { name: "Smooth point", exact: true }).click();
      await page.waitForTimeout(150);
    }
    await h.save(page, `ring-${index}-shaped`);
  }
  const stop = await record(page);
  try {
    await q.tool(page, "Motion");
    await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
    for (let index = 0; index < 3; index++) {
      await page.getByLabel("Target layer", { exact: true }).selectOption(layers[index]);
      await seek(page, 0);
      const width = [48, 39, 30][index];
      await page.getByLabel("Motion layer width", { exact: true }).fill(String(width));
      await page.getByLabel("Motion layer height", { exact: true }).fill(String((width * 16) / 9));
      await page.getByLabel("Motion layer duration", { exact: true }).fill("8");
      await page.getByLabel("Rotate", { exact: true }).fill(String(index * 30));
      await page.getByLabel("Stroke start", { exact: true }).fill("0");
      await page.getByLabel("Stroke end", { exact: true }).fill(String([28, 35, 22][index]));
      const poses = [
        [0, 0],
        [2, 85],
        [4, 185],
        [6, 100],
        [7.75, 0],
      ];
      for (const [time, travel] of poses) {
        await seek(page, time);
        await page
          .getByLabel("Stroke offset", { exact: true })
          .fill(String((index === 1 ? -1 : 1) * travel + index * 33));
        await page.getByLabel("Stroke offset", { exact: true }).blur();
        const add = page.getByRole("button", {
          name: "Add stroke offset key at playhead",
          exact: true,
        });
        if (await add.count()) await add.click();
      }
    }
    await page.getByLabel("Target layer", { exact: true }).selectOption(layers[0]);
    await seek(page, 1);
    const before = await h.save(page, "offset-authored");
    assert.equal(
      before.snapshot.motionKeyframes.filter(
        k => layers.includes(k.targetId) && k.property === "strokeOffset"
      ).length,
      15
    );
    const input = page.getByLabel("Stroke offset", { exact: true });
    assert.equal(Number(await input.inputValue()), 42.5);
    await input.fill("63");
    await input.blur();
    const changed = await h.save(page, "offset-midpoint-added");
    await page.getByTestId("studio-undo-button").click();
    assert.equal(
      decisions((await h.save(page, "offset-undo")).snapshot.studioDocument),
      decisions(before.snapshot.studioDocument)
    );
    await page.getByTestId("studio-redo-button").click();
    assert.equal(
      decisions((await h.save(page, "offset-redo")).snapshot.studioDocument),
      decisions(changed.snapshot.studioDocument)
    );
    await page
      .getByRole("button", { name: "Remove stroke offset key at playhead", exact: true })
      .click();
    const timeline = page.getByTestId("studio-pro-timeline");
    await timeline.getByRole("button", { name: "Sequence tracks", exact: true }).click();
    const row = timeline.getByTestId("pro-track-row-broll");
    await row.getByRole("button", { name: "Lock track", exact: true }).click();
    assert(await input.isDisabled());
    await row.getByRole("button", { name: "Unlock track", exact: true }).click();
    await seek(page, 0);
    await q.tool(page, "Graphics");
    await page.getByRole("button", { name: "H1 Headline Bold hook copy", exact: true }).click();
    await page.getByLabel("Title text", { exact: true }).fill("FIND\nYOUR FLOW");
    await page.getByLabel("Title duration", { exact: true }).fill("8");
    await page.getByLabel("Title start time", { exact: true }).fill("0");
    await page
      .getByTestId("title-editor")
      .getByRole("button", { name: "Center", exact: true })
      .click();
    await page.getByLabel("Title size", { exact: true }).evaluate((e, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, String(v));
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    }, 0.95);
    await page.getByLabel("Title outline width", { exact: true }).evaluate(e => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, "0");
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await q.tool(page, "Sound");
    await page
      .locator("#studio-background-sound-input")
      .setInputFiles(path.join(root, "reports/studio-vector-offset-20261018/orbit-score.mp3"));
    await page.getByLabel("Keep original audio", { exact: false }).uncheck();
    await page.getByLabel("Duck under speech", { exact: false }).uncheck();
    await q.tool(page, "Motion");
    await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
    await page.getByLabel("Target layer", { exact: true }).selectOption(layers[0]);
    await seek(page, 1.5);
    await page.screenshot({ path: path.join(folder, "native-loop-controls.png") });
    await timeline.getByRole("button", { name: "Composition layers", exact: true }).click();
    const show = timeline.getByRole("button", { name: "Show motion keyframes", exact: true });
    if (await show.count()) await show.click();
    const values = page.getByLabel("Vector artwork strokeOffset value", { exact: true });
    const expand = timeline.getByRole("button", {
      name: "Expand Vector artwork keyframes",
      exact: true,
    });
    if (!(await values.count()) && (await expand.count())) await expand.first().click();
    await values.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(folder, "native-loop-property-rows.png") });
  } finally {
    await stop();
  }
  const final = await h.save(page, "final-edit");
  await page.reload();
  await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
  await open(page);
  const reopened = await h.save(page, "reopened");
  assert.equal(hash(reopened.snapshot.studioDocument), hash(final.snapshot.studioDocument));
  const layer = reopened.snapshot.overlays.find(o => o.id === layers[0]);
  const shape = layer.vectorShape;
  fs.writeFileSync(
    path.join(folder, "native-edit.json"),
    JSON.stringify(
      {
        projectId: reopened.id,
        canonicalHash: hash(reopened.snapshot.studioDocument),
        layerId: layer.id,
        vectorShape: shape,
        layers: reopened.snapshot.overlays
          .filter(o => o.vectorShape)
          .map(o => ({
            id: o.id,
            vectorShape: o.vectorShape,
            strokeStart: o.strokeStart,
            strokeEnd: o.strokeEnd,
            rotation: o.rotation,
          })),
        allKeys: reopened.snapshot.motionKeyframes,
        keys: reopened.snapshot.motionKeyframes.filter(k => k.targetId === layer.id),
        nativeTrimUndoRedo: true,
        nativePerPropertyKeyToggle: true,
        nativeEvaluatedStrokeValues: true,
        nativeTimelineStrokeRows: true,
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
    "Native three-ring offset keys, authored contours, history, lock, property rows and cold reopen pass."
  );
}
async function alignContours(page) {
  const native = JSON.parse(fs.readFileSync(path.join(folder, "native-edit.json")));
  for (const layer of native.layers) {
    await q.tool(page, "Graphics");
    const panel = page.getByTestId("studio-vector-panel");
    if (!(await panel.evaluate(e => e.open))) await panel.locator("summary").click();
    await panel.getByLabel("Vector artwork layer", { exact: true }).selectOption(layer.id);
    await panel.getByLabel("Selected vector point", { exact: true }).selectOption({ value: "5" });
    await panel.getByRole("button", { name: "Smooth point", exact: true }).click();
    await page.waitForTimeout(200);
    const saved = await h.save(page, `last-tangent-${layer.id}`);
    const shape = saved.snapshot.overlays.find(l => l.id === layer.id).vectorShape;
    const a = shape.nodes[4],
      b = shape.nodes[0],
      actual = shape.nodes[5];
    assert(
      Math.abs(actual.out[0] - (b.x - a.x) / 6) < 0.0001 &&
        Math.abs(actual.out[1] - (b.y - a.y) / 6) < 0.0001
    );
  }
  await q.tool(page, "Motion");
  await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
  await page.getByLabel("Target layer", { exact: true }).selectOption(native.layerId);
  await seek(page, 0);
  const beforeTyping = await h.save(page, "before-signed-keyboard");
  const input = page.getByLabel("Stroke offset", { exact: true });
  await input.fill("");
  await input.pressSequentially("-25", { delay: 40 });
  assert.equal(await input.inputValue(), "-25");
  await input.blur();
  const typed = await h.save(page, "signed-keyboard");
  assert.equal(
    typed.snapshot.motionKeyframes.find(
      k => k.targetId === native.layerId && k.property === "strokeOffset" && k.time === 0
    ).value,
    -25
  );
  await page.getByTestId("studio-undo-button").click();
  assert.equal(
    decisions((await h.save(page, "signed-keyboard-undo")).snapshot.studioDocument),
    decisions(beforeTyping.snapshot.studioDocument)
  );
  const saved = await h.save(page, "aligned-contours");
  const next = {
    ...native,
    canonicalHash: hash(saved.snapshot.studioDocument),
    vectorShape: saved.snapshot.overlays.find(l => l.id === native.layerId).vectorShape,
    layers: saved.snapshot.overlays
      .filter(l => l.vectorShape)
      .map(l => ({
        id: l.id,
        vectorShape: l.vectorShape,
        strokeStart: l.strokeStart,
        strokeEnd: l.strokeEnd,
        rotation: l.rotation,
      })),
    allKeys: saved.snapshot.motionKeyframes,
  };
  fs.writeFileSync(
    path.join(folder, "native-edit-before-last-tangent.json"),
    JSON.stringify(native, null, 2)
  );
  fs.writeFileSync(path.join(folder, "native-edit.json"), JSON.stringify(next, null, 2));
  await page.reload();
  await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
  await open(page);
  assert.equal(
    hash((await h.save(page, "aligned-cold-reopen")).snapshot.studioDocument),
    next.canonicalHash
  );
}
async function levelScore(page) {
  await q.tool(page, "Sound");
  await seek(page, 0);
  const range = async (locator, value) =>
    locator.evaluate((e, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, String(v));
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  await range(page.getByLabel("Background volume", { exact: false }), 60);
  await page.getByLabel("Automation source", { exact: true }).selectOption("music");
  const slider = page.getByLabel("music volume at 0.00 seconds", { exact: true });
  if (!(await slider.count()))
    await page.getByRole("button", { name: /Add volume keyframe at 0.00s/ }).click();
  await range(slider, 180);
  const saved = await h.save(page, "native-score-level");
  assert.equal(saved.snapshot.musicTrack.volume, 0.6);
  assert.equal(saved.snapshot.audioKeyframes.music[0].value, 180);
  const file = path.join(folder, "native-edit.json"),
    native = JSON.parse(fs.readFileSync(file));
  fs.writeFileSync(
    path.join(folder, "native-edit-before-level.json"),
    JSON.stringify(native, null, 2)
  );
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        ...native,
        canonicalHash: hash(saved.snapshot.studioDocument),
        nativeMusicGain: 180,
        nativeMusicVolume: 0.6,
      },
      null,
      2
    )
  );
  await page.reload();
  await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
  await open(page);
  assert.equal(
    hash((await h.save(page, "score-cold-reopen")).snapshot.studioDocument),
    hash(saved.snapshot.studioDocument)
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
  await page.keyboard.press("Escape");
  await page.getByTestId("hook-preview-frame").click({ position: { x: 10, y: 10 } });
  await pause(page);
  const observations = [];
  for (const time of [0, 0.5, 1, 1.5, 2.5, 3, 4, 4.5, 5.5, 7]) {
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
  const file = path.join(folder, "Find-your-flow.autopromote.json");
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
  const file = path.join(folder, "Find-your-flow.autopromote.json"),
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
  page.on("pageerror", error =>
    fs.appendFileSync(path.join(folder, "runtime-errors.private.log"), String(error.stack) + "\n", {
      mode: 0o600,
    })
  );
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
      if (action === "align") await alignContours(page);
      else if (action === "level") await levelScore(page);
      else if (action === "verify") {
        const saved = await h.save(page, "verified-current");
        const native = JSON.parse(fs.readFileSync(path.join(folder, "native-edit.json")));
        assert.equal(hash(saved.snapshot.studioDocument), native.canonicalHash);
        console.log("Exact cold project and native music level verified.");
      } else if (action === "render") await h.render(page, "vector");
      else if (action === "preview") await preview(page);
      else if (action === "delivery") {
        await preview(page);
        await backup(page);
        await require("../creative-templates/materials-editing-proof").view(page, "vector");
      } else if (action === "view")
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
