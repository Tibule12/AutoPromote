#!/usr/bin/env node
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../../..");
const folder = path.join(root, "reports/public-homepage-video-20261006");
const url = process.env.LANDING_PREVIEW_URL || "http://127.0.0.1:3095";
assert(["127.0.0.1", "localhost"].includes(new URL(url).hostname));
fs.mkdirSync(folder, { recursive: true });
const checks = [];

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    for (const failure of ["blocked-autoplay", "invalid-media"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
      const page = await context.newPage();
      const exceptions = [];
      page.on("pageerror", error => exceptions.push(error.message));
      await page.addInitScript(blocked => {
        window.__footage = [];
        const create = document.createElement.bind(document);
        document.createElement = (tag, ...args) => {
          const element = create(tag, ...args);
          if (tag.toLowerCase() === "video") window.__footage.push(element);
          return element;
        };
        if (blocked) {
          const play = HTMLMediaElement.prototype.play;
          HTMLMediaElement.prototype.play = function (...args) {
            return this.getAttribute("src")?.includes("/landing/podcast-conversation.mp4")
              ? Promise.reject(new DOMException("Autoplay disabled by test", "NotAllowedError"))
              : play.apply(this, args);
          };
        }
      }, failure === "blocked-autoplay");
      if (failure === "invalid-media") await page.route("**/landing/podcast-conversation.mp4", route => route.fulfill({ status: 200, contentType: "video/mp4", body: "Invalid media fixture" }));
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Number(document.querySelector('[data-mode="opening"] canvas')?.dataset.time) >= 7, null, { timeout: 60000 });
      const state = await page.locator('[data-mode="opening"] canvas').evaluate(element => ({ ...element.dataset }));
      assert.equal(state.previewSource, "poster");
      assert.equal(state.videoSurfaces, "0");
      assert.equal(state.videoPaused, "true");
      assert.equal(await page.locator('[data-mode="opening"]').getAttribute("data-renderer"), "three-webgl");
      if (failure === "invalid-media") assert(await page.evaluate(() => window.__footage.some(video => video.error?.code === 4)));
      await page.locator('[data-mode="opening"]').getByRole("button", { name: "Pause editing animation", exact: true }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(folder, `${failure}.png`) });
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await page.getByPlaceholder("Enter your email").waitFor();
      assert(await page.evaluate(() => window.__footage.every(video => video.paused && !video.getAttribute("src"))));
      assert.deepEqual(exceptions, []);
      checks.push({ failure, status: "PASS", state, posterRetained: true, sourcesReleased: true, exceptions });
      console.log(`[homepage media] ${failure}: poster retained, controls work, resources released`);
      await context.close();
    }
    fs.writeFileSync(path.join(folder, "media-fallback-verification.json"), JSON.stringify({ status: "PASS", checks }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => {
  fs.writeFileSync(path.join(folder, "media-fallback-failure.json"), JSON.stringify({ error: error.message, stack: error.stack, checks }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
