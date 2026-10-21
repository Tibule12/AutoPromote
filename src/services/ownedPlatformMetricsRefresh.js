const { db } = require("../firebaseAdmin");
const metrics = require("./platformMetricsService");
const { normalizeMetrics } = require("./platformMetricValues");

function owner(row) {
  return row.user_id || row.userId || row.uid || row.ownerId || row.creatorId;
}

async function refreshOwnedPlatformMetrics(uid, postIds) {
  if (!Array.isArray(postIds) || !postIds.length || postIds.length > 6 ||
      postIds.some(id => typeof id !== "string" || !id || id.includes("/")) ||
      new Set(postIds).size !== postIds.length) {
    throw Object.assign(new Error("Choose up to six distinct published posts."), { status: 400 });
  }
  const docs = await Promise.all(postIds.map(id => db.collection("platform_posts").doc(id).get()));
  // Validate the complete request before touching a connection or writing any record.
  if (docs.some(doc => !doc.exists || owner(doc.data()) !== uid ||
      doc.data().success !== true || doc.data().simulated)) {
    throw Object.assign(new Error("Published posts must belong to your account."), { status: 403 });
  }
  return Promise.all(docs.map(async doc => {
    const row = doc.data(), now = new Date().toISOString();
    const claimed = await db.runTransaction(async tx => {
      const fresh = await tx.get(doc.ref);
      if (!fresh.exists || owner(fresh.data()) !== uid || fresh.data().success !== true || fresh.data().simulated) return false;
      const last = Date.parse(fresh.data().lastMetricsRefreshRequestedAt || "");
      if (Number.isFinite(last) && Date.now() - last < 5 * 60 * 1000) return false;
      tx.set(doc.ref, { lastMetricsRefreshRequestedAt: now, lastMetricsCheck: now,
        metricsCollectionStatus: "collecting" }, { merge: true });
      return true;
    });
    if (!claimed) return { postId: doc.id, platform: row.platform, status: "cooldown" };
    const fetchers = {
      youtube: () => metrics.fetchYouTubeMetrics(uid, row.externalId),
      tiktok: () => metrics.fetchTikTokMetrics(uid, row.externalId),
      instagram: () => metrics.fetchInstagramMediaMetrics(uid, row.externalId),
      facebook: () => metrics.fetchFacebookPostMetrics(uid, row.externalId, row.rawOutcome?.pageId || row.pageId),
      linkedin: () => metrics.fetchLinkedInMetrics(uid, row.externalId),
      reddit: () => metrics.fetchRedditMetrics(uid, row.externalId),
    };
    let timer;
    try {
      const raw = row.externalId && fetchers[row.platform] ? await Promise.race([
        fetchers[row.platform](),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), 15000); }),
      ]) : null;
      const normalized = normalizeMetrics(raw);
      const available = Object.values(normalized).some(value => value !== null);
      const finished = new Date().toISOString();
      const update = { lastMetricsCheck: finished,
        metricsCollectionStatus: available ? "collected" : "unavailable",
        metricsCollectionMessage: available ? null : "Statistics unavailable. Check connection permissions and platform support.",
        next_check_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
      if (available) Object.assign(update, { metrics: raw, lastMetricsSuccessAt: finished,
        analytics_snapshots: [...(row.analytics_snapshots || []), { timestamp: finished, ...normalized }].slice(-20) });
      await doc.ref.set(update, { merge: true });
      return { postId: doc.id, platform: row.platform, status: update.metricsCollectionStatus,
        metrics: available ? normalized : null, collectedAt: available ? finished : null };
    } catch (_) {
      await doc.ref.set({ lastMetricsCheck: new Date().toISOString(), metricsCollectionStatus: "failed",
        metricsCollectionMessage: "Statistics collection failed. Retry after checking the connection.",
        next_check_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() }, { merge: true });
      return { postId: doc.id, platform: row.platform, status: "failed", metrics: null };
    } finally { clearTimeout(timer); }
  }));
}

module.exports = { refreshOwnedPlatformMetrics };
