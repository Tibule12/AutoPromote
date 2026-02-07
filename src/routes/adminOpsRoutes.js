const express = require("express");
const router = express.Router();
let authMiddleware;
try {
  authMiddleware = require("../authMiddleware");
} catch (_) {
  authMiddleware = (req, res, next) => next();
}
const adminOnly = require("../middlewares/adminOnly");
const { db } = require("../firebaseAdmin");

// Leader status
router.get("/leader", authMiddleware, adminOnly, (_req, res) => {
  const leader =
    global.__bgLeader && global.__bgLeader.isLeader ? global.__bgLeader.isLeader() : false;
  return res.json({ ok: true, leader });
});

// Force leader relinquish (next election cycle another instance can grab it)
router.post("/leader/relinquish", authMiddleware, adminOnly, async (_req, res) => {
  try {
    if (!global.__bgLeader)
      return res.status(500).json({ ok: false, error: "leader_control_unavailable" });
    const r = await global.__bgLeader.relinquish();
    return res.json({ ok: r, leader: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// In-memory latency metrics (JSON)
router.get("/latency", authMiddleware, adminOnly, (_req, res) => {
  try {
    const stats = (global.getLatencyStats || require("../server").getLatencyStats)();
    return res.json({ ok: true, stats });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Prometheus style latency export
router.get("/latency/prom", authMiddleware, adminOnly, (_req, res) => {
  try {
    const stats = (global.getLatencyStats || require("../server").getLatencyStats)();
    res.setHeader("Content-Type", "text/plain");
    if (!stats.count) return res.send("# no samples yet");
    const lines = [
      "# HELP autopromote_latency_ms Request latency summary (in-memory)",
      "# TYPE autopromote_latency_ms summary",
      `autopromote_latency_ms_count ${stats.count}`,
      `autopromote_latency_ms_avg ${stats.avg}`,
      `autopromote_latency_ms_p50 ${stats.p50}`,
      `autopromote_latency_ms_p90 ${stats.p90}`,
      `autopromote_latency_ms_p95 ${stats.p95}`,
      `autopromote_latency_ms_p99 ${stats.p99}`,
      `autopromote_latency_ms_max ${stats.max}`,
    ];
    if (stats.buckets) {
      lines.push("# HELP autopromote_latency_bucket Request latency histogram buckets");
      lines.push("# TYPE autopromote_latency_bucket histogram");
      Object.entries(stats.buckets).forEach(([bucket, count]) => {
        lines.push(`autopromote_latency_bucket{le="${bucket}"} ${count}`);
      });
      lines.push(`autopromote_latency_bucket{le="+Inf"} ${stats.count}`);
      lines.push(`# overflows ${stats.over || 0}`);
    }
    return res.send(lines.join("\n"));
  } catch (e) {
    return res.status(500).send(`# error ${e.message}`);
  }
});

// List recent persisted latency snapshots
router.get("/latency/snapshots", authMiddleware, adminOnly, async (_req, res) => {
  try {
    const snap = await db
      .collection("system_latency_snapshots")
      .orderBy("at", "desc")
      .limit(50)
      .get();
    const rows = snap.docs.map(d => d.data());
    return res.json({ ok: true, count: rows.length, snapshots: rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Status route latency summary (instrumented routes)
router.get("/status-latency", authMiddleware, adminOnly, (_req, res) => {
  try {
    const m = global.__getRouteMetrics ? global.__getRouteMetrics() : {};
    return res.json({ ok: true, routes: m });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/admin/ops/clips/generate-and-publish
 * Admin-only: Generate best clip from latest user video (or provided contentId) and publish to YouTube.
 * Body: { uid?, contentId? }
 */
router.post("/clips/generate-and-publish", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { uid: bodyUid, contentId: bodyContentId } = req.body || {};
    // Allow operator to provide either a contentId or an explicit UID
    let uid = bodyUid || null;
    let contentId = bodyContentId || null;

    // If contentId provided, validate and set uid
    if (contentId) {
      const contentDoc = await db.collection("content").doc(String(contentId)).get();
      if (!contentDoc.exists) return res.status(404).json({ error: "Content not found" });
      const c = contentDoc.data() || {};
      uid = uid || c.userId || c.user || null;
      if (!uid) return res.status(400).json({ error: "content has no owner uid" });
    }

    if (!uid) return res.status(400).json({ error: "uid or contentId required" });

    // If no contentId provided, pick the latest video content for this uid
    if (!contentId) {
      const snaps = await db
        .collection("content")
        .where("userId", "==", uid)
        .where("type", "==", "video")
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();
      let found = null;
      snaps.forEach(d => {
        if (found) return;
        const data = d.data() || {};
        const url = data.processedUrl || data.url || data.fileUrl || null;
        if (url) found = { id: d.id, url, data };
      });

      if (!found)
        return res
          .status(404)
          .json({ error: "No recent video content with accessible URL found for uid" });
      contentId = found.id;
    }

    // Analyze
    const { analyzeVideo, generateClip } = require("../services/videoClippingService");
    const analysis = await analyzeVideo(null, contentId, uid); // analyzeVideo can accept content's url when invoked server-side

    // Choose top clip
    const top = (analysis.topClips && analysis.topClips[0]) || null;
    if (!top) return res.status(500).json({ error: "No clip suggestions returned by analyzer" });

    const genRes = await generateClip(analysis.analysisId, top.id, { aspectRatio: "16:9" });
    if (!genRes || !genRes.url) return res.status(500).json({ error: "Clip generation failed" });

    // Find generated clip doc
    const snap = await db
      .collection("generated_clips")
      .where("analysisId", "==", analysis.analysisId)
      .where("clipId", "==", top.id)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    if (snap.empty) return res.status(500).json({ error: "Generated clip doc missing" });
    const clipDoc = snap.docs[0];
    const clipData = clipDoc.data();

    // Create a content doc for the clip
    const contentPayload = {
      userId: uid,
      title: clipData.caption || `AI clip from ${contentId}`,
      description: clipData.caption || "",
      type: "video",
      url: clipData.url,
      sourceType: "ai_clip",
      sourceClipId: clipDoc.id,
      sourceAnalysisId: clipData.analysisId,
      viralScore: clipData.viralScore,
      duration: clipData.duration,
      target_platforms: ["youtube"],
      status: "approved",
      createdAt: new Date().toISOString(),
    };
    const ref = await db.collection("content").add(contentPayload);
    const newContentId = ref.id;

    // Upload to YouTube
    const { uploadVideo } = require("../services/youtubeService");
    const uploadOutcome = await uploadVideo({
      uid,
      title: contentPayload.title,
      description: contentPayload.description,
      fileUrl: clipData.url,
      contentId: newContentId,
      shortsMode: false,
      optimizeMetadata: true,
    });

    return res.json({ success: true, uploadOutcome, contentId: newContentId });
  } catch (err) {
    console.error("[AdminClips] generate-and-publish error:", err && err.message);
    return res.status(500).json({ error: err && err.message ? err.message : "Failed" });
  }
});

module.exports = router;
