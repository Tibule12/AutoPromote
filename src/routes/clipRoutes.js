// clipRoutes.js
// API routes for AI video clipping (Opus Clip style)

const express = require("express");
const router = express.Router();
const videoClippingService = require("../services/videoClippingService");
const crypto = require("crypto");
const authMiddleware = require("../authMiddleware");
const { db } = require("../firebaseAdmin");
const logger = require("../utils/logger");

// Rate limiting
const rateLimitMap = new Map();
function clipRateLimit(req, res, next) {
  const userId = req.userId || req.user?.uid;
  const now = Date.now();
  const userKey = `clip_${userId}`;

  const userLimits = rateLimitMap.get(userKey) || { count: 0, resetTime: now + 60000 };

  if (now > userLimits.resetTime) {
    userLimits.count = 0;
    userLimits.resetTime = now + 60000;
  }

  if (userLimits.count >= 5) {
    // 5 analyses per minute
    return res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
  }

  userLimits.count++;
  rateLimitMap.set(userKey, userLimits);
  next();
}

// Plan Quotas (Monthly)
const PLAN_CLIP_QUOTAS = {
  free: 3,
  premium: 50,
  pro: 200,
  enterprise: Infinity,
};

// Quota Middleware
async function checkClipQuota(req, res, next) {
  const userId = req.userId || req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    // 1. Get User Plan
    let userDoc;
    try {
      userDoc = await db.collection("users").doc(userId).get();
    } catch (e) {
      // If getting user doc fails (e.g. invalid ID or connection), treat as empty
      console.warn("ClipQuota: Failed to load user doc", userId, e.message);
    }
    const userData = userDoc && userDoc.exists ? userDoc.data() : {};
    // Check both potential locations for plan config
    const planId =
      (userData.subscription && userData.subscription.planId) || userData.planId || "free";

    const limit =
      PLAN_CLIP_QUOTAS[planId] !== undefined ? PLAN_CLIP_QUOTAS[planId] : PLAN_CLIP_QUOTAS.free;

    // Enterprise/Unlimited users bypass check
    if (limit === Infinity) return next();

    // 2. Count Usage this Month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Query count of clip analyses created by this user this month
    // First attempt: use aggregate count() if supported, otherwise fall back to get() and measure size
    let used = 0;
    try {
      const usageSnap = await db
        .collection("clip_analyses")
        .where("userId", "==", userId)
        .where("createdAt", ">=", startOfMonth)
        .count()
        .get();
      used = usageSnap && usageSnap.data && usageSnap.data().count ? usageSnap.data().count : 0;
    } catch (e) {
      // Fallback: perform a query get() and rely on snapshot.size
      try {
        const snap = await db
          .collection("clip_analyses")
          .where("userId", "==", userId)
          .where("createdAt", ">=", startOfMonth)
          .get();
        used =
          snap && typeof snap.size === "number"
            ? snap.size
            : snap && snap.docs
              ? snap.docs.length
              : 0;
      } catch (e2) {
        throw e; // rethrow original to be caught by outer try
      }
    }

    if (used >= limit) {
      return res.status(403).json({
        error: "quota_exceeded",
        message: `You have used ${used}/${limit} AI credits this month. Upgrade to generate more clips!`,
        plan: planId,
        limit,
        used,
      });
    }

    // Attach usage info to request for potential logging
    req.clipUsage = { used, limit, planId };
    next();
  } catch (e) {
    logger.error("ClipQuotaCheckError", e);
    console.error("DBG_QUOTA_ERROR", e && e.message, e && e.stack);
    // Fail safe - don't block user if DB check fails, but log it
    // Or fail secure - block user. Choosing fail secure to protect resources.
    return res.status(500).json({ error: "Failed to verify usage quota", detail: e && e.message });
  }
}

// Simple in-memory job store for generation jobs (suitable for testing/demo)
const generationJobs = new Map();

