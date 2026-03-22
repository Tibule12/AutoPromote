const express = require("express");
const { db } = require("./firebaseAdmin");
const authMiddleware = require("./authMiddleware");
const { getPlanCapabilities } = require("./config/subscriptionPlans");
const { getEffectiveTierSnapshot } = require("./services/billingService");
const router = express.Router();

function parseTimestamp(value) {
  if (!value) return null;
  if (value.toMillis) return value.toMillis();
  const t = Date.parse(value);
  return isNaN(t) ? null : t;
}

function parseDateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const t = parseTimestamp(value);
  return t ? new Date(t) : null;
}

function getContentCreatedAt(content) {
  return (
    parseDateValue(content.createdAt) ||
    parseDateValue(content.created_at) ||
    parseDateValue(content.updatedAt) ||
    parseDateValue(content.updated_at)
  );
}

function getOwnerId(record) {
  if (!record) return null;
  return (
    record.user_id || record.userId || record.uid || record.ownerId || record.creatorId || null
  );
}

function getNumericMetric(...values) {
  for (const value of values) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) return numericValue;
  }
  return 0;
}

async function fetchOwnedCollectionDocs(collectionName, uid, ownerFields, limit = 200) {
  const seen = new Set();
  const docs = [];

  await Promise.all(
    ownerFields.map(async field => {
      try {
        const snapshot = await db
          .collection(collectionName)
          .where(field, "==", uid)
          .limit(limit)
          .get();
        snapshot.forEach(doc => {
          if (seen.has(doc.id)) return;
          seen.add(doc.id);
          docs.push({ id: doc.id, ...doc.data() });
        });
      } catch (error) {
        console.warn(`[Analytics] Failed ${collectionName} lookup on ${field}:`, error.message);
      }
    })
  );

  return docs;
}

function normalizePlatformName(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === "unknown" || normalized === "n/a") return null;
  return normalized;
}

function getPostEventDate(post) {
  return (
    parseDateValue(post.publishedAt) ||
    parseDateValue(post.published_at) ||
    parseDateValue(post.postedAt) ||
    parseDateValue(post.completedAt) ||
    parseDateValue(post.createdAt) ||
    parseDateValue(post.created_at) ||
    parseDateValue(post.updatedAt) ||
    parseDateValue(post.updated_at)
  );
}

function isPublishedPlatformPost(post) {
  if (!post) return false;
  // Exclude synthetic/test placeholders from user-facing analytics.
  if (post.simulated === true) return false;
  if (post.rawOutcome && post.rawOutcome.simulated === true) return false;
  const reason = String(post.reason || post.rawOutcome?.reason || "").toLowerCase();
  if (["missing_credentials", "missing_fetch", "disabled_by_feature_flag"].includes(reason)) {
    return false;
  }
  if (post.success === true) return true;
  const status = String(post.status || post.publish_status || "").toLowerCase();
  if (
    ["published", "posted", "completed", "success", "succeeded", "done", "live"].includes(status)
  ) {
    return true;
  }
  if (post.externalId || post.external_id || post.postId || post.post_id) return true;
  if (post.rawOutcome && post.rawOutcome.success === true) return true;
  return false;
}

async function fetchContentTitleMap(contentIds) {
  const titleMap = new Map();
  await Promise.all(
    [...contentIds].map(async contentId => {
      try {
        const snap = await db.collection("content").doc(contentId).get();
        if (!snap.exists) return;
        const data = snap.data() || {};
        titleMap.set(contentId, data.title || data.caption || null);
      } catch (_error) {}
    })
  );
  return titleMap;
}

