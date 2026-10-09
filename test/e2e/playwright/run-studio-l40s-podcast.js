#!/usr/bin/env node
// Exercise the production Studio with the actual L40S transcript and source.
// The localhost token only reaches the fixture callback; all cloud traffic is blocked.
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../../..");
const folder = path.join(root, "reports/studio-l40s-hardening-20261006/podcast-browser");

async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [], requests = [], checks = [];
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
      requests.push({ blocked: true, hostname: url.hostname });
      return route.abort();
    }
    if (url.pathname.startsWith("/api/")) throw new Error("This local proof must never call a cloud API");
    return route.continue();
  });
  await context.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "local-gpu-podcast-fixture-only";
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  const check = label => { checks.push(label); console.log(label); };
  try {
    await page.goto("http://127.0.0.1:5007/?fixture=podcast");
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3, undefined, { timeout: 45000 });
    const video = page.getByTestId("studio-after-video");
    if (!(await page.evaluate(() => document.querySelector('[data-testid="studio-after-video"]').paused))) await page.getByRole("button", { name: "Pause comparison", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]').paused);
    const source = page.getByTestId("pro-video-clip-1");
    assert(Math.abs(Number(await source.getAttribute("data-end-time")) - 20) < .03);
    check("Actual podcast source and NVIDIA caption draft open as a 20-second edit");
    await page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name: "Reframe", exact: true }).click();
    await page.getByTestId("reframe-aspect-16-9").click();
    const lane = await page.locator('[data-testid="pro-track-row-video"] .pro-track-lane').boundingBox();
    await page.mouse.click(lane.x + lane.width * 3 / 20, lane.y + lane.height / 2);
    await page.waitForFunction(() => Math.abs(document.querySelector('[data-testid="studio-after-video"]').currentTime - 19.08) < .06);
    check("Timeline scrub preserves the matching source picture at 19.08 seconds");
    await page.getByTestId("pro-quick-split").click();
    await page.getByTestId("pro-video-clip-2").waitFor();
    check("An actual pointer command splits the real podcast into editable sequence clips");
    await page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name: "Captions", exact: true }).click();
    await page.screenshot({ path: path.join(folder, "studio-podcast-caption-edit.png") });
    await page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name: "Export", exact: true }).click();
    await page.getByTestId("render-caption-review-copy").click();
    await page.waitForFunction(() => Boolean(window.__studioFixtureRenderRequest));
    const data = await page.evaluate(() => ({ payload: window.__studioFixtureRenderRequest, options: window.__studioFixtureExport.options }));
    assert.equal(data.payload.caption_review_copy, true);
    assert.equal(data.payload.timeline_segments.length, 2);
    assert.equal(data.payload.auto_captions, true);
    assert(data.payload.caption_segments.length > 1);
    const duration = data.payload.timeline_segments.reduce((sum, clip) => sum + clip.duration, 0);
    assert(Math.abs(duration - 20) < .03);
    assert.equal(data.payload.finish_plan.reframe.aspect, "16:9");
    check("The real production payload builder preserves split timing, caption review and chosen framing");
    fs.writeFileSync(path.join(folder, "browser-render-request.json"), JSON.stringify(data.payload, null, 2));
    fs.writeFileSync(path.join(folder, "browser-options.json"), JSON.stringify(data.options, null, 2));
    // Move only media transport addresses into the isolated GPU loopback server.
    const move = value => {
      if (typeof value === "string") return value.replace("http://127.0.0.1:5007/", "http://127.0.0.1:8765/");
      if (Array.isArray(value)) return value.map(move);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, move(item)]));
      return value;
    };
    fs.writeFileSync(path.join(folder, "gpu-render-request.json"), JSON.stringify(move(data.payload), null, 2));
    await page.screenshot({ path: path.join(folder, "studio-podcast-export.png") });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(folder, "receipt.json"), JSON.stringify({ status: "PASS", completedAt: new Date().toISOString(), checks, pageErrors: errors, externalRequests: requests, scope: "Production Studio and payload builder on localhost, real podcast and real L40S caption artifact; explicit review copy; cloud traffic blocked; no production authentication or deployment" }, null, 2));
    console.log(JSON.stringify({ status: "PASS", checks: checks.length }));
  } catch (error) {
    await page.screenshot({ path: path.join(folder, "failure.png") }).catch(() => {});
    const media = await page.evaluate(() => [...document.querySelectorAll("video")].map(video => ({
      testId: video.dataset.testid, src: video.currentSrc, readyState: video.readyState,
      networkState: video.networkState, error: video.error?.message, currentTime: video.currentTime,
      paused: video.paused, duration: video.duration,
    }))).catch(() => []);
    fs.writeFileSync(path.join(folder, "failure.json"), JSON.stringify({ error: error.message, checks, errors, requests, media }, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
