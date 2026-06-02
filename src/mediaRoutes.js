const express = require("express");
const router = express.Router();
const multer = require("multer");
const axios = require("axios");
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");
// Import as class to instantiate per request or use singleton if it's stateless
// The service file exports an instance by default? No, let's check.
const VideoEditingService = require("./services/videoEditingService");
const videoEditingService = new VideoEditingService(); // Instantiate for general use

const authMiddleware = require("./authMiddleware");
const { deductCredits, refundCredits, getCreditBreakdown } = require("./creditSystem");
const {
  CREDIT_COSTS,
  CREDIT_TOP_UP_PACKS,
  getPlanCapabilities,
} = require("./config/subscriptionPlans");
const { getEffectiveTierSnapshot } = require("./services/billingService");
const MEDIA_WORKER_URL =
  process.env.MEDIA_WORKER_URL || "https://media-worker-v1-341498038874.us-central1.run.app";
const LOCAL_MEDIA_WORKER_URL = process.env.LOCAL_MEDIA_WORKER_URL || "http://127.0.0.1:8000";
const CAM_COMBINER_WORKER_URL =
  process.env.CAM_COMBINER_WORKER_URL || process.env.MULTICAM_WORKER_URL || MEDIA_WORKER_URL;
const LOCAL_CAM_COMBINER_WORKER_URL =
  process.env.LOCAL_CAM_COMBINER_WORKER_URL || LOCAL_MEDIA_WORKER_URL;
const IS_PRODUCTION_RUNTIME =
  process.env.NODE_ENV === "production" || !!process.env.RENDER || !!process.env.K_SERVICE;
const ALLOW_LOCAL_WORKER_FALLBACK =
  process.env.ALLOW_LOCAL_WORKER_FALLBACK === "true" ||
  (!IS_PRODUCTION_RUNTIME && process.env.ALLOW_LOCAL_WORKER_FALLBACK !== "false");
const VIDEO_EDITOR_CREDITS_DISABLED = process.env.DISABLE_VIDEO_EDITOR_CREDITS === "true";
const MULTICAM_MAX_RENDER_SECONDS = parseInt(
  process.env.MULTICAM_MAX_RENDER_SECONDS || String(20 * 60),
  10
) || 20 * 60;

const normalizeMulticamRenderTier = value => {
  const tier = String(value || "premium").trim().toLowerCase().replace(/-/g, "_");
  return ["simple", "premium", "studio"].includes(tier) ? tier : "premium";
};

const estimateMulticamRenderCredits = ({ renderTier, baseCost }) => {
  const safeBase = Number(baseCost || 15);
  const tier = normalizeMulticamRenderTier(renderTier);
  if (tier === "simple") return Math.max(8, Math.round(safeBase * 0.67));
  if (tier === "studio") return Math.max(safeBase + 8, Math.ceil(safeBase * 1.6));
  return safeBase;
};

const estimateCleanAudioSyncCredits = ({ sources = [], externalAudio = {} }) => {
  const videoSources = Array.isArray(sources) ? sources : [];
  const longestDuration = Math.max(
    0,
    ...videoSources.map(source => Number(source.duration || source.duration_seconds || 0)),
    Number(externalAudio.duration || externalAudio.duration_seconds || 0)
  );
  const totalBytes =
    videoSources.reduce((sum, source) => sum + Math.max(0, Number(source.size || 0)), 0) +
    Math.max(0, Number(externalAudio.size || 0));
  const durationMinutes = Math.max(1, longestDuration / 60);
  return Math.max(18, Math.ceil(10 + videoSources.length * 6 + durationMinutes * 1.25 + totalBytes / (1024 * 1024 * 1024) * 4));
};

const shouldRetryWithLocalWorker = error => {
  const status = error.response?.status;
  const code = error.code;
  return (
    status === 404 ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED"
  );
};

const postToWorker = async (
  endpoint,
  payload,
  timeout = 120000,
  primaryWorkerUrl = MEDIA_WORKER_URL,
  localWorkerUrl = LOCAL_MEDIA_WORKER_URL
) => {
  try {
    return await axios.post(`${primaryWorkerUrl}${endpoint}`, payload, { timeout });
  } catch (error) {
    const canFallback =
      ALLOW_LOCAL_WORKER_FALLBACK &&
      localWorkerUrl &&
      localWorkerUrl !== primaryWorkerUrl &&
      shouldRetryWithLocalWorker(error);

    if (!canFallback) throw error;

    console.warn(
      `[MediaRoute] Falling back to local worker for ${endpoint}. Primary worker: ${primaryWorkerUrl}`
    );
    return axios.post(`${localWorkerUrl}${endpoint}`, payload, { timeout });
  }
};

