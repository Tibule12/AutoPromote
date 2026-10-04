#!/usr/bin/env node
const assert = require("assert/strict"),
  fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const { chromium } = require("@playwright/test");
const root = path.resolve(__dirname, "../../.."),
  folder = path.join(root, "artifacts/studio-sequence-audio-20261004");
async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-gpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(15000);
  const checks = [],
    errors = [],
    apiRequests = [];
  let stage = "load";
  const check = (label, detail = {}) => {
    checks.push({ label, ...detail });
    console.log(`[sequence] ${label}`);
  };
  const near = (actual, expected) =>
    assert(
      Math.abs(actual - expected) < 0.025,
      `${actual} differs from ${expected}`,
    );
  const bounds = async (clip) => {
    const title = await clip.getAttribute("title");
    const match = title.match(/([\d.]+)s–([\d.]+)s/);
    assert(match, title);
    return match.slice(1).map(Number);
  };
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/api/")) apiRequests.push(new URL(r.url()).pathname);
  });
  const video = page.getByTestId("studio-after-video");
  const pause = async () => {
    if (!(await video.evaluate((v) => v.paused)))
      await page
        .getByRole("button", { name: "Pause comparison", exact: true })
        .click();
  };
  const seek = async (time) => {
    const lane = await page
      .locator('[data-testid="pro-track-row-video"] .pro-track-lane')
      .boundingBox();
    const total = Number(
      await page.getByTestId("pro-video-clip-2").getAttribute("data-end-time"),
    );
    await page.mouse.click(
      Math.round(lane.x + (lane.width * time) / total),
      lane.y + lane.height / 2,
    );
    const firstEnd = Number(
      await page.getByTestId("pro-video-clip-1").getAttribute("data-end-time"),
    );
    await page.waitForFunction(
      ({ time, firstEnd }) => {
        const v = document.querySelector('[data-testid="studio-after-video"]');
        const expected =
          time < firstEnd ? time + (12 - firstEnd) : time - firstEnd;
        return v.readyState >= 3 && Math.abs(v.currentTime - expected) < 0.04;
      },
      { time, firstEnd },
    );
  };
  const dragEnd = async (seconds) => {
    const clip = page.getByTestId("pro-broll-clip-1");
    await clip.scrollIntoViewIfNeeded();
    const right = await clip.locator(":scope > div").last().boundingBox();
    const lane = await page
      .locator('[data-testid="pro-track-row-broll"] .pro-track-lane')
      .boundingBox();
    const total = Number(
      await page.getByTestId("pro-video-clip-2").getAttribute("data-end-time"),
    );
    await page.mouse.move(
      right.x + right.width / 2,
      right.y + right.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      right.x + right.width / 2 + (seconds * lane.width) / total,
      right.y + right.height / 2,
      { steps: 5 },
    );
    await page.mouse.up();
  };
  try {
    await page.goto(
      `http://127.0.0.1:${Number(process.env.STUDIO_INTERACTION_PORT || 5007)}/?fixture=sequence`,
    );
    await page.getByTestId("pro-video-clip-2").waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="studio-after-video"]')
          ?.readyState >= 3,
    );
    await pause();
    if (
      await page
        .getByRole("button", { name: "Hide media", exact: true })
        .isVisible()
    ) {
      await page
        .getByRole("button", { name: "Hide media", exact: true })
        .click();
    }
    assert.equal(
      Number(
        await page
          .getByTestId("pro-video-clip-2")
          .getAttribute("data-end-time"),
      ),
      16,
    );
    check("Two distinct native source files form a 16-second sequence");
    await video.evaluate((v) => {
      window.__sequenceEvents = [];
      for (const name of [
        "loadstart",
        "loadedmetadata",
        "canplay",
        "play",
        "pause",
        "ended",
        "seeked",
      ]) {
        v.addEventListener(name, () =>
          window.__sequenceEvents.push({
            name,
            time: v.currentTime,
            duration: v.duration,
            paused: v.paused,
            src: v.currentSrc,
          }),
        );
      }
    });
    stage = "seek first source before EOF";
    await seek(11.8);
    stage = "first native EOF";
    await page
      .getByRole("button", { name: "Play comparison", exact: true })
      .click();
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v.duration === 4 && !v.paused && v.currentTime < 1;
    });
    check(
      "Native 12-second source EOF advances into the 4-second second video",
    );
    await pause();
    stage = "last native EOF";
    await seek(15.8);
    await page
      .getByRole("button", { name: "Play comparison", exact: true })
      .click();
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v.duration === 12 && !v.paused && v.currentTime < 1;
    });
    check(
      "Native EOF of the last video loops to the first source and keeps playing",
    );
    await pause();
    stage = "B-roll placement";
    await seek(5);
    await page.getByRole("button", { name: "Show media", exact: true }).click();
    const card = page
      .locator(".studio-media-card")
      .filter({ hasText: "Sequence second" });
    await card
      .getByRole("button", { name: "Preview Sequence second", exact: true })
      .click();
    await card
      .getByRole("button", { name: "Add as B-roll", exact: true })
      .click();
    await page.getByRole("button", { name: "Hide media", exact: true }).click();
    const broll = page.getByTestId("pro-broll-clip-1");
    const [initialStart, initialEnd] = await bounds(broll);
    near(initialStart, 5);
    near(initialEnd, 8);
    stage = "B-roll end trim";
    await dragEnd(1);
    const endTitle = await broll.getAttribute("title");
    const [trimmedStart, trimmedEnd] = await bounds(broll);
    near(trimmedStart, 5);
    near(trimmedEnd, 9);
    check(
      "Dragging B-roll end away from zero keeps the 5-second start and extends to 9 seconds",
    );
    stage = "track lock";
    await page
      .getByTestId("pro-track-row-broll")
      .getByRole("button", { name: "Lock track" })
      .click();
    await dragEnd(1);
    assert.equal(await broll.getAttribute("title"), endTitle);
    await page
      .getByTestId("pro-track-row-broll")
      .getByRole("button", { name: "Unlock track" })
      .click();
    check("Locked B-roll rejects an actual captured pointer trim");
    stage = "original audio";
    await page
      .getByTestId("pro-track-row-originalAudio")
      .getByRole("button", { name: "Mute track" })
      .click();
    assert(await video.evaluate((v) => v.muted));
    await video.evaluate((v) => v.dispatchEvent(new Event("ratechange")));
    assert(await video.evaluate((v) => v.muted));
    await page
      .getByTestId("pro-track-row-originalAudio")
      .getByRole("button", { name: "Unmute track" })
      .click();
    assert.equal(await video.evaluate((v) => v.muted), false);
    check(
      "Original-audio mute remains applied after a media synchronization event",
    );
    stage = "source trim and export";
    await seek(2);
    await page.getByTestId("pro-quick-trim-start").click();
    near(
      Number(
        await page
          .getByTestId("pro-video-clip-2")
          .getAttribute("data-end-time"),
      ),
      14,
    );
    const [retimedStart, retimedEnd] = await bounds(broll);
    near(retimedStart, 3);
    near(retimedEnd, 7);
    check("Source trim retimes B-roll once onto the 14-second edited sequence");
    await seek(3.5);
    await page.waitForFunction(() =>
      document.querySelectorAll(".pro-source-filmstrip .pro-source-frame img").length === 9
    );
    await page.screenshot({ path: path.join(folder, "edited-sequence.png") });
    await page
      .getByRole("navigation", { name: "Creative tools" })
      .getByRole("button", { name: "Export", exact: true })
      .click();
    await page.getByRole("button", { name: /Render Final Clip/i }).click();
    await page.getByText("Please login first", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => window.__studioFixtureExport),
      undefined,
    );
    check(
      "Signed-out export displays the sign-in requirement and never invokes the export callback",
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(apiRequests, []);
    const files = [
      "frontend/src/components/ViralClipStudio.js",
      "frontend/src/components/StudioProTimeline.js",
      "frontend/src/components/ViralClipStudio.css",
      "frontend/src/components/studioOverlayTiming.js",
      "scripts/run-studio-interaction-preview.js",
      "test/e2e/playwright/studio-interaction-entry.jsx",
      "test/e2e/playwright/run-studio-sequence-audio.js",
    ];
    const sha = (file) =>
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, file)))
        .digest("hex");
    fs.writeFileSync(
      path.join(folder, "browser.json"),
      JSON.stringify(
        {
          passed: true,
          completedAt: new Date().toISOString(),
          scope:
            "Local production Studio, two FFmpeg source files, native decoder and pointer gestures. Signed-out export is blocked. Synthetic storage metadata permits local placement only. No cloud auth, uploads, export payload or encoded render are exercised.",
          checks,
          pageErrors: errors,
          apiRequests,
          mediaEvents: await page.evaluate(() => window.__sequenceEvents),
          sourceHashes: Object.fromEntries(files.map((f) => [f, sha(f)])),
          bundleSha256: sha(
            "artifacts/studio-sequence-audio-20261004/build/static/js/bundle.js",
          ),
          fixtureHashes: {
            first: sha("artifacts/studio-sequence-audio-20261004/fixture.mp4"),
            second: sha(
              "artifacts/studio-sequence-audio-20261004/fixture-second.mp4",
            ),
          },
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ passed: true, checks: checks.length }));
  } catch (error) {
    fs.writeFileSync(
      path.join(folder, "browser-failure.json"),
      JSON.stringify(
        {
          stage,
          message: error.message,
          checks,
          media: await video.evaluate((v) => ({
            currentTime: v.currentTime,
            duration: v.duration,
            paused: v.paused,
            ended: v.ended,
            readyState: v.readyState,
            src: v.currentSrc,
          })),
          events: await page.evaluate(() => window.__sequenceEvents),
        },
        null,
        2,
      ),
    );
    await page
      .screenshot({ path: path.join(folder, "browser-failure.png") })
      .catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
