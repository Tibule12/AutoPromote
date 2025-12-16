const express = require("express");
const authMiddleware = require("../authMiddleware");
const adminOnly = require("../middlewares/adminOnly");
const { db } = require("../firebaseAdmin");
const {
  enqueueYouTubeUploadTask,
  processNextYouTubeTask,
  enqueuePlatformPostTask,
  processNextPlatformTask,
} = require("../services/promotionTaskQueue");
const { admin } = require("../firebaseAdmin");
const { rateLimit } = require("../middleware/rateLimit");
const { validateBody } = require("../middleware/validate");

const router = express.Router();
const { rateLimiter } = require("../middlewares/globalRateLimiter");
const promotionWriteLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_PROMO_WRITES || "60", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "5"),
  windowHint: "promo_writes",
});
const promotionPublicLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_PROMO_PUBLIC || "120", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "10"),
  windowHint: "promo_public",
});

// Enqueue a YouTube upload task for a content item
router.post(
  "/youtube/enqueue",
  authMiddleware,
  promotionWriteLimiter,
  rateLimit({ field: "ytEnqueue", perMinute: 30 }),
  validateBody({
    contentId: { type: "string", required: true },
    fileUrl: { type: "string", required: true },
    title: { type: "string", required: false, maxLength: 140 },
    description: { type: "string", required: false, maxLength: 5000 },
    shortsMode: { type: "boolean", required: false },
  }),
  async (req, res) => {
    try {
      const { contentId, title, description, fileUrl, shortsMode } = req.body || {};
      if (!contentId || !fileUrl)
        return res.status(400).json({ error: "contentId and fileUrl required" });
      const uid = req.userId || req.user?.uid;

      // Fetch content to auto-fill defaults if missing
      const contentSnap = await db.collection("content").doc(contentId).get();
      if (!contentSnap.exists) return res.status(404).json({ error: "Content not found" });
      const content = contentSnap.data();

      const task = await enqueueYouTubeUploadTask({
        contentId,
        uid,
        title: title || content.title || "Untitled",
        description: description || content.description || "",
        fileUrl,
        shortsMode: shortsMode || (content.duration && content.duration < 60),
      });
      return res.json({ success: true, task });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
);

// Manual processor trigger (temporary until a scheduler is added)
router.post("/youtube/process-once", promotionWriteLimiter, async (req, res) => {
  try {
    const result = await processNextYouTubeTask();
    return res.json({ processed: !!result, result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
// List dead-letter tasks (simple sample)
router.get("/dead-letter", authMiddleware, adminOnly, promotionWriteLimiter, async (req, res) => {
  try {
    const snap = await require("../firebaseAdmin")
      .db.collection("dead_letter_tasks")
      .orderBy("failed.failedAt", "desc")
      .limit(50)
      .get();
    const out = [];
    snap.forEach(d =>
      out.push({
        id: d.id,
        type: d.data().type,
        error: d.data().failed?.error,
        attempts: d.data().failed?.attempts,
      })
    );
    return res.json({ success: true, deadLetter: out });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Retry a dead-letter task by re-queuing (clone minimal fields)
router.post(
  "/dead-letter/requeue/:id",
  authMiddleware,
  adminOnly,
  promotionWriteLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;
      const ref = await require("../firebaseAdmin")
        .db.collection("dead_letter_tasks")
        .doc(id)
        .get();
      if (!ref.exists) return res.status(404).json({ error: "dead_letter_task_not_found" });
      const data = ref.data();
      const base = { ...data };
      delete base.failed;
      delete base.outcome;
      delete base.completedAt;
      delete base.nextAttemptAt;
      base.status = "queued";
      base.attempts = 0;
      base.requeuedFrom = id;
      base.createdAt = new Date().toISOString();
      base.updatedAt = new Date().toISOString();
      const newRef = await require("../firebaseAdmin").db.collection("promotion_tasks").add(base);
      return res.json({ success: true, requeuedTaskId: newRef.id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
);

// Force reset attempts for a queued task (I)
router.post(
  "/reset-attempts/:id",
  authMiddleware,
  adminOnly,
  promotionWriteLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;
      const docRef = require("../firebaseAdmin").db.collection("promotion_tasks").doc(id);
      const snap = await docRef.get();
      if (!snap.exists) return res.status(404).json({ error: "task_not_found" });
      await docRef.update({
        attempts: 0,
        nextAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
);
// Requeue a failed (non-dead-letter) task by id
router.post("/requeue/:id", authMiddleware, adminOnly, promotionWriteLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const ref = require("../firebaseAdmin").db.collection("promotion_tasks").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "task_not_found" });
    const data = snap.data();
    if (data.status !== "failed") return res.status(400).json({ error: "task_not_failed" });
    await ref.update({
      status: "queued",
      attempts: 0,
      nextAttemptAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      requeuedAt: new Date().toISOString(),
    });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
// Enqueue cross-platform post (generic)
router.post(
  "/platform/enqueue",
  authMiddleware,
  promotionWriteLimiter,
  rateLimit({ field: "platformEnqueue", perMinute: 60, weight: 2 }),
  validateBody({
    contentId: { type: "string", required: true },
    platform: {
      type: "string",
      required: true,
      enum: ["twitter", "facebook", "instagram", "tiktok", "youtube"],
    },
    reason: { type: "string", required: false, maxLength: 120 },
    payload: { type: "object", required: false },
  }),
  async (req, res) => {
    try {
      const { contentId, platform, reason, payload } = req.body || {};
      if (!contentId || !platform)
        return res.status(400).json({ error: "contentId and platform required" });
      const uid = req.userId || req.user?.uid;
      const task = await enqueuePlatformPostTask({
        contentId,
        uid,
        platform,
        reason: reason || "manual",
        payload: payload || {},
      });
      return res.json({ success: true, task });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
);

// Process one platform post task
router.post("/platform/process-once", promotionWriteLimiter, async (req, res) => {
  try {
    const result = await processNextPlatformTask();
    return res.json({ processed: !!result, result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