const postToMediaWorker = async (endpoint, payload, timeout = 120000) =>
  postToWorker(endpoint, payload, timeout);

const postToCamCombinerWorker = async (endpoint, payload, timeout = 120000) =>
  postToWorker(
    endpoint,
    payload,
    timeout,
    CAM_COMBINER_WORKER_URL,
    LOCAL_CAM_COMBINER_WORKER_URL
  );

const getFromMediaWorker = async (endpoint, timeout = 15000) => {
  try {
    return await axios.get(`${MEDIA_WORKER_URL}${endpoint}`, { timeout });
  } catch (error) {
    const canFallback =
      ALLOW_LOCAL_WORKER_FALLBACK &&
      LOCAL_MEDIA_WORKER_URL &&
      LOCAL_MEDIA_WORKER_URL !== MEDIA_WORKER_URL &&
      shouldRetryWithLocalWorker(error);

    if (!canFallback) throw error;

    console.warn(
      `[MediaRoute] Falling back to local worker for ${endpoint}. Primary worker: ${MEDIA_WORKER_URL}`
    );
    return axios.get(`${LOCAL_MEDIA_WORKER_URL}${endpoint}`, { timeout });
  }
};

const getFromCamCombinerWorker = async (endpoint, timeout = 15000) => {
  try {
    return await axios.get(`${CAM_COMBINER_WORKER_URL}${endpoint}`, { timeout });
  } catch (error) {
    const canFallback =
      ALLOW_LOCAL_WORKER_FALLBACK &&
      LOCAL_CAM_COMBINER_WORKER_URL &&
      LOCAL_CAM_COMBINER_WORKER_URL !== CAM_COMBINER_WORKER_URL &&
      shouldRetryWithLocalWorker(error);

    if (!canFallback) throw error;

    console.warn(
      `[MediaRoute] Falling back to local Cam Combiner worker for ${endpoint}. Primary worker: ${CAM_COMBINER_WORKER_URL}`
    );
    return axios.get(`${LOCAL_CAM_COMBINER_WORKER_URL}${endpoint}`, { timeout });
  }
};

const chargeVideoEditorCredits = async (userId, amount, routeName) => {
  if (VIDEO_EDITOR_CREDITS_DISABLED) {
    console.log(
      `[MediaRoute] Credit billing bypassed for ${routeName}. User ${userId}, amount ${amount}`
    );
    return { success: true, remaining: null, skipped: true };
  }

  return deductCredits(userId, amount, routeName);
};

const toIsoString = value => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
};

const normalizeRenderJob = (doc, data = {}) => {
  const result = data.result || {};
  const outputUrl =
    data.outputUrl || data.output_url || result.url || result.output_url || result.firebase_output_url || null;
  const thumbnailUrl =
    data.thumbnailUrl || data.thumbnail_url || result.thumbnailUrl || result.thumbnail_url || null;
  return {
    jobId: data.jobId || doc.id,
    type: data.type || data.feature || "media_job",
    status: data.status || "queued",
    stage: data.stage || null,
    progress: Number(data.progress || 0),
    outputUrl,
    output_url: outputUrl,
    thumbnailUrl,
    thumbnail_url: thumbnailUrl,
    duration: data.duration || result.duration || 0,
    renderTier: data.renderTier || result.renderTier || result.render_tier || null,
    expiresAt: toIsoString(data.expiresAt || result.expiresAt || result.expires_at),
    retentionDays: data.retentionDays || result.retention_days || null,
    createdAt: toIsoString(data.createdAt || data.created_at),
    completedAt: toIsoString(data.completedAt || data.completed_at),
    detail: data.detail || data.message || null,
    error: data.error || null,
  };
};

const isFailedJobStatus = status => {
  const normalized = String(status || "").toLowerCase();
  return normalized === "failed" || normalized.endsWith("_failed") || normalized.includes("failed");
};

const isRefundableCleanAudioSyncStatus = status => {
  const normalized = String(status || "").toLowerCase();
  return isFailedJobStatus(normalized) || normalized === "sync_low_confidence";
};

const refundCleanAudioSyncJobIfNeeded = async (userId, jobId, data, reason = "worker_failed") => {
  if (
    !userId ||
    !jobId ||
    data?.feature !== "clean-audio-sync" ||
    !isRefundableCleanAudioSyncStatus(data?.status) ||
    !data?.creditRefund ||
    data?.creditsRefunded
  ) {
    return null;
  }

  const refundResult = await refundCredits(userId, data.creditRefund, "clean-audio-sync-refund", {
    jobId,
    reason,
  });

  if (refundResult.success) {
    await admin.firestore().collection("video_edits").doc(jobId).set(
      {
        creditsRefunded: true,
        creditRefundedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundReason: reason,
      },
      { merge: true }
    );
  }

  return refundResult;
};