function createJob(userId, contentId, options) {
  const jobId = crypto.randomBytes(8).toString("hex");
  const job = {
    id: jobId,
    userId,
    contentId,
    options,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
  generationJobs.set(jobId, job);
  return job;
}

function updateJob(jobId, patch) {
  const job = generationJobs.get(jobId) || {};
  const updated = { ...job, ...patch };
  generationJobs.set(jobId, updated);
  return updated;
}

/**
 * POST /api/clips/analyze
 * Analyze a video and generate clip suggestions
 * Body: { contentId, videoUrl }
 */
router.post("/analyze", authMiddleware, clipRateLimit, checkClipQuota, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    console.error("DBG_REQ_USER", userId, req.user);
    logger.debug("ClipRoutes.incomingRequest", { userId, userPresent: !!req.user });
    const { contentId, videoUrl } = req.body;

    if (!contentId || !videoUrl) {
      return res.status(400).json({ error: "contentId and videoUrl are required" });
    }

    // Verify user owns this content (support both snake_case and camelCase schemas)
    const contentDoc = await db.collection("content").doc(contentId).get();
    console.error(
      "DBG_CONTENT_DOC",
      contentDoc && contentDoc.exists,
      contentDoc && contentDoc.data && contentDoc.data()
    );

    if (!contentDoc || !contentDoc.exists) {
      return res.status(404).json({ error: "Content not found" });
    }

    const contentData = contentDoc.data() || {};
    const contentOwner = contentData.userId || contentData.user_id || contentData.user || null;
    if (contentOwner !== userId) {
      logger.warn("ClipRoutes.ownershipMismatch", { contentId, contentOwner, requester: userId });
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Start analysis (this may take a while for long videos)
    logger.info("ClipRoutes.startAnalysis", { contentId, userId });
    let result;
    try {
      result = await videoClippingService.analyzeVideo(videoUrl, contentId, userId);
    } catch (err) {
      logger.error("ClipRoutes.analyzeVideoError", {
        message: err && err.message ? err.message : err,
        stack: err && err.stack,
      });
      throw err;
    }

    // Update content document with analysis reference
    await db
      .collection("content")
      .doc(contentId)
      .update({
        clipAnalysis: {
          analysisId: result.analysisId,
          analyzed: true,
          analyzedAt: new Date().toISOString(),
          clipsGenerated: result.clipsGenerated,
        },
        updatedAt: new Date().toISOString(),
      });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[ClipRoutes] Analysis error:", error);
    res.status(500).json({ error: error.message || "Analysis failed" });
  }
});

/**
 * POST /api/clips/generate-and-publish
 * One-click flow: analyze, generate best clip, and publish/schedule to selected platforms.
 * Body: { contentId, options }
 */
router.post("/generate-and-publish", authMiddleware, clipRateLimit, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { contentId, options = {} } = req.body;
    if (!contentId) return res.status(400).json({ error: "contentId required" });

    const contentDoc = await db.collection("content").doc(contentId).get();
    if (!contentDoc.exists) return res.status(404).json({ error: "Content not found" });
    const contentData = contentDoc.data() || {};
    const contentOwner = contentData.userId || contentData.user_id || contentData.user || null;
    if (contentOwner !== userId) return res.status(403).json({ error: "Unauthorized" });

    const job = createJob(userId, contentId, options);
    // Kick off async worker (fire-and-forget)
    (async () => {
      try {
        updateJob(job.id, { status: "analyzing" });
        const analysisRes = await videoClippingService.analyzeVideo(
          contentData.videoUrl || contentData.sourceUrl,
          contentId,
          userId
        );
        updateJob(job.id, { status: "analyzed", analysisId: analysisRes.analysisId });

        // Choose first top clip
        const top = (analysisRes.topClips && analysisRes.topClips[0]) || null;
        if (!top) {
          updateJob(job.id, { status: "failed", error: "No clip suggestions" });
          return;
        }

        updateJob(job.id, { status: "generating", clipId: top.id });
        const genRes = await videoClippingService.generateClip(
          analysisRes.analysisId,
          top.id,
          options
        );

        updateJob(job.id, { status: "complete", clipResult: genRes });
      } catch (err) {
        console.error("[ClipRoutes] generate-and-publish worker error:", err && err.message);
        updateJob(job.id, { status: "failed", error: err && err.message });
      }
    })();

    res.json({ success: true, jobId: job.id });
  } catch (error) {
    console.error("[ClipRoutes] generate-and-publish error:", error);
    res.status(500).json({ error: error.message || "Failed" });
  }
});

/**
 * GET /api/clips/generate-status/:jobId
 * Polling endpoint to read job status
 */
router.get("/generate-status/:jobId", authMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = generationJobs.get(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    // Only expose limited fields
    return res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        clipResult: job.clipResult || null,
        error: job.error || null,
      },
    });
  } catch (err) {
    console.error("[ClipRoutes] status error:", err);
    res.status(500).json({ error: "Failed to read job status" });
  }
});

/**
 * GET /api/clips/analysis/:analysisId
 * Get analysis results
 */
