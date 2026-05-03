const express = require("express");
const router = express.Router();
const axios = require("axios");
const videoClippingService = require("../services/videoClippingService");
const authMiddleware = require("../authMiddleware");
const { deductCredits, refundCredits } = require("../creditSystem");
const { db } = require("../firebaseAdmin");
const { cleanupSourceFile } = require("../utils/cleanupSource");
const { CREDIT_COSTS } = require("../config/subscriptionPlans");

const CLIP_ANALYSIS_COST = 0; // Cost per analysis (Phase 1 default)
const MEDIA_WORKER_URL =
  process.env.MEDIA_WORKER_URL || "https://media-worker-v1-341498038874.us-central1.run.app";
const PROMO_SUMMARY_COST = parseInt(
  process.env.SMART_PROMO_SUMMARY_CREDIT_COST || `${CREDIT_COSTS["promo-summary"] || 18}`,
  10
);
const PROMO_SUMMARY_CLIP_COUNT = parseInt(process.env.SMART_PROMO_SUMMARY_CLIP_COUNT || "4", 10);
const PROMO_SUMMARY_RETENTION_HOURS = parseInt(
  process.env.SMART_PROMO_SUMMARY_RETENTION_HOURS || "24",
  10
);

const PROMO_STYLE_MAP = {
  clean: { captionStyle: "minimal", smartCropMode: "speaker_track" },
  hype: { captionStyle: "bold_pop", smartCropMode: "speaker_track" },
  minimal: { captionStyle: "minimal", smartCropMode: "center" },
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const getPromoStyleConfig = style => {
  const key = String(style || "clean").trim().toLowerCase();
  return PROMO_STYLE_MAP[key] || PROMO_STYLE_MAP.clean;
};

const normalizePromoCaption = (value, fallback) => {
  const cleaned = String(value || "")
    .replace(/[#@]/g, " ")
    .replace(/[^a-zA-Z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  const words = cleaned
    .split(" ")
    .map(word => word.trim())
    .filter(Boolean)
    .slice(0, 6);
  if (!words.length) return fallback;
  if (words.length === 1) words.push("Moment");
  return words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const buildPromoCaption = (clip, index) => {
  const text = String(clip?.text || "").trim();
  const reason = String(clip?.reason || "").trim();
  const fallback = `Promo Cut ${index + 1}`;
  if (text) return normalizePromoCaption(text, fallback);
  if (reason) return normalizePromoCaption(reason, fallback);
  return fallback;
};

const getPromoExpiresAtIso = () =>
  new Date(Date.now() + PROMO_SUMMARY_RETENTION_HOURS * 60 * 60 * 1000).toISOString();

const sanitizeErrorMessage = error => {
  const rawMessage =
    typeof error === "string" ? error : typeof error?.message === "string" ? error.message : "unknown_error";
  return rawMessage.replace(/[\r\n\t]+/g, " ").slice(0, 240).trim() || "unknown_error";
};

async function persistPromoSummaryOutputs(docRef, data) {
  if (data.outputsPersistedAt) return data;

  const renderedClips = (Array.isArray(data.clips) ? data.clips : [])
    .filter(clip => clip?.rendered && clip?.url)
    .slice(0, PROMO_SUMMARY_CLIP_COUNT);

  if (!renderedClips.length) {
    throw new Error("Promo generation completed without usable clips");
  }

  const nowIso = new Date().toISOString();
  const expiresAt = getPromoExpiresAtIso();
  const batch = db.batch();
  const generatedClipIds = [];
  const promoClips = [];

  renderedClips.forEach((clip, index) => {
    const clipId = `promo-${docRef.id}-${index + 1}`;
    const promoCaption = buildPromoCaption(clip, index);
    const payload = {
      id: clipId,
      userId: data.userId,
      url: clip.url,
      storagePath: clip.storagePath || null,
      title: promoCaption,
      description: clip.reason || "AI-generated promotional clip",
      promoCaption,
      createdAt: nowIso,
      expiresAt,
      sourceType: "promo_summary_clip",
      sourceContext: "smart_promo_summary",
      sourceAnalysisId: docRef.id,
      sourceClipId: clip.id || `clip-${index + 1}`,
      contentId: data.contentId || null,
      viralScore: clip.viralScore || null,
      duration: clip.duration || data.targetDurationSeconds || null,
      promoStyle: data.style || "clean",
      promoDurationSeconds: data.targetDurationSeconds || null,
      downloadAvailable: true,
      type: "video",
    };

    batch.set(db.collection("generated_clips").doc(clipId), payload);
    batch.set(db.collection("content").doc(clipId), payload);
    generatedClipIds.push(clipId);
    promoClips.push(payload);
  });

  batch.set(
    docRef,
    {
      outputsPersistedAt: nowIso,
      generatedClipIds,
      generatedClipsCount: generatedClipIds.length,
      promoClips,
      expiresAt,
    },
    { merge: true }
  );

  await batch.commit();

  let sourceCleanupStatus = "not_requested";
  if (data.cleanupTempSourceOnComplete && data.videoUrl) {
    const cleanupResult = await cleanupSourceFile(data.videoUrl, {
      currentPlatform: "smart_promo_summary",
    });
    sourceCleanupStatus = cleanupResult?.status || "unknown";
    await docRef.set(
      {
        sourceCleanupStatus,
        sourceCleanedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  return {
    ...data,
    outputsPersistedAt: nowIso,
    generatedClipIds,
    generatedClipsCount: generatedClipIds.length,
    promoClips,
    expiresAt,
    sourceCleanupStatus,
  };
}

async function refundPromoSummaryJob(docRef, data, reason = "processing_failed") {
  if (!data?.billing?.charged || data?.billing?.refundedAt) {
    return data;
  }

  const refundResult = await refundCredits(
    data.userId,
    {
      amount: data.billing.cost || 0,
      deducted: data.billing.cost || 0,
      fromMonthly: data.billing.fromMonthly || 0,
      fromTopUp: data.billing.fromTopUp || 0,
      monthKey: data.billing.monthKey,
    },
    "promo-summary-refund",
    {
      jobId: docRef.id,
      reason,
    }
  );

  const refundAt = new Date().toISOString();
  await docRef.set(
    {
      billing: {
        ...data.billing,
        refundedAt: refundAt,
        refundReason: reason,
        refundSuccess: !!refundResult.success,
      },
    },
    { merge: true }
  );

  if (data.cleanupTempSourceOnComplete && data.videoUrl) {
    await cleanupSourceFile(data.videoUrl, {
      currentPlatform: "smart_promo_summary_failed",
    }).catch(() => {});
  }

  return {
    ...data,
    billing: {
      ...data.billing,
      refundedAt: refundAt,
      refundReason: reason,
      refundSuccess: !!refundResult.success,
    },
  };
}

async function reconcilePromoSummaryJob(docRef, data) {
  if (!data || data.type !== "promo_summary") {
    return data;
  }

  if (data.status === "completed" && !data.outputsPersistedAt) {
    try {
      return await persistPromoSummaryOutputs(docRef, data);
    } catch (error) {
      await docRef.set(
        {
          status: "failed",
          error: error.message,
          failedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      const failedData = {
        ...data,
        status: "failed",
        error: error.message,
      };
      return refundPromoSummaryJob(docRef, failedData, "persist_failed");
    }
  }

  if (data.status === "failed") {
    return refundPromoSummaryJob(docRef, data, data.error || "worker_failed");
  }

  return data;
}

async function monitorPromoSummaryJob(jobId) {
  const jobRef = db.collection("clip_analyses").doc(jobId);

  for (let attempt = 0; attempt < 720; attempt += 1) {
    const snap = await jobRef.get();
    if (!snap.exists) return;
    const data = snap.data() || {};

    if (data.outputsPersistedAt || data.billing?.refundedAt) {
      return;
    }

    if (data.status === "completed" || data.status === "failed") {
      await reconcilePromoSummaryJob(jobRef, data);
      return;
    }

    await sleep(5000);
  }

  const timeoutSnap = await jobRef.get();
  if (!timeoutSnap.exists) return;
  const timeoutData = timeoutSnap.data() || {};
  if (timeoutData.outputsPersistedAt || timeoutData.billing?.refundedAt) return;

  await jobRef.set(
    {
      status: "failed",
      error: "Promo summary timed out while waiting for worker completion.",
      failedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  await refundPromoSummaryJob(
    jobRef,
    {
      ...timeoutData,
      status: "failed",
      error: "Promo summary timed out while waiting for worker completion.",
    },
    "timeout"
  );
}

/**
 * @route POST /analyze
 * @desc Analyze video for clips (Deducts credits)
 * @access Private
 */
router.post("/analyze", authMiddleware, async (req, res) => {
  const { videoUrl, contentId } = req.body;
  const userId = req.user.uid;

  console.log(`[ClipRoute] Request from ${userId} for ${contentId}`);

  if (!videoUrl || !contentId) {
    return res.status(400).json({ error: "Missing videoUrl or contentId" });
  }

  try {
    // 1. Check & Deduct Credits
    // returns { success: true, remaining: X } or { success: false, message: ... }
    const creditResult = await deductCredits(userId, CLIP_ANALYSIS_COST);

    if (!creditResult.success && CLIP_ANALYSIS_COST > 0) {
      console.warn(`[ClipRoute] Insufficient credits for ${userId}`);
      return res.status(402).json({
        error: "Insufficient credits",
        required: CLIP_ANALYSIS_COST,
        details: creditResult.message,
      });
    }

    console.log(`[ClipRoute] Credits deducted. Remaining: ${creditResult.remaining}`);

    // Call Process Async
    // Now returns jobId immediately
    const result = await videoClippingService.startAnalysis(videoUrl, contentId, userId);

    // 3. Return result with remaining credits info
    res.json({
      success: true,
      analysisId: result, // This is the job ID
      // Optional: keep 'data' field for compatibility if frontend expects immediate result
      // but frontend should check status now.
      message: "Analysis started successfully. Poll /status/{analysisId} for progress.",
      creditsRemaining: creditResult.remaining,
      async: true, // Tell frontend expecting immediate result that this is async
    });
  } catch (error) {
    console.error("[ClipRoute] Error:", error.message);
    res.status(500).json({ error: "Analysis failed", details: error.message });
  }
});

/**
 * @route POST /generate
 * @desc Generate (Render) a specific clip from analysis
 */
router.post("/generate", authMiddleware, async (req, res) => {
  const { analysisId, clipId, isMontage, montageSegments, options } = req.body;
  const userId = req.user.uid;

  console.log(`[ClipRoute] Generate request for analysis ${analysisId} (Montage: ${isMontage})`);

  if (!analysisId) {
    return res.status(400).json({ error: "Missing analysisId" });
  }

  if (!isMontage && !clipId) {
    return res.status(400).json({ error: "Missing clipId for single clip generation" });
  }

  try {
    // Note: Rendering consumes "server time" credits potentially, but for Phase 1 we'll skip deduction
    // or assume analysis cost covers it.

    // Pass everything to service
    const result = await videoClippingService.generateClip(
      userId,
      analysisId,
      clipId,
      options,
      isMontage,
      montageSegments
    );

    res.json({
      success: true,
      message: "Clip generated successfully",
      data: result,
    });
  } catch (error) {
    console.error("[ClipRoute] Generate Error:", error.message);
    res.status(500).json({ error: "Clip generation failed", details: error.message });
  }
});

const getUserAnalyses = async (req, res) => {
  const userId = req.user.uid;
  try {
    const snapshot = await db
      .collection("clip_analyses")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const history = [];
    snapshot.forEach(doc => {
      // Clean up fields for frontend
      const data = doc.data();
      history.push({
        id: doc.id,
        ...data,
        // Calculate generated clips count for display
        clipCount: (data.clipSuggestions || []).length,
      });
    });

    res.json({ clips: history });
  } catch (error) {
    console.error("[ClipRoute] Analysis History error:", error);
    res.status(500).json({ error: "Failed to fetch analysis history" });
  }
};

/**
 * @route GET /history
 * @desc Get user's clip analysis history
 */
router.get("/history", authMiddleware, getUserAnalyses);

/**
 * @route GET /user
 * @desc Get user's GENERATED clips (the ones they chose to keep)
 * @access Private
 */
router.get("/user", authMiddleware, async (req, res) => {
  const userId = req.user.uid;
  try {
    const snapshot = await db
      .collection("content")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const clips = [];
    const now = new Date();

    snapshot.forEach(doc => {
      const data = doc.data();
      if (!["ai_clip", "promo_summary_clip"].includes(String(data.sourceType || ""))) return;
      // Filter out expired clips if an expiration date is set
      if (data.expiresAt) {
        const expiry = new Date(data.expiresAt);
        if (expiry < now) return;
        data.expiresInMs = Math.max(0, expiry.getTime() - now.getTime());
      }
      clips.push({ id: doc.id, ...data });
    });

    res.json({ clips, count: clips.length });
  } catch (error) {
    console.error("[ClipRoute] Generated Clips error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fetch generated clips", details: error.message });
    }
  }
});

/**
 * @route GET /analysis/:id
 * @desc Get specific analysis result
 * @access Private
 */
router.get("/analysis/:id", authMiddleware, async (req, res) => {
  try {
    const docRef = db.collection("clip_analyses").doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Analysis not found" });
    }

    // Ensure user owns it
    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const reconciled = await reconcilePromoSummaryJob(docRef, doc.data());
    res.json({ analysis: { id: doc.id, ...reconciled } });
  } catch (error) {
    console.error("Fetch analysis error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route POST /promo-summary
 * @desc Generate multiple short promo clips with auto story captions
 * @access Private
 */
router.post("/promo-summary", authMiddleware, async (req, res) => {
  const {
    videoUrl,
    contentId = null,
    durationSeconds = 30,
    style = "clean",
    sourceStoragePath = null,
  } = req.body || {};
  const userId = req.user.uid;

  const targetDurationSeconds = [15, 30, 60].includes(Number(durationSeconds))
    ? Number(durationSeconds)
    : 30;
  const normalizedStyle = String(style || "clean").trim().toLowerCase();
  const styleConfig = getPromoStyleConfig(normalizedStyle);

  if (!videoUrl) {
    return res.status(400).json({ error: "Missing videoUrl" });
  }

  try {
    const credits = await deductCredits(userId, PROMO_SUMMARY_COST, "promo-summary");
    if (!credits.success) {
      return res.status(402).json({
        error: "Insufficient credits",
        message: "Smart Promo Summary is a premium feature and requires credits.",
        required: PROMO_SUMMARY_COST,
        remaining: credits.remaining || 0,
      });
    }

    const jobId = `promo-${Date.now()}-${userId.slice(0, 6)}`;
    await db
      .collection("clip_analyses")
      .doc(jobId)
      .set({
        userId,
        videoUrl,
        contentId,
        type: "promo_summary",
        status: "queued",
        progress: 0,
        phase: "queued",
        requestedClipCount: PROMO_SUMMARY_CLIP_COUNT,
        targetDurationSeconds,
        style: normalizedStyle,
        captionStyle: styleConfig.captionStyle,
        smartCropMode: styleConfig.smartCropMode,
        clips: [],
        createdAt: new Date().toISOString(),
        cleanupTempSourceOnComplete: Boolean(
          sourceStoragePath &&
            /^(temp_uploads|temp_sources)\//.test(String(sourceStoragePath))
        ),
        sourceStoragePath: sourceStoragePath || null,
        billing: {
          charged: true,
          cost: PROMO_SUMMARY_COST,
          chargedAt: new Date().toISOString(),
          fromMonthly: credits.fromMonthly || 0,
          fromTopUp: credits.fromTopUp || 0,
          monthKey: credits.monthKey || new Date().toISOString().slice(0, 7),
        },
      });

    axios
      .post(
        `${MEDIA_WORKER_URL}/auto-generate-clips`,
        {
          video_url: videoUrl,
          job_id: jobId,
          max_clips: PROMO_SUMMARY_CLIP_COUNT,
          target_duration: targetDurationSeconds,
          caption_style: styleConfig.captionStyle,
          smart_crop_mode: styleConfig.smartCropMode,
          target_aspect_ratio: "9:16",
          template: normalizedStyle === "hype" ? "reaction" : normalizedStyle === "minimal" ? "tutorial" : "story",
        },
        { timeout: 600000 }
      )
      .catch(async error => {
        const safeWorkerError = sanitizeErrorMessage(error);
        console.error("[ClipRoute] Promo summary worker call failed", {
          jobId,
          message: safeWorkerError,
        });
        await db
          .collection("clip_analyses")
          .doc(jobId)
          .set(
            {
              status: "failed",
              error: safeWorkerError,
              failedAt: new Date().toISOString(),
            },
            { merge: true }
          )
          .catch(() => {});
      });

    monitorPromoSummaryJob(jobId).catch(error => {
      console.error("[ClipRoute] Promo summary monitor failed", {
        jobId,
        message: sanitizeErrorMessage(error),
      });
    });

    res.json({
      success: true,
      jobId,
      cost: PROMO_SUMMARY_COST,
      creditsRemaining: credits.remaining,
      clipCount: PROMO_SUMMARY_CLIP_COUNT,
      message: "Smart Promo Summary started.",
    });
  } catch (error) {
    console.error("[ClipRoute] Promo summary error", {
      message: sanitizeErrorMessage(error),
    });
    res.status(500).json({ error: "Smart Promo Summary failed" });
  }
});

/**
 * @route POST /:clipId/export
 * @desc Export a specific clip to the Content Library for posting
 * @access Private
 */
router.post("/:clipId/export", authMiddleware, async (req, res) => {
  try {
    const { clipId } = req.params;
    const { platforms = [], scheduledTime, caption } = req.body;
    const userId = req.user.uid;

    if (!clipId) return res.status(400).json({ error: "Clip ID required" });

    // 1. Find the Analysis containing this clip
    // Optimally, we should find which analysis doc has this clip.
    // Since Phase 1 stores clips inside the 'clip_analyses' doc in 'clipSuggestions' array,
    // we might need to search or pass the analysisId.
    // For simplicity in Phase 1, we'll assume the client sends the analysisId or we query for it.
    // Use a Collection Group Query if needed, or just assume analysisId is passed in body for efficiency.

    let analysisId = req.body.analysisId;
    let clipData = null;
    let analysisDoc = null;

    if (analysisId) {
      analysisDoc = await db.collection("clip_analyses").doc(analysisId).get();
      if (analysisDoc.exists) {
        const data = analysisDoc.data();
        clipData = data.clipSuggestions.find(c => c.id === clipId);
      }
    } else {
      // Fallback: This is expensive, better to pass analysisId
      const snapshot = await db
        .collection("clip_analyses")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();

      for (const doc of snapshot.docs) {
        const found = (doc.data().clipSuggestions || []).find(c => c.id === clipId);
        if (found) {
          clipData = found;
          analysisDoc = doc;
          analysisId = doc.id;
          break;
        }
      }
    }

    if (!clipData) {
      return res.status(404).json({ error: "Clip not found" });
    }

    // 2. Create Content Entry
    const contentPayload = {
      userId,
      title: caption || clipData.text || `Clip ${clipId}`,
      description: caption || clipData.reason || "",
      type: "video",
      url: analysisDoc.data().videoUrl, // Use original video URL for now, Phase 2 will duplicate/trim
      sourceType: "ai_clip",
      sourceClipId: clipId,
      sourceAnalysisId: analysisId,
      virtualClip: {
        // Store start/end times for the player to handle
        start: clipData.start,
        end: clipData.end,
        duration: clipData.duration,
      },
      viralScore: clipData.viralScore,
      target_platforms: platforms,
      status: "approved", // auto-approve generated content
      createdAt: new Date().toISOString(),
      sourceContext: "clip_studio",
    };

    const contentRef = await db.collection("content").add(contentPayload);

    // 3. Create Schedule if requested
    if (scheduledTime) {
      await db.collection("promotion_schedules").add({
        userId,
        contentId: contentRef.id,
        platforms,
        scheduledTime,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      contentId: contentRef.id,
      message: "Clip exported to Content Library",
    });
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: "Export failed" });
  }
});

/**
 * @route POST /memetic/seed
 * @desc Start a memetic experiment (seed phase)
 * @access Private
 */
router.post("/memetic/seed", authMiddleware, async (req, res) => {
  const { plan, options, contentId } = req.body;
  // Use user id from auth middleware
  const userId = req.user.uid;

  if (!plan || !Array.isArray(plan)) {
    return res.status(400).json({ error: "Plan array is required" });
  }

  try {
    // 1. If contentId is provided, enforce ownership
    if (contentId) {
      const contentDoc = await db.collection("content").doc(contentId).get();
      if (!contentDoc.exists) {
        return res.status(404).json({ error: "Content not found" });
      }
      const data = contentDoc.data();
      // Handle legacy 'user_id' vs 'userId'
      const owner = data.user_id || data.userId;
      if (owner !== userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
    }

    // 2. Create experiment doc
    const experimentData = {
      userId,
      plan,
      options: options || {},
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    if (contentId) {
      experimentData.contentId = contentId;
    }

    const docRef = await db.collection("memetic_experiments").add(experimentData);

    res.json({
      success: true,
      experimentId: docRef.id,
    });
  } catch (error) {
    console.error("[ClipRoute] Memetic seed error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @route POST /auto-generate
 * @desc One-click: analyze video + render top clips automatically
 * @access Private
 */
router.post("/auto-generate", authMiddleware, async (req, res) => {
  const {
    videoUrl,
    contentId,
    maxClips = 5,
    captionStyle = "bold_pop",
    smartCropMode = "center",
    targetAspectRatio = "9:16",
    template = "",
  } = req.body;
  const userId = req.user.uid;

  if (!videoUrl) {
    return res.status(400).json({ error: "Missing videoUrl" });
  }

  try {
    const jobId = `autogen-${Date.now()}-${userId.slice(0, 6)}`;

    // Create tracking doc immediately
    await db
      .collection("clip_analyses")
      .doc(jobId)
      .set({
        userId,
        videoUrl,
        contentId: contentId || null,
        type: "auto_generate",
        status: "processing",
        maxClips,
        captionStyle,
        smartCropMode,
        template,
        clips: [],
        createdAt: new Date().toISOString(),
      });

    // Fire-and-forget to Python worker
    const MEDIA_WORKER_URL = process.env.MEDIA_WORKER_URL || "http://127.0.0.1:8000";
    const axios = require("axios");
    axios
      .post(
        `${MEDIA_WORKER_URL}/auto-generate-clips`,
        {
          video_url: videoUrl,
          job_id: jobId,
          max_clips: Math.min(Number(maxClips) || 5, 10),
          caption_style: captionStyle,
          smart_crop_mode: smartCropMode,
          target_aspect_ratio: targetAspectRatio,
          template,
        },
        { timeout: 600000 }
      )
      .catch(err => {
        console.error(`[ClipRoute] Auto-generate worker call failed: ${err.message}`);
        db.collection("clip_analyses")
          .doc(jobId)
          .update({ status: "failed", error: err.message })
          .catch(() => {});
      });

    res.json({
      success: true,
      jobId,
      message: "Auto-generation started. Poll /analysis/{jobId} for status.",
      async: true,
    });
  } catch (error) {
    console.error("[ClipRoute] Auto-generate error:", error.message);
    res.status(500).json({ error: "Auto-generate failed", details: error.message });
  }
});

/**
 * @route GET /templates
 * @desc Get available clip templates, caption styles, and platform presets
 * @access Private
 */
router.get("/templates", authMiddleware, async (req, res) => {
  try {
    const MEDIA_WORKER_URL = process.env.MEDIA_WORKER_URL || "http://127.0.0.1:8000";
    const axios = require("axios");
    const response = await axios.get(`${MEDIA_WORKER_URL}/clip-templates`, { timeout: 10000 });
    res.json({ success: true, ...response.data });
  } catch (error) {
    // Fallback: return hardcoded templates if worker is down
    res.json({
      success: true,
      templates: {
        podcast: {
          label: "Podcast / Interview",
          aspect_ratio: "9:16",
          caption_style: "bold_pop",
          smart_crop_mode: "speaker_track",
          auto_captions: true,
          description: "Speaker-tracking crop with bold captions.",
        },
        gaming: {
          label: "Gaming Highlights",
          aspect_ratio: "9:16",
          caption_style: "glow",
          smart_crop_mode: "center",
          auto_captions: true,
          description: "High-energy with neon glow captions.",
        },
        tutorial: {
          label: "Tutorial / How-To",
          aspect_ratio: "9:16",
          caption_style: "minimal",
          smart_crop_mode: "center",
          auto_captions: true,
          description: "Clean minimal captions.",
        },
        reaction: {
          label: "Reaction / Commentary",
          aspect_ratio: "9:16",
          caption_style: "bounce",
          smart_crop_mode: "speaker_track",
          auto_captions: true,
          description: "Bouncy animated captions following the speaker.",
        },
        story: {
          label: "Story / Vlog",
          aspect_ratio: "9:16",
          caption_style: "karaoke",
          smart_crop_mode: "speaker_track",
          auto_captions: true,
          description: "Karaoke-style word-by-word captions.",
        },
      },
      caption_styles: {
        bold_pop: { label: "Bold Pop", animation: "scale_pop" },
        karaoke: { label: "Karaoke Highlight", animation: "karaoke_fill" },
        glow: { label: "Neon Glow", animation: "glow_pulse" },
        bounce: { label: "Bounce", animation: "bounce_word" },
        minimal: { label: "Minimal Clean", animation: "fade_word" },
      },
      platform_presets: {
        tiktok: { max_duration: 60, aspect_ratio: "9:16" },
        youtube_shorts: { max_duration: 58, aspect_ratio: "9:16" },
        instagram_reels: { max_duration: 90, aspect_ratio: "9:16" },
        instagram_feed: { max_duration: 60, aspect_ratio: "1:1" },
        youtube: { max_duration: null, aspect_ratio: "16:9" },
        facebook: { max_duration: 60, aspect_ratio: "9:16" },
      },
    });
  }
});

module.exports = router;