const getRequestedMulticamDuration = body => {
  const candidates = [
    body?.overlapDuration,
    body?.overlap_duration,
    body?.timelineDuration,
    body?.timeline_duration,
    body?.duration,
  ];
  return Math.max(0, ...candidates.map(value => Number(value || 0)).filter(Number.isFinite));
};

// Configure Multer (Buffer storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB Limit
});

// Middleware to verify Firebase Token and attach user
// Replaced local 'protect' with standard 'authMiddleware' for consistency
router.use(authMiddleware);

// Route: GET /api/media/credits
// Returns the user's credit breakdown (monthly + top-up) and cost table
router.get("/credits", async (req, res) => {
  try {
    const userId = req.user.uid;
    const breakdown = await getCreditBreakdown(userId);
    res.json({
      success: true,
      balance: breakdown.totalAvailable,
      monthly: {
        allocation: breakdown.monthlyAllocation,
        used: breakdown.monthlyUsed,
        remaining: breakdown.monthlyRemaining,
      },
      topUp: breakdown.topUpBalance,
      tier: breakdown.tier,
      localCreditBypass: breakdown.localCreditBypass || false,
      costs: CREDIT_COSTS,
      topUpPacks: CREDIT_TOP_UP_PACKS,
      entitlements: getPlanCapabilities(breakdown.tier),
    });
  } catch (error) {
    console.error("[MediaRoute] Credit balance error:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch credit balance" });
  }
});

router.get("/worker-health", async (_req, res) => {
  try {
    const response = await getFromMediaWorker("/health", 10000);
    res.json({
      ok: true,
      worker: response.data || null,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      message: "Media worker is not reachable right now. Please try again in a moment.",
      details: error.response?.data?.detail || error.message,
    });
  }
});

// Route: POST /api/media/estimate
// Returns cost estimate for a set of operations BEFORE processing
router.post("/estimate", async (req, res) => {
  try {
    const userId = req.user.uid;
    const operations = Array.isArray(req.body?.operations) ? req.body.operations : [];
    const breakdown = await getCreditBreakdown(userId);

    let totalCost = 0;
    const items = [];
    for (const op of operations) {
      const cost = CREDIT_COSTS[op] || 0;
      if (cost > 0) {
        items.push({ operation: op, credits: cost });
        totalCost += cost;
      }
    }

    const canAfford = breakdown.totalAvailable >= totalCost;

    res.json({
      success: true,
      items,
      totalCost,
      balance: breakdown.totalAvailable,
      monthly: {
        allocation: breakdown.monthlyAllocation,
        remaining: breakdown.monthlyRemaining,
      },
      topUp: breakdown.topUpBalance,
      localCreditBypass: breakdown.localCreditBypass || false,
      canAfford,
      deficit: canAfford ? 0 : totalCost - breakdown.totalAvailable,
      topUpPacks: canAfford ? undefined : CREDIT_TOP_UP_PACKS,
    });
  } catch (error) {
    console.error("[MediaRoute] Estimate error:", error.message);
    res.status(500).json({ success: false, message: "Failed to estimate costs" });
  }
});

