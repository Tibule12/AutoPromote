#!/usr/bin/env node
// Read-only native Queue captures. These actual UI cards become editable image
// layers; their captions, platforms and times are never invented or redrawn.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../..");
const folder = path.join(root, "reports/daily-studio/2026-10-17/schedule-tour/creative-v2/assets");
fs.mkdirSync(folder, { recursive: true });
const book = JSON.parse(
  fs.readFileSync(path.join(root, "reports/daily-studio/2026-10-17/platform-packages.json"))
);
const labels = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  reddit: "Reddit",
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: ["--mute-audio", "--host-resolver-rules=MAP localhost 127.0.0.1"],
  });
  const context = await browser.newContext({
    storageState: path.join(root, require("../../config/daily-studio.json").authState),
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    timezoneId: book.timezone,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const writes = [],
    rows = new Map();
  page.on("request", r => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) &&
      new URL(r.url()).pathname.startsWith("/api/content/")
    )
      writes.push(new URL(r.url()).pathname);
  });
  page.on("response", async r => {
    if (new URL(r.url()).pathname === "/api/content/my-promotion-schedules" && r.ok())
      for (const s of (await r.json()).schedules || []) rows.set(s.id, s);
  });
  try {
    assert(
      !fs.existsSync(path.join(folder, "native-scenes.json")),
      "Preserve the captured native scenes"
    );
    await page.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Queue", exact: true }).click();
    await page.locator(".schedule-detail").waitFor();
    const read = async (action, cursor) => {
      const pending = page.waitForResponse(r => {
        const u = new URL(r.url());
        return (
          u.pathname === "/api/content/my-promotion-schedules" &&
          !u.searchParams.has("from") &&
          (u.searchParams.get("cursor") || null) === (cursor || null) &&
          r.ok()
        );
      });
      await action();
      const data = await (await pending).json();
      for (const s of data.schedules || []) rows.set(s.id, s);
      await page.locator(".schedule-loading").waitFor({ state: "hidden" });
      await wait(100);
      return data;
    };
    let data = await read(() =>
      page.getByLabel("Queue period", { exact: true }).selectOption("all")
    );
    const cursors = new Set();
    for (let i = 0; data.meta?.hasMore && i < 20; i++) {
      if (Date.parse(data.schedules.at(-1)?.startTime) < Date.now()) break;
      const cursor = data.meta.nextCursor;
      assert(cursor && !cursors.has(cursor));
      cursors.add(cursor);
      data = await read(
        () => page.getByRole("button", { name: "Load more schedules", exact: true }).click(),
        cursor
      );
    }
    assert(!data.meta?.hasMore || Date.parse(data.schedules.at(-1)?.startTime) < Date.now());
    await page.locator(".schedule-view-timezone select").selectOption(book.timezone);
    const calendar = page.locator(".schedule-calendar"),
      cards = page.locator(".schedule-calendar-card");
    await calendar.screenshot({ path: path.join(folder, "whole-calendar.png") });
    const dimensions = await calendar.evaluate(e => ({
      width: e.getBoundingClientRect().width,
      height: e.getBoundingClientRect().height,
    }));
    const all = [];
    for (let i = 0; i < (await cards.count()); i++) {
      const card = cards.nth(i),
        file = `calendar-card-${String(i).padStart(2, "0")}.png`;
      const geometry = await card.evaluate(e => {
        const a = e.getBoundingClientRect(),
          b = e.closest(".schedule-calendar").getBoundingClientRect();
        return { x: a.x - b.x, y: a.y - b.y, width: a.width, height: a.height };
      });
      await card.screenshot({ path: path.join(folder, file) });
      all.push({
        index: i,
        file,
        text: await card.innerText(),
        label: await card.getAttribute("aria-label"),
        geometry,
      });
    }
    const scenes = [];
    const master = book.posts.find(
      p => p.storyId === "sound-alignment" && p.platform === "youtube"
    ).title;
    for (const platform of ["linkedin", "instagram", "facebook", "tiktok", "youtube", "reddit"]) {
      const post = book.posts.find(p => p.storyId === "sound-alignment" && p.platform === platform),
        row = rows.get(post.schedules[0].id);
      assert(row, "Actual schedule missing");
      const card = cards
        .filter({ hasText: master })
        .filter({ has: page.locator(`.platform-${platform}`) })
        .first();
      await card.screenshot({ path: path.join(folder, `${platform}-card.png`) });
      const calendarText = await card.innerText();
      await card.click();
      await page.locator(".schedule-destination-toggle").first().click();
      const video = page.locator(".schedule-destination-detail video").first();
      if (await video.count()) {
        await video.scrollIntoViewIfNeeded();
        if (await video.evaluate(v => v.paused)) await video.press("Space");
        await page.waitForFunction(() => {
          const v = document.querySelector(".schedule-destination-detail video");
          return v && v.readyState >= 2 && v.currentTime > 0.05;
        });
        if (!(await video.evaluate(v => v.paused))) await video.press("Space");
      }
      const detail = page.locator(".schedule-destination").first();
      await detail.screenshot({ path: path.join(folder, `${platform}-detail.png`) });
      scenes.push({
        platform,
        label: labels[platform],
        postId: post.postId,
        scheduleId: row.id,
        contentId: row.contentId,
        startTime: row.startTime,
        status: row.status,
        calendarText,
        detailText: await detail.innerText(),
        card: `${platform}-card.png`,
        detail: `${platform}-detail.png`,
      });
      if (platform === "linkedin") {
        await page.getByRole("button", { name: "Reschedule LinkedIn", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Reschedule", exact: true });
        await dialog.screenshot({ path: path.join(folder, "real-reschedule-dialog.png") });
        await dialog.getByRole("button", { name: "Keep current time", exact: true }).click();
      }
    }
    assert.equal(writes.length, 0);
    assert.equal(scenes.length, 6);
    const result = {
      capturedAt: new Date().toISOString(),
      normalSignedInUi: true,
      nativeContentWrites: writes,
      deviceScaleFactor: 2,
      calendar: dimensions,
      allCalendarCards: all,
      scenes,
      realContentId: new Set(scenes.map(s => s.contentId)).size === 1 ? scenes[0].contentId : null,
      wholeCalendar: "whole-calendar.png",
      reschedule: "real-reschedule-dialog.png",
      selectedActualScheduledVideo: book.posts.find(p => p.storyId === "sound-alignment").media,
    };
    assert(
      result.realContentId,
      "All six cards must be actual versions of the same scheduled video"
    );
    fs.writeFileSync(
      path.join(folder, "native-scenes.json"),
      JSON.stringify(result, null, 2) + "\n",
      { mode: 0o600 }
    );
    console.log(
      JSON.stringify({
        realCalendarCards: all.length,
        realPlatformCards: 6,
        realCaptions: 6,
        sameContent: true,
        contentMutations: 0,
      })
    );
  } catch (e) {
    await page.screenshot({ path: path.join(folder, "failure.private.png") }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
}
main().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
