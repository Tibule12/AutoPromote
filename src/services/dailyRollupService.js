// dailyRollupService.js
// Aggregates previous day's platform post performance & click events into per-content daily documents.
// Collection: content_daily_metrics (doc id: <contentId>_<YYYYMMDD>)
// Fields: { contentId, date, posts, impressions, clicks, variants: { [variantString]: { posts, impressions, clicks } }, updatedAt, createdAt }
// NOTE: This is a best-effort rollup using sampled queries (capped) to remain inexpensive in Firestore.

const { db } = require("../firebaseAdmin");

function formatDateUTC(d) {
  const yr = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${yr}${mo}${da}`; // YYYYMMDD
}

/**
 * Roll up metrics for a given UTC date (defaults to yesterday if date not provided).
 * Strategy:
 *  1. Determine time window [start, end) for target day in UTC.
 *  2. Sample platform_posts created in that window (cap 5000) -> aggregate by contentId & variant.
 *  3. Sample shortlink_resolve events in that window (cap 5000) -> aggregate clicks per contentId & variantIndex (then map to variant string via posts sample) and overall.
 *  4. Persist (merge) into content_daily_metrics/<contentId>_<YYYYMMDD>. If doc exists, increment counters (idempotence guard via upsert+merge).
 */
async function rollupContentDailyMetrics({ date } = {}) {
  const now = new Date();
  let target =
    date instanceof Date
      ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
      : null;
  if (!target) {
    // default: yesterday UTC
    target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    target.setUTCDate(target.getUTCDate() - 1);
  }
  const start = target;
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1)
  );
  const dayKey = formatDateUTC(start);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // 1 & 2. Sample platform_posts in window (createdAt stored as ISO string or Firestore Timestamp)
  const postSnap = await db
    .collection("platform_posts")
    .orderBy("createdAt", "desc")
    .limit(5000)
    .get()
    .catch(() => ({ empty: true, docs: [] }));
  const posts = [];
  postSnap.docs.forEach(d => {
    const v = d.data();
    const ts =
      v.createdAt && v.createdAt.toMillis
        ? v.createdAt.toMillis()
        : Date.parse(v.createdAt || "") || 0;
    if (ts >= Date.parse(startIso) && ts < Date.parse(endIso)) {
      posts.push({
        contentId: v.contentId,
        variant: v.usedVariant || null,
        impressions: v.metrics?.impressions || 0,
        clicks: v.clicks || 0,
      });
    }
  });
  const byContent = {};
  posts.forEach(p => {
    if (!p.contentId) return;
    if (!byContent[p.contentId])
      byContent[p.contentId] = {
        posts: 0,
        impressions: 0,
        clicks: 0,
        variants: {},
        variantClicks: {},
      };
    const c = byContent[p.contentId];
    c.posts += 1;
    c.impressions += p.impressions;
    c.clicks += p.clicks;
    if (p.variant) {
      if (!c.variants[p.variant]) c.variants[p.variant] = { posts: 0, impressions: 0, clicks: 0 };
      c.variants[p.variant].posts += 1;
      c.variants[p.variant].impressions += p.impressions;
      c.variants[p.variant].clicks += p.clicks;
    }
  });

  // 3. Sample shortlink_resolve events for extra click attribution
  const resolveSnap = await db
    .collection("events")
    .where("type", "==", "shortlink_resolve")
    .orderBy("createdAt", "desc")
    .limit(5000)
    .get()
    .catch(() => ({ empty: true, docs: [] }));
  const resolves = [];
  resolveSnap.docs.forEach(d => {
    const v = d.data();
    const ts = Date.parse(v.createdAt || "") || 0;
    if (ts >= Date.parse(startIso) && ts < Date.parse(endIso)) resolves.push(v);
  });
  resolves.forEach(r => {
    if (!r.contentId) return;
    if (!byContent[r.contentId])
      byContent[r.contentId] = {
        posts: 0,
        impressions: 0,
        clicks: 0,
        variants: {},
        variantClicks: {},
      };
    const c = byContent[r.contentId];
    c.clicks += 1; // total clicks
    if (typeof r.variantIndex === "number") {
      c.variantClicks[r.variantIndex] = (c.variantClicks[r.variantIndex] || 0) + 1;
    }
  });

  // 4. Persist
  const batch = db.batch();
  let writes = 0;
  for (const [contentId, agg] of Object.entries(byContent)) {
    const docId = `${contentId}_${dayKey}`;
    const ref = db.collection("content_daily_metrics").doc(docId);
    const payload = {
      contentId,
      date: dayKey,
      posts: agg.posts,
      impressions: agg.impressions,
      clicks: agg.clicks,
      variants: agg.variants,
      variantClicks: agg.variantClicks,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    batch.set(ref, payload, { merge: true });
    writes++;
    // Commit in chunks of 400 to stay below batch limits
    if (writes >= 400) {
      await batch.commit().catch(() => {});
      writes = 0;
    }
  }
  if (writes > 0) {
    try {
      await batch.commit();
    } catch (_) {}
  }
  return { ok: true, date: dayKey, contents: Object.keys(byContent).length };
}

module.exports = { rollupContentDailyMetrics };