// Route: POST /api/media/transcribe
// Handles file upload -> Firebase Storage -> Python Worker -> Returns Captions
router.post("/transcribe", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const userId = req.user.uid;
    const bucket = admin.storage().bucket();
    const filename = `temp_transcribe/${userId}/${uuidv4()}_${req.file.originalname}`;
    const blob = bucket.file(filename);

    console.log(`[MediaRoute] Uploading file for transcription: ${filename}`);

    // 1. Upload to Firebase Storage
    const blobStream = blob.createWriteStream({
      metadata: { contentType: req.file.mimetype },
    });

    blobStream.on("error", err => {
      console.error(err);
      res.status(500).json({ error: "Upload to storage failed" });
    });

    blobStream.on("finish", async () => {
      // 2. Get Signed URL (or make public? Signed is safer)
      // Python worker needs to access it.
      const [url] = await blob.getSignedUrl({
        action: "read",
        expires: Date.now() + 1000 * 60 * 60, // 1 hour
      });

      console.log(`[MediaRoute] File uploaded. Sending to Python Worker...`);

      // 3. Call Service (Async Job)
      try {
        // Old sync: const segments = await videoEditingService.transcribeVideo(url);
        const job = await videoEditingService.startTranscriptionJob(url, userId);
        res.json({ success: true, jobId: job.jobId, message: "Transcription started" });
      } catch (err) {
        res.status(500).json({ error: "Transcription service failed: " + err.message });
      }
    });

    blobStream.end(req.file.buffer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Route: POST /api/media/process
// Body: { fileUrl: "...", options: { smartCrop: true, silenceRemoval: true, ... } }
router.post("/process", async (req, res) => {
  const userId = req.user.uid;
  const { fileUrl, options } = req.body;
  console.log("[MediaRoute] Received request:", { fileUrl, options });
  const cost = CREDIT_COSTS.process || 10;

  if (!fileUrl) {
    return res.status(400).json({ message: "No file provided" });
  }

  // 1. Deduct Credits
  try {
    const result = await chargeVideoEditorCredits(userId, cost, "process");
    if (!result.success) {
      return res.status(403).json({
        message: `This operation costs ${cost} credits. You have ${result.remaining || 0} credits available.`,
        required: cost,
        remaining: result.remaining || 0,
        monthlyRemaining: result.monthlyRemaining,
        topUpBalance: result.topUpBalance,
        tier: result.tier,
        topUpPacks: CREDIT_TOP_UP_PACKS,
      });
    }

    // 2. Delegate to Service (Async Job Queue)
    // Old sync method: const processResult = await videoEditingService.processVideo(fileUrl, options, userId);
    // New async method: returns { jobId }
    const job = await videoEditingService.startProcessingJob(fileUrl, options, userId);

    // 3. Return Job ID + remaining credits (or defer credit check)
    // Note: The frontend needs to poll /status/:jobId now.
    res.json({
      success: true,
      jobId: job.jobId,
      message: "Processing started",
      remainingCredits: result.remaining,
      billingDisabled: !!result.skipped,
    });
  } catch (error) {
    console.error("[MediaRoute] Processing error:", error.message);
    res.status(500).json({ message: "Media processing failed", details: error.message });
  }
});

router.post("/extract-audio", async (req, res) => {
  const userId = req.user.uid;
  const fileUrl = typeof req.body?.fileUrl === "string" ? req.body.fileUrl.trim() : "";
  const sourceLabel = typeof req.body?.sourceLabel === "string" ? req.body.sourceLabel.trim() : "";

  if (!fileUrl) {
    return res.status(400).json({ message: "No file provided" });
  }

  try {
    const job = await videoEditingService.startAudioExtractionJob(fileUrl, userId, { sourceLabel });
    res.json({
      success: true,
      jobId: job.jobId,
      message: "Audio extraction started",
    });
  } catch (error) {
    console.error("[MediaRoute] Audio extraction error:", error.message);
    res.status(500).json({ message: "Audio extraction failed", details: error.message });
  }
});

router.get("/multicam/worker-readiness", async (req, res) => {
  const userId = req.user?.uid || req.userId;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const response = await getFromCamCombinerWorker("/health", 120000);
    res.json({
      success: true,
      workerUrl: CAM_COMBINER_WORKER_URL,
      localFallbackEnabled: ALLOW_LOCAL_WORKER_FALLBACK,
      worker: response.data || {},
    });
  } catch (error) {
    const detail = error.response?.data?.detail || error.response?.data?.message || error.message;
    console.error("[MediaRoute] Cam Combiner worker readiness failed:", detail);
    res.status(503).json({
      success: false,
      message: "Cam Combiner worker is not ready. Please retry later; no credits were charged.",
      details: detail,
      workerUrl: CAM_COMBINER_WORKER_URL,
      localFallbackEnabled: ALLOW_LOCAL_WORKER_FALLBACK,
    });
  }
});

router.post("/multicam/preflight-sync", async (req, res) => {
  const userId = req.user?.uid || req.userId;
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
  const externalAudioUrl = req.body?.external_audio_url || req.body?.externalAudio?.url || null;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!sources.length) {
    return res.status(400).json({ message: "At least one camera source is required" });
  }

  if (!externalAudioUrl) {
    return res.status(400).json({ message: "External clean audio is required for preflight" });
  }

  try {
    const result = await videoEditingService.preflightMulticamSync({ sources, external_audio_url: externalAudioUrl });
    res.json(result);
  } catch (error) {
    console.error("[MediaRoute] Multicam preflight sync error:", error.message);
    res.status(500).json({ message: "Preflight sync check failed", details: error.message });
  }
});

