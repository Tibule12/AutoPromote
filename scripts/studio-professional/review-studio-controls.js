#!/usr/bin/env node
// Read the real native Studio controls using an independently restored owner backup.
const fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, "../.."),
  report = path.join(root, "reports/studio-ui-controls-20261021"),
  stage = process.argv[2] || "before";
fs.mkdirSync(path.join(report, stage), { recursive: true });
Object.assign(process.env, {
  STUDIO_TEMPLATE_PROOF_DIR: path.join(report, stage),
  STUDIO_KINETIC_PROOF_DIR: path.join(report, stage),
});
const h = require("../creative-templates/studio-proof"),
  q = require("../../test/e2e/playwright/studio-stability/run"),
  { pause, seek } = require("./kinetic-type-proof"),
  { hash } = require("../../src/creativeTemplates/contract");
(async () => {
  const b = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: [
      "--mute-audio",
      "--host-resolver-rules=MAP localhost 127.0.0.7",
      "--no-proxy-server",
      "--disable-http2",
      "--disable-quic",
      "--remote-debugging-port=9848",
      "--remote-debugging-address=127.0.0.1",
    ],
  });
  const c = await b.newContext({
      storageState: require("../creative-templates/studio-session").sessionPath,
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    }),
    p = await c.newPage();
  p.setDefaultTimeout(60000);
  let jobs = 0,
    publishing = 0;
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  p.on("request", r => {
    const n = new URL(r.url()).pathname;
    if (
      r.method() === "POST" &&
      (/\/api\/media\/process$/.test(n) || /generate|studio-3d-preview|subject-vfx/.test(n))
    )
      jobs++;
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) &&
      /^\/api\/(content|publisher|platform)\//.test(n)
    )
      publishing++;
  });
  try {
    await p.goto("http://localhost:5000/");
    await p
      .getByRole("button", { name: "Viral Clip Studio", exact: true })
      .click({ timeout: 120000 });
    assert(!(await p.evaluate(() => !!window.__E2E_BYPASS)));
    const file = path.join(
        root,
        "reports/welcome-studio-reel-20261021/proof/FROM-THE-FRAME-SELECTED.autopromote.json"
      ),
      backup = JSON.parse(fs.readFileSync(file));
    await p.waitForFunction(
      () => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false
    );
    await p.getByLabel("Restore project backup", { exact: true }).setInputFiles(file);
    await p
      .getByRole("region", { name: "Saved Studio projects", exact: true })
      .getByRole("button", { name: backup.name, exact: true })
      .click();
    await h.rail(p);
    await pause(p);
    const before = await h.save(p, "restored");
    assert.equal(hash(before.snapshot.studioDocument), hash(backup.snapshot.studioDocument));
    await p.getByRole("button", { name: "Hide media", exact: true }).click();
    await seek(p, 11.3);
    const result = [];
    const responsive = [];
    let editUndo;
    const inspect = (e, tool) => {
      const bounds = e.getBoundingClientRect();
      const controls = [...e.querySelectorAll("input:not([type=file]),select,button,textarea")]
        .filter(x => {
          const r = x.getBoundingClientRect();
          return r.width && r.height && getComputedStyle(x).opacity !== "0";
        })
        .map(x => {
          const r = x.getBoundingClientRect(),
            s = getComputedStyle(x);
          return {
            type: x.tagName + "/" + (x.type || ""),
            label: x.getAttribute("aria-label") || x.textContent.trim().slice(0, 80),
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            fontSize: s.fontSize,
            outsidePanel: r.left < bounds.left - 1 || r.right > bounds.right + 1,
            overflow: x.scrollWidth > x.clientWidth + 1,
          };
        });
      return {
        tool,
        width: e.clientWidth,
        scrollWidth: e.scrollWidth,
        scrollHeight: e.scrollHeight,
        height: e.clientHeight,
        controls,
      };
    };
    for (const tool of [
      "Motion",
      "Graphics",
      "B-roll",
      "Sound",
      "Color",
      "Reframe",
      "Cut",
      "Composite",
      "Export",
    ]) {
      await q.tool(p, tool);
      if (tool === "Motion") {
        await p.getByRole("button", { name: "Transform keyframes", exact: true }).click();
        await p
          .getByLabel("Target layer", { exact: true })
          .selectOption(before.snapshot.overlays[0].id);
      }
      await p.locator(".studio-sidebar").evaluate(e => (e.scrollTop = 0));
      await p.waitForTimeout(250);
      await p.getByTestId("viral-studio-workspace").screenshot({
        path: path.join(report, stage, `${tool.toLowerCase().replace(/[^a-z]/g, "")}-desktop.png`),
      });
      result.push(await p.locator(".studio-sidebar").evaluate(inspect, tool));
    }
    if (stage !== "before") {
      for (const viewport of [
        { width: 1280, height: 800 },
        { width: 1024, height: 768 },
        { width: 900, height: 900 },
      ]) {
        await p.setViewportSize(viewport);
        for (const tool of [
          "Motion",
          "Graphics",
          "Sound",
          "Color",
          "Reframe",
          "Composite",
          "Export",
        ]) {
          await q.tool(p, tool);
          await p.locator(".studio-sidebar").evaluate(e => (e.scrollTop = 0));
          await p.waitForTimeout(100);
          const check = await p.locator(".studio-sidebar").evaluate(inspect, tool);
          responsive.push({ viewport, ...check });
          await p.screenshot({
            path: path.join(report, stage, `${tool.toLowerCase()}-${viewport.width}.png`),
          });
        }
      }
      await p.setViewportSize({ width: 1440, height: 1000 });
      fs.writeFileSync(
        path.join(report, stage, "layout-inspection.json"),
        JSON.stringify({ result, responsive }, null, 2)
      );
      await q.tool(p, "Motion");
      await p.getByRole("button", { name: "Transform keyframes", exact: true }).click();
      await p
        .getByLabel("Target layer", { exact: true })
        .selectOption(before.snapshot.overlays[0].id);
      console.log("All desktop layouts captured; checking native edit and Undo.");
      const x = p.getByLabel("X", { exact: true });
      const oldValue = await x.inputValue();
      await x.fill(String(Number(oldValue) + 1));
      await x.blur();
      const editData = document => ({ ...document, revision: 0, journal: [] });
      const edited = await h.save(p, "native-ui-edit");
      assert.notDeepEqual(
        editData(edited.snapshot.studioDocument),
        editData(before.snapshot.studioDocument)
      );
      await p.getByTitle("Undo (Ctrl/Cmd+Z)", { exact: true }).click();
      const restored = await h.save(p, "after-ui-edit-undo");
      // History legitimately advances revision/journal while restoring all edit data.
      assert.deepEqual(
        editData(restored.snapshot.studioDocument),
        editData(before.snapshot.studioDocument)
      );
      editUndo = {
        passed: true,
        oldValue: Number(oldValue),
        editedValue: Number(oldValue) + 1,
        originalRevision: before.snapshot.studioDocument.revision,
        undoRevision: restored.snapshot.studioDocument.revision,
        sameEditData: true,
        historyMetadataExcluded: ["revision", "journal"],
      };
      console.log("Native edit/Undo restored all edit data; history revision advanced normally.");
      for (const viewport of [
        { width: 820, height: 1000 },
        { width: 390, height: 844 },
      ]) {
        await p.setViewportSize(viewport);
        await p
          .getByText("Clip Studio and Cam Combiner are optimized for laptop and desktop editing.", {
            exact: false,
          })
          .waitFor();
        assert.equal(await p.getByTestId("viral-studio-workspace").count(), 0);
        responsive.push({ viewport, desktopOnlyBoundary: true });
        await p.screenshot({
          path: path.join(report, stage, `desktop-required-${viewport.width}.png`),
        });
      }
    }
    fs.writeFileSync(
      path.join(report, stage, "inspection.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          result,
          responsive,
          editUndo,
          errors,
          jobs,
          publishing,
          originalCanonicalHash: hash(before.snapshot.studioDocument),
        },
        null,
        2
      )
    );
    console.log("Native control baseline captured.");
    if (process.env.STUDIO_UI_KEEP_OPEN === "1") {
      fs.writeFileSync(path.join(report, stage, "ready.json"), JSON.stringify({ ready: true }));
      await p.waitForTimeout(30 * 60000);
    }
    assert.equal(jobs, 0);
    assert.equal(publishing, 0);
    assert.deepEqual(errors, []);
    if (stage !== "before")
      for (const panel of [...result, ...responsive].filter(e => e.controls)) {
        assert.deepEqual(
          panel.controls.filter(e => e.outsidePanel),
          [],
          `${panel.tool} controls extend beyond the inspector`
        );
      }
  } catch (e) {
    console.error(e.stack);
    await p.screenshot({ path: path.join(report, stage, "failure.private.png") }).catch(() => {});
    fs.writeFileSync(
      path.join(report, stage, "failure.private.txt"),
      (await p.locator("body").innerText()).slice(-16000),
      { mode: 0o600 }
    );
    throw e;
  } finally {
    await c.close();
    await b.close();
  }
})().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
