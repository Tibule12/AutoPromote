// repostSchedulerService.js - determine when to enqueue repost tasks based on decay & engagement
const { db } = require("../firebaseAdmin");
const { enqueuePlatformPostTask } = require("./promotionTaskQueue");

/* Heuristic:
   For each content with at least one successful platform_post in last REPOST_LOOKBACK_HOURS,
   compute decay = (latest impressions delta / hours since first post). If impressions growth per hour
   has dropped below threshold but total impressions < potential ceiling (based on youtube velocity or prior top post),
   schedule a repost (platform_post task with reason 'decay_repost').
*/

async function analyzeAndScheduleReposts({ limit = 10 }) {
  const hours = parseInt(process.env.REPOST_LOOKBACK_HOURS || "24", 10);
  const since = Date.now() - hours * 3600000;
  const postsSnap = await db
    .collection("platform_posts")
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();
  const byContentPlatform = {};
  postsSnap.forEach(d => {
    const v = d.data();
    const ts =
      v.createdAt && v.createdAt.toMillis
        ? v.createdAt.toMillis()
        : Date.parse(v.createdAt || "") || 0;
    if (ts < since) return;
    const key = v.contentId + "|" + v.platform;
    if (!byContentPlatform[key]) byContentPlatform[key] = [];
    byContentPlatform[key].push({ ...v, ts });
  });
  const tasks = [];
  for (const [, arr] of Object.entries(byContentPlatform)) {
    if (tasks.length >= limit) break;
    if (arr.length < 1) continue;
    arr.sort((a, b) => a.ts - b.ts);
    const first = arr[0];
    const latest = arr[arr.length - 1];
    const hoursSpan = Math.max((latest.ts - first.ts) / 3600000, 1 / 12);
    // Aggregate impressions
    let impressions = 0;
    arr.forEach(p => {
      if (p.metrics && p.metrics.impressions) impressions += p.metrics.impressions;
    });
    const growthPerHour = impressions / hoursSpan;
    const velocityThreshold = parseFloat(process.env.REPOST_MIN_GROWTH_PER_HOUR || "5");
    const maxImpressionsCap = parseInt(process.env.REPOST_MAX_IMPRESSIONS_CAP || "5000", 10);
    if (growthPerHour < velocityThreshold && impressions < maxImpressionsCap) {
      // Check cooldown: ensure we haven't reposted for same (content,platform) recently
      const cooldownHrs = parseInt(process.env.REPOST_COOLDOWN_HOURS || "6", 10);
      const lastTs = latest.ts;
      if (Date.now() - lastTs < cooldownHrs * 3600000) continue;
      tasks.push({
        contentId: latest.contentId,
        platform: latest.platform,
        impressions,
        growthPerHour,
      });
    }
  }
  // Enqueue repost tasks
  let scheduled = 0;
  for (const t of tasks.slice(0, limit)) {
    try {
      const contentSnap = await db.collection("content").doc(t.contentId).get();
      const uid = contentSnap.exists ? contentSnap.data().user_id || contentSnap.data().uid : null;
      if (!uid) continue;
      await enqueuePlatformPostTask({
        contentId: t.contentId,
        uid,
        platform: t.platform,
        reason: "decay_repost",
        payload: { message: "Giving this another boost!" },
        skipIfDuplicate: true,
      });
      scheduled++;
    } catch (e) {
      /* ignore */
    }
  }
  return { analyzed: Object.keys(byContentPlatform).length, scheduled };
}

module.exports = { analyzeAndScheduleReposts };