router.post("/render-multicam", async (req, res) => {
  const userId = req.user?.uid || req.userId;
  const renderTier = normalizeMulticamRenderTier(req.body?.renderTier || req.body?.render_tier);
  const cost = estimateMulticamRenderCredits({
    renderTier,
    baseCost: CREDIT_COSTS["render-multicam"] || 15,
  });
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (sources.length < 2) {
    return res.status(400).json({ message: "At least two camera sources are required" });
  }

  const requestedDuration = getRequestedMulticamDuration(req.body);
  if (requestedDuration > MULTICAM_MAX_RENDER_SECONDS + 0.5) {
    return res.status(400).json({
      message: "Cam Combiner renders are capped at 20 minutes. Please select a shorter range.",
      code: "MULTICAM_DURATION_LIMIT",
      maxDurationSeconds: MULTICAM_MAX_RENDER_SECONDS,
    });
  }

  try {
    const tierSnapshot = await getEffectiveTierSnapshot(userId);
    const capabilities = getPlanCapabilities(tierSnapshot.tierId);

    if (!capabilities.multicam) {
      return res.status(403).json({
        message: `${capabilities.planName} plan does not include multi-camera rendering.`,
        code: "MULTICAM_PLAN_REQUIRED",
        upgradeRequired: true,
        entitlements: capabilities,
      });
    }

    const result = await chargeVideoEditorCredits(userId, cost, "render-multicam");
    if (!result.success) {
      return res.status(403).json({
        message: `Multicam rendering costs ${cost} credits. You have ${result.remaining || 0} credits available.`,
        required: cost,
        remaining: result.remaining || 0,
        topUpPacks: CREDIT_TOP_UP_PACKS,
      });
    }

    const job = await videoEditingService.startMulticamRenderJob(
      {
        sources,
        segments: Array.isArray(req.body?.segments) ? req.body.segments : [],
        switches: Array.isArray(req.body?.switches) ? req.body.switches : [],
        autoSwitch: !!req.body?.autoSwitch,
        audioBasedAutoSwitch: req.body?.audioBasedAutoSwitch !== false,
        autoSwitchInterval: Number(req.body?.autoSwitchInterval ?? 5),
        autoSwitchAggressiveness:
          typeof req.body?.autoSwitchAggressiveness === "string"
            ? req.body.autoSwitchAggressiveness
            : "balanced",
        renderTier,
        render_tier: renderTier,
        primaryAudioCameraId:
          typeof req.body?.primaryAudioCameraId === "string" ? req.body.primaryAudioCameraId : null,
        overlapStart: Number(req.body?.overlapStart ?? 0),
        overlapDuration: Number(req.body?.overlapDuration ?? 0),
        outputAspectRatio:
          typeof req.body?.outputAspectRatio === "string" ? req.body.outputAspectRatio : "9:16",
        externalAudio: req.body?.externalAudio || null,
        brandWatermark: req.body?.brandWatermark !== false,
        watermarkText:
          typeof req.body?.watermarkText === "string" && req.body.watermarkText.trim()
            ? req.body.watermarkText.trim()
            : "AutoPromote Cam Combiner",
        generateThumbnail: req.body?.generateThumbnail !== false,
        creditReceipt: result,
      },
      userId
    );

    res.json({
      success: true,
      jobId: job.jobId,
      message: "Multi-camera render started",
      renderTier,
      chargedCredits: cost,
      remainingCredits: result.remaining,
      billingDisabled: !!result.skipped,
    });
  } catch (error) {
    console.error("[MediaRoute] Multicam render error:", error.message);
    res.status(500).json({ message: "Multi-camera render failed", details: error.message });
  }
});

