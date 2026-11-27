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
const auditDir = path.join(root, "reports/studio-hollywood-vfx-20261122/caption-ui-audit");
const factoryDir = path.join(auditDir, "factory");
const port = Number(process.env.CAPTION_AUDIT_PORT || 5033);

const REAL_SRT = `1
00:00:01,200 --> 00:00:04,250
Hello my lovely viewers at home.

2
00:00:04,260 --> 00:00:06,000
It has truly been a long time.

3
00:00:06,000 --> 00:00:07,600
I have missed you so much,

4
00:00:07,600 --> 00:00:10,000
and I hope you missed us as well.

5
00:00:10,000 --> 00:00:12,000
We are thrilled to tell you we are back!
`;

function prepareFactoryFixture() {
  fs.mkdirSync(factoryDir, { recursive: true });
  const srcVideo = "/home/tibule12/Projects/AutoPromte/AutoPromote/test/e2e/playwright/test-assets/real-podcast-fast.mp4";
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
    if (res.status !== 0) throw new Error(res.stderr || "Failed to prepare host-12s.mp4");
  }
  const srtPath = path.join(auditDir, "real-host.srt");
  fs.writeFileSync(srtPath, REAL_SRT, "utf8");

  const clip = {
    id: "host-clip-1",
    sourceClipId: "host-clip-1",
    name: "Unmuted Podcast · Host Intro",
    start: 0,
    end: 12,
    duration: 12,
    sourceDuration: 12,
    url: "/factory-media/host-12s.mp4",
  };
  const project = {
    id: "caption-ux-audit-proj",
    name: "Caption UX & Parity Audit",
    updatedAt: new Date().toISOString(),
    snapshot: {
      selectedClipId: clip.id,
      orderedClips: [clip],
      timeline: [
        {
          ...clip,
          startRequest: 0,
          endRequest: 12,
        },
      ],
      autoCaptions: false,
      captionSegments: [],
      captionStyle: "word_pill",
      captionPosition: "creative",
      captionScale: 1,
      comparisonMode: "after",
      smartCrop: false,
      reframeAspect: "16:9",
    },
  };
  fs.writeFileSync(
    path.join(factoryDir, "studio-fixture-project.json"),
    JSON.stringify({ project, clip }, null, 2),
    "utf8"
  );
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
    }, 120000);
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
  await page.waitForTimeout(450);
}

