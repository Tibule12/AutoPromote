#!/usr/bin/env node
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../.."),
  report = path.join(root, "reports/welcome-real-workflow-20261021"),
  out = path.join(root, "reports/welcome-studio-reel-20261021/review");
fs.mkdirSync(out, { recursive: true });
const actual = JSON.parse(fs.readFileSync(path.join(root, "frontend/public/welcome/2026-10-21/release-data.json")));
const names = {
  linkedin: "LinkedIn",
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  reddit: "Reddit",
};
async function main() {
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: ["--mute-audio", "--no-proxy-server", "--disable-http2", "--disable-quic"],
  });
  const checks = [];
  try {
    for (const device of [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "mobile", width: 390, height: 844 },
      { name: "narrow", width: 360, height: 800 },
      { name: "reduced", width: 1200, height: 900, reducedMotion: "reduce" },
    ]) {
      const context = await browser.newContext({
          viewport: { width: device.width, height: device.height },
          reducedMotion: device.reducedMotion || "no-preference",
        }),
        page = await context.newPage();
      page.setDefaultTimeout(30000);
      const errors = [],
        obsolete = [];
      let writes = 0;
      page.on("pageerror", e => errors.push(e.message));
      page.on("request", r => {
        if (
          ["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) &&
          new URL(r.url()).pathname.startsWith("/api/")
        )
          writes++;
        if (/studio-story|schedule-tour|product-tour|boxing/.test(new URL(r.url()).pathname))
          obsolete.push(new URL(r.url()).pathname);
      });
      await page.goto(process.env.WELCOME_PREVIEW_URL || "http://localhost:5006/", {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByRole("heading", { level: 1, name: "More creating. Less posting work." })
        .waitFor();
      await page.getByRole("tab", { name: "LinkedIn", exact: true }).waitFor();
      await page.locator(".wf-queue-window img").evaluate(img => img.decode());
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        "Page horizontal overflow"
      );
      const title = await page.locator("h1").boundingBox();
      assert(title.x >= 0 && title.x + title.width <= device.width + 1, "Hero title clipped");
      await page.locator(".wf-reel video").waitFor();
      await page.waitForFunction(() => document.querySelector(".wf-reel video")?.readyState >= 2);
      const reelBox = await page.locator(".wf-reel video").boundingBox();
      assert(reelBox.width <= device.width && reelBox.height > 100, "Native reel picture visible");
      if (!device.reducedMotion) {
        const pausePreview = page.getByRole("button", {
          name: "Pause welcome preview",
          exact: true,
        });
        await pausePreview.click();
        assert(await page.locator(".wf-reel video").evaluate(v => v.paused));
        await page.getByRole("button", { name: "Play welcome preview", exact: true }).click();
      } else assert(await page.locator(".wf-reel video").evaluate(v => v.paused));
      await page.screenshot({ path: path.join(out, `${device.name}-hero.png`) });
      const reelTrigger = page.getByRole("button", {
        name: "Watch the welcome Studio film with sound",
        exact: true,
      });
      await reelTrigger.click();
      const reelDialog = page.getByRole("dialog"),
        reelVideo = reelDialog.locator("video");
      await reelVideo.evaluate(v => {
        v.muted = true;
        v.currentTime = 0;
        return v.play();
      });
      await page.waitForFunction(() => document.querySelector("dialog video")?.readyState >= 2);
      assert(
        Math.abs((await reelVideo.evaluate(v => v.duration)) - 28) < 0.05,
        "Complete native 28-second output"
      );
      const viewportDialog = await reelDialog.boundingBox();
      assert(
        Math.abs(viewportDialog.width - device.width) < 2 &&
          Math.abs(viewportDialog.height - device.height) < 2,
        "Film viewer fills viewport"
      );
      if (device.name === "desktop") {
        await page.waitForFunction(() => document.querySelector("dialog video")?.ended, undefined, {
          timeout: 60000,
        });
        const playback = await reelVideo.evaluate(v => ({
          ended: v.ended,
          duration: v.duration,
          time: v.currentTime,
          decoded: v.getVideoPlaybackQuality().totalVideoFrames,
          error: v.error?.code || null,
        }));
        assert(playback.ended && playback.decoded > 500 && !playback.error);
        fs.writeFileSync(
          path.join(out, "complete-reel-playback.json"),
          JSON.stringify(playback, null, 2)
        );
      }
      await reelVideo.evaluate(v => v.pause());
      await page.keyboard.press("Escape");
      assert(await reelTrigger.evaluate(e => e === document.activeElement));
      await page.getByRole("button", { name: /Watch its Studio timeline/ }).click();
      await page.waitForFunction(() => document.querySelector("dialog video")?.readyState >= 2);
      assert.equal(
        await page.getByRole("dialog").locator("video").getAttribute("src"),
        "/welcome/2026-10-21/welcome-reel-studio.mp4"
      );
      await page
        .getByRole("dialog")
        .locator("video")
        .evaluate(v => v.pause());
      await page.keyboard.press("Escape");
      if (!process.argv.includes("--layout-only")) {
        const story = page.locator(".wf-workflow"),
          box = await story.boundingBox(),
          start = box.y + (await page.evaluate(() => scrollY));
        if (device.reducedMotion)
          await story.evaluate(e => e.scrollIntoView({ block: "start", behavior: "instant" }));
        for (let i = 0; i < 4; i++) {
          if (device.reducedMotion)
            await page
              .getByRole("navigation", { name: "Explore the workflow" })
              .getByRole("button")
              .nth(i)
              .click();
          else
            await page.evaluate(
              ({ start, height, i }) =>
                scrollTo({
                  top: start + ((height - innerHeight) * (i + 0.32)) / 4,
                  behavior: "instant",
                }),
              { start, height: box.height, i }
            );
          await page.waitForTimeout(500);
          await page.waitForFunction(() => {
            const v = document.querySelector(".wf-native-pane.is-active video");
            return v && v.readyState >= 2;
          });
          assert.equal(
            await page
              .locator(".wf-steps button[aria-current=step]")
              .evaluate(e => [...e.parentElement.children].indexOf(e)),
            i
          );
          const rect = await page.locator(".wf-stage-screen").boundingBox();
          assert(
            rect.y >= 0 && rect.y + rect.height <= device.height + 1,
            `${device.name} chapter ${i}: whole picture visible`
          );
          await page.screenshot({ path: path.join(out, `${device.name}-step-${i}.png`) });
        }
        for (const post of actual.destinations) {
          await page.getByRole("tab", { name: names[post.platform], exact: true }).click();
          const panel = page.getByRole("tabpanel");
          await panel.getByRole("heading", { name: post.title, exact: true }).waitFor();
          await panel.getByText(post.label + " SAST", { exact: true }).waitFor();
          await panel.locator("img").evaluate(img => img.decode());
          assert.equal(
            await panel.locator("img").getAttribute("src"),
            `/welcome/2026-10-21/destination-${post.platform}.png`
          );
        }
        await page.getByRole("tab", { name: "LinkedIn", exact: true }).click();
        await page.locator(".wf-channel-proof").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(out, `${device.name}-posts.png`) });
        await page.getByRole("button", { name: "Open the actual Queue", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        assert.equal(await dialog.locator("img").getAttribute("src"), "/welcome/2026-10-21/queue.png");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(50);
        assert(
          await page
            .getByRole("button", { name: "Open the actual Queue", exact: true })
            .evaluate(e => e === document.activeElement)
        );
        await page.getByRole("button", { name: "Watch the Studio film", exact: true }).click();
        await page.getByRole("dialog").waitFor();
        const v = page.getByRole("dialog").locator("video");
        assert.equal(await v.getAttribute("src"), "/welcome/2026-10-21/film.mp4");
        assert(await v.evaluate(e => e.controls));
        await v.evaluate(e => e.pause());
        await page.keyboard.press("Escape");
        await page.waitForTimeout(50);
        assert(
          await page
            .getByRole("button", { name: "Watch the Studio film", exact: true })
            .evaluate(e => e === document.activeElement)
        );
        await page
          .getByRole("navigation", { name: "Explore the workflow" })
          .getByRole("button")
          .first()
          .click();
        await page.waitForTimeout(300);
        assert.equal(await page.locator(".wf-stage-picture").getAttribute("data-step"), "result");
        const menu = page.getByRole("button", { name: "Open navigation", exact: true });
        if (await menu.isVisible()) await menu.click();
        await page
          .getByRole("navigation", { name: "Primary" })
          .getByRole("button", { name: "Product Tour", exact: true })
          .click();
        await page.waitForFunction(
          () => Math.abs(document.querySelector(".wf-release").getBoundingClientRect().top) < 3
        );
        await page.screenshot({ path: path.join(out, `${device.name}-calendar.png`) });
        await page
          .getByRole("button", { name: "Start creating free", exact: true })
          .first()
          .click();
        await page.getByRole("heading", { name: "Create your workspace", exact: true }).waitFor();
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(obsolete, []);
      assert.equal(writes, 0);
      checks.push({
        device: device.name,
        width: device.width,
        errors,
        obsoleteMediaRequests: obsolete,
        publishingWrites: writes,
        wholePictureChecks: process.argv.includes("--layout-only") ? 0 : 4,
        actualPostCopyAndTimeChecks: process.argv.includes("--layout-only") ? 0 : 6,
        layoutOnly: process.argv.includes("--layout-only"),
      });
      await context.close();
    }
    fs.writeFileSync(
      path.join(out, process.argv.includes("--layout-only") ? "layout.json" : "verification.json"),
      JSON.stringify({ at: new Date().toISOString(), checks }, null, 2) + "\n"
    );
    console.log(JSON.stringify(checks));
    if (process.argv.includes("--record")) {
      const c = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          recordVideo: { dir: path.join(out, "recording"), size: { width: 1440, height: 1000 } },
        }),
        p = await c.newPage();
      await p.goto("http://localhost:5006/");
      await p.locator(".wf-queue-window img").evaluate(e => e.decode());
      await p.waitForTimeout(2200);
      const r = await p.locator(".wf-workflow").boundingBox(),
        start = r.y + (await p.evaluate(() => scrollY));
      for (let i = 0; i < 4; i++) {
        await p.evaluate(
          ({ start, height, i }) =>
            scrollTo({
              top: start + ((height - innerHeight) * (i + 0.32)) / 4,
              behavior: "smooth",
            }),
          { start, height: r.height, i }
        );
        await p.waitForTimeout(2200);
      }
      for (const id of ["LinkedIn", "TikTok", "Reddit"]) {
        await p.getByRole("tab", { name: id, exact: true }).click();
        await p.locator(".wf-channel-proof").scrollIntoViewIfNeeded();
        await p.waitForTimeout(1400);
      }
      await p.locator(".wf-release").scrollIntoViewIfNeeded();
      await p.waitForTimeout(2200);
      await p.locator(".wf-final").scrollIntoViewIfNeeded();
      await p.waitForTimeout(1700);
      const v = p.video();
      await c.close();
      await v.saveAs(path.join(out, "welcome-workflow.webm"));
    }
  } finally {
    await browser.close();
  }
}
main().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