router.post("/multicam/clean-audio-sync", async (req, res) => {
  const userId = req.user?.uid || req.userId;
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
  const externalAudio = req.body?.externalAudio || {};

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!sources.length) {
    return res.status(400).json({ message: "At least one camera source is required" });
  }

  if (!externalAudio.url) {
    return res.status(400).json({ message: "External clean audio is required" });
  }

  const requestedEstimate = Number(req.body?.estimatedCredits || 0);
  const estimatedCredits = Math.max(
    CREDIT_COSTS["clean-audio-sync"] || 18,
    requestedEstimate > 0 ? requestedEstimate : estimateCleanAudioSyncCredits({ sources, externalAudio })
  );
  const jobId = `clean-audio-sync-${Date.now()}-${uuidv4().slice(0, 8)}`;
  let creditResult = null;

  try {
    const tierSnapshot = await getEffectiveTierSnapshot(userId);
    const capabilities = getPlanCapabilities(tierSnapshot.tierId);

    if (!capabilities.multicam) {
      return res.status(403).json({
        message: `${capabilities.planName} plan does not include clean-audio multicam sync.`,
        code: "MULTICAM_PLAN_REQUIRED",
        upgradeRequired: true,
        entitlements: capabilities,
      });
    }

    creditResult = await chargeVideoEditorCredits(userId, estimatedCredits, "clean-audio-sync");
    if (!creditResult.success) {
      return res.status(403).json({
        message: `External clean-audio sync costs ${estimatedCredits} credits. You have ${creditResult.remaining || 0} credits available.`,
        required: estimatedCredits,
        remaining: creditResult.remaining || 0,
        topUpPacks: CREDIT_TOP_UP_PACKS,
      });
    }

    const syncReplayPayload = JSON.parse(JSON.stringify({
      job_id: jobId,
      user_id: userId,
      sources,
      external_audio: externalAudio,
      mix_mode: req.body?.mixMode || "external_only",
      output_aspect_ratio: req.body?.outputAspectRatio || "9:16",
      estimated_credits: estimatedCredits,
      requested_estimate: requestedEstimate,
    }));

    await admin.firestore().collection("video_edits").doc(jobId).set({
      userId,
      feature: "clean-audio-sync",
      status: "queued",
      stage: "queued",
      detail: "Clean-audio sync queued",
      progress: 1,
      creditsCharged: estimatedCredits,
      creditRefund: creditResult,
      debugReplayPayload: syncReplayPayload,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await postToCamCombinerWorker(
      "/multicam/clean-audio-sync",
      syncReplayPayload,
      180000
    );

    res.json({
      success: true,
      jobId,
      estimatedCredits,
      remainingCredits: creditResult.remaining,
      billingDisabled: !!creditResult.skipped,
      message: "External clean-audio sync queued",
    });
  } catch (error) {
    console.error("[MediaRoute] Clean-audio sync error:", error.message);
    if (creditResult?.success && !creditResult.skipped) {
      const refundResult = await refundCredits(userId, creditResult, "clean-audio-sync-refund", {
        jobId,
        reason: "worker_start_failed",
      }).catch(refundError => {
        console.error("[MediaRoute] Clean-audio sync refund failed:", refundError.message);
        return null;
      });

      if (refundResult?.success) {
        await admin.firestore().collection("video_edits").doc(jobId).set(
          {
            creditsRefunded: true,
            creditRefundedAt: admin.firestore.FieldValue.serverTimestamp(),
            refundReason: "worker_start_failed",
          },
          { merge: true }
        ).catch(() => {});
      }
    }
    await admin.firestore().collection("video_edits").doc(jobId).set(
      {
        userId,
        feature: "clean-audio-sync",
        status: "failed",
        stage: "failed",
        progress: 0,
        error: error.response?.data?.detail || error.message,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {});
    res.status(500).json({
      message: "External clean-audio sync failed to start",
      details: error.response?.data?.detail || error.message,
    });
  }
});

router.post("/preview-silence", async (req, res) => {
  const fileUrl = typeof req.body?.fileUrl === "string" ? req.body.fileUrl.trim() : "";
  if (!fileUrl) {
    return res.status(400).json({ message: "No file provided" });
  }

  try {
    const response = await postToMediaWorker(
      "/preview-silence",
      {
        video_url: fileUrl,
        silence_threshold_db: Number(req.body?.silenceThreshold ?? -35),
        min_silence_duration: Number(req.body?.minSilenceDuration ?? 0.75),
      },
      120000
    );
    res.json(response.data || {});
  } catch (error) {
    console.error("[MediaRoute] Silence preview error:", error.message);
    res.status(500).json({
      message: "Silence preview failed",
      details: error.response?.data?.detail || error.message,
    });
  }
});

router.post("/preview-watermark-cleanup", async (req, res) => {
  const fileUrl = typeof req.body?.fileUrl === "string" ? req.body.fileUrl.trim() : "";
  if (!fileUrl) {
    return res.status(400).json({ message: "No file provided" });
  }

  try {
    const response = await postToMediaWorker(
      "/preview-watermark-cleanup",
      {
        video_url: fileUrl,
        watermark_mode:
          typeof req.body?.watermarkMode === "string" ? req.body.watermarkMode : "adaptive",
        watermark_regions: Array.isArray(req.body?.manualWatermarkRegions)
          ? req.body.manualWatermarkRegions
          : [],
        preview_time: Number(req.body?.previewTime ?? 0),
      },
      120000
    );
    res.json(response.data || {});
  } catch (error) {
    console.error("[MediaRoute] Watermark cleanup preview error:", error.message);
    res.status(500).json({
      message: "Watermark cleanup preview failed",
      details: error.response?.data?.detail || error.message,
    });
  }
});

router.post("/preview-music", async (req, res) => {
  const musicFile = typeof req.body?.musicFile === "string" ? req.body.musicFile.trim() : "";
  if (!musicFile) {
    return res.status(400).json({ message: "No music selection provided" });
  }

  try {
    const response = await postToMediaWorker(
      "/preview-music",
      {
        music_file: musicFile,
        is_search: !!req.body?.isSearch,
        safe_search: req.body?.safeSearch !== undefined ? !!req.body.safeSearch : true,
        preview_duration: Number(req.body?.previewDuration ?? 20),
      },
      120000
    );
    res.json(response.data || {});
  } catch (error) {
    console.error("[MediaRoute] Music preview error:", error.message);
    res.status(500).json({
      message: "Music preview failed",
      details: error.response?.data?.detail || error.message,
    });
  }
});

router.get("/renders", async (req, res) => {
  try {
    const userId = req.user.uid;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));

    const snapshot = await admin
      .firestore()
      .collection("video_edits")
      .where("userId", "==", userId)
      .limit(Math.max(limit * 3, 50))
      .get();

    const renders = snapshot.docs
      .map(doc => normalizeRenderJob(doc, doc.data() || {}))
      .filter(job => {
        const outputUrl = job.outputUrl || job.output_url;
        return job.type === "multicam_render" && job.status === "completed" && !!outputUrl;
      })
      .sort((a, b) => {
        const aTime = Date.parse(a.completedAt || a.createdAt || "") || 0;
        const bTime = Date.parse(b.completedAt || b.createdAt || "") || 0;
        return bTime - aTime;
      })
      .slice(0, limit);

    res.json({
      success: true,
      renders,
      retentionDays: parseInt(process.env.MULTICAM_MASTER_RETENTION_DAYS || "4", 10) || 4,
    });
  } catch (error) {
    console.error("[MediaRoute] Failed to list renders:", error.message);
    res.status(500).json({ success: false, message: "Could not load recent renders" });
  }
});

