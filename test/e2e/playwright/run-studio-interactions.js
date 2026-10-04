#!/usr/bin/env node
const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");
const { assertStudioTimelineLayout } = require("./studio-timeline-layout");
const root = path.resolve(__dirname, "../../..");
const folder = path.join(root, "artifacts/studio-interactions-20261004");

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const checks = [],
    errors = [],
    apiRequests = [];
  let stage = "load";
  const check = (label, detail = {}) => {
    checks.push({ label, ...detail });
    console.log(`[interaction] ${label}`);
  };
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (request.url().includes("/api/")) apiRequests.push(new URL(request.url()).pathname);
  });
  const source = page.getByTestId("pro-video-clip-1");
  const video = page.getByTestId("studio-after-video");
  const pause = async () => {
    if (!(await video.evaluate(node => node.paused)))
      await page.getByRole("button", { name: "Pause comparison", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="studio-after-video"]').paused
    );
  };
  const seek = async outputTime => {
    const lane = await page
      .locator('[data-testid="pro-track-row-video"] .pro-track-lane')
      .boundingBox();
    const duration = Number(await source.getAttribute("data-end-time"));
    await page.mouse.click(
      Math.round(lane.x + (lane.width * outputTime) / duration),
      lane.y + lane.height / 2
    );
    await page.waitForFunction(
      time =>
        Math.abs(document.querySelector('[data-testid="studio-after-video"]').currentTime - time) <
        0.04,
      outputTime + 2
    );
  };
  try {
    await page.goto(`http://127.0.0.1:${Number(process.env.STUDIO_INTERACTION_PORT || 5007)}`);
    await page.waitForFunction(
      () => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3
    );
    await pause();
    assert.equal(Number(await video.evaluate(node => node.duration)), 12);
    assert.equal(Number(await source.getAttribute("data-end-time")), 6);
    check("Native 12-second source retains its selected 2–8-second range");
    stage = "metadata and paused seek";
    await seek(3);
    await video.evaluate(node => node.dispatchEvent(new Event("loadedmetadata")));
    assert(Math.abs((await video.evaluate(node => node.currentTime)) - 5) < 0.04);
    check("Metadata event preserves the paused editing frame");
    const scrubber = page.getByRole("slider", { name: "Edited output position" });
    await scrubber.press("End");
    await page.waitForFunction(
      () =>
        Math.abs(document.querySelector('[data-testid="studio-after-video"]').currentTime - 8) <
        0.01
    );
    assert(await video.evaluate(node => node.paused));
    check("Paused scrub reaches the trimmed end without looping");
    stage = "trimmed playback";
    for (let step = 0; step < 5; step++) await scrubber.press("ArrowLeft");
    assert(Math.abs((await video.evaluate(node => node.currentTime)) - 7.75) < 0.01);
    await page.getByRole("button", { name: "Play comparison", exact: true }).click();
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-testid="studio-after-video"]');
      return !node.paused && node.currentTime >= 2 && node.currentTime < 3;
    });
    check("Native playback loops at the trimmed end instead of continuing into excluded footage");
    await pause();
    await seek(3);
    stage = "undo and redo";
    await page.getByTestId("pro-quick-trim-end").click();
    await page.waitForFunction(
      () => Number(document.querySelector('[data-testid="pro-video-clip-1"]').dataset.endTime) === 3
    );
    await page.keyboard.press("Control+z");
    await page.waitForFunction(
      () => Number(document.querySelector('[data-testid="pro-video-clip-1"]').dataset.endTime) === 6
    );
    await page.keyboard.press("Control+Shift+z");
    await page.waitForFunction(
      () => Number(document.querySelector('[data-testid="pro-video-clip-1"]').dataset.endTime) === 3
    );
    check("Keyboard Undo and Redo restore the complete trim");
    stage = "keyboard library";
    await page.getByRole("button", { name: "Show media", exact: true }).click();
    await page.getByRole("tab", { name: "Media", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert(await page.getByRole("tabpanel", { name: "Sequence", exact: true }).isVisible());
    await page.keyboard.press("End");
    assert(await page.getByRole("tabpanel", { name: "Moments", exact: true }).isVisible());
    await page.keyboard.press("ArrowRight");
    assert(await page.getByRole("tabpanel", { name: "Media", exact: true }).isVisible());
    check("Keyboard library navigation selects the matching accessible pane");
    stage = "project reopening";
    await page.locator(".studio-project-rail__head > summary").click();
    await page.getByRole("textbox", { name: "Project name" }).fill("Interaction fixture saved");
    await page.getByTestId("studio-save-project").click();
    await page.waitForFunction(() =>
      document.querySelector(".studio-project-save-state").classList.contains("is-saved")
    );
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3
    );
    await pause();
    await page.getByRole("button", { name: "Show media", exact: true }).click();
    await page.locator(".studio-project-rail__head > summary").click();
    await page.locator(".studio-saved-projects > summary").click();
    await page
      .locator(".studio-saved-projects article > button")
      .filter({ hasText: "Interaction fixture saved" })
      .click();
    await page.waitForFunction(
      () => Number(document.querySelector('[data-testid="pro-video-clip-1"]').dataset.endTime) === 3
    );
    check("IndexedDB checkpoint survives reload and restores the selected trim");
    await page.locator(".studio-project-rail__head > summary").click();
    await page.getByRole("button", { name: "Hide media", exact: true }).click();
    stage = "menu Escape";
    const summary = page.locator(".studio-view-options > summary");
    await summary.click();
    await page.getByTestId("preview-fullscreen-button").click();
    assert(
      await page
        .getByTestId("hook-preview-frame")
        .evaluate(node => node.classList.contains("preview-expanded"))
    );
    await summary.focus();
    await summary.press("Enter");
    await summary.press("Escape");
    assert.equal(await page.locator(".studio-view-options").evaluate(node => node.open), false);
    assert(
      await page
        .getByTestId("hook-preview-frame")
        .evaluate(node => node.classList.contains("preview-expanded"))
    );
    await summary.press("Escape");
    assert.equal(
      await page
        .getByTestId("hook-preview-frame")
        .evaluate(node => node.classList.contains("preview-expanded")),
      false
    );
    check("Escape closes the open menu before closing the expanded preview");
    stage = "responsive layout";
    for (const [width, height] of [
      [1440, 1000],
      [1000, 800],
      [820, 1024],
      [768, 1024],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(
        limit =>
          Number(
            document.querySelector(".studio-timeline-resize").getAttribute("aria-valuemax")
          ) === limit,
        Math.max(148, Math.min(480, height - 220))
      );
      await page.getByTestId("studio-pro-timeline").scrollIntoViewIfNeeded();
      const geometry = await page.evaluate(() => {
        const rect = selector => {
          const b = document.querySelector(selector).getBoundingClientRect();
          return {
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            right: b.right,
            bottom: b.bottom,
          };
        };
        return {
          viewport: { width: innerWidth, height: innerHeight },
          timeline: rect(".studio-pro-timeline"),
          monitor: rect(".phone-preview-container"),
          picture: rect('[data-testid="hook-preview-frame"]'),
          transport: rect(".preview-custom-controls"),
          close: rect('[aria-label="Close Clip Studio"]'),
        };
      });
      assert(
        geometry.timeline.width > width * 0.85 &&
          geometry.timeline.right <= width + 2 &&
          geometry.timeline.x >= -2,
        `${width}x${height}: timeline does not fit the screen: ${JSON.stringify(geometry)}`
      );
      assert(
        geometry.close.x >= 0 && geometry.close.right <= width,
        `${width}x${height}: Close is outside the viewport`
      );
      assert(
        geometry.picture.height >= 120 && geometry.picture.width >= 60,
        `${width}x${height}: programme picture has collapsed`
      );
      assert(
        geometry.picture.bottom <= geometry.transport.y + 2,
        `${width}x${height}: transport obscures the programme picture`
      );
      assert(
        geometry.picture.y >= geometry.monitor.y &&
          geometry.transport.bottom <= geometry.monitor.bottom,
        `${width}x${height}: monitor contents are clipped`
      );
      if (width <= 820) {
        const order = await page.evaluate(() => {
          const box = selector => document.querySelector(selector).getBoundingClientRect();
          return {
            toolsWidth: box(".creative-tool-rail").width,
            toolsHeight: box(".creative-tool-rail").height,
            monitorEnd: box(".phone-preview-container").bottom,
            timelineStart: box(".studio-pro-timeline-dock").top,
            timelineEnd: box(".studio-pro-timeline-dock").bottom,
            inspectorStart: box(".studio-sidebar").top,
          };
        });
        assert(order.toolsWidth >= width - 2);
        assert(order.toolsHeight >= 64, "The mobile tool strip has collapsed");
        assert(
          order.monitorEnd <= order.timelineStart + 2 &&
            order.timelineEnd <= order.inspectorStart + 2
        );
      }
      if (height < 600 && width > 820)
        assert(geometry.monitor.height >= 120, "Landscape monitor has no editing space");
      if (width > 820 && height >= 800)
        await assertStudioTimelineLayout(page, `${width}x${height}`);
      await page.screenshot({ path: path.join(folder, `layout-${width}x${height}.png`) });
      check(`${width}x${height} timeline fits the screen`, geometry);
      if (width <= 820) {
        await page.getByRole("button", { name: "Show media", exact: true }).click();
        await page.getByRole("tab", { name: "Media", exact: true }).click();
        await page.locator(".studio-layout").evaluate(node => {
          node.scrollTop = 0;
        });
        const library = await page
          .getByRole("tabpanel", { name: "Media", exact: true })
          .boundingBox();
        assert(
          library &&
            library.width > width * 0.8 &&
            library.x >= 0 &&
            library.x + library.width <= width
        );
        await page.locator(".studio-media-card").first().scrollIntoViewIfNeeded();
        const usableLibrary = await page.evaluate(() => {
          const rail = document.querySelector(".studio-project-rail").getBoundingClientRect();
          const tabs = document.querySelector(".studio-library-tabs").getBoundingClientRect();
          const card = document.querySelector(".studio-media-card").getBoundingClientRect();
          return {
            height: rail.height,
            tabsTop: tabs.top,
            railTop: rail.top,
            cardTop: card.top,
            cardBottom: card.bottom,
            railBottom: rail.bottom,
          };
        });
        assert(usableLibrary.height >= 300, "The media library has collapsed");
        assert(
          usableLibrary.tabsTop >= usableLibrary.railTop &&
            usableLibrary.cardTop >= usableLibrary.railTop &&
            usableLibrary.cardBottom <= usableLibrary.railBottom + 2,
          `The library card or its tabs are clipped: ${JSON.stringify(usableLibrary)}`
        );
        assert(await page.getByRole("button", { name: "Hide media", exact: true }).isVisible());
        await page.screenshot({ path: path.join(folder, `library-${width}x${height}.png`) });
        await page.getByRole("button", { name: "Hide media", exact: true }).click();
        check(`${width}x${height} media library remains reachable and fits the screen`);
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(apiRequests, []);
    const files = [
      "frontend/src/components/ViralClipStudio.js",
      "frontend/src/components/ViralClipStudio.css",
      "frontend/src/components/StudioControlMenu.js",
      "scripts/run-studio-interaction-preview.js",
      "test/e2e/playwright/run-studio-interactions.js",
      "test/e2e/playwright/studio-interaction-entry.jsx",
    ];
    const receipt = {
      passed: true,
      completedAt: new Date().toISOString(),
      scope:
        "Local production component and native video fixture; real IndexedDB; no sign-in, cloud uploads, analysis or export jobs",
      checks,
      pageErrors: errors,
      apiRequests,
      sourceHashes: Object.fromEntries(
        files.map(file => [
          file,
          crypto
            .createHash("sha256")
            .update(fs.readFileSync(path.join(root, file)))
            .digest("hex"),
        ])
      ),
      bundleSha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(folder, "build/static/js/bundle.js")))
        .digest("hex"),
      fixtureSha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(folder, "fixture.mp4")))
        .digest("hex"),
    };
    fs.writeFileSync(path.join(folder, "receipt.json"), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify({ passed: true, checks: checks.length }));
  } catch (error) {
    const failure = { stage, message: error.message, checks };
    fs.writeFileSync(path.join(folder, "failure.json"), JSON.stringify(failure, null, 2));
    await page.screenshot({ path: path.join(folder, "failure.png") }).catch(() => {});
    console.error(JSON.stringify(failure));
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