async function main() {
  fs.mkdirSync(auditDir, { recursive: true });
  const { srtPath } = prepareFactoryFixture();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu", "--mute-audio"] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 960 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", err => pageErrors.push(err.message));

  const findings = { uxMetrics: {}, previewSnapshots: {}, exportCheck: {} };

  try {
    await page.addInitScript(() => {
      window.__E2E_BYPASS = true;
      window.__E2E_TEST_TOKEN = "local-caption-audit-only";
    });
    await page.goto(`http://127.0.0.1:${port}/?fixture=factory`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v && v.readyState >= 2;
    }, null, { timeout: 45000 });
    await page.evaluate(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      if (v && !v.paused) v.pause();
    });

    // 1. Open Captions tool
    await page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name: "Captions", exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(auditDir, "01_captions_tab_initial.png") });

    // Measure where Creator Style sits before vs after importing SRT
    const metricsEmpty = await page.evaluate(() => {
      const body = document.querySelector(".clip-inspector-body");
      const styleGrid = document.querySelector(".caption-style-grid");
      const bodyRect = body?.getBoundingClientRect();
      const gridRect = styleGrid?.getBoundingClientRect();
      return {
        panelScrollHeight: body?.scrollHeight || 0,
        panelClientHeight: body?.clientHeight || 0,
        styleGridOffsetFromPanelTop: gridRect && bodyRect ? Math.round(gridRect.top - bodyRect.top) : null,
      };
    });
    findings.uxMetrics.beforeImport = metricsEmpty;

    // 2. Import real SRT via file picker
    const srtInput = page.locator('input[type="file"][accept=".srt,.vtt,.txt"]');
    await srtInput.setInputFiles(srtPath);
    await page.waitForTimeout(400);

    // Seek to t=2.25s ("lovely" inside "Hello my lovely viewers at home.")
    await seekStudio(page, 2.25);

    const metricsAfter = await page.evaluate(() => {
      const body = document.querySelector(".clip-inspector-body");
      const styleGrid = document.querySelector(".caption-style-grid");
      const rows = document.querySelectorAll(".caption-segment-row").length;
      const bodyRect = body?.getBoundingClientRect();
      const gridRect = styleGrid?.getBoundingClientRect();
      return {
        rowsCreated: rows,
        panelScrollHeight: body?.scrollHeight || 0,
        panelClientHeight: body?.clientHeight || 0,
        styleGridOffsetFromPanelTop: gridRect && bodyRect ? Math.round(gridRect.top - bodyRect.top) : null,
        visibleCaptionText: document.querySelector('[data-testid="live-caption-preview"]')?.innerText || "",
      };
    });
    findings.uxMetrics.afterImport = metricsAfter;

    await page.screenshot({ path: path.join(auditDir, "02_after_srt_import_live_preview.png") });

    // 3. Creator Style swatches & Stage mode bar near top (measure & screenshot)
    await page.locator(".caption-style-grid").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(auditDir, "03_creator_style_swatches.png") });

    // Test switching spatial & stylized caption templates and inspect live browser preview!
    const styleAuditTargets = [
      { key: "word_pill", t: 2.25, tag: "word_pill" },
      { key: "editorial_duo", t: 2.25, tag: "editorial_duo_left" },
      { key: "editorial_duo", t: 4.9, tag: "editorial_duo_right" },
      { key: "wall_type", t: 2.25, tag: "wall_type" },
      { key: "story_pop", t: 2.25, tag: "story_pop_cue1" },
      { key: "story_pop", t: 4.9, tag: "story_pop_cue2" },
      { key: "story_pop", t: 8.6, tag: "story_pop_cue4" },
      { key: "retro", t: 2.25, tag: "retro" },
      { key: "sticker", t: 4.9, tag: "sticker" },
      { key: "luxury", t: 2.25, tag: "luxury" },
      { key: "newsroom", t: 2.25, tag: "newsroom" },
      { key: "spring_slam", t: 2.25, tag: "spring_slam" },
      { key: "neon_bloom", t: 2.25, tag: "neon_bloom" },
      { key: "typewriter", t: 2.25, tag: "typewriter" },
    ];
    for (const entry of styleAuditTargets) {
      const btn = page.locator(`.caption-style-option-${entry.key}`);
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await seekStudio(page, entry.t);
      const inspect = await page.evaluate(() => {
        const preview = document.querySelector('[data-testid="live-caption-preview"]');
        const stageFrame = preview?.closest(".preview-video-frame, .studio-monitor-stage") || preview?.parentElement;
        const frameRect = stageFrame?.getBoundingClientRect();
        const pill = preview?.querySelector(".caption-preview-pill-active");
        const activeWord = preview?.querySelector(".caption-preview-word-active");
        const words = [...(preview?.querySelectorAll(".caption-preview-word") || [])].map(el => ({
          text: el.textContent,
          active: el.classList.contains("caption-preview-word-active"),
          color: getComputedStyle(el).color,
          bg: getComputedStyle(el).backgroundColor,
          textShadow: getComputedStyle(el).textShadow,
          transform: getComputedStyle(el).transform,
        }));
        const rect = preview?.getBoundingClientRect();
        return {
          text: preview?.innerText || "",
          placement: preview?.getAttribute("data-caption-placement") || "",
          stacked: preview?.classList.contains("is-caption-stacked") || false,
          tiltCssVar: preview?.style?.getPropertyValue("--caption-stage-tilt") || "0deg",
          pillFont: pill ? `${getComputedStyle(pill).fontFamily} / ${getComputedStyle(pill).fontSize}` : null,
          pillBg: pill ? getComputedStyle(pill).backgroundColor : null,
          previewBox: rect && frameRect ? {
            leftPct: Math.round(((rect.left - frameRect.left) / frameRect.width) * 100),
            topPct: Math.round(((rect.top - frameRect.top) / frameRect.height) * 100),
            widthPct: Math.round((rect.width / frameRect.width) * 100),
            heightPx: Math.round(rect.height),
          } : null,
          hasStoryIcon: Boolean(preview?.querySelector(".caption-preview-story-icon")),
          activeWordText: activeWord?.textContent || null,
          words,
        };
      });
      findings.previewSnapshots[entry.tag] = inspect;
      if (["editorial_duo_left", "editorial_duo_right", "wall_type", "story_pop_cue2", "story_pop_cue4", "retro", "sticker", "spring_slam", "neon_bloom", "typewriter"].includes(entry.tag)) {
        await page.screenshot({ path: path.join(auditDir, `04_preview_${entry.tag}.png`) });
      }
    }

    // Check 9:16 portrait Reframe + Preview!
    await page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name: "Reframe", exact: true }).click();
    await page.waitForTimeout(200);
    const ratio916 = page.getByTestId("reframe-aspect-9-16");
    if (await ratio916.isVisible()) {
      await ratio916.click();
      await page.waitForTimeout(300);
      await seekStudio(page, 2.25);
      await page.screenshot({ path: path.join(auditDir, "05_portrait_9x16_preview_spatial.png") });
      const ratio169 = page.getByTestId("reframe-aspect-16-9");
      if (await ratio169.isVisible()) {
        await ratio169.click();
        await page.waitForTimeout(200);
      }
    }

    // Back to Captions: switch back to Editorial Duo and test Smart Safe face & body avoidance!
    await page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name: "Captions", exact: true }).click();
    await page.waitForTimeout(250);
    await page.locator(".caption-style-option-editorial_duo").scrollIntoViewIfNeeded();
    await page.locator(".caption-style-option-editorial_duo").click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: /Smart safe/i }).first().click();
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="smart-safe-captions-status"]');
        return el && /Safe zones applied across/i.test(el.textContent || "");
      },
      null,
      { timeout: 20000 }
    );
    await seekStudio(page, 2.25);
    await page.screenshot({ path: path.join(auditDir, "04_preview_smart_safe_cue1.png") });
    const smartCue1 = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="live-caption-preview"]');
      const s = document.querySelector('[data-testid="smart-safe-captions-status"]');
      return { placement: p?.getAttribute("data-caption-placement") || "", status: s?.textContent || "" };
    });
    await seekStudio(page, 8.6);
    await page.screenshot({ path: path.join(auditDir, "04_preview_smart_safe_cue4.png") });
    const smartCue4 = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="live-caption-preview"]');
      return { placement: p?.getAttribute("data-caption-placement") || "" };
    });
    findings.uxMetrics.smartSafeAudit = { cue1: smartCue1, cue4: smartCue4 };
    findings.uxMetrics.sideBySideQuickbarPlacement = smartCue1.placement;
    const line1Input = page.getByLabel("Caption 1 text");
    await line1Input.scrollIntoViewIfNeeded();
    await line1Input.fill("Hello my amazing viewers at home!");
    await page.getByRole("button", { name: /I checked every line — approve wording/i }).click().catch(() => {});
    // Also remove speaker/language review flags if needed or inspect Export payload directly
    const behindBtn = page.getByTestId("captions-to-subject-vfx");
    await behindBtn.scrollIntoViewIfNeeded();
    await behindBtn.click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(auditDir, "06_after_behind_subject_jump.png") });

    findings.uxMetrics.afterBehindSubjectJumpTab = await page.evaluate(() => {
      return document.querySelector(".creative-tool-rail button.active, .creative-tool-rail button[aria-selected='true']")?.textContent || "unknown";
    });

    // Export check
    await page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name: "Export", exact: true }).click();
    await page.waitForTimeout(250);
    const reviewExportBtn = page.getByTestId("render-caption-review-copy");
    if (await reviewExportBtn.isVisible().catch(() => false)) {
      await reviewExportBtn.click();
      await page.waitForFunction(() => Boolean(window.__studioFixtureRenderRequest), null, { timeout: 10000 }).catch(() => {});
    }
    const exportReq = await page.evaluate(() => window.__studioFixtureRenderRequest || null);
    if (exportReq) {
      findings.exportCheck = {
        auto_captions: exportReq.auto_captions,
        caption_style: exportReq.caption_style,
        caption_position: exportReq.caption_position,
        caption_avoid_subjects: exportReq.caption_avoid_subjects,
        caption_scale: exportReq.caption_scale,
        segmentsCount: exportReq.caption_segments?.length || 0,
        firstSegment: exportReq.caption_segments?.[0] || null,
      };
    }

    findings.pageErrors = pageErrors;
    fs.writeFileSync(path.join(auditDir, "audit_findings.json"), JSON.stringify(findings, null, 2));
    console.log("AUDIT_DONE", JSON.stringify({
      rowsCreated: metricsAfter.rowsCreated,
      scrollHeightAfter: metricsAfter.panelScrollHeight,
      styleGridOffsetFromTop: metricsAfter.styleGridOffsetFromPanelTop,
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