router.get("/analysis/:analysisId", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { analysisId } = req.params;

    const analysisDoc = await db.collection("clip_analyses").doc(analysisId).get();

    if (!analysisDoc.exists) {
      return res.status(404).json({ error: "Analysis not found" });
    }

    const analysis = analysisDoc.data();

    // Verify ownership
    if (analysis.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json({
      success: true,
      analysis: {
        id: analysisId,
        ...analysis,
      },
    });
  } catch (error) {
    console.error("[ClipRoutes] Get analysis error:", error);
    res.status(500).json({ error: "Failed to retrieve analysis" });
  }
});

/**
 * POST /api/clips/generate
 * Generate a specific clip from analysis
 * Body: { analysisId, clipId, options: { aspectRatio, addCaptions, addBranding } }
 */
router.post("/generate", authMiddleware, clipRateLimit, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { analysisId, clipId, options = {} } = req.body;

    if (!analysisId || !clipId) {
      return res.status(400).json({ error: "analysisId and clipId are required" });
    }

    // Verify ownership
    const analysisDoc = await db.collection("clip_analyses").doc(analysisId).get();
    if (!analysisDoc.exists) {
      return res.status(404).json({ error: "Analysis not found" });
    }

    const analysis = analysisDoc.data();
    if (analysis.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Generate clip
    const result = await videoClippingService.generateClip(analysisId, clipId, options);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[ClipRoutes] Generate clip error:", error);
    res.status(500).json({ error: error.message || "Clip generation failed" });
  }
});

/**
 * POST /api/clips/memetic/plan
 * Create a memetic plan given a base variant or content reference. Returns ranked variants and summaries.
 * Body: { contentId?, baseVariant?, options?: { count, simulationSteps, seedSize } }
 */
router.post("/memetic/plan", authMiddleware, clipRateLimit, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { contentId, options = {} } = req.body;
    let baseVariant = req.body.baseVariant;

    // If contentId provided, verify ownership and optionally derive baseVariant from analysis
    if (contentId) {
      const contentDoc = await db.collection("content").doc(contentId).get();
      if (!contentDoc.exists) return res.status(404).json({ error: "Content not found" });
      const contentData = contentDoc.data() || {};
      const owner = contentData.userId || contentData.user_id || contentData.user || null;
      if (owner !== userId) return res.status(403).json({ error: "Unauthorized" });
      // Derive a minimal baseVariant if none provided
      if (!baseVariant) {
        // Use a lightweight heuristic from content metadata
        baseVariant = {
          hookStrength: 0.6,
          shareability: 0.05,
          predictedWT: Math.min(0.9, contentData.estimated_watch_through || 0.6),
          tempo: 1.0,
        };
      }
    }

    if (!baseVariant) return res.status(400).json({ error: "baseVariant or contentId required" });

    // Lazy require to avoid circular deps
    const { planVariants } = require("../services/memeticPlanner");

    const plan = planVariants(baseVariant, options);

    // Return a summarized version of the plan
    const summary = plan.map(p => ({
      variantId: p.v.id,
      variant: {
        hookStrength: p.v.hookStrength,
        shareability: p.v.shareability,
        ctaIntensity: p.v.ctaIntensity,
        remixProbability: p.v.remixProbability,
        tempo: p.v.tempo,
        captionStyle: p.v.captionStyle,
        thumbnailStyle: p.v.thumbnailStyle,
      },
      modelScore: p.modelScore,
      resonanceScore: p.sim.resonanceScore,
      combined: p.combined,
    }));

    res.json({ success: true, plan: summary });
  } catch (error) {
    console.error("[ClipRoutes] memetic plan error:", error);
    res.status(500).json({ error: error.message || "Memetic plan failed" });
  }
});

/**
 * POST /api/clips/memetic/seed
 * Create a memetic experiment to seed chosen variants to audiences.
 * Body: { contentId?, experimentName?, plan: [{ variantId, variant }], options: { seedSize, durationDays } }
 */
router.post("/memetic/seed", authMiddleware, clipRateLimit, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { contentId, experimentName, plan, options = {} } = req.body;

    if (!Array.isArray(plan) || plan.length === 0) {
      return res.status(400).json({ error: "plan (array of variants) is required" });
    }

    // If contentId provided, verify ownership
    if (contentId) {
      const contentDoc = await db.collection("content").doc(contentId).get();
      if (!contentDoc.exists) return res.status(404).json({ error: "Content not found" });
      const contentData = contentDoc.data() || {};
      const owner = contentData.userId || contentData.user_id || contentData.user || null;
      if (owner !== userId) return res.status(403).json({ error: "Unauthorized" });
    }

    // Persist experiment
    const experimentDoc = {
      userId,
      contentId: contentId || null,
      name: experimentName || `memetic-${Date.now()}`,
      plan: plan.map(p => ({ variantId: p.variantId, variant: p.variant })),
      options: {
        seedSize: typeof options.seedSize === "number" ? options.seedSize : 200,
        durationDays: typeof options.durationDays === "number" ? options.durationDays : 3,
        ...options,
      },
      status: "scheduled",
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection("memetic_experiments").add(experimentDoc);

    // For MVP, we do not start background workers here — scheduling will be performed by a separate worker in future

    res.json({ success: true, experimentId: ref.id });
  } catch (error) {
    console.error("[ClipRoutes] memetic seed error:", error);
    res.status(500).json({ error: error.message || "Memetic seed failed" });
  }
});

