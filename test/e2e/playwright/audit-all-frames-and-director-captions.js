#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const sharedNodeModules = path.resolve(root, "../AutoPromote/node_modules");
if (fs.existsSync(sharedNodeModules) && !module.paths.includes(sharedNodeModules)) {
  module.paths.push(sharedNodeModules);
}

const { chromium } = require("@playwright/test");
const auditDir =
  "/home/tibule12/.gemini/antigravity/brain/c76bd0eb-e4a4-4018-9091-27cbe5c75791/caption_matrix_audit/playwright_4frame_audit";
const factoryDir = path.join(root, "reports/studio-hollywood-vfx-20261122/caption-ui-audit/factory");
const port = Number(process.env.CAPTION_FOUR_FRAME_PORT || 5037);

const REAL_SRT = `1
00:00:01,200 --> 00:00:04,250
Hello my lovely viewers at home.

2
00:00:04,260 --> 00:00:06,200
It has truly been a long time.

3
00:00:06,200 --> 00:00:08,200
Captions adapt to every frame cleanly.
`;

function ensureFixture() {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.mkdirSync(factoryDir, { recursive: true });
  const srcVideo =
    "/home/tibule12/Projects/AutoPromte/AutoPromote/test/e2e/playwright/test-assets/real-podcast-fast.mp4";
  const destMp4 = path.join(factoryDir, "host-12s.mp4");
  if (!fs.existsSync(destMp4)) {
    const res = require("node:child_process").spawnSync(
      "ffmpeg",
      [
        "-y", "-v", "error", "-ss", "0", "-t", "12.0", "-i", srcVideo,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", destMp4,
      ],
      { encoding: "utf8" }
    );
    if (res.status !== 0) throw new Error(res.stderr || "Failed to generate host-12s.mp4");
  }
  const srtPath = path.join(auditDir, "host-sample.srt");
  fs.writeFileSync(srtPath, REAL_SRT, "utf8");
  return { srtPath };
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, "scripts/run-studio-interaction-preview.js")],
      {
        cwd: root,
        env: {
          ...process.env,
          STUDIO_INTERACTION_PORT: String(port),
          STUDIO_INTERACTION_FOLDER: auditDir,
          STUDIO_CONTENT_FACTORY_ROOT: factoryDir,
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let buf = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Server timeout on ${port}:\n${stderr}`));
    }, 180000);
    child.stdout.on("data", chunk => {
      buf += chunk.toString("utf8");
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim().startsWith("{")) continue;
        try {
          const parsed = JSON.parse(line.trim());
          if (parsed.ready) {
            clearTimeout(timer);
            resolve(child);
          }
        } catch (_) {}
      }
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", code => {
      clearTimeout(timer);
      reject(new Error(`Server exited early (${code}):\n${stderr}`));
    });
  });
}

async function seekStudio(page, targetSec) {
  await page.evaluate(t => {
    const v = document.querySelector('[data-testid="studio-after-video"]');
    if (v) {
      v.currentTime = t;
      v.dispatchEvent(new Event("timeupdate"));
    }
  }, targetSec);
  await page.waitForTimeout(350);
}

async function measurePreviewBox(page) {
  return page.evaluate(() => {
    const preview = document.querySelector('[data-testid="live-caption-preview"]');
    const frame = preview?.closest('[data-testid="hook-preview-frame"]') || document.querySelector('[data-testid="hook-preview-frame"]');
    const fRect = frame?.getBoundingClientRect();
    const pRect = preview?.getBoundingClientRect();
    const pill = preview?.querySelector(".caption-preview-pill-active");
    if (!preview || !fRect || !pRect) return { missing: true };
    const pillStyle = pill ? getComputedStyle(pill) : null;
    return {
      text: preview.innerText.trim(),
      style: preview.getAttribute("data-caption-render-style") || "",
      placement: preview.getAttribute("data-caption-placement") || "",
      frameW: Math.round(fRect.width),
      frameH: Math.round(fRect.height),
      leftPct: Number((((pRect.left - fRect.left) / fRect.width) * 100).toFixed(1)),
      rightPct: Number((((pRect.right - fRect.left) / fRect.width) * 100).toFixed(1)),
      topPct: Number((((pRect.top - fRect.top) / fRect.height) * 100).toFixed(1)),
      bottomPct: Number((((pRect.bottom - fRect.top) / fRect.height) * 100).toFixed(1)),
      widthPct: Number(((pRect.width / fRect.width) * 100).toFixed(1)),
      heightPct: Number(((pRect.height / fRect.height) * 100).toFixed(1)),
      fontSizePx: pillStyle ? Number.parseFloat(pillStyle.fontSize) : 0,
      refDimCssVar: frame?.style?.getPropertyValue("--caption-programme-ref-dim") || "",
      oob:
        pRect.left < fRect.left - 3 ||
        pRect.right > fRect.right + 3 ||
        pRect.top < fRect.top - 3 ||
        pRect.bottom > fRect.bottom + 3,
    };
  });
}

async function main() {
  const { srtPath } = ensureFixture();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu", "--mute-audio"] });
  const context = await browser.newContext({ viewport: { width: 1520, height: 960 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", err => pageErrors.push(err.message));

  const report = { frames: {}, directorPick: {}, pageErrors: [] };

  try {
    await page.addInitScript(() => {
      window.__E2E_BYPASS = true;
      window.__E2E_TEST_TOKEN = "local-4frame-audit";
    });
    await page.goto(`http://127.0.0.1:${port}/?fixture=factory`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v && v.readyState >= 2;
    }, null, { timeout: 45000 });
    await page.evaluate(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      if (v && !v.paused) v.pause();
    });

    // Import real captions
    await page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name: "Captions", exact: true }).click();
    await page.waitForTimeout(250);
    await page.locator('input[type="file"][accept=".srt,.vtt,.txt"]').setInputFiles(srtPath);
    await page.waitForTimeout(350);
    await seekStudio(page, 2.25);

    const frameOrder = [
      { aspect: "16:9", testId: "reframe-aspect-16-9", slug: "16x9" },
      { aspect: "9:16", testId: "reframe-aspect-9-16", slug: "9x16" },
      { aspect: "4:5", testId: "reframe-aspect-4-5", slug: "4x5" },
      { aspect: "1:1", testId: "reframe-aspect-1-1", slug: "1x1" },
    ];
    const stylesToTest = ["word_pill", "editorial_duo", "wall_type", "glass", "headline", "neon_bloom", "story_pop"];

    for (const frameSpec of frameOrder) {
      await page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name: "Reframe", exact: true }).click();
      await page.waitForTimeout(200);
      await page.getByTestId(frameSpec.testId).click();
      await page.waitForTimeout(250);
      await page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name: "Captions", exact: true }).click();
      await page.waitForTimeout(250);

      // First exercise AI Director picks template directly inside Captions tab!
      const directorBtn = page.getByTestId("director-pick-caption-btn");
      await directorBtn.scrollIntoViewIfNeeded();
      await directorBtn.click();
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="smart-safe-captions-status"]');
          return el && (/AI Director selected/i.test(el.textContent || "") || /Safe zones applied/i.test(el.textContent || ""));
        },
        null,
        { timeout: 15000 }
      );
      await seekStudio(page, 2.25);
      const directorMeasurement = await measurePreviewBox(page);
      const directorStatus = await page.getByTestId("smart-safe-captions-status").textContent();
      report.directorPick[frameSpec.aspect] = { status: directorStatus, ...directorMeasurement };
      assert.equal(directorMeasurement.oob, false, `OOB on Director pick for ${frameSpec.aspect}`);
      await page.screenshot({ path: path.join(auditDir, `director_pick_${frameSpec.slug}.png`) });

      // Now test diverse templates in this aspect ratio
      report.frames[frameSpec.aspect] = {};
      for (const styleKey of stylesToTest) {
        const btn = page.locator(`.caption-style-option-${styleKey}`);
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        await seekStudio(page, 2.25);
        const box = await measurePreviewBox(page);
        report.frames[frameSpec.aspect][styleKey] = box;
        assert.equal(box.missing, undefined, `Missing preview for ${styleKey} on ${frameSpec.aspect}`);
        assert.equal(box.oob, false, `Out of bounds preview for ${styleKey} on ${frameSpec.aspect}: ${JSON.stringify(box)}`);
      }
      await page.screenshot({ path: path.join(auditDir, `frame_${frameSpec.slug}_story_pop.png`) });
    }

    report.pageErrors = pageErrors;
    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join("; ")}`);
    fs.writeFileSync(path.join(auditDir, "four_frame_audit_report.json"), JSON.stringify(report, null, 2));
    console.log("FOUR_FRAME_AUDIT_OK", JSON.stringify({
      aspectsTested: Object.keys(report.frames),
      directorPicks: Object.fromEntries(Object.entries(report.directorPick).map(([k, v]) => [k, `${v.style} (${v.widthPct}%w, ${v.fontSizePx}px, oob=${v.oob})`])),
      pageErrors: pageErrors.length,
    }));
  } finally {
    await browser.close().catch(() => {});
    server.kill("SIGTERM");
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
