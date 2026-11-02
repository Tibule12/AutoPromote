const express = require("express");
const { db } = require("./firebaseAdmin");
const authMiddleware = require("./authMiddleware");
const { normalizeMetrics } = require("./services/platformMetricValues");
const {
  getClipLearningProfile,
  recomputeClipLearningProfile,
} = require("./services/clipOutcomeLearningService");
const { getEffectiveTierSnapshot } = require("./services/billingService");
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


const router = express.Router();
router.all("/user", require("./retiredFeatureResponse"));

// Rewards still need their existing progress, independent of the removed dashboard.
router.get("/rewards", authMiddleware, async (req, res) => {
  const uid = req.user?.uid || req.userId;
  if (!uid) return res.status(401).json({ error: "Unauthorized" });
  try {
    const [user, credits, posts, tier] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("user_credits").doc(uid).get(),
      fetchOwnedCollectionDocs("platform_posts", uid, ["uid", "userId", "user_id", "ownerId", "creatorId"]),
      getEffectiveTierSnapshot(uid),
    ]);
    const count = credits.exists ? Number(credits.data().totalReferrals || 0) : 0;
    const days = tier.tierId === "free" || tier.testerAccess ? 7 : 30;
    const start = new Date(); start.setDate(start.getDate() - days);
    const eligible = posts.filter(post => isPublishedPlatformPost(post) && normalizePlatformName(post.platform)
      && getPostEventDate(post)?.getTime() >= start.getTime());
    const measured = eligible.map(post => normalizeMetrics(post.metrics).views).filter(value => value !== null);
    const views = measured.length ? Math.max(...measured) : eligible.length ? null : 0;
    res.json({
      referralCode: user.exists ? user.data().referralCode || "" : "",
      referralTracker: { total: count, nextGoal: count < 10 ? 10 : count < 20 ? 20 : 100,
        potentialBonus: count < 10 ? 5 : count < 20 ? 15 : 50 },
      viralityTracker: { views, nextGoal: views >= 100000 ? 500000 : views >= 50000 ? 100000 : 50000, potentialBonus: 0 },
    });
  } catch (_) { res.status(500).json({ error: "Rewards progress unavailable" }); }
});

function getOwnerId(record) {
  if (!record) return null;
  return (
    record.user_id || record.userId || record.uid || record.ownerId || record.creatorId || null
  );
}

async function fetchOwnedCollectionDocs(collectionName, uid, ownerFields, pageSize = 200) {
  const seen = new Set();
  const docs = [];

  await Promise.all(
    ownerFields.map(async field => {
      try {
        const baseQuery = db
          .collection(collectionName)
          .where(field, "==", uid);
        let cursor = null;
        let readCount = 0;
        while (true) {
          const query = cursor ? baseQuery.startAfter(cursor) : baseQuery;
          const snapshot = await query.limit(pageSize).get();
          readCount += snapshot.size;
          // Bound reads without presenting an arbitrary prefix as complete analytics.
          if (readCount > 10000) {
            throw new Error("Owned analytics history exceeds the supported read window");
          }
          snapshot.forEach(doc => {
            if (seen.has(doc.id)) return;
            seen.add(doc.id);
            docs.push({ id: doc.id, ...doc.data() });
          });
          if (snapshot.size < pageSize) break;
          cursor = snapshot.docs[snapshot.docs.length - 1];
        }
      } catch (error) {
        console.warn(`[Analytics] Failed ${collectionName} lookup on ${field}:`, error.message);
        throw Object.assign(new Error("Published post history could not be fully loaded. Retry analytics."), { status: 503 });
      }
    })
  );

  return docs;
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
