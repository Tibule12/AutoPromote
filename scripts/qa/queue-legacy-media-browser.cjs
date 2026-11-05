// Exact historical namespace regression, through the actual App/Auth/router.
// Fixtures belong only to the fresh loopback demo; no provider is invoked.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
module.exports = async ({ page, origin, directory, db, uid, navigateWorkspace, mediaUrl }) => {
  assert.equal(new URL(origin).hostname, "127.0.0.1");
  assert.equal(db.projectId, "demo-autopromote-credits");
  const userBefore = (await db.collection("users").doc(uid).get()).data();
  const contentId = "legacy-queue-owned-media";
  const title = "Change the room. Keep the conversation. | A long historical release title";
  await db.collection("content").doc(contentId).set({
    user_id: uid, workspace_id: "old-automatically-selected-workspace", title,
    type: "video", url: mediaUrl, description: "The existing scheduled source stays playable.",
    created_at: new Date().toISOString(),
  });
  await db.collection("content").doc("other-users-private-movie").set({
    user_id: "another-user", workspace_id: "old-automatically-selected-workspace", title: "Private",
    type: "video", url: mediaUrl, created_at: new Date().toISOString(),
  });
  await db.collection("content").doc("reviewed-team-not-personal").set({
    user_id: uid, workspace_id: "old-automatically-selected-workspace", title: "Reviewed Team",
    teamReleaseId: "reviewed", type: "video", url: mediaUrl, created_at: new Date().toISOString(),
  });
  const schedule = { user_id: uid, contentId, title, platform: "youtube", status: "pending",
    isActive: true, frequency: "once", startTime: new Date(Date.now() + 3600000).toISOString(),
    timezone: "Africa/Johannesburg" };
  await db.collection("promotion_schedules").doc("legacy-personal-schedule").set(schedule);
  const baseline = (await db.collection("promotion_schedules").doc("legacy-personal-schedule").get()).data();
  const rowsPromise = page.waitForResponse(response => response.url().includes("/api/content/my-content?"));
  await page.reload();
  const rows = (await (await rowsPromise).json()).content;
  assert(rows.some(row => row.id === contentId), "Actual personal content API dropped its owner's historical movie");
  assert(!rows.some(row => ["other-users-private-movie", "reviewed-team-not-personal"].includes(row.id)));
  await navigateWorkspace("Queue");
  const video = page.getByLabel(`${title} video preview`, { exact: true });
  await video.waitFor();
  await page.waitForFunction(() => document.querySelector(".schedule-media video")?.readyState >= 2);
  const metadata = await video.evaluate(node => ({ width: node.videoWidth, height: node.videoHeight,
    duration: node.duration, crossOrigin: node.crossOrigin }));
  assert(metadata.width > 0 && metadata.height > 0 && metadata.duration > 0);
  assert.equal(metadata.crossOrigin, "anonymous");
  await video.focus();
  await video.press("Space");
  await page.waitForFunction(() => document.querySelector(".schedule-media video")?.currentTime > .1);
  const playbackTime = await video.evaluate(node => node.currentTime);
  assert.equal(await page.getByText("Media preview unavailable", { exact: true }).count(), 0);
  const views = [];
  for (const width of [390, 1280, 1840]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.locator(".schedule-release-item").evaluateAll(nodes => nodes.map(node => {
      const title = node.querySelector("strong");
      return { scroll: node.scrollWidth, width: node.clientWidth,
        titleScroll: title?.scrollWidth, titleWidth: title?.clientWidth };
    }));
    assert(overflow.every(item => item.scroll <= item.width + 2 && item.titleScroll <= item.titleWidth + 2));
    views.push({ width, overflow });
    await page.screenshot({ path: path.join(directory, `queue-retained-media-${width}.png`), fullPage: true });
  }
  assert.deepEqual((await db.collection("promotion_schedules").doc("legacy-personal-schedule").get()).data(), baseline);
  const after = (await db.collection("users").doc(uid).get()).data();
  for (const field of ["credits", "subscriptionTier", "subscriptionPlan", "role", "isAdmin"])
    assert.deepEqual(after[field], userBefore[field]);
  fs.writeFileSync(path.join(directory, "queue-legacy-media-result.json"), JSON.stringify({
    actualApp: true, normalVerifiedSignIn: true, isolatedDemo: true, productionTraffic: false,
    historicalOwnerMediaIncluded: true, otherUserAndReviewedTeamMediaExcluded: true,
    mediaMetadata: metadata, playbackTime, viewports: views, scheduleAndFinancialStateUnchanged: true,
  }, null, 2));
  console.log("PASS: actual personal Queue retains owned historical media, plays a real MP4 and fits all three widths; schedules and financial state unchanged.");
};
