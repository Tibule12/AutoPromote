#!/usr/bin/env node
// Actual read-only signed-in Queue, cropped only to exclude the account header.
// Speech is added later through ordinary Studio Sound controls.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { spawn } = require("node:child_process"),
  { once } = require("node:events");
const { chromium } = require("playwright"),
  c = require("./contract");
const root = path.resolve(__dirname, "../.."),
  date = c.validDate(process.argv[2] || c.localDate());
const dir = c.dayRoot(root, date),
  folder = path.join(dir, "schedule-tour");
const packages = JSON.parse(fs.readFileSync(path.join(dir, "platform-packages.json")));
assert.equal(
  packages.posts.filter(post => post.queueVerified).length,
  24,
  "Capture after all native schedules exist"
);
const narration = JSON.parse(fs.readFileSync(path.join(folder, "narration-receipt.json")));
const wait = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
async function main() {
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: ["--mute-audio", "--host-resolver-rules=MAP localhost 127.0.0.1"],
  });
  const context = await browser.newContext({
    storageState: path.join(root, c.policy.authState),
    timezoneId: c.policy.timezone,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  let encoder,
    capture,
    active = false,
    transitioning = false;
  const schedules = new Map(),
    visibleCards = new Set(),
    mutations = [];
  page.on("request", request => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
      new URL(request.url()).pathname.startsWith("/api/content/")
    )
      mutations.push(new URL(request.url()).pathname);
  });
  page.on("response", async response => {
    if (new URL(response.url()).pathname === "/api/content/my-promotion-schedules" && response.ok())
      for (const row of (await response.json()).schedules || []) schedules.set(row.id, row);
  });
  try {
    await page.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Queue", exact: true }).click();
    await page.locator(".schedule-detail").waitFor();
    const readPage = async (action, cursor) => {
      const pending = page.waitForResponse(response => {
        const url = new URL(response.url());
        return (
          url.pathname === "/api/content/my-promotion-schedules" &&
          !url.searchParams.has("from") &&
          (url.searchParams.get("cursor") || null) === (cursor || null) &&
          response.ok()
        );
      });
      await action();
      const value = await (await pending).json();
      for (const row of value.schedules || []) schedules.set(row.id, row);
      await page.locator(".schedule-loading").waitFor({ state: "hidden" });
      await wait(200);
      return value;
    };
    let inventory = await readPage(() =>
      page.getByLabel("Queue period", { exact: true }).selectOption("all")
    );
    const cursors = new Set();
    // The native list is descending. Once a page reaches past dates, every
    // later page is history; none can contain another future release.
    for (let i = 0; inventory.meta?.hasMore && i < 20; i++) {
      const last = inventory.schedules.at(-1),
        lastTime = Date.parse(last?.startTime);
      assert(Number.isFinite(lastTime), "Cannot prove future-page coverage without a date");
      if (lastTime < Date.now()) break;
      const cursor = inventory.meta.nextCursor;
      assert(cursor && !cursors.has(cursor), "Schedule cursor did not advance");
      cursors.add(cursor);
      inventory = await readPage(
        () => page.getByRole("button", { name: "Load more schedules", exact: true }).click(),
        cursor
      );
    }
    assert(
      !inventory.meta?.hasMore || Date.parse(inventory.schedules.at(-1)?.startTime) < Date.now(),
      "Read every future schedule page"
    );
    await page.locator(".schedule-view-timezone select").selectOption(c.policy.timezone);
    for (const post of packages.posts)
      assert(schedules.has(post.schedules[0].id), "Missing actual prepared schedule");
    const cards = page.locator(".schedule-calendar-card"),
      cardCount = await cards.count();
    assert(cardCount >= 24, "Show the complete upcoming calendar");
    const warmPreview = async () => {
      const video = page.locator(".schedule-detail video").first();
      await video.waitFor();
      await video.scrollIntoViewIfNeeded();
      if (await video.evaluate(element => element.paused)) await video.press("Space");
      await page.waitForFunction(() => {
        const element = document.querySelector(".schedule-detail video");
        return element && element.readyState >= 2 && !element.seeking && element.currentTime > 0.05;
      });
      if (!(await video.evaluate(element => element.paused))) await video.press("Space");
    };
    // Warm actual player bytes through native controls before recording. No
    // loading indicator is presented as the video's result.
    for (const story of ["editable-reveal", "visual-hierarchy", "sound-alignment"]) {
      const post = packages.posts.find(
        post => post.storyId === story && post.platform === "youtube"
      );
      await cards.filter({ hasText: post.title }).first().click();
      await warmPreview();
      console.log("Decoded native preview: " + story);
    }
    await cards
      .filter({
        hasText: packages.posts.find(
          post => post.storyId === "pacing-contrast" && post.platform === "youtube"
        ).title,
      })
      .first()
      .click();
    await warmPreview();
    await page.locator(".schedule-kpis").scrollIntoViewIfNeeded();
    const initialVideo = page.locator(".schedule-detail video").first();
    await initialVideo.waitFor();
    const initialBox = await initialVideo.boundingBox();
    await initialVideo.click({ position: { x: 18, y: initialBox.height - 28 } });
    await initialVideo.evaluate(
      video =>
        new Promise((resolve, reject) => {
          if (video.readyState >= 2) return resolve();
          const timeout = setTimeout(
            () => reject(Error("Wait for an actual decoded preview before capture")),
            45000
          );
          video.addEventListener(
            "loadeddata",
            () => {
              clearTimeout(timeout);
              resolve();
            },
            { once: true }
          );
        })
    );
    if (!(await initialVideo.evaluate(video => video.paused)))
      await initialVideo.click({ position: { x: 18, y: initialBox.height - 28 } });
    const clip = { x: 288, y: 80, width: 1600, height: 1000 };
    const movie = path.join(folder, "schedule-screen.mp4");
    assert(!fs.existsSync(movie), "Preserve the previous recorded tour");
    encoder = spawn(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-f",
        "image2pipe",
        "-framerate",
        "10",
        "-i",
        "pipe:0",
        "-an",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-preset",
        "veryfast",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        movie,
      ],
      { stdio: ["pipe", "ignore", "pipe"] }
    );
    let encodingError = "",
      captured = 0,
      written = 0,
      heldLoadingFrames = 0,
      lastCleanFrame = await page.screenshot({ clip });
    active = true;
    encoder.stderr.on("data", data => (encodingError += data));
    const start = Date.now();
    capture = (async () => {
      while (active) {
        // Keep the last actual frame during native player loading; never
        // present the browser's spinner as the creative result. These holds
        // preserve narration wall time and are disclosed in the receipt.
        const ready = await page
          .locator(".schedule-detail video")
          .first()
          .evaluate(video => video.readyState >= 2 && (video.paused || video.readyState >= 3));
        if (!transitioning && ready) {
          const candidate = await page.screenshot({ clip });
          if (!transitioning) {
            lastCleanFrame = candidate;
            captured++;
          }
        } else heldLoadingFrames++;
        const bytes = lastCleanFrame;
        const tick = Math.floor((Date.now() - start) / 100);
        while (written <= tick) {
          if (!encoder.stdin.write(bytes)) await once(encoder.stdin, "drain");
          written++;
        }
        const labels = await cards.evaluateAll(
          (elements, rectangle) =>
            elements
              .map((element, index) => ({ element, index }))
              .filter(({ element }) => {
                const r = element.getBoundingClientRect();
                return r.top >= rectangle.y && r.bottom <= rectangle.y + rectangle.height;
              })
              .map(({ index }) => index),
          clip
        );
        labels.forEach(label => visibleCards.add(label));
        await wait(start + written * 100 - Date.now());
      }
    })();
    capture.catch(() => {});
    const until = segment => wait(start + (segment.start + segment.seconds) * 1000 - Date.now());
    const screenshots = [];
    for (const segment of narration.segments) {
      if (segment.id === "calendar") {
        await page.locator(".schedule-calendar").scrollIntoViewIfNeeded();
        const count = await cards.count();
        for (const index of [
          ...new Set([0, Math.floor(count / 3), Math.floor((count * 2) / 3), count - 1]),
        ]) {
          await cards.nth(index).scrollIntoViewIfNeeded();
          await wait(950);
        }
      }
      if (segment.id === "preview") {
        transitioning = true;
        await cards
          .filter({
            hasText: packages.posts.find(
              post => post.storyId === "editable-reveal" && post.platform === "youtube"
            ).title,
          })
          .first()
          .click();
        await page.locator(".schedule-detail").scrollIntoViewIfNeeded();
        await warmPreview();
        const video = page.locator(".schedule-detail video").first();
        if (await video.isVisible()) {
          const box = await video.boundingBox();
          await video.click({ position: { x: 18, y: box.height - 28 } });
        }
        await wait(200);
        transitioning = false;
      }
      if (segment.id === "destination") {
        await page.locator(".schedule-destination-toggle").first().click();
        await page.locator(".schedule-destination-detail").first().scrollIntoViewIfNeeded();
        const reschedule = page
          .getByRole("button", {
            name: /^Reschedule (YouTube|TikTok|Instagram|LinkedIn|Facebook|Reddit)$/,
          })
          .first();
        await reschedule.click();
        await wait(1500);
        await page
          .getByRole("dialog", { name: "Reschedule", exact: true })
          .getByRole("button", { name: "Keep current time", exact: true })
          .click();
      }
      if (segment.id === "delivery") {
        await page.locator(".schedule-calendar").scrollIntoViewIfNeeded();
        for (const story of ["visual-hierarchy", "sound-alignment"]) {
          transitioning = true;
          const post = packages.posts.find(
            post => post.storyId === story && post.platform === "youtube"
          );
          await cards.filter({ hasText: post.title }).first().click();
          await warmPreview();
          await wait(200);
          transitioning = false;
          await wait(800);
        }
      }
      if (segment.id === "closing") await page.locator(".schedule-kpis").scrollIntoViewIfNeeded();
      const frame = path.join(folder, segment.id + ".png");
      await page.screenshot({ path: frame, clip });
      screenshots.push(path.relative(root, frame));
      await until(segment);
    }
    active = false;
    await capture;
    encoder.stdin.end();
    const [code] = await once(encoder, "exit");
    assert.equal(code, 0, encodingError);
    assert.equal(mutations.length, 0, "The public demonstration must not mutate real schedules");
    assert.equal(
      visibleCards.size,
      cardCount,
      "Every currently displayed upcoming release must be shown"
    );
    fs.writeFileSync(
      path.join(folder, "native-queue-capture.json"),
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          normalSignedInUi: true,
          allSchedulePagesRead: !inventory.meta?.hasMore,
          allUpcomingPagesRead: true,
          currentlyDisplayedReleases: cardCount,
          allCalendarCardsShown: visibleCards.size,
          exactPreparedSchedulesVisible: 24,
          storedSchedulesRead: schedules.size,
          contentMutations: mutations,
          privacyCrop: clip,
          capturedFrames: captured,
          encodedFrames: written,
          actualCaptureFps: captured / ((Date.now() - start) / 1000),
          duplicateFramesPreserveWallTime: true,
          loadingTransitionsHoldPreviousActualFrame: true,
          heldLoadingFrames,
          screenshots,
          output: path.relative(root, movie),
          sha256: c.sha(fs.readFileSync(movie)),
          narration: path.relative(root, path.join(folder, "narration-receipt.json")),
          providerPublicationClaimed: false,
        },
        null,
        2
      )
    );
    console.log(
      JSON.stringify({
        cardCount,
        allCalendarCardsShown: visibleCards.size,
        contentMutations: 0,
        capture: path.relative(root, movie),
      })
    );
  } catch (error) {
    await page
      .screenshot({ path: path.join(folder, "capture-failure.private.png"), fullPage: true })
      .catch(() => {});
    console.error(
      "Native player state",
      await page
        .locator(".schedule-detail video")
        .first()
        .evaluate(element => ({
          time: element.currentTime,
          paused: element.paused,
          readyState: element.readyState,
          networkState: element.networkState,
          error: element.error?.code,
        }))
        .catch(() => ({}))
    );
    throw error;
  } finally {
    active = false;
    if (capture) await capture.catch(() => {});
    if (encoder && encoder.exitCode === null) {
      encoder.stdin.destroy();
      encoder.kill("SIGTERM");
    }
    await browser.close();
  }
}
main().catch(error => {
  console.error(error.stack);
  process.exitCode = 1;
});