/**
 * GET /api/clips/user
 * Get all clips generated by current user
 */
router.get("/user", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;

    const snapshot = await db
      .collection("generated_clips")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const clips = [];
    snapshot.forEach(doc => {
      clips.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    res.json({
      success: true,
      clips,
      count: clips.length,
    });
  } catch (error) {
    console.error("[ClipRoutes] Get user clips error:", error);
    res.status(500).json({ error: "Failed to retrieve clips" });
  }
});

/**
 * DELETE /api/clips/:clipId
 * Delete a generated clip
 */
router.delete("/:clipId", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { clipId } = req.params;

    const clipDoc = await db.collection("generated_clips").doc(clipId).get();

    if (!clipDoc.exists) {
      return res.status(404).json({ error: "Clip not found" });
    }

    const clipData = clipDoc.data();

    // Verify ownership
    if (clipData.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Delete from Firestore
    await db.collection("generated_clips").doc(clipId).delete();

    // TODO: Delete from Firebase Storage (optional - keep files for recovery)

    res.json({
      success: true,
      message: "Clip deleted successfully",
    });
  } catch (error) {
    console.error("[ClipRoutes] Delete clip error:", error);
    res.status(500).json({ error: "Failed to delete clip" });
  }
});

/**
 * POST /api/clips/:clipId/export
 * Export clip to platform(s)
 * Body: { platforms: ['tiktok', 'instagram', ...], scheduledTime }
 */
router.post("/:clipId/export", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { clipId } = req.params;
    const { platforms = [], scheduledTime } = req.body;

    if (platforms.length === 0) {
      return res.status(400).json({ error: "At least one platform required" });
    }

    const clipDoc = await db.collection("generated_clips").doc(clipId).get();

    if (!clipDoc.exists) {
      return res.status(404).json({ error: "Clip not found" });
    }

    const clipData = clipDoc.data();

    // Verify ownership
    if (clipData.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Create content entry for this clip
    // Determine admin status
    const isAdmin = !!(req.user && (req.user.isAdmin === true || req.user.role === "admin"));

    // Create content entry for this clip
    const contentPayload = {
      userId,
      title: clipData.caption || `Clip from ${clipData.contentId}`,
      description: clipData.caption || "",
      type: "video",
      url: clipData.url,
      sourceType: "ai_clip",
      sourceClipId: clipId,
      sourceAnalysisId: clipData.analysisId,
      viralScore: clipData.viralScore,
      duration: clipData.duration,
      target_platforms: platforms,
      createdAt: new Date().toISOString(),
      audit: {
        createdBy: userId,
        createdVia: "clip-studio",
        createdAt: new Date().toISOString(),
      },
    };

    // If user is admin, mark content active and create schedule; otherwise mark pending
    if (isAdmin) {
      contentPayload.status = "approved";
    } else {
      contentPayload.status = "approved";
    }

    const contentRef = await db.collection("content").add(contentPayload);
    const contentId = contentRef.id;

    if (isAdmin) {
      // Create promotion schedule for admin users only
      const scheduleTime = scheduledTime || new Date(Date.now() + 3600000).toISOString(); // Default: 1 hour from now
      await db.collection("promotion_schedules").add({
        userId,
        contentId,
        platforms,
        scheduledTime: scheduleTime,
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      logger.info("ClipRoutes.adminExport", { contentId, platforms });

      res.json({
        success: true,
        contentId,
        message: "Clip scheduled for export",
        platforms,
        scheduledTime: scheduleTime,
      });
    } else {
      // Non-admin uploads are pending approval — inform the client and do not create schedules
      logger.info("ClipRoutes.nonAdminExport", { contentId, message: "pending_approval" });
      res.json({
        success: true,
        contentId,
        message: "Clip created and awaiting admin approval before it can be scheduled for posting.",
        platforms,
      });
    }
  } catch (error) {
    logger.error("ClipRoutes.exportError", {
      error: error && error.message ? error.message : error,
    });
    res.status(500).json({ error: "Failed to export clip" });
  }
});

module.exports = router;
