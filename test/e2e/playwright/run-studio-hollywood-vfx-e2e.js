#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../../..");
const sharedNodeModules = path.resolve(root, "../AutoPromote/node_modules");
if (fs.existsSync(sharedNodeModules) && !module.paths.includes(sharedNodeModules)) {
  module.paths.push(sharedNodeModules);
}

const { chromium } = require("@playwright/test");
const folder = path.resolve(
  root,
  process.env.STUDIO_HOLLYWOOD_E2E_FOLDER || "reports/studio-hollywood-vfx-20261122/e2e-hollywood"
);
const port = Number(process.env.STUDIO_HOLLYWOOD_E2E_PORT || 5029);
const pythonBin =
  process.env.STUDIO_PYTHON_BIN ||
  "/home/tibule12/.cache/autopromote-cinematic-runtime/worker-venv/bin/python3";

const sha256Json = value =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function startFixtureServer() {
  fs.mkdirSync(folder, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, "scripts/run-studio-interaction-preview.js")],
      {
        cwd: root,
        env: {
          ...process.env,
          STUDIO_MOTIONFLOW_FIXTURE: "1",
          STUDIO_INTERACTION_PORT: String(port),
          STUDIO_INTERACTION_FOLDER: folder,
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

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

async function readSavedProjectRecord(page, targetName) {
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
    return found;
  }, targetName);
}

async function selectNodeInInspector(page, nodeId) {
  const selector = page.getByLabel("Inspect node", { exact: true });
  await selector.selectOption(nodeId);
  await page.waitForTimeout(120);
}