// Get content analytics
router.get("/content/:id", authMiddleware, async (req, res) => {
  try {
    const contentId = req.params.id;

    const contentRef = db.collection("content").doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) {
      return res.status(404).json({ error: "Content not found" });
    }

    const content = contentDoc.data();

    // Check if user has permission to view this content's analytics
    if (process.env.DEBUG_AUTH === "true") {
      const logger = require("./utils/logger");
      logger.debug(
        "[analytics] debug: content.userId=%s content.uid=%s req.user=%o",
        content.userId,
        content.uid,
        req.user
      );
    }
    if (getOwnerId(content) !== req.user.uid && req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get analytics data
    const analyticsRef = db.collection("analytics").doc(contentId);
    const analyticsDoc = await analyticsRef.get();
    const analytics = analyticsDoc.exists
      ? analyticsDoc.data()
      : {
          views: 0,
          likes: 0,
          shares: 0,
          revenue: 0,
        };

    // Override revenue to 0 as pay-per-view is disabled
    if (analytics.revenue) analytics.revenue = 0;

    res.json({ analytics });
  } catch (error) {
    const logger = require("./utils/logger");
    logger.error("Error getting content analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get user analytics overview
router.get("/overview", authMiddleware, async (req, res) => {
  try {
    const statsService = require("./services/statsService");
    const overview = await statsService.getUserOverview(req.user.uid);
    res.json({ overview });
  } catch (error) {
    console.error("Error getting analytics overview:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get user analytics with time range
router.get("/user", authMiddleware, async (req, res) => {
  try {
    const requestedRange = req.query.range || "7d";
    const uid = req.user?.uid || req.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const snapshot = await getEffectiveTierSnapshot(uid);
    const entitlements = getPlanCapabilities(snapshot.tierId);
    const allowedRanges = entitlements.analytics.allowedRanges || ["7d"];
    const range = allowedRanges.includes(requestedRange)
      ? requestedRange
      : allowedRanges[allowedRanges.length - 1] || "7d";

    // Parse time range
    const now = new Date();
    let startDate = null;
    if (range === "all") {
      startDate = null;
    } else {
      startDate = new Date();
      if (range === "24h") startDate.setHours(now.getHours() - 24);
      else if (range === "7d") startDate.setDate(now.getDate() - 7);
      else if (range === "30d") startDate.setDate(now.getDate() - 30);
      else if (range === "90d") startDate.setDate(now.getDate() - 90);
      else startDate.setDate(now.getDate() - 7); // default to 7d
    }

    // Analytics should be sourced from published platform posts only.
    console.log(
      `[Analytics] Aggregating published platform posts for user: ${uid}, range: ${range}`
    );
    const allOwnedPosts = await fetchOwnedCollectionDocs(
      "platform_posts",
      uid,
      ["uid", "userId", "user_id", "ownerId", "creatorId"],
      400
    );

    const publishedPostsAllTime = allOwnedPosts.filter(
      post => isPublishedPlatformPost(post) && normalizePlatformName(post.platform)
    );
    const postsWithoutEventDate = publishedPostsAllTime.filter(
      post => !getPostEventDate(post)
    ).length;
    const publishedPosts = publishedPostsAllTime
      .filter(post => {
        const eventDate = getPostEventDate(post);
        if (!startDate) return true;
        // Keep range windows strict: posts with no event timestamp are excluded from dated windows.
        if (!eventDate) return false;
        return eventDate.getTime() >= startDate.getTime();
      })
      .sort((a, b) => {
        const aTime = getPostEventDate(a)?.getTime() || 0;
        const bTime = getPostEventDate(b)?.getTime() || 0;
        return bTime - aTime;
      });

    const filterLabel = startDate ? startDate.toISOString() : "all-time";
    console.log(
      `[Analytics] ${publishedPosts.length} published platform posts passed date filter (>= ${filterLabel})`
    );

    const contentIds = new Set(
      publishedPosts
        .map(post => post.contentId)
        .filter(contentId => typeof contentId === "string" && contentId)
    );
    const contentTitleMap = await fetchContentTitleMap(contentIds);

    let totalViews = 0;
    let totalLikes = 0;
    let totalShares = 0;
    let totalRevenue = 0;
    let totalClicks = 0;
    const contentByPlatform = {};
    let latestSnapshot = null;
    let lastUpdatedAt = null;
    let nextUpdateAt = null;

    const topContentCandidates = publishedPosts.map(post => {
      const platform = normalizePlatformName(post.platform);
      const metrics = post.metrics || {};
      const views = getNumericMetric(
        metrics.views,
        metrics.view_count,
        metrics.video_views,
        metrics.video_view_count,
        metrics.play_count,
        metrics.plays,
        metrics.post_impressions,
        metrics.impressions,
        metrics.impression_count
      );
      const likes = getNumericMetric(
        metrics.likes,
        metrics.like_count,
        metrics.favorite_count,
        metrics.reaction_count,
        metrics.score
      );
      const shares = getNumericMetric(
        metrics.shares,
        metrics.share_count,
        metrics.retweet_count,
        metrics.repost_count,
        metrics.reposts
      );
      const clicks = getNumericMetric(
        metrics.clicks,
        metrics.click_count,
        metrics.link_clicks,
        metrics.post_clicks
      );
      const comments = getNumericMetric(
        metrics.comments,
        metrics.comment_count,
        metrics.comments_count,
        metrics.reply_count,
        metrics.post_engaged_users,
        metrics.total_comments
      );

      if (!contentByPlatform[platform]) {
        contentByPlatform[platform] = {
          count: 0,
          views: 0,
          likes: 0,
          shares: 0,
          comments: 0,
          clicks: 0,
          ctr: 0,
        };
      }

      contentByPlatform[platform].count += 1;
      contentByPlatform[platform].views += views;
      contentByPlatform[platform].likes += likes;
      contentByPlatform[platform].shares += shares;
      contentByPlatform[platform].comments += comments;
      contentByPlatform[platform].clicks += clicks;

      totalViews += views;
      totalLikes += likes;
      totalShares += shares;
      totalClicks += clicks;

      if (Array.isArray(post.analytics_snapshots)) {
        post.analytics_snapshots.forEach(snapshot => {
          if (!snapshot || !snapshot.timestamp) return;
          const ts = parseTimestamp(snapshot.timestamp);
          if (!ts) return;
          if (!lastUpdatedAt || ts > lastUpdatedAt) {
            lastUpdatedAt = ts;
            latestSnapshot = snapshot;
          }
        });
      }
      const nextCheckTs = parseTimestamp(post.next_check_at);
      if (nextCheckTs && (!nextUpdateAt || nextCheckTs < nextUpdateAt)) {
        nextUpdateAt = nextCheckTs;
      }

      const fallbackTitle =
        post.payload?.title ||
        post.payload?.caption ||
        post.payload?.message ||
        post.payload?.text ||
        null;
      const resolvedTitle = contentTitleMap.get(post.contentId) || fallbackTitle || "Untitled";
      const publishedAt = getPostEventDate(post);

      return {
        title: resolvedTitle,
        views,
        clicks,
        platform,
        comments,
        shares,
        publishedAt: publishedAt ? publishedAt.toISOString() : null,
      };
    });

    Object.values(contentByPlatform).forEach(platformRow => {
      platformRow.ctr =
        platformRow.views > 0
          ? parseFloat(((platformRow.clicks / platformRow.views) * 100).toFixed(2))
          : 0;
    });

    const bestCandidate = topContentCandidates.reduce((best, item) => {
      if (!best) return item;
      if (item.views > best.views) return item;
      if (item.views === best.views && item.clicks > best.clicks) return item;
      return best;
    }, null);

    const bestContent = {
      views: bestCandidate ? bestCandidate.views : 0,
      nextGoal:
        bestCandidate && bestCandidate.views >= 100000
          ? 500000
          : bestCandidate && bestCandidate.views >= 50000
            ? 100000
            : 50000,
      potentialBonus: 0,
    };

    const performanceStatus = publishedPosts.length
      ? totalViews > 0
        ? "Live"
        : "Published with low measurable reach"
      : "No published platform posts";
    const motivationMessage = publishedPosts.length
      ? "Analytics are sourced from published platform post records."
      : "Publish content to at least one connected platform to generate analytics.";

    // 2. Referral Progress (Logic from referralGrowthEngine: 10 friends = $5, 20 = $15)
    let referralStats = { total: 0, nextGoal: 10, potentialBonus: 5 };
    let referralCode = "";
    try {
      const userDocRef = db.collection("users").doc(uid);
      const userDoc = await userDocRef.get(); // Simplified for speed

      const credsRef = db.collection("user_credits").doc(uid);
      const creds = await credsRef.get();

      if (creds.exists) {
        const count = creds.data().totalReferrals || 0;
        referralStats = {
          total: count,
          nextGoal: count < 10 ? 10 : count < 20 ? 20 : 100,
          potentialBonus: count < 10 ? 5 : count < 20 ? 15 : 50,
        };
      }
      if (userDoc.exists) {
        referralCode = userDoc.data().referralCode || "";
      }
    } catch (e) {}

    // Calculate top platform from published platform post metrics only.
    let topPlatform = "N/A";
    let maxPlatViews = -1;
    Object.entries(contentByPlatform).forEach(([plat, data]) => {
      if (data.views > maxPlatViews) {
        maxPlatViews = data.views;
        topPlatform = plat;
      }
    });
    if (maxPlatViews <= 0) topPlatform = "N/A";

    const topContent = topContentCandidates
      .sort((a, b) => {
        // Prioritize views
        if (b.views !== a.views) return b.views - a.views;
        // Then clicks
        if (b.clicks !== a.clicks) return b.clicks - a.clicks;
        // Then recency (publishedAt desc) if tied
        const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return db - da;
      })
      .slice(0, entitlements.analytics.topContentLimit || 10);

    const latestSnapshotAt = lastUpdatedAt ? new Date(lastUpdatedAt).toISOString() : null;
    const nextUpdateAtStr = nextUpdateAt ? new Date(nextUpdateAt).toISOString() : null;

    res.json({
      requestedRange,
      range,
      plan: {
        tierId: snapshot.tierId,
        name: entitlements.planName,
      },
      entitlements,
      totalContent: contentIds.size,
      publishedPostCount: publishedPosts.length,
      publishedPostCountAllTime: publishedPostsAllTime.length,
      postsWithoutEventDate,
      rangeStartAt: startDate ? startDate.toISOString() : null,
      rangeEndAt: now.toISOString(),
      totalViews,
      totalLikes,
      totalShares,
      totalRevenue,
      totalClicks,
      ctr: totalViews > 0 ? parseFloat(((totalClicks / totalViews) * 100).toFixed(2)) : 0,

      // Frontend specific keys
      platformBreakdown: entitlements.analytics.platformBreakdown ? contentByPlatform : {},
      byPlatform: entitlements.analytics.platformBreakdown ? contentByPlatform : {},
      topPlatform,
      topContent,

      // Analytics snapshot info
      latestSnapshot,
      lastUpdatedAt: latestSnapshotAt,
      nextUpdateAt: nextUpdateAtStr,

      viralityTracker: bestContent,
      performanceStatus,
      motivationMessage,
      referralTracker: referralStats,
      referralCode,
      dataSource: "published_platform_posts",
    });
  } catch (error) {
    console.error("Error getting user analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mount platform-specific analytics routes (LinkedIn / Reddit / Pinterest)
try {
  const platformAnalytics = require("./routes/platformAnalyticsRoutes");
  router.use("/", platformAnalytics);
} catch (e) {
  console.warn("platformAnalyticsRoutes mount failed:", e && e.message);
}

module.exports = router;