// Route: GET /api/media/status/:jobId
// Check status of async video processing
router.get("/status/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.uid;

    const doc = await admin.firestore().collection("video_edits").doc(jobId).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    const data = doc.data();
    // Security check: ensure user owns the job
    if (data.userId !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized access to job" });
    }

    await refundCleanAudioSyncJobIfNeeded(userId, jobId, data, "worker_failed");

    res.json({
      success: true,
      status: data.status,
      stage: data.stage,
      progress: data.progress,
      result: data.result, // Node worker result
      output_url: data.output_url, // Python worker result (Async)
      audio_url: data.audio_url,
      outputUrl: data.outputUrl, // Legacy Node worker result
      thumbnailUrl: data.thumbnailUrl || data.thumbnail_url || data.result?.thumbnailUrl || data.result?.thumbnail_url,
      expiresAt: data.expiresAt || data.result?.expiresAt || data.result?.expires_at || null,
      retentionDays: data.retentionDays || data.result?.retention_days || null,
      clipSuggestions: data.clipSuggestions, // Viral clips
      detail: data.detail,
      message: data.message,
      offsets: data.offsets,
      error: data.error,
    });
  } catch (e) {
    console.error("Status check failed:", e);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// Phase 2: Viral Clip Analysis
router.post("/analyze", async (req, res) => {
  const userId = req.user.uid;
  const { fileUrl, localPath = null, forceFresh = false, scanNonce = "" } = req.body;
  const cost = CREDIT_COSTS.analyze || 8;

  try {
    console.log(
      `[MediaRoute] Analyze clip request for user ${userId}, forceFresh=${Boolean(forceFresh)}, nonce=${scanNonce ? "set" : "none"}`
    );

    // Check and deduct credits first
    const credits = await chargeVideoEditorCredits(userId, cost, "/analyze");
    if (!credits.success) {
      console.warn(
        `[MediaRoute] Insufficient credits for user ${userId}. Required: ${cost}, Msg: ${credits.message}`
      );
      return res.status(403).json({
        message: "Insufficient credits. Please purchase more.",
        required: cost,
        balance: credits.remaining,
      });
    }

    console.log(`[MediaRoute] Credits OK. Starting analysis...`);
    const scenes = await videoEditingService.analyzeVideo(fileUrl || localPath, userId, {
      forceFresh: Boolean(forceFresh),
      scanNonce: typeof scanNonce === "string" ? scanNonce : "",
      localPath: localPath || null,
    });
    res.json({
      success: true,
      scenes: scenes,
      remainingCredits: credits.remaining,
      billingDisabled: !!credits.skipped,
    });
  } catch (error) {
    console.error(`[MediaRoute] Analyze error:`, error);
    res.status(500).json({ message: "Analysis failed", details: error.message });
  }
});

// Phase 2: Render Specific Clip
router.post("/render-clip", async (req, res) => {
  const userId = req.user.uid;
  const { fileUrl, startTime, endTime } = req.body;
  const cost = CREDIT_COSTS["render-clip"] || 5;

  try {
    const creditRes = await chargeVideoEditorCredits(userId, cost, "/render-clip");
    if (!creditRes.success) return res.status(403).json({ message: "Insufficient credits" });

    const result = await videoEditingService.renderClip(fileUrl, startTime, endTime, userId);
    res.json({
      success: true,
      url: result.url,
      remainingCredits: creditRes.remaining,
      billingDisabled: !!creditRes.skipped,
    });
  } catch (error) {
    res.status(500).json({ message: "Rendering failed", details: error.message });
  }
});

// Phase 3: Memetic Composer (Viral Engineering)
router.post("/memetic/plan", async (req, res) => {
  const userId = req.user.uid;
  const { baseVariant } = req.body;

  // Safe logging
  console.log("[Memetic] Planning mutations", { userId, baseVariant });

  // In a real implementation:
  // 1. Send base params to Python worker (AI model trained on viral clips)
  // 2. Worker generates 3-6 mutation strategies based on "genes"
  // 3. Return these strategies as a plan

  // For MVP, we simulate the AI planning phase:
  try {
    const variants = [
      {
        id: `v_${Date.now()}_1`,
        title: "High-Velocity Hook",
        style: "viral",
        viralScore: 88 + Math.floor(Math.random() * 10),
        reason: `Detected ${(baseVariant.tempo || 1.0).toFixed(1)}x tempo preference. Applied rapid cuts in first 3s.`,
        thumbnailUrl: "https://via.placeholder.com/320x180/FF0000/FFFFFF?text=HOOK+MAX",
        previewUrl: "", // In real app, this would be a rendered preview
      },
      {
        id: `v_${Date.now()}_2`,
        title: "Emotional Resonance",
        style: "cute",
        viralScore: 75 + Math.floor(Math.random() * 15),
        reason: `Valence set to ${(baseVariant.ctaIntensity * 100).toFixed(0)}%. Softened color grading and acoustic sync.`,
        thumbnailUrl: "https://via.placeholder.com/320x180/FF69B4/FFFFFF?text=CUTE+MOOD",
      },
      {
        id: `v_${Date.now()}_3`,
        title: "Chaos Mode",
        style: "chaos",
        viralScore: 90 + Math.floor(Math.random() * 8),
        reason: `Ambiguity ${(baseVariant.ambiguity * 100).toFixed(0)}% triggered glitch effects and non-linear editing.`,
        thumbnailUrl: "https://via.placeholder.com/320x180/000000/00FF00?text=GLITCH+CORE",
      },
    ];

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    res.json({
      id: `plan_${Date.now()}`,
      variants,
    });
  } catch (error) {
    console.error("[Memetic] Plan generation failed:", error);
    res.status(500).json({ message: "Failed to generate plan" });
  }
});

// Phase 3.5: Memetic Preview (Actually Render Video)
router.post("/memetic/preview", async (req, res) => {
  // Check user auth or use fallback for testing
  const userId = req.user && req.user.uid ? req.user.uid : "test_user";
  const { videoUrl, style } = req.body;

  console.log(`[Memetic] Generating PREVIEW for user ${userId}, style=${style}`);

  // Map style to Python Worker Options
  let options = {
    smartCrop: true,
    cropStyle: "blur",
    captions: true,
    addHook: true,
    addMusic: true,
  };

  if (style === "viral") {
    options.hookText = "WAIT FOR IT 😱";
    options.musicFile = "intense.mp3";
    options.musicVolume = 0.3;
  } else if (style === "cute") {
    options.hookText = "So Wholesome ❤️";
    options.musicFile = "lofi.mp3";
    options.musicVolume = 0.2;
  } else if (style === "chaos") {
    options.hookText = "What just happened?!";
    options.musicFile = "upbeat.mp3";
    options.musicVolume = 0.5;
  } else {
    // Default / Fallback
    options.hookText = "Watch This!";
    options.musicFile = "upbeat.mp3";
    options.musicVolume = 0.2;
  }

  try {
    // Instantiate service (VideoEditingService is a class now)
    const service = new VideoEditingService();

    const result = await service.processVideo(videoUrl, options, userId);

    res.json({
      success: true,
      previewUrl: result.url,
    });
  } catch (error) {
    console.error("[Memetic] Preview generation failed:", error);
    res.status(500).json({ message: "Failed to generate preview", error: error.message });
  }
});

router.post("/memetic/seed", async (req, res) => {
  // This would actually schedule the post or start the A/B test
  const { planId } = req.body;
  console.log(`[Memetic] Seeding plan ${planId}`);

  // Simulate DB update
  setTimeout(() => {
    res.json({ success: true, message: "Seeding initiated. Cohort: Global" });
  }, 1000);
});

module.exports = router;
