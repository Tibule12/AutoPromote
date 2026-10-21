#!/usr/bin/env node
// Real signed-in product capture. No scheduling, publishing or data fabrication.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../.."),
  out = path.join(root, "reports/welcome-real-workflow-20261021"),
  media = path.join(out, "media"),
  capture = path.join(out, "capture");
const book = JSON.parse(
  fs.readFileSync(
    path.join(root, "reports/content-performance-test-20261021/publishing/platform-packages.json")
  )
);
const rows = new Map(),
  errors = [];
let writes = 0;
async function main() {
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: [
      "--mute-audio",
      "--host-resolver-rules=MAP localhost 127.0.0.6",
      "--no-proxy-server",
      "--disable-http2",
      "--disable-quic",
    ],
  });
  const context = await browser.newContext({
    storageState: require("./studio-session").sessionPath,
    viewport: { width: 1920, height: 1440 },
    deviceScaleFactor: 1,
    timezoneId: "Africa/Johannesburg",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) &&
      /^\/api\/(content|publisher|platform)\//.test(new URL(r.url()).pathname)
    )
      writes++;
  });
  page.on("response", async r => {
    if (r.ok() && new URL(r.url()).pathname === "/api/content/my-promotion-schedules")
      for (const x of (await r.json()).schedules || []) rows.set(x.id, x);
  });
  try {
    await page.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Queue", exact: true }).click();
    await page.locator(".schedule-detail").waitFor();
    assert(!(await page.evaluate(() => !!window.__E2E_BYPASS)));
    await page.getByLabel("Queue period", { exact: true }).selectOption("all");
    await page.locator(".schedule-loading").waitFor({ state: "hidden" });
    await page.locator(".schedule-view-timezone select").selectOption("Africa/Johannesburg");
    const expected = book.posts.find(p => p.platform === "youtube").title;
    await page.locator(".schedule-calendar-card").filter({ hasText: expected }).first().click();
    const video = page.locator(".schedule-detail video").first();
    await video.waitFor();
    await page.waitForFunction(() => {
      const v = document.querySelector(".schedule-detail video");
      return v && v.readyState >= 2;
    });
    await video.evaluate(v => {
      v.muted = true;
      v.currentTime = 11;
      return v.play().catch(() => {});
    });
    await page.waitForTimeout(800);
    await page.locator(".schedule-kpis").scrollIntoViewIfNeeded();
    const area = page.locator(".schedules-panel");
    const box = await area.boundingBox();
    assert(box.x >= 0 && box.width > 1200);
    const kpi = await page.locator(".schedule-kpis").boundingBox(),
      calendarBox = await page.locator(".schedule-calendar").boundingBox();
    const clip = {
      x: Math.round(box.x),
      y: Math.floor(kpi.y),
      width: Math.floor(box.width),
      height: Math.ceil(calendarBox.y + calendarBox.height - kpi.y + 4),
    };
    assert(clip.y >= 0 && clip.y + clip.height <= 1440);
    await page.screenshot({ path: path.join(media, "queue.webp"), type: "png", clip }); // renamed after capture below
    fs.renameSync(path.join(media, "queue.webp"), path.join(media, "queue.png"));
    const frames = path.join(capture, "queue-frames");
    fs.mkdirSync(frames, { recursive: true });
    const clock = [],
      start = Date.now();
    while (Date.now() - start < 6500) {
      const name = String(clock.length).padStart(5, "0") + ".jpg";
      fs.writeFileSync(
        path.join(frames, name),
        await page.screenshot({ type: "jpeg", quality: 90, clip })
      );
      clock.push({ name, t: (Date.now() - start) / 1000 });
    }
    const concat = path.join(frames, "frames.ffconcat");
    fs.writeFileSync(
      concat,
      "ffconcat version 1.0\n" +
        clock
          .map(
            (f, i) =>
              `file '${f.name}'\nduration ${Math.max(0.001, (clock[i + 1]?.t || 6.6) - f.t)}\n`
          )
          .join("") +
        `file '${clock.at(-1).name}'\n`
    );
    execFileSync("ffmpeg", [
      "-nostdin",
      "-v",
      "error",
      "-y",
      "-safe",
      "0",
      "-i",
      concat,
      "-t",
      "6",
      "-vf",
      "fps=24,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      path.join(media, "queue.mp4"),
    ]);
    await video.evaluate(v => v.pause());
    const destinationData = [];
    for (const post of book.posts) {
      await page
        .locator(".schedule-calendar-card")
        .filter({ hasText: expected })
        .filter({ has: page.locator(`.platform-${post.platform}`) })
        .first()
        .click();
      const row = rows.get(post.schedules[0].id);
      assert(row, "Expected owned schedule is missing");
      assert.equal(row.contentId, post.contentId);
      assert.equal(Date.parse(row.startTime), Date.parse(post.scheduledAt));
      const toggle = page
        .locator(".schedule-destination")
        .filter({ has: page.locator(`.platform-${post.platform}`) })
        .getByRole("button")
        .first();
      await toggle.click();
      const detail = page
        .locator(".schedule-destination")
        .filter({ has: page.locator(`.platform-${post.platform}`) });
      const fields = detail.locator('.schedule-destination-detail > div');
      const nativeTitle = await fields.nth(0).locator('p').textContent();
      const nativeCaption = await fields.nth(1).locator('p').textContent();
      assert.equal(nativeTitle, post.title);
      assert.equal(nativeCaption, post.submittedCaption || post.description);
      await detail.screenshot({ path: path.join(media, `destination-${post.platform}.png`) });
      destinationData.push({
        platform: post.platform,
        title: nativeTitle,
        description: nativeCaption,
        time: row.startTime,
        status: row.status,
        label: new Date(row.startTime).toLocaleString("en-ZA", {
          timeZone: "Africa/Johannesburg",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      });
      await toggle.click();
    }
    await page.locator(".schedule-calendar").screenshot({ path: path.join(media, "calendar.png") });
    await page.locator(".schedule-detail").screenshot({ path: path.join(media, "release.png") });
    assert.equal(writes, 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(media, "release-data.json"),
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          timezone: "Africa/Johannesburg",
          title: expected,
          destinations: destinationData,
        },
        null,
        2
      ) + "\n"
    );
    fs.writeFileSync(
      path.join(capture, "receipt.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          normalSignedInUi: true,
          authBypass: false,
          publishingWrites: writes,
          actualScheduleRowsVerified: destinationData.length,
          errors,
          clip,
          screenFrames: clock.length,
          captureSeconds: 6.5,
          accountHeaderExcluded: true,
          queueSummary: await page.locator(".schedule-kpis").innerText(),
          calendarCards: await page.locator(".schedule-calendar-card").count(),
        },
        null,
        2
      ) + "\n"
    );
    console.log("Actual Queue captured; six owned destinations checked; zero publishing writes.");
  } catch (e) {
    await page.screenshot({ path: path.join(capture, "failure.private.png") }).catch(() => {});
    fs.writeFileSync(
      path.join(capture, "failure.private.txt"),
      await page.locator("body").innerText(),
      { mode: 0o600 }
    );
    throw e;
  } finally {
    await context.close();
    await browser.close();
  }
}
main().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
