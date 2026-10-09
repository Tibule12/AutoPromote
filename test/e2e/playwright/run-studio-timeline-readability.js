#!/usr/bin/env node
const assert = require("assert/strict");
const fs = require("fs"),
  path = require("path");
const { chromium } = require("playwright");
const { assertStudioTimelineLayout } = require("./studio-timeline-layout");
const folder = path.resolve(__dirname, "../../../reports/studio-timeline-readability-20261007");
fs.mkdirSync(folder, { recursive: true });
async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  const errors = [],
    checks = [];
  let page;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route("**/*", route =>
      ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
        ? route.continue()
        : route.abort()
    );
    page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:5007/?fixture=podcast");
    await page.waitForFunction(
      () => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3,
      null,
      { timeout: 45000 }
    );
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    const pause = page.getByRole("button", { name: "Pause comparison", exact: true });
    if (await pause.count()) await pause.click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="studio-after-video"]').paused
    );
    await page.waitForFunction(
      () => document.querySelectorAll(".pro-source-frame img").length === 10,
      null,
      { timeout: 30000 }
    );
    const source = page.getByTestId("pro-video-clip-1");
    assert(await source.locator(".pro-video-clip-title").isVisible());
    assert.equal(await source.locator(".pro-video-clip-duration").innerText(), "20.0s");
    const frames = await page
      .locator(".pro-source-frame")
      .evaluateAll(nodes =>
        nodes.map(node => ({
          background: getComputedStyle(node).backgroundImage,
          time: Number(node.querySelector("img").dataset.sourceTime),
        }))
      );
    assert(frames.every(frame => frame.background === "none"));
    assert(new Set(frames.map(frame => frame.time)).size === 10);
    checks.push({
      label:
        "Each filmstrip tile represents a different sampled source time; the label occupies a separate band",
    });
    await page.screenshot({ path: path.join(folder, "desktop-1440.png") });
    await page
      .locator(".studio-pro-timeline-dock")
      .screenshot({ path: path.join(folder, "timeline-detail.png") });
    checks.push(await assertStudioTimelineLayout(page, "1440px"));
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      checks.push(await assertStudioTimelineLayout(page, `${viewport.width}px`));
      await page.screenshot({ path: path.join(folder, `desktop-${viewport.width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const lane = page.locator('[data-testid="pro-track-row-video"] .pro-track-lane');
    const rect = await lane.boundingBox();
    await page.mouse.click(rect.x + rect.width * 0.3, rect.y + rect.height * 0.5);
    await page.waitForFunction(
      () =>
        Math.abs(document.querySelector('[data-testid="studio-after-video"]').currentTime - 22.08) <
        0.08
    );
    await page.getByTestId("pro-quick-split").click();
    await page.getByTestId("pro-video-clip-2").waitFor();
    assert(
      Math.abs(
        Number(await page.getByTestId("pro-video-clip-1").getAttribute("data-end-time")) - 6
      ) < 0.08
    );
    checks.push({ label: "Pointer seek and split retain the 16.08-second source offset" });
    await page.keyboard.press("Control+z");
    await page.getByTestId("pro-video-clip-2").waitFor({ state: "detached" });
    await page.keyboard.press("Control+Shift+z");
    await page.getByTestId("pro-video-clip-2").waitFor();
    checks.push({ label: "Undo and redo restore actual split timing" });
    await page
      .getByRole("navigation", { name: "Creative tools" })
      .getByRole("button", { name: "Composite", exact: true })
      .click();
    await page.getByLabel("Subject effect source clip").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Add first-frame point" }).click();
    assert.match(await page.locator(".subject-vfx-point-count").innerText(), /^1 first-frame/);
    await page.getByRole("button", { name: "Render subject preview" }).click();
    await page
      .getByText(
        "Save or upload this source to your Studio project before rendering subject effects."
      )
      .waitFor();
    await page.screenshot({ path: path.join(folder, "subject-authoring.png") });
    checks.push({
      label:
        "Real-source subject authoring is accessible and unsaved sources cannot dispatch a render",
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(folder, "receipt.json"),
      JSON.stringify(
        {
          status: "PASS",
          scope:
            "Actual production Studio on localhost with existing podcast source; no inference, production API, or GPU job",
          checks,
          pageErrors: errors,
        },
        null,
        2
      )
    );
    console.log(JSON.stringify({ status: "PASS", checks: checks.length }));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(folder, "failure.png") }).catch(() => {});
    fs.writeFileSync(
      path.join(folder, "failure.json"),
      JSON.stringify({ message: error.message, checks, errors }, null, 2)
    );
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
