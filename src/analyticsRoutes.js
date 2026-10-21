const express = require("express");
const { db } = require("./firebaseAdmin");
const authMiddleware = require("./authMiddleware");
const { normalizeMetrics } = require("./services/platformMetricValues");
const { getPlanCapabilities } = require("./config/subscriptionPlans");
const { applyTesterCapabilityAllowlist } = require("./config/testerProgram");
const { getEffectiveTierSnapshot } = require("./services/billingService");
const {
  getClipLearningProfile,
  recomputeClipLearningProfile,
} = require("./services/clipOutcomeLearningService");
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

function getOwnerId(record) {
  if (!record) return null;
  return (
    record.user_id || record.userId || record.uid || record.ownerId || record.creatorId || null
  );
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

function normalizeWorkflowToken(value, fallback = "") {
  const normalized = String(value ?? fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .slice(0, 80);
  return normalized || fallback;
}

function sanitizeWorkflowProperties(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value).reduce((accumulator, [key, rawValue]) => {
    const normalizedKey = normalizeWorkflowToken(key);
    if (!normalizedKey || rawValue === undefined || rawValue === null) return accumulator;

    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      accumulator[normalizedKey] = rawValue;
      return accumulator;
    }

    if (typeof rawValue === "string") {
      accumulator[normalizedKey] = rawValue.slice(0, 300);
      return accumulator;
    }

    if (Array.isArray(rawValue)) {
      accumulator[normalizedKey] = rawValue.slice(0, 12).map(item => {
        if (typeof item === "number" || typeof item === "boolean") return item;
        return String(item).slice(0, 120);
      });
      return accumulator;
    }

    if (typeof rawValue === "object") {
      accumulator[normalizedKey] = Object.fromEntries(
        Object.entries(rawValue)
          .slice(0, 20)
          .map(([nestedKey, nestedValue]) => [normalizeWorkflowToken(nestedKey), nestedValue])
          .filter(
            ([nestedKey, nestedValue]) =>
              nestedKey && nestedValue !== undefined && nestedValue !== null
          )
      );
    }

    return accumulator;
  }, {});
}

function getWorkflowRangeStart(range) {
  const now = Date.now();
  switch (
    String(range || "7d")
      .trim()
      .toLowerCase()
  ) {
    case "24h":
      return now - 24 * 60 * 60 * 1000;
    case "30d":
      return now - 30 * 24 * 60 * 60 * 1000;
    case "90d":
      return now - 90 * 24 * 60 * 60 * 1000;
    case "all":
      return 0;
    case "7d":
    default:
      return now - 7 * 24 * 60 * 60 * 1000;
  }
}

function getClipScannerCacheId(uid, sourceFingerprint) {
  const safeUid = normalizeWorkflowToken(uid, "user");
  const safeFingerprint = normalizeWorkflowToken(sourceFingerprint, "source");
  return `${safeUid}__${safeFingerprint}`.slice(0, 180);
}

