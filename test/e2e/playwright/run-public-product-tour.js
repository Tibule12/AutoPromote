#!/usr/bin/env node
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../../..");
const folder = process.env.PRODUCT_TOUR_REPORT_DIR
  ? path.resolve(process.env.PRODUCT_TOUR_REPORT_DIR)
  : path.join(root, "reports/public-product-tour-20261006");
fs.mkdirSync(folder, { recursive: true });
const url = process.env.LANDING_PREVIEW_URL || "http://127.0.0.1:3095";
assert(["127.0.0.1", "localhost"].includes(new URL(url).hostname));
const checks = [], errors = [];
const filmRoute = /\/landing\/product-tour(?:-l40s)?\.mp4(?:\?|$)/;
const check = label => { checks.push(label); console.log(`[product tour] ${label}`); };
const layout = async page => {
  const result = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.equal(result.width, result.scrollWidth);
};
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", recordVideo: { dir: path.join(folder, "browser"), size: { width: 960, height: 600 } } });
    await context.route("http://127.0.0.1:8000/**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{}' }));
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    let mediaRequests = 0;
    page.on("request", request => { if (filmRoute.test(request.url())) mediaRequests++; });
    const recording = page.video();
    await page.goto(url, { waitUntil: "networkidle" });
    const tour = page.locator("#workflow");
    const video = tour.locator("video");
    await tour.scrollIntoViewIfNeeded();
    await layout(page);
    assert.equal(await video.getAttribute("src"), null);
    assert.equal(mediaRequests, 0);
    await tour.screenshot({ path: path.join(folder, "tour-desktop-1440.png") });
    check("Reduced motion keeps the actual tour behind explicit user intent and requests no film");
    const playChapter = async (label, time) => {
      await tour.getByRole("button", { name: new RegExp(label) }).click();
      await page.waitForFunction(time => {
        const video = document.querySelector("#workflow video");
        return video.readyState >= 2 && !video.paused && video.currentTime >= time && video.currentTime < time + 3;
      }, time);
      await page.waitForTimeout(450);
      await video.evaluate(video => video.pause());
      assert(await tour.getByRole("button", { name: new RegExp(label) }).getAttribute("aria-pressed") === "true");
      await tour.locator(".lp-tour-screen").screenshot({ path: path.join(folder, `tour-${label.split(" ")[1].toLowerCase()}.png`) });
      check(`${label}: chapter seek, decoded moving footage and active control verified`);
    };
    await playChapter("02 Studio", 9);
    await playChapter("01 Uploads", 0);
    await playChapter("03 Schedule", 18);
    await playChapter("04 Analytics", 27);
    await video.evaluate(video => video.play());
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => document.querySelector("#workflow video").paused);
    check("Scrolling away pauses tour playback");
    await page.getByRole("button", { name: "Watch Demo", exact: true }).click();
    const dialog = page.getByRole("dialog");
    assert.equal(await dialog.locator("video").getAttribute("src"), null);
    await dialog.getByRole("button", { name: /03 Schedule/ }).click();
    await page.waitForFunction(() => document.querySelector("dialog video")?.currentTime >= 18, null, { timeout: 10000 }).catch(async error => {
      const state = await dialog.locator("video").evaluate(video => ({ currentTime: video.currentTime, readyState: video.readyState, paused: video.paused, src: video.getAttribute("src"), error: video.error?.message, bounds: video.getBoundingClientRect().toJSON() }));
      throw new Error(`${error.message}: ${JSON.stringify(state)}`);
    });
    await dialog.locator("video").evaluate(video => { window.__tourDialogVideo = video; });
    await dialog.screenshot({ path: path.join(folder, "tour-dialog.png") });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert(await page.evaluate(() => window.__tourDialogVideo.paused && !window.__tourDialogVideo.getAttribute("src")));
    assert(await page.getByRole("button", { name: "Watch Demo", exact: true }).evaluate(element => element === document.activeElement));
    check("Watch Demo opens the full tour; Escape releases its decoder and restores focus");
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.reload({ waitUntil: "networkidle" });
      await tour.scrollIntoViewIfNeeded();
      await layout(page);
      await tour.screenshot({ path: path.join(folder, `tour-${viewport.width}.png`) });
      await tour.getByRole("button", { name: /02 Studio/ }).click();
      await page.waitForFunction(() => document.querySelector("#workflow video")?.currentTime >= 9.3);
      await video.evaluate(video => video.pause());
      check(`Tour at ${viewport.width}px: readable chapter controls, playback and no horizontal overflow`);
    }
    await video.evaluate(video => { window.__tourInlineVideo = video; });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.getByPlaceholder("Enter your email").waitFor();
    assert(await page.evaluate(() => window.__tourInlineVideo.paused && !window.__tourInlineVideo.getAttribute("src")));
    check("Original sign-in route works and releases tour media");
    assert.deepEqual(errors, []);
    await context.close();
    await recording.saveAs(path.join(folder, "product-tour-browser.webm"));
    await recording.delete();

    const fallback = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const fallbackPage = await fallback.newPage();
    const fallbackErrors = [];
    fallbackPage.on("pageerror", error => fallbackErrors.push(error.message));
    await fallback.route(filmRoute, route => route.fulfill({ status: 200, contentType: "video/mp4", body: "invalid media fixture" }));
    await fallbackPage.goto(url, { waitUntil: "networkidle" });
    const fallbackTour = fallbackPage.locator("#workflow");
    await fallbackTour.scrollIntoViewIfNeeded();
    await fallbackTour.getByRole("button", { name: /Play product tour/ }).click();
    await fallbackTour.getByRole("button", { name: /Retry product tour/ }).waitFor();
    assert(await fallbackTour.getByRole("link", { name: /Open film/ }).isVisible());
    await fallback.unroute(filmRoute);
    await fallbackTour.getByRole("button", { name: /Retry product tour/ }).click();
    await fallbackPage.waitForFunction(() => {
      const video = document.querySelector("#workflow video");
      return video.readyState >= 2 && !video.paused && video.currentTime > 0;
    }, null, { timeout: 12000 }).catch(async error => {
      const state = await fallbackTour.locator("video").evaluate(video => ({ currentTime: video.currentTime, readyState: video.readyState, paused: video.paused, src: video.getAttribute("src"), error: video.error?.message, bounds: video.getBoundingClientRect().toJSON() }));
      throw new Error(`${error.message}: ${JSON.stringify(state)}`);
    });
    assert.deepEqual(fallbackErrors, []);
    check("Missing media offers a direct film link and recovers after retry");
    await fallback.close();
    fs.writeFileSync(path.join(folder, "browser-verification.json"), JSON.stringify({ status: "PASS", checks, errors, filmRequestsBeforeUserIntent: 0, routes: ["public homepage", "product tour modal", "original sign-in"] }, null, 2) + "\n");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); fs.writeFileSync(path.join(folder, "browser-failure.json"), JSON.stringify({ error: error.message, checks, errors }, null, 2)); process.exitCode = 1; });
