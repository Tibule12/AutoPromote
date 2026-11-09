const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const folder = path.resolve(__dirname, "../../../reports/public-homepage-art-direction-20261005");
const checks = [];

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    for (const [name, width, height] of [
      ["desktop", 1440, 900],
      ["tablet", 820, 1180],
      ["mobile", 390, 844],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "no-preference" });
      await page.goto("http://127.0.0.1:3095", { waitUntil: "networkidle" });
      await page.waitForFunction(() => {
        const title = document.getElementById("landing-headline");
        const animations = title?.getAnimations({ subtree: true });
        return animations?.length === 4 && animations.every(animation => animation.playState === "finished");
      });
      await page.locator("#features").scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(150);
      const state = await page.locator("#landing-headline").evaluate(title => ({
        animations: title.getAnimations({ subtree: true }).map(animation => animation.playState),
        opacity: [...title.querySelectorAll("[data-kinetic-line]")].map(line => Number(getComputedStyle(line).opacity)),
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      assert(state.animations.every(value => value === "finished"), `${name} rewound a completed headline`);
      assert(state.opacity.every(value => value === 1), `${name} hid completed headline text`);
      assert.equal(state.documentWidth, state.viewportWidth);
      await page.waitForFunction(() =>
        Number(document.querySelector('[data-mode="opening"] canvas')?.dataset.time) >= 14.5,
        null, { timeout: 90000 }
      );
      await page.screenshot({ path: path.join(folder, `${name}-headline-return.png`) });
      checks.push({ viewport: name, status: "PASS", ...state });
      await page.close();
    }
    fs.writeFileSync(path.join(folder, "headline-verification.json"), JSON.stringify({ status: "PASS", checks }, null, 2));
    console.log("Completed headline stays visible after scrolling away and returning: 3 viewports pass.");
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