function isFreshClipScannerCache(record, now = Date.now()) {
  const createdAt = Number(record?.createdAt || 0);
  const expiresAt = Number(record?.expiresAt || 0);
  if (!createdAt || !expiresAt) return false;
  return createdAt <= now && expiresAt > now;
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
    const entitlements = applyTesterCapabilityAllowlist(
      getPlanCapabilities(snapshot.tierId),
      snapshot.testerAccess
    );
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
    let publishedPosts = publishedPostsAllTime
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

    const requestedRelease = req.query.contentId || "";
    if (typeof requestedRelease !== "string" || requestedRelease.includes("/") || requestedRelease.length > 200) {
      return res.status(400).json({ error: "Choose a published release." });
    }
    const contentTitleMap = await fetchContentTitleMap(new Set(publishedPosts.map(post => post.contentId).filter(Boolean)));
    const releaseOptions = [...new Set(publishedPosts.map(post => post.contentId).filter(Boolean))]
      .map(id => ({ id, title: contentTitleMap.get(id) || "Published release" }));
    if (requestedRelease) publishedPosts = publishedPosts.filter(post => post.contentId === requestedRelease);
    const contentIds = new Set(publishedPosts.map(post => post.contentId).filter(Boolean));
    const targetPlatforms = new Set();
    const refreshTargets = publishedPosts.filter(post => {
      if (!['youtube', 'tiktok', 'instagram', 'facebook', 'linkedin', 'reddit'].includes(post.platform) || targetPlatforms.has(post.platform)) return false;
      targetPlatforms.add(post.platform); return true;
    }).slice(0, 6).map(post => ({ postId: post.id, platform: post.platform }));

    let totalViews = 0;
    let totalLikes = 0;
    let totalShares = 0;
    let totalClicks = 0;
    const contentByPlatform = {};
    let latestSnapshot = null;
    let lastUpdatedAt = null;
    let nextUpdateAt = null;

    const coverage = Object.fromEntries(["views", "impressions", "likes", "comments", "shares", "clicks"].map(key => [key, 0]));
    let postsWithMetrics = 0;
    const topContentCandidates = publishedPosts.map(post => {
      const platform = normalizePlatformName(post.platform);
      const measured = normalizeMetrics(post.metrics);
      const { views, likes, shares, clicks, comments, impressions } = measured;
      const hasMetrics = Object.values(measured).some(value => value !== null);
      if (hasMetrics) postsWithMetrics++;
      for (const [key, value] of Object.entries(measured)) if (value !== null) coverage[key]++;
      if (!contentByPlatform[platform]) {
        contentByPlatform[platform] = {
          count: 0,
          views: 0,
          likes: 0,
          shares: 0,
          comments: 0,
          clicks: 0,
          ctr: null,
          impressions: 0,
          measuredPosts: Object.fromEntries(Object.keys(coverage).map(key => [key, 0])),
        };
      }

      contentByPlatform[platform].count += 1;
      contentByPlatform[platform].impressions += impressions;
      for (const [key, value] of Object.entries(measured)) {
        if (value !== null) contentByPlatform[platform].measuredPosts[key]++;
      }
      const collectedAt = hasMetrics ? parseTimestamp(post.lastMetricsSuccessAt || post.metricsFetchedAt) : null;
      if (collectedAt && (!lastUpdatedAt || collectedAt > lastUpdatedAt)) lastUpdatedAt = collectedAt;
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
        postId: post.id,
        contentId: post.contentId,
        likes,
        title: resolvedTitle,
        metricsAvailable: hasMetrics,
        metricsCollectionStatus: post.metricsCollectionStatus || (hasMetrics ? "collected" : "not_collected"),
        lastMetricsAttemptAt: parseDateValue(post.lastMetricsCheck)?.toISOString() || null,
        views,
        impressions,
        clicks,
        platform,
        comments,
        shares,
        publishedAt: publishedAt ? publishedAt.toISOString() : null,
      };
    });

    Object.values(contentByPlatform).forEach(row => {
      for (const key of Object.keys(coverage)) if (!row.measuredPosts[key]) row[key] = null;
      // Cross-post totals cannot establish an exposure-matched click rate.
      row.ctr = null;
    });
    if (!coverage.views) totalViews = null;
    if (!coverage.likes) totalLikes = null;
    if (!coverage.shares) totalShares = null;
    if (!coverage.clicks) totalClicks = null;

    const bestCandidate = topContentCandidates.reduce((best, item) => {
      if (!best) return item;
      if (best.views === null && item.views !== null) return item;
      if (best.views !== null && item.views === null) return best;
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

    const performanceStatus = !publishedPosts.length ? "No published platform posts"
      : !postsWithMetrics ? "Platform statistics unavailable"
      : postsWithMetrics < publishedPosts.length ? "Partial platform statistics" : "Live platform statistics";
    const motivationMessage = publishedPosts.length
      ? `${postsWithMetrics} of ${publishedPosts.length} published posts have collected statistics. Unavailable metrics are not zero.`
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
      if (data.views !== null && data.views > maxPlatViews) {
        maxPlatViews = data.views;
        topPlatform = plat;
      }
    });
    if (maxPlatViews <= 0) topPlatform = "N/A";

    const topContent = topContentCandidates
      .sort((a, b) => {
        if ((a.views === null) !== (b.views === null)) return a.views === null ? 1 : -1;
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
      selectedReleaseId: requestedRelease,
      releaseOptions,
      refreshTargets,
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
      totalRevenue: 0, // Pay-per-view is disabled; zero to match /content/:id behavior
      totalClicks,
      ctr: null,
      measurement: {
        status: !postsWithMetrics ? "unavailable" : postsWithMetrics < publishedPosts.length ? "partial" : "available",
        postsWithMetrics,
        postsWithoutMetrics: publishedPosts.length - postsWithMetrics,
        measuredPostsByMetric: coverage,
        note: "Metrics reflect collected posts only. Missing or unsupported values are unavailable; impressions are separate from video views. CTR needs matched click and impression attribution.",
      },

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

router.post("/refresh-post-metrics", authMiddleware, async (req, res) => {
  const uid = req.user?.uid || req.userId;
  if (!uid) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { refreshOwnedPlatformMetrics } = require("./services/ownedPlatformMetricsRefresh");
    const results = await refreshOwnedPlatformMetrics(uid, req.body?.postIds);
    return res.json({ results, refreshedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Statistics refresh failed." });
  }
});

router.post("/workflow-events", authMiddleware, async (req, res) => {
  try {
    const uid = req.user?.uid || req.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const workflow = normalizeWorkflowToken(req.body?.workflow, "clip_scanner");
    const eventName = normalizeWorkflowToken(req.body?.eventName);
    if (!eventName) return res.status(400).json({ error: "eventName is required" });

    const properties = sanitizeWorkflowProperties(req.body?.properties);
    const event = {
      uid,
      workflow,
      eventName,
      properties,
      createdAt: Date.now(),
    };

    const saved = await db.collection("workflow_events").add(event);
    res.status(201).json({ ok: true, id: saved.id });
  } catch (error) {
    console.error("Error storing workflow event:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/clip-learning-profile", authMiddleware, async (req, res) => {
  try {
    const uid = req.user?.uid || req.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const profile = await getClipLearningProfile(uid);
    return res.json({
      ok: true,
      profile: profile || {
        version: 1,
        uid,
        status: "warming_up",
        sampleCount: 0,
        confidence: 0,
        strategyWeights: {},
        contentTypeWeights: {},
        durationWeights: {},
        platformWeights: {},
      },
    });
  } catch (error) {
    console.error("Error loading clip learning profile:", error);
    return res.status(500).json({ error: "Failed to load clip learning profile" });
  }
});

router.post("/clip-learning-profile/rebuild", authMiddleware, async (req, res) => {
  try {
    const uid = req.user?.uid || req.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const profile = await recomputeClipLearningProfile(uid);
    return res.json({ ok: true, profile });
  } catch (error) {
    console.error("Error rebuilding clip learning profile:", error);
    return res.status(500).json({ error: "Failed to rebuild clip learning profile" });
  }
});

router.get("/workflow-summary", authMiddleware, async (req, res) => {
  try {
    const uid = req.user?.uid || req.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const workflow = normalizeWorkflowToken(req.query.workflow, "clip_scanner");
    const range = String(req.query.range || "7d");
    const rangeStart = getWorkflowRangeStart(range);

    let query = db
      .collection("workflow_events")
      .where("uid", "==", uid);
    if (workflow) {
      query = query.where("workflow", "==", workflow);
    }
    const snapshot = await query.limit(500).get();
    const events = [];
    snapshot.forEach(doc => {
      const data = doc.data() || {};
      const createdAt = Number(data.createdAt || 0);
      if (createdAt < rangeStart) return;
      events.push({ id: doc.id, ...data, createdAt });
    });

    events.sort((left, right) => left.createdAt - right.createdAt);

    const eventCounts = events.reduce((accumulator, event) => {
      accumulator[event.eventName] = (accumulator[event.eventName] || 0) + 1;
      return accumulator;
    }, {});

    const sessionStates = new Map();
    events.forEach(event => {
      const sessionId = event.properties?.scanSessionId;
      if (!sessionId) return;
      if (!sessionStates.has(sessionId)) {
        sessionStates.set(sessionId, {
          opened: false,
          started: false,
          completed: false,
          previewed: false,
          sentToEditor: false,
          openedInEditor: false,
          exportStarted: false,
          exportFailed: false,
          resultCount: 0,
          topScore: 0,
        });
      }

      const session = sessionStates.get(sessionId);
      if (event.eventName === "scanner_opened") session.opened = true;
      if (event.eventName === "scan_started") session.started = true;
      if (event.eventName === "scan_completed") {
        session.completed = true;
        session.resultCount = Math.max(
          session.resultCount,
          Number(event.properties?.resultCount || 0)
        );
        session.topScore = Math.max(session.topScore, Number(event.properties?.topScore || 0));
      }
      if (event.eventName === "clip_previewed") session.previewed = true;
      if (event.eventName === "clip_sent_to_editor") session.sentToEditor = true;
      if (event.eventName === "scanner_clip_opened_in_editor") session.openedInEditor = true;
      if (event.eventName === "scanner_clip_export_started") session.exportStarted = true;
      if (event.eventName === "scanner_clip_export_failed") session.exportFailed = true;
    });

    const sessions = [...sessionStates.values()];
    const openedSessions = sessions.filter(session => session.opened).length;
    const startedSessions = sessions.filter(session => session.started).length;
    const completedSessions = sessions.filter(session => session.completed).length;
    const previewedSessions = sessions.filter(session => session.previewed).length;
    const editorSessions = sessions.filter(
      session => session.sentToEditor || session.openedInEditor
    ).length;
    const exportSessions = sessions.filter(session => session.exportStarted).length;

    const successfulScans = sessions.filter(
      session => session.completed && session.resultCount > 0
    );
    const averageTopScore = successfulScans.length
      ? Math.round(
          successfulScans.reduce((sum, session) => sum + Number(session.topScore || 0), 0) /
            successfulScans.length
        )
      : 0;
    const averageResultCount = successfulScans.length
      ? Number(
          (
            successfulScans.reduce((sum, session) => sum + Number(session.resultCount || 0), 0) /
            successfulScans.length
          ).toFixed(1)
        )
      : 0;

    const funnel = [
      { event: "scanner_opened", sessions: openedSessions },
      { event: "scan_started", sessions: startedSessions },
      { event: "scan_completed", sessions: completedSessions },
      { event: "clip_previewed", sessions: previewedSessions },
      { event: "clip_sent_to_editor", sessions: editorSessions },
      { event: "scanner_clip_export_started", sessions: exportSessions },
    ].map((step, index, steps) => ({
      ...step,
      rateFromPrevious:
        index === 0 || !steps[index - 1].sessions
          ? 1
          : Number((step.sessions / steps[index - 1].sessions).toFixed(3)),
    }));

    res.json({
      workflow,
      range,
      totalEvents: events.length,
      totalSessions: sessions.length,
      eventCounts,
      funnel,
      metrics: {
        scanStartRate: openedSessions ? Number((startedSessions / openedSessions).toFixed(3)) : 0,
        scanCompletionRate: startedSessions
          ? Number((completedSessions / startedSessions).toFixed(3))
          : 0,
        previewRate: completedSessions
          ? Number((previewedSessions / completedSessions).toFixed(3))
          : 0,
        editorConversionRate: completedSessions
          ? Number((editorSessions / completedSessions).toFixed(3))
          : 0,
        exportConversionRate: editorSessions
          ? Number((exportSessions / editorSessions).toFixed(3))
          : 0,
        averageTopScore,
        averageResultCount,
      },
      recentEvents: events.slice(-25).reverse(),
    });
  } catch (error) {
    console.error("Error building workflow summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/clip-scanner-cache", authMiddleware, async (req, res) => {
  try {
    const uid = req.user?.uid || req.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const sourceFingerprint = normalizeWorkflowToken(req.query.sourceFingerprint);
    if (!sourceFingerprint) {
      return res.status(400).json({ error: "sourceFingerprint is required" });
    }

    const docId = getClipScannerCacheId(uid, sourceFingerprint);
    const snapshot = await db.collection("clip_scanner_cache").doc(docId).get();
    if (!snapshot.exists) {
      return res.json({ hit: false, cache: null });
    }

    const data = snapshot.data() || {};
    if (!isFreshClipScannerCache(data)) {
      await db
        .collection("clip_scanner_cache")
        .doc(docId)
        .delete()
        .catch(() => {});
      return res.json({ hit: false, cache: null, expired: true });
    }

    res.json({
      hit: true,
      cache: {
        sourceFingerprint: data.sourceFingerprint,
        sourceLabel: data.sourceLabel || "Untitled source",
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
        resultCount: Number(data.resultCount || 0),
        topScore: Number(data.topScore || 0),
        results: Array.isArray(data.results) ? data.results : [],
      },
    });
  } catch (error) {
    console.error("Error getting clip scanner cache:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/clip-scanner-cache", authMiddleware, async (req, res) => {
  try {
    const uid = req.user?.uid || req.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const sourceFingerprint = normalizeWorkflowToken(req.body?.sourceFingerprint);
    if (!sourceFingerprint) {
      return res.status(400).json({ error: "sourceFingerprint is required" });
    }

    const results = Array.isArray(req.body?.results) ? req.body.results.slice(0, 30) : [];
    const now = Date.now();
    const expiresAt = now + 3 * 24 * 60 * 60 * 1000;
    const payload = {
      uid,
      sourceFingerprint,
      sourceLabel: String(req.body?.sourceLabel || "Untitled source").slice(0, 200),
      createdAt: now,
      expiresAt,
      resultCount: Number(req.body?.resultCount || results.length || 0),
      topScore: Number(req.body?.topScore || 0),
      results,
    };

    const docId = getClipScannerCacheId(uid, sourceFingerprint);
    await db.collection("clip_scanner_cache").doc(docId).set(payload);
    res.status(201).json({ ok: true, expiresAt });
  } catch (error) {
    console.error("Error saving clip scanner cache:", error);
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
