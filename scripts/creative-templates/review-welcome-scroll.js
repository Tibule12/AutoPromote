#!/usr/bin/env node
const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../.."),
  out = path.join(root, "reports/welcome-studio-scroll-20261021/page-review");
const previewUrl = "http://localhost:5006/";
fs.mkdirSync(out, { recursive: true });
async function recordWalkthrough(browser) {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      recordVideo: { dir: path.join(out, "capture"), size: { width: 1440, height: 1000 } },
    }),
    page = await context.newPage();
  await page.goto(previewUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: "Make the video. Make your move." }).waitFor();
  await page.waitForTimeout(2400);
  const box = await page.locator(".sw-story").boundingBox(),
    start = box.y + (await page.evaluate(() => window.scrollY));
  await page.evaluate(y => window.scrollTo({ top: y, behavior: "smooth" }), start);
  await page.waitForTimeout(1300);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(
      ({ start, height, i }) =>
        window.scrollTo({
          top: start + ((height - innerHeight) * (i + 0.32)) / 6,
          behavior: "smooth",
        }),
      { start, height: box.height, i }
    );
    await page.waitForTimeout(1700);
  }
  for (const selector of [".sw-work", ".sw-release", ".sw-final"]) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.waitForTimeout(2100);
  }
  await page.getByRole("button", { name: "Watch Find the rhythm." }).click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(3300);
  await page.keyboard.press("Escape");
  const recording = page.video();
  await context.close();
  await recording.saveAs(path.join(out, "welcome-page-walkthrough.webm"));
}
async function main() {
  if (process.argv.includes("--wait-for-film")) {
    const movie = path.join(out, "../media/studio-story.mp4"),
      deadline = Date.now() + 12 * 60000;
    while (!fs.existsSync(movie) && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 1000));
    assert(fs.existsSync(movie), "Native film is not available within the observation budget");
  }
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: ["--mute-audio", "--no-proxy-server", "--disable-http2", "--disable-quic"],
  });
  const summaries = [];
  try {
    for (const device of [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "mobile", width: 390, height: 844 },
      { name: "reduced-motion", width: 1200, height: 900, reducedMotion: "reduce" },
    ]) {
      const context = await browser.newContext({
          viewport: { width: device.width, height: device.height },
          reducedMotion: device.reducedMotion || "no-preference",
        }),
        page = await context.newPage();
      page.setDefaultTimeout(30000);
      const errors = [];
      let writes = 0;
      page.on("pageerror", e => errors.push(e.message));
      page.on("request", r => {
        if (
          ["POST", "PATCH", "DELETE", "PUT"].includes(r.method()) &&
          new URL(r.url()).pathname.startsWith("/api/")
        )
          writes++;
      });
      await page.goto(previewUrl, { waitUntil: "domcontentloaded" });
      await page
        .getByRole("heading", { level: 1, name: "Make the video. Make your move." })
        .waitFor();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(out, `${device.name}-hero.png`) });
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        "Horizontal overflow"
      );
      if (!process.argv.includes("--layout-only")) {
        const story = page.locator(".sw-story"),
          box = await story.boundingBox(),
          start = box.y + (await page.evaluate(() => window.scrollY));
        const chapters = [];
        // Reduced motion is a normal static section. Bring the whole section
        // into view before using its controls, rather than centering one button.
        if (device.reducedMotion)
          await story.evaluate(e => e.scrollIntoView({ block: "start", behavior: "instant" }));
        for (let i = 0; i < 6; i++) {
          if (device.reducedMotion)
            await page
              .getByRole("navigation", { name: "Explore the creative workflow" })
              .getByRole("button")
              .nth(i)
              .click();
          else
            await page.evaluate(
              ({ start, height, viewport, index }) =>
                window.scrollTo(0, start + ((height - viewport) * (index + 0.32)) / 6),
              { start, height: box.height, viewport: device.height, index: i }
            );
          await page.waitForTimeout(700);
          await page.waitForFunction(() => {
            const v = document.querySelector(".sw-story-screen video");
            return v && !v.seeking && v.readyState >= 2;
          });
          const visible = await page.locator(".sw-story-screen").evaluate(e => {
            const r = e.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= innerHeight + 1;
          });
          assert(visible, "The actual story picture stays fully in the viewport");
          assert.equal(
            await page
              .locator(".sw-chapters button[aria-current=step]")
              .evaluate(e => Array.from(e.parentNode.children).indexOf(e)),
            i
          );
          chapters.push(
            await page
              .locator(".sw-story-screen video")
              .evaluate(v => ({ time: v.currentTime, readyState: v.readyState }))
          );
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth + 1
            ),
            "Chapter horizontal overflow"
          );
          await page.screenshot({ path: path.join(out, `${device.name}-chapter-${i + 1}.png`) });
        }
        await page
          .getByRole("navigation", { name: "Explore the creative workflow" })
          .getByRole("button")
          .first()
          .click();
        await page.waitForTimeout(600);
        await page.waitForFunction(() => {
          const v = document.querySelector(".sw-story-screen video");
          return v && !v.seeking && v.currentTime < 2;
        });
        await page.getByRole("button", { name: "Watch Find the rhythm." }).click();
        await page.getByRole("dialog").waitFor();
        const movie = page.getByRole("dialog").locator("video");
        await movie.evaluate(v => v.pause());
        await page.keyboard.press("Escape");
        assert.equal(await page.getByRole("dialog").count(), 0);
        assert(
          await page
            .getByRole("button", { name: "Watch Find the rhythm." })
            .evaluate(e => e === document.activeElement),
          "Film trigger focus restored"
        );
        const nav = page.getByRole("navigation", { name: "Primary" });
        const menu = page.getByRole("button", { name: "Open navigation", exact: true });
        if (await menu.isVisible()) await menu.click();
        await nav.getByRole("button", { name: "Product Tour", exact: true }).click();
        await page.waitForFunction(
          () => Math.abs(document.querySelector(".sw-release").getBoundingClientRect().top) < 3
        );
        await page.screenshot({ path: path.join(out, `${device.name}-schedule.png`) });
        await page
          .getByRole("button", { name: "Start with my video", exact: true })
          .first()
          .click();
        await page
          .getByRole("heading", { name: "Create your workspace", exact: true })
          .first()
          .waitFor({ timeout: 15000 });
        fs.writeFileSync(
          path.join(out, `${device.name}-chapter-times.json`),
          JSON.stringify(chapters, null, 2)
        );
      }
      assert.equal(writes, 0);
      assert.deepEqual(errors, []);
      summaries.push({
        device: device.name,
        viewport: { width: device.width, height: device.height },
        horizontalOverflow: false,
        storyPictureFullyVisible: !process.argv.includes("--layout-only"),
        reverseSeekAndDialogFocusChecked: !process.argv.includes("--layout-only"),
        errors,
        writes,
        layoutOnly: process.argv.includes("--layout-only"),
      });
      await context.close();
    }
    fs.writeFileSync(
      path.join(out, process.argv.includes("--layout-only") ? "layout.json" : "verification.json"),
      JSON.stringify(
        { at: new Date().toISOString(), normalPublicUi: true, authBypass: false, ...{ summaries } },
        null,
        2
      )
    );
    console.log(JSON.stringify(summaries));
    if (process.argv.includes("--record")) await recordWalkthrough(browser);
  } finally {
    await browser.close();
  }
}
main().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