async function setRangeInput(locator, value) {
  await locator.evaluate((el, val) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, String(val));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function clickToolTab(page, labelText) {
  const railBtn = page.locator(".creative-tool-rail button", { hasText: labelText }).first();
  await railBtn.click();
  await page.waitForTimeout(150);
}

async function main() {
  const checks = [];
  const errors = [];
  const apiRequests = [];
  let stage = "startup";

  const check = (label, detail = {}) => {
    checks.push({ label, ...detail });
    console.log(`[hollywood-e2e] PASS: ${label}`);
  };

  console.log(`[hollywood-e2e] Starting loopback fixture server on 127.0.0.1:${port}...`);
  const server = await startFixtureServer();
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--mute-audio"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  page.on("pageerror", err => errors.push(`pageerror: ${err.message}`));
  page.on("console", msg => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("request", req => {
    if (req.url().includes("/api/")) apiRequests.push(new URL(req.url()).pathname);
  });

  try {
    stage = "load-studio";
    await page.goto(`http://127.0.0.1:${port}/?fixture=motionflow`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3
    );
    const video = page.getByTestId("studio-after-video");
    if (!(await video.evaluate(el => el.paused))) {
      await page.getByRole("button", { name: "Pause comparison", exact: true }).click();
    }
    check("Studio loaded with native fixture video paused cleanly");

    // 1. Enter FX Flow & open Signal Node Flow dock
    stage = "node-flow-compositing";
    await page.getByTestId("studio-mode-fxflow").click();
    await page.getByTestId("dock-tab-node_flow").click();
    await page.getByTestId("studio-node-flow").waitFor({ state: "visible" });

    // Select fill-cyan transform to attach ChromaKeyer, PolygonMask (Bezier+Boolean), CornerPin (Track+Glare)
    await selectNodeInInspector(page, "Transform:fill-cyan");

    // Add & configure ChromaKeyer
    await page.getByTestId("flow-palette-add_chroma_keyer").click();
    await page.getByTestId("flow-chroma-keyer-controls").waitFor({ state: "visible" });
    await page.getByTestId("flow-chroma-mode-select").selectOption("hsl_delta");
    await setRangeInput(page.getByTestId("flow-chroma-similarity-slider"), 0.42);
    await setRangeInput(page.getByTestId("flow-chroma-spill-slider"), 0.55);
    await setRangeInput(page.getByTestId("flow-chroma-choke-slider"), 2);

    // Add & configure 2.5D CornerPin + live Planar Track + Screen Glare on unmasked fill-cyan
    await selectNodeInInspector(page, "Transform:fill-cyan");
    await page.getByTestId("flow-palette-add_corner_pin").click();
    await page.getByTestId("flow-corner-pin-editor").waitFor({ state: "visible" });
    await page.getByTestId("flow-corner-pin-track").click();
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-testid="flow-corner-pin-track"]');
      return btn && !btn.disabled && btn.textContent.includes("Track 4 Corners");
    });
    await page.getByTestId("flow-corner-screen-replace-toggle").check();
    await setRangeInput(page.getByTestId("flow-corner-screen-glare-slider"), 0.55);

    // Add second Vector Shape layer -> attach Bezier PolygonMask + Boolean submask
    await page.getByTestId("flow-palette-add_vector_shape").click();
    await page.waitForTimeout(150);
    await page.getByTestId("flow-palette-add_polygon_mask").click();
    await page.getByTestId("flow-polygon-mask-editor").waitFor({ state: "visible" });
    await page.getByTestId("flow-mask-bezier-toggle").click();
    await page.getByTestId("flow-add-boolean-submask").click();

    // Inspect Merge:fill-cyan -> Light Wrap + Linear-Light + Mesh Grid Warp
    await selectNodeInInspector(page, "Merge:fill-cyan");
    await page.getByTestId("flow-light-wrap-controls").waitFor({ state: "visible" });
    await page.getByTestId("flow-light-wrap-toggle").check();
    await setRangeInput(page.getByTestId("flow-light-wrap-intensity"), 0.72);
    await setRangeInput(page.getByTestId("flow-light-wrap-radius"), 18);
    await page.getByTestId("flow-linear-light-toggle").check();
    await page.getByTestId("flow-mesh-warp-toggle").check();

    check("Authored Delta Keyer, Bezier/Boolean Mask, Planar CornerPin+Glare, Light Wrap, Linear-Light & Mesh Warp");

    // 2. ColorCorrector:finish -> Scopes, Sky Replacement, Precision Grade + RGB, CST/LUT .cube Export, Optical Camera
    stage = "node-flow-grading-sky-optical";
    await selectNodeInInspector(page, "ColorCorrector:finish");
    await page.getByTestId("flow-color-grade-suite").waitFor({ state: "visible" });

    // Live Scopes check
    await page.getByTestId("flow-scope-mode-parade").click();
    await page.getByTestId("flow-color-scope-svg").waitFor({ state: "visible" });
    await page.getByTestId("flow-scope-mode-vectorscope").click();
    const scopeTelemetry = await page.getByTestId("flow-color-scope-telemetry").textContent();
    assert(scopeTelemetry && scopeTelemetry.trim().length > 5, "Live scope telemetry empty");

    // Sky Replacement
    await page.getByTestId("flow-sky-replace-toggle").check();
    await page.getByTestId("flow-sky-preset-select").selectOption("sunset_gold");

    // Precision Grade + CST + Film Emulation + 3D LUT + .cube Download
    await page.getByTestId("flow-precision-grade-toggle").check();
    await page.locator("summary", { hasText: "Per-Channel R/G/B Lift" }).click();
    await setRangeInput(page.getByLabel("Grade Exposure Stops"), 0.15);
    await setRangeInput(page.getByLabel("Grade Gamma Midtones"), 1.08);
    await setRangeInput(page.getByLabel(/R Lift/), 0.04);
    await setRangeInput(page.getByLabel(/B Gain/), 1.08);
    await page.getByTestId("flow-lut-preset-select").selectOption("kodak_2383");
    await page.getByTestId("flow-cst-profile-select").selectOption("apple_log");
    await page.getByTestId("flow-film-emulation-select").selectOption("35mm_halation");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("flow-export-cube-lut").click(),
    ]);
    const cubeDest = path.join(folder, "exported-grade.cube");
    await download.saveAs(cubeDest);
    assert(fs.existsSync(cubeDest), "Downloaded .cube file missing");

    // Optical Lens Distortion, Z Rack Focus & Atmospheric Haze
    await setRangeInput(page.getByLabel("Optical Lens Distortion"), 0.28);
    await setRangeInput(page.getByLabel("Z-Depth Rack Focus Bokeh"), 0.62);
    await setRangeInput(page.getByLabel("Rack Focus Plane Depth"), 0.45);
    await setRangeInput(page.getByLabel("Atmospheric Depth Haze"), 0.34);

    await page.screenshot({ path: path.join(folder, "vfx-node-flow.png") });
    check("Authored Scopes, Sunset Sky Replacement, Per-Channel/CST Grade, .cube LUT Export & Optical/Rack-Focus/Haze", {
      scopeTelemetry: scopeTelemetry.trim(),
      cubeBytes: fs.statSync(cubeDest).size,
    });

    // 3. Creative Effects: fire_embers + scrolling_credits + ripped_paper
    stage = "creative-effects";
    await clickToolTab(page, "Effects FX");
    await page.getByTestId("creative-effects-panel").waitFor({ state: "visible" });
    await page.getByTestId("apply-fx-particle_overlays").click();
    await page.getByTestId("creative-fx-inspector").waitFor({ state: "visible" });
    await page.getByLabel("Particle Type").selectOption("fire_embers");

    await clickToolTab(page, "Effects FX");
    await page.getByTestId("apply-fx-kinetic_typography").click();
    await page.getByLabel("Animation Style").selectOption("scrolling_credits");

    await clickToolTab(page, "Effects FX");
    await page.getByTestId("apply-fx-ripped_paper").click();

    await page.screenshot({ path: path.join(folder, "vfx-creative-fx.png") });
    check("Authored Fire Embers, Scrolling Credits, and Ripped Paper creative effects");

    // 4. 3D Matchmove & Audio Mastering
    stage = "3d-matchmove";
    await clickToolTab(page, "Motion");
    await page.getByRole("button", { name: "3D Motion", exact: true }).click();
    await page.getByTestId("studio-3d-panel").waitFor({ state: "visible" });
    await page.locator('[aria-label="3D templates"] button:not([disabled])').nth(1).click();
    await page.locator('[aria-label="3D control mode"] button', { hasText: "Advanced" }).click();
    await page.getByTestId("studio-3d-matchmove-btn").waitFor({ state: "visible" });
    await page.getByTestId("studio-3d-matchmove-btn").click();
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('[data-testid="studio-3d-matchmove-btn"]');
        const poses = document.querySelector('[aria-label="3D pose keyframes"]');
        return btn && !btn.disabled && btn.textContent.includes("Matchmove from Video") && Boolean(poses);
      },
      null,
      { timeout: 60000 }
    );
    await page.screenshot({ path: path.join(folder, "vfx-3d-matchmove.png") });
    check("Executed 3D Optical Camera Matchmove from Video into pose keyframes");

    stage = "audio-remix-lufs";
    await clickToolTab(page, "Sound");
    await page.getByTestId("audio-remix-panel").waitFor({ state: "visible" });
    await page.getByTestId("audio-remix-preset-warm_vocal").click();
    const audioText = await page.getByTestId("audio-remix-panel").textContent();
    assert(/LUFS/i.test(audioText || ""), "AudioRemixPanel missing LUFS meter readout");
    await page.screenshot({ path: path.join(folder, "vfx-audio-remix.png") });
    check("Applied Audio Remix Warm Vocal preset and verified LUFS meter readout");

    // 5. Save in IndexedDB -> Cold Reload -> Reopen -> Verify Exact SHA-256 Persistence -> Compile -> Worker Render
    stage = "indexeddb-save-reload";
    const projectName = "Hollywood VFX E2E 20261122";
    const showMediaBtn = page.getByRole("button", { name: "Show media", exact: true });
    if (await showMediaBtn.isVisible().catch(() => false)) {
      await showMediaBtn.click();
    }
    await page.locator(".studio-project-rail__head > summary").click();
    await page.getByRole("textbox", { name: "Project name" }).fill(projectName);
    await page.getByTestId("studio-save-project").click();
    await page.waitForFunction(() =>
      document.querySelector(".studio-project-save-state")?.classList.contains("is-saved")
    );

    const recordBefore = await readSavedProjectRecord(page, projectName);
    const shaBefore = sha256Json(recordBefore.snapshot.studioDocument);

    await page.goto(`http://127.0.0.1:${port}/?fixture=motionflow&reloaded=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3
    );
    const showMediaAfter = page.getByRole("button", { name: "Show media", exact: true });
    if (await showMediaAfter.isVisible().catch(() => false)) {
      await showMediaAfter.click();
    }
    await page.locator(".studio-project-rail__head > summary").click();
    await page.locator(".studio-saved-projects > summary").click();
    await page
      .locator(".studio-saved-projects article > button")
      .filter({ hasText: projectName })
      .click();
    await page.waitForTimeout(350);

    const recordAfter = await readSavedProjectRecord(page, projectName);
    const shaAfter = sha256Json(recordAfter.snapshot.studioDocument);
    assert.equal(shaAfter, shaBefore, "studioDocument SHA-256 changed after IndexedDB reload");

    const compiled = await page.evaluate(
      name => window.__compileSavedStudioProjectForParity(name),
      projectName
    );
    if (recordAfter.snapshot?.audioRemix) {
      compiled.renderRequest.audio_remix = recordAfter.snapshot.audioRemix;
    }
    compiled.savedSnapshotSummary = {
      threeDScenesCount: (recordAfter.snapshot?.threeDScenes || []).length,
      threeDMatchmoveKeys: ((recordAfter.snapshot?.threeDScenes || [])[0]?.keyframes || []).length,
      hasAudioRemix: Boolean(recordAfter.snapshot?.audioRemix),
      audioRemixPreset: recordAfter.snapshot?.audioRemix?.preset || null,
    };
    fs.writeFileSync(
      path.join(folder, "render-request.json"),
      JSON.stringify(compiled, null, 2)
    );
    check("IndexedDB checkpoint survived cold reload with identical studioDocument SHA-256", {
      studioDocumentSha256: shaAfter,
      ...compiled.savedSnapshotSummary,
    });

    // 6. Execute Real Python Worker Render & Output Media/Pixel Verification
    stage = "python-worker-render";
    console.log("[hollywood-e2e] Running Python media worker render & media verification...");
    const pyOut = await new Promise((resolve, reject) => {
      const proc = spawn(
        pythonBin,
        [path.join(root, "python_media_worker/verify_hollywood_vfx_e2e.py"), "--folder", folder],
        { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
      );
      let out = "";
      let err = "";
      proc.stdout.on("data", chunk => (out += chunk.toString("utf8")));
      proc.stderr.on("data", chunk => (err += chunk.toString("utf8")));
      proc.on("exit", code => {
        if (code === 0) resolve({ out, err });
        else reject(new Error(`Python Hollywood E2E verifier failed (${code}):\nSTDOUT:${out}\nSTDERR:${err}`));
      });
    });

    assert.deepEqual(errors, [], `Browser errors detected: ${errors.join(" | ")}`);
    assert.deepEqual(apiRequests, [], `Unexpected /api/ calls: ${apiRequests.join(", ")}`);

    const workerSummary = JSON.parse(pyOut.out.trim().split("\n").pop());
    const receipt = {
      passed: true,
      completedAt: new Date().toISOString(),
      checks,
      pageErrors: errors,
      apiRequests,
      studioDocumentSha256: shaAfter,
      workerSummary,
    };
    fs.writeFileSync(path.join(folder, "hollywood-browser-receipt.json"), JSON.stringify(receipt, null, 2));
    console.log("[hollywood-e2e] ALL HOLLYWOOD VFX E2E CHECKS PASSED");
    console.log(JSON.stringify({ passed: true, checks: checks.length, workerSummary }));
  } catch (err) {
    const failure = {
      passed: false,
      stage,
      message: err.message,
      errors,
      apiRequests,
      checks,
    };
    fs.writeFileSync(path.join(folder, "failure.json"), JSON.stringify(failure, null, 2));
    await page.screenshot({ path: path.join(folder, "failure.png") }).catch(() => {});
    console.error(JSON.stringify(failure, null, 2));
    throw err;
  } finally {
    await browser.close().catch(() => {});
    server.kill("SIGTERM");
  }
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
