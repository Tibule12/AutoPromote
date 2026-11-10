#!/usr/bin/env node
/**
 * Headless, muted browser QA + paired local CPU FFmpeg pixel parity verification
 * for Viral Clip Studio's AutoPromote Comp & Rig + Signal Node Flow workbench.
 *
 * Enforces:
 * - HeadlessChrome (`--headless`, `--disable-gpu`, `--mute-audio`) verified via CDP
 * - Zero auth bypass (`!window.__E2E_BYPASS`), zero cloud/API writes, zero GPU calls
 * - Zero third-party competitor brand strings in visible UI text, aria-labels, or titles
 * - Multi-viewport layout verification (`1440x1000`, `1280x860`, `1024x820`)
 * - Real UI authoring of Null Rig, Pick-Whip Parenting, Alpha Track Matte,
 *   Motion Drivers (`loop` cycle, `wiggle`, `spin`), Speed Graph `Whip Snap` Bezier curve,
 *   Signal Node Flow Dual `[1]`/`[2]` A/B viewer wipe, Undo/Redo, cold reload IndexedDB SHA-256 parity,
 *   signed-out export guard (`Please login first`), and 4-frame CPU FFmpeg pixel parity (`IoU >= 0.95`, `p95 <= 2.0px`).
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const sharedNodeModules = path.resolve(root, "../AutoPromote/node_modules");
if (
  !fs.existsSync(path.join(root, "node_modules/@playwright/test")) &&
  fs.existsSync(sharedNodeModules)
) {
  process.env.NODE_PATH = process.env.NODE_PATH
    ? `${sharedNodeModules}${path.delimiter}${process.env.NODE_PATH}`
    : sharedNodeModules;
  Module._initPaths();
}
const { chromium } = require("@playwright/test");
const folder = path.resolve(
  root,
  process.env.STUDIO_MOTIONFLOW_FOLDER || "reports/studio-motion-flow-parity-20261031"
);
const port = Number(process.env.STUDIO_MOTIONFLOW_PORT || 5027);
const pythonBin =
  process.env.STUDIO_PYTHON_BIN ||
  "/home/tibule12/Projects/AutoPromte/AutoPromote/.venv/bin/python";
const projectName = "AutoPromote Motion Flow Parity 20261031";
const parityTimes = [0.5, 1.5, 2.5, 3.5];

const sha256Json = value =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function startFixtureServer() {
  fs.mkdirSync(folder, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts/run-studio-interaction-preview.js")], {
      cwd: root,
      env: {
        ...process.env,
        STUDIO_MOTIONFLOW_FIXTURE: "1",
        STUDIO_INTERACTION_PORT: String(port),
        STUDIO_INTERACTION_FOLDER: folder,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutBuf = "";
    let stderrBuf = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timed out waiting for fixture server on port ${port}.\n${stderrBuf}`));
    }, 120000);

    child.stdout.on("data", chunk => {
      stdoutBuf += chunk.toString("utf8");
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.ready && Number(parsed.port) === port) {
            clearTimeout(timer);
            resolve(child);
          }
        } catch (_err) {
          // Ignore non-JSON log lines
        }
      }
    });

    child.stderr.on("data", chunk => {
      stderrBuf += chunk.toString("utf8");
    });

    child.on("exit", code => {
      clearTimeout(timer);
      reject(
        new Error(
          `Fixture server exited prematurely with code ${code}.\nSTDOUT: ${stdoutBuf}\nSTDERR: ${stderrBuf}`
        )
      );
    });
  });
}

async function readSavedStudioDocument(page, targetName) {
  return page.evaluate(async expectedName => {
    const records = await new Promise((resolve, reject) => {
      const open = indexedDB.open("autopromote-viral-studio");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("projects", "readonly");
        const req = tx.objectStore("projects").getAll();
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
        req.onsuccess = () => {
          db.close();
          resolve(req.result || []);
        };
      };
    });
    const found = records.find(item => item.name === expectedName);
    if (!found?.snapshot?.studioDocument) {
      throw new Error(`Saved project "${expectedName}" missing studioDocument in IndexedDB`);
    }
    return {
      id: found.id,
      name: found.name,
      studioDocument: found.snapshot.studioDocument,
    };
  }, targetName);
}

async function assertCleanAutoPromoteBranding(page) {
  const leaks = await page.evaluate(() => {
    const forbidden = /\b(adobe|after\s*effects|davinci|fusion|premiere|capcut|final\s*cut|ae)\b/i;
    const found = [];
    const bodyText = document.body?.innerText || "";
    for (const line of bodyText.split(/\r?\n/)) {
      if (forbidden.test(line)) {
        found.push({ kind: "text", value: line.trim().slice(0, 120) });
      }
    }
    for (const el of document.querySelectorAll("[aria-label], [title]")) {
      const aria = el.getAttribute("aria-label") || "";
      const title = el.getAttribute("title") || "";
      if (forbidden.test(aria)) found.push({ kind: "aria-label", value: aria });
      if (forbidden.test(title)) found.push({ kind: "title", value: title });
    }
    return found;
  });
  assert.deepEqual(
    leaks,
    [],
    `Competitor brand names leaked into Studio UI: ${JSON.stringify(leaks)}`
  );
}

async function main() {
  fs.mkdirSync(folder, { recursive: true });
  console.log(`[motionflow] Starting local loopback fixture server on 127.0.0.1:${port}...`);
  const server = await startFixtureServer();

  let browser;
  const checks = [];
  const pageErrors = [];
  const consoleErrors = [];
  const apiRequests = [];
  let stage = "startup";

  const recordCheck = (label, detail = {}) => {
    checks.push({ label, ...detail });
    console.log(`[motionflow] PASS: ${label}`);
  };

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-gpu", "--mute-audio"],
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);

    // Verify HeadlessChrome strictly via CDP
    const cdp = await browser.newBrowserCDPSession();
    const versionInfo = await cdp.send("Browser.getVersion");
    await cdp.detach();
    assert(
      String(versionInfo.userAgent || "").includes("HeadlessChrome"),
      `Expected HeadlessChrome userAgent, got ${versionInfo.userAgent}`
    );
    recordCheck("Verified HeadlessChrome & muted browser launch via CDP", {
      product: versionInfo.product,
    });

    page.on("pageerror", err => pageErrors.push(err.message));
    page.on("console", msg => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("request", req => {
      if (req.url().includes("/api/")) {
        apiRequests.push(new URL(req.url()).pathname);
      }
    });

    const muteAndPause = async () => {
      await page.locator("video,audio").evaluateAll(nodes => {
        for (const el of nodes) {
          el.muted = true;
          el.volume = 0;
        }
      });
      const video = page.getByTestId("studio-after-video");
      const pauseEdited = page.getByRole("button", { name: "Pause edited preview", exact: true });
      const pauseComp = page.getByRole("button", { name: "Pause comparison", exact: true });
      if (await pauseEdited.isVisible().catch(() => false)) {
        await pauseEdited.click();
      } else if (await pauseComp.isVisible().catch(() => false)) {
        await pauseComp.click();
      } else if (!(await video.evaluate(el => el.paused))) {
        await video.evaluate(el => el.pause());
      }
      await page.waitForFunction(
        () => document.querySelector('[data-testid="studio-after-video"]')?.paused === true
      );
    };

    const seekOutputTime = async targetSeconds => {
      await muteAndPause();
      const scrubber = page.getByRole("slider", { name: "Edited output position" });
      await scrubber.evaluate((el, value) => {
        if (el._valueTracker) {
          el._valueTracker.setValue("__force_seek__");
        }
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        ).set;
        setter.call(el, String(value));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, targetSeconds);
      await page.waitForFunction(
        expected => {
          const v = document.querySelector('[data-testid="studio-after-video"]');
          return v && !v.seeking && v.readyState >= 2 && Math.abs(v.currentTime - expected) < 0.04;
        },
        targetSeconds
      );
      await page.evaluate(
        () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );
    };

    stage = "initial-load";
    await page.goto(`http://127.0.0.1:${port}/?fixture=motionflow`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3
    );
    await muteAndPause();
    assert.equal(await page.evaluate(() => Boolean(window.__E2E_BYPASS)), false);

    stage = "fxflow-mode-and-viewports";
    await page.getByTestId("studio-mode-fxflow").click();
    await page.getByTestId("studio-comp-workbench").waitFor({ state: "visible" });
    await page.getByTestId("studio-node-flow").waitFor({ state: "visible" });
    await muteAndPause();
    await assertCleanAutoPromoteBranding(page);

    const viewportMetrics = [];
    for (const [width, height] of [
      [1440, 1000],
      [1280, 860],
      [1024, 820],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(
        () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );
      const layout = await page.evaluate(() => {
        const box = sel => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height),
            right: Math.round(r.right),
            bottom: Math.round(r.bottom),
          };
        };
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          stage: box('[data-testid="hook-preview-frame"]'),
          compWorkbench: box('[data-testid="studio-comp-workbench"]'),
          nodeFlow: box('[data-testid="studio-node-flow"]'),
        };
      });
      assert(layout.stage && layout.stage.height >= 160 && layout.stage.width >= 90);
      assert(
        layout.compWorkbench &&
          layout.compWorkbench.x >= -2 &&
          layout.compWorkbench.right <= width + 2 &&
          layout.compWorkbench.height >= 150,
        `AutoPromote Comp Workbench overflowed at ${width}x${height}: ${JSON.stringify(layout)}`
      );
      assert(
        layout.nodeFlow &&
          layout.nodeFlow.right <= width + 2 &&
          layout.nodeFlow.width >= 240 &&
          layout.nodeFlow.height >= 180,
        `AutoPromote Signal Node Flow overflowed at ${width}x${height}: ${JSON.stringify(layout)}`
      );
      await page.screenshot({ path: path.join(folder, `viewport-${width}x${height}.png`) });
      viewportMetrics.push(layout);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    recordCheck("Verified AutoPromote Motion & Flow dual workbench + node graph layout across 1440x1000, 1280x860, and 1024x820 with zero competitor brand labels", {
      viewports: viewportMetrics,
    });

    stage = "author-comp-rig-and-node-flow";
    await seekOutputTime(0);

    // 1. Create Null Rig 1 at t = 0.00s
    await page.getByTestId("comp-add-null-rig").click();
    const nullGizmo = page.locator('[data-testid^="null-rig-gizmo-"]');
    await nullGizmo.waitFor({ state: "visible" });
    const nullTestId = await nullGizmo.getAttribute("data-testid");
    const nullId = nullTestId.replace(/^null-rig-gizmo-/, "");
    await page.getByTestId(`flow-node-NullRig:${nullId}`).waitFor({ state: "attached" });

    // 2. Parent both Ellipse Matte Source & Cyan Fill Plate to Null Rig 1 at t = 0.00s
    await page.getByLabel("Parent layer for Ellipse Matte Source", { exact: true }).selectOption(nullId);
    await page.getByLabel("Parent layer for Cyan Fill Plate", { exact: true }).selectOption(nullId);

    // 3. Assign Alpha Track Matte on Cyan Fill Plate sourced from Ellipse Matte Source
    await page.getByLabel("Track matte mode for Cyan Fill Plate", { exact: true }).selectOption("alpha");
    assert.equal(
      await page.getByLabel("Track matte source for Cyan Fill Plate", { exact: true }).inputValue(),
      "matte-plate"
    );
    assert(
      await page
        .getByTestId("comp-layer-row-matte-plate")
        .evaluate(el => el.classList.contains("is-matte-hidden"))
    );

    // 4. Select Null Rig 1 in AutoPromote Comp Workbench and author Motion Drivers + Keyframe Curves
    await page.getByTestId(`comp-layer-row-${nullId}`).locator(".ap-comp-layer-title").click();

    const propSelect = page.getByLabel("Motion driver target property", { exact: true });
    const driverSelect = page.getByLabel("Motion driver expression type", { exact: true });

    // 4a. Pos X: 38% @ 0.00s -> 62% @ 1.25s with Cycle Loop driver
    await propSelect.selectOption("x");
    await seekOutputTime(0);
    await page.getByTestId("comp-add-keyframe-playhead").click();
    await page.getByLabel("Selected keyframe value", { exact: true }).fill("38");
    await seekOutputTime(1.25);
    await page.getByTestId("comp-add-keyframe-playhead").click();
    await page.getByLabel("Selected keyframe value", { exact: true }).fill("62");
    await driverSelect.selectOption("loop");

    // 4b. Pos Y: Organic Wiggle driver
    await propSelect.selectOption("y");
    await driverSelect.selectOption("wiggle");

    // 4c. Rotation: Continuous Spin driver (45 deg/s)
    await propSelect.selectOption("rotation");
    await driverSelect.selectOption("spin");

    // 4d. Scale: 0.85x @ 0.00s (Whip Snap Bezier preset in Speed Graph) -> 1.18x @ 3.50s
    await propSelect.selectOption("scale");
    await seekOutputTime(0);
    await page.getByTestId("comp-add-keyframe-playhead").click();
    await page.getByLabel("Selected keyframe value", { exact: true }).fill("0.85");
    await page.getByRole("tab", { name: "Speed Graph", exact: true }).click();
    await page.getByTestId("comp-curve-preset-whip_snap").click();
    await seekOutputTime(3.5);
    await page.getByTestId("comp-add-keyframe-playhead").click();
    await page.getByLabel("Selected keyframe value", { exact: true }).fill("1.18");

    // 5. Verify Signal Node Flow Dock Swap + Dual Viewer [1]/[2] A/B Wipe + Cinema Color Grading Suite
    await page.getByTestId("dock-tab-node_flow").click();
    const dockFlow = page.getByTestId("studio-node-flow").last();
    await dockFlow.getByTestId("flow-node-ColorCorrector:finish").click();
    await dockFlow.getByTestId("flow-color-grade-suite").waitFor({ state: "visible" });
    await dockFlow.getByTestId("flow-color-scopes-card").waitFor({ state: "visible" });
    await dockFlow.getByTestId("flow-grade-keyframes-card").waitFor({ state: "visible" });
    await dockFlow.getByTestId("flow-3way-wheels-card").waitFor({ state: "visible" });
    await dockFlow.getByTestId("flow-tone-curve-card").waitFor({ state: "visible" });
    await dockFlow.getByTestId("flow-lut-lab-card").waitFor({ state: "visible" });
    await dockFlow.getByLabel("Assign ColorGrade to Viewer 2", { exact: true }).click();
    const wipeSlider = dockFlow.getByLabel("Signal Flow A/B viewer wipe split", { exact: true });
    await wipeSlider.waitFor({ state: "visible" });
    await assertCleanAutoPromoteBranding(page);
    await page.screenshot({ path: path.join(folder, "flow-ab-wipe-active.png") });
    // Toggle Viewer [2] off so stage renders clean single-viewer programme output, then return dock to Comp & Rig
    await dockFlow.getByLabel("Assign ColorGrade to Viewer 2", { exact: true }).click();
    assert.equal(await wipeSlider.count(), 0);
    await page.getByTestId("dock-tab-comp_rig").click();
    recordCheck("Authored Null Rig, Parenting, Alpha Track Matte, loop/wiggle/spin Drivers, Whip Snap Bezier Curve, and Signal Node Flow [1]/[2] wipe", {
      nullRigId: nullId,
    });

    stage = "undo-redo-check";
    await page.waitForTimeout(750);
    await page.getByTestId("comp-add-adjustment-layer").click();
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="comp-add-adjustment-layer"]')?.textContent?.includes("(1)")
    );
    await page.keyboard.press("Control+z");
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="comp-add-adjustment-layer"]')?.textContent?.includes("(0)")
    );
    await page.keyboard.press("Control+Shift+z");
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="comp-add-adjustment-layer"]')?.textContent?.includes("(1)")
    );
    // Leave adjustment grade undone so base slate #0a0f1a + #00e5ff cyan matte stays clean
    await page.keyboard.press("Control+z");
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="comp-add-adjustment-layer"]')?.textContent?.includes("(0)")
    );
    recordCheck("Verified keyboard Undo and Redo across canonical AutoPromote Motion & Flow edit history");

    stage = "save-and-cold-reload-indexeddb";
    const showMediaBtn = page.getByRole("button", { name: "Show media", exact: true });
    if (await showMediaBtn.isVisible().catch(() => false)) {
      await showMediaBtn.click();
    }
    const railHead = page.locator(".studio-project-rail__head");
    if (!(await railHead.evaluate(el => el.open))) {
      await railHead.locator(":scope > summary").click();
    }
    await page.getByRole("textbox", { name: "Project name" }).fill(projectName);
    await page.getByTestId("studio-save-project").click();
    await page.waitForFunction(() =>
      document.querySelector(".studio-project-save-state")?.classList.contains("is-saved")
    );

    const savedBeforeReload = await readSavedStudioDocument(page, projectName);
    const shaBeforeReload = sha256Json(savedBeforeReload.studioDocument);

    // Navigate with ?fixture=motionflow&reloaded=1 (initialSavedProject = null -> pure IndexedDB reopen)
    await page.goto(`http://127.0.0.1:${port}/?fixture=motionflow&reloaded=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3
    );
    await muteAndPause();

    const showMediaAfter = page.getByRole("button", { name: "Show media", exact: true });
    if (await showMediaAfter.isVisible().catch(() => false)) {
      await showMediaAfter.click();
    }
    const railHeadAfter = page.locator(".studio-project-rail__head");
    if (!(await railHeadAfter.evaluate(el => el.open))) {
      await railHeadAfter.locator(":scope > summary").click();
    }
    const savedProjectsDetails = page.locator(".studio-saved-projects");
    if (!(await savedProjectsDetails.evaluate(el => el.open))) {
      await savedProjectsDetails.locator(":scope > summary").click();
    }
    await page
      .locator(".studio-saved-projects article > button")
      .filter({ hasText: projectName })
      .click();

    await page.getByTestId("studio-mode-fxflow").click();
    await page.getByTestId(`comp-layer-row-${nullId}`).waitFor({ state: "visible" });
    await assertCleanAutoPromoteBranding(page);

    const savedAfterReload = await readSavedStudioDocument(page, projectName);
    const shaAfterReload = sha256Json(savedAfterReload.studioDocument);
    assert.equal(shaAfterReload, shaBeforeReload, "Cold-reopened studioDocument SHA-256 drifted");
    recordCheck("Verified IndexedDB save & cold reload reopen with identical studioDocument SHA-256", {
      studioDocumentSha256: shaAfterReload,
      revision: savedAfterReload.studioDocument.revision,
    });

    stage = "signed-out-export-auth-guard";
    await page
      .getByRole("navigation", { name: "Creative tools" })
      .getByRole("button", { name: "Export", exact: true })
      .click();
    await page.getByRole("button", { name: /Render Final Clip/i }).first().click();
    await page.getByText("Please login first").waitFor({ state: "visible" });
    assert.deepEqual(apiRequests, [], "Signed-out export must not issue /api/ requests");
    recordCheck("Verified signed-out Export -> Render Final Clip enforces 'Please login first' with zero API calls");

    stage = "stage-frame-captures";
    // Return to FX Flow, close media rail if open, and select Main Programme row to dismiss Null Rig gizmo
    await page.getByTestId("studio-mode-fxflow").click();
    const hideMediaBtn = page.getByRole("button", { name: "Hide media", exact: true });
    if (await hideMediaBtn.isVisible().catch(() => false)) {
      await hideMediaBtn.click();
    }
    await page
      .getByTestId("studio-comp-workbench")
      .getByText("Main Programme", { exact: true })
      .click();
    assert.equal(await page.locator('[data-testid^="null-rig-gizmo-"]').count(), 0);
    assert.equal(await page.locator(".draggable-overlay.active").count(), 0);

    const frameStage = page.getByTestId("hook-preview-frame");
    for (const t of parityTimes) {
      await seekOutputTime(t);
      const tag = t.toFixed(2);
      await frameStage.screenshot({ path: path.join(folder, `preview-${tag}.png`) });
    }
    recordCheck("Captured 4 clean pre-final stage frames after ordinary selection dismissal", {
      times: parityTimes,
    });

    stage = "compile-and-cpu-ffmpeg-parity";
    const compiled = await page.evaluate(
      name => window.__compileSavedStudioProjectForParity(name),
      projectName
    );
    const renderEnvelope = {
      projectId: compiled.projectId,
      projectName: compiled.projectName,
      revision: compiled.revision,
      studioDocumentSha256: shaAfterReload,
      renderRequest: compiled.renderRequest,
    };
    fs.writeFileSync(
      path.join(folder, "render-request.json"),
      JSON.stringify(renderEnvelope, null, 2) + "\n"
    );

    assert.deepEqual(pageErrors, [], `Unexpected page errors: ${JSON.stringify(pageErrors)}`);
    assert.deepEqual(consoleErrors, [], `Unexpected console errors: ${JSON.stringify(consoleErrors)}`);
    assert.deepEqual(apiRequests, [], `Unexpected API requests: ${JSON.stringify(apiRequests)}`);

    console.log("[motionflow] Running local CPU FFmpeg render & pixel parity verification...");
    const pyRes = spawnSync(
      pythonBin,
      [
        path.join(root, "python_media_worker/verify_motion_flow_parity.py"),
        "--folder",
        folder,
        "--times",
        ...parityTimes.map(t => t.toFixed(2)),
        "--min-iou",
        "0.95",
        "--max-p95-px",
        "2.0",
      ],
      { cwd: root, encoding: "utf8" }
    );
    if (pyRes.status !== 0) {
      throw new Error(
        `CPU FFmpeg parity runner failed (exit ${pyRes.status}):\nSTDOUT: ${pyRes.stdout}\nSTDERR: ${pyRes.stderr}`
      );
    }

    const paritySummary = JSON.parse(
      fs.readFileSync(path.join(folder, "parity-receipt.json"), "utf8")
    );
    assert.equal(
      paritySummary.color_grade_parity?.passed,
      true,
      `Color grade LUT + 3-Way wheel parity failed: ${JSON.stringify(paritySummary.color_grade_parity)}`
    );
    recordCheck("Verified 4-frame browser preview vs local CPU FFmpeg render pixel parity + 3D LUT/3-Way Wheel color parity", {
      summary: paritySummary.summary,
      colorGradeParity: paritySummary.color_grade_parity,
      mediaProbe: paritySummary.media_probe,
    });

    const bundleJsPath = path.join(folder, "build/static/js/bundle.js");
    const bundleSha256 = fs.existsSync(bundleJsPath)
      ? crypto.createHash("sha256").update(fs.readFileSync(bundleJsPath)).digest("hex")
      : null;

    const browserReceipt = {
      passed: true,
      completedAt: new Date().toISOString(),
      headless: true,
      muted: true,
      cdpProduct: versionInfo.product,
      authBypassUsed: false,
      gpuJobsStarted: 0,
      cloudUploads: 0,
      competitorBrandLeaks: 0,
      bundleSha256,
      projectName,
      studioDocumentSha256BeforeReload: shaBeforeReload,
      studioDocumentSha256AfterReload: shaAfterReload,
      pageErrors,
      consoleErrors,
      apiRequests,
      checks,
      paritySummary: paritySummary.summary,
    };
    fs.writeFileSync(
      path.join(folder, "browser-receipt.json"),
      JSON.stringify(browserReceipt, null, 2) + "\n"
    );
    console.log(
      JSON.stringify({
        passed: true,
        checks: checks.length,
        studioDocumentSha256: shaAfterReload,
        parity: paritySummary.summary,
      })
    );
  } catch (error) {
    const failure = {
      passed: false,
      stage,
      message: error.message,
      pageErrors,
      consoleErrors,
      apiRequests,
      checks,
    };
    fs.writeFileSync(path.join(folder, "failure.json"), JSON.stringify(failure, null, 2) + "\n");
    console.error(JSON.stringify(failure, null, 2));
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    server.kill("SIGTERM");
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

