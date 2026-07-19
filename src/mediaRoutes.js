const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const multer = require("multer");
const axios = require("axios");
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");
const { buildWorkerRequestConfig } = require("./utils/cloudRunAuth");
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
const { isDurableMulticamRenderEnabled } = require("./services/cloudRunJobService");
const {
  releaseMulticamRenderCapacity,
  reserveMulticamRenderCapacity,
} = require("./services/multicamCapacityService");
const {
  buildApprovalUpdate,
  buildRejectionUpdate,
  isMulticamRenderJob,
  normalizeRenderApproval,
  sanitizeResultForApproval,
} = require("./services/renderApprovalService");
const {
  abortMulticamUpload,
  completeMulticamUpload,
  recoverMulticamUpload,
  startMulticamUpload,
  verifyMulticamRenderInputs,
} = require("./services/multicamUploadService");
const { getMulticamStoragePaths } = require("./services/storageCleanupService");
const { getClipLearningProfile } = require("./services/clipOutcomeLearningService");
const MEDIA_WORKER_URL =
  process.env.MEDIA_WORKER_URL || "https://media-worker-v1-341498038874.us-central1.run.app";
const DEFAULT_CAM_COMBINER_WORKER_URL =
  "https://cam-combiner-worker-341498038874.us-central1.run.app";
const LOCAL_MEDIA_WORKER_URL = process.env.LOCAL_MEDIA_WORKER_URL || "http://127.0.0.1:8000";
const CAM_COMBINER_WORKER_URL =
  process.env.CAM_COMBINER_WORKER_URL ||
  process.env.MULTICAM_WORKER_URL ||
  DEFAULT_CAM_COMBINER_WORKER_URL;
const LOCAL_CAM_COMBINER_WORKER_URL =
  process.env.LOCAL_CAM_COMBINER_WORKER_URL || LOCAL_MEDIA_WORKER_URL;
const IS_PRODUCTION_RUNTIME =
  process.env.NODE_ENV === "production" || !!process.env.RENDER || !!process.env.K_SERVICE;
const ALLOW_LOCAL_WORKER_FALLBACK =
  process.env.ALLOW_LOCAL_WORKER_FALLBACK === "true" ||
  (!IS_PRODUCTION_RUNTIME && process.env.ALLOW_LOCAL_WORKER_FALLBACK !== "false");
const VIDEO_EDITOR_CREDITS_DISABLED = process.env.DISABLE_VIDEO_EDITOR_CREDITS === "true";
const MULTICAM_MAX_TOTAL_RENDER_SECONDS = parseInt(
  process.env.MULTICAM_MAX_TOTAL_RENDER_SECONDS || String(3 * 60 * 60),
  10
) || 3 * 60 * 60;
const MULTICAM_CHECKPOINT_SECONDS = parseInt(
  process.env.MULTICAM_CHECKPOINT_SECONDS || String(5 * 60),
  10
) || 5 * 60;
const MULTICAM_BILLING_UNIT_SECONDS = 20 * 60;
const MULTICAM_PRODUCTION_PROOF_SECONDS = 60;
const MULTICAM_PRODUCTION_PROOF_CREDITS = Math.max(
  1,
  parseInt(process.env.MULTICAM_PRODUCTION_PROOF_CREDITS || "15", 10) || 15
);
const MULTICAM_SERVER_PROOF_REQUIRED =
  process.env.MULTICAM_SERVER_PROOF_REQUIRED === "true" ||
  (process.env.MULTICAM_SERVER_PROOF_REQUIRED !== "false" && IS_PRODUCTION_RUNTIME);

const normalizeMulticamRenderTier = value => {
  const tier = String(value || "premium").trim().toLowerCase().replace(/-/g, "_");
  return ["simple", "premium", "studio"].includes(tier) ? tier : "premium";
};

const MULTICAM_RENDER_CREDITS_BY_TIER = {
  simple: 75,
  premium: 150,
  studio: 300,
};

const getMulticamBillingUnits = durationSeconds =>
  Math.max(1, Math.ceil(Math.max(0, Number(durationSeconds) || 0) / MULTICAM_BILLING_UNIT_SECONDS));

const estimateMulticamRenderCredits = ({ renderTier, durationSeconds }) => {
  const tier = normalizeMulticamRenderTier(renderTier);
  const unitCost = MULTICAM_RENDER_CREDITS_BY_TIER[tier] || MULTICAM_RENDER_CREDITS_BY_TIER.premium;
  return unitCost * getMulticamBillingUnits(durationSeconds);
};

const normalizeMulticamRenderPurpose = value =>
  String(value || "full_master").trim().toLowerCase() === "production_proof"
    ? "production_proof"
    : "full_master";

const getPersistedMulticamExternalAudio = request => {
  if (request?.externalAudio?.url || request?.externalAudio?.storagePath || request?.externalAudio?.storage_path) {
    return request.externalAudio;
  }
  if (request?.external_audio_url || request?.external_audio_storage_path) {
    return {
      url: request.external_audio_url || "",
      storagePath: request.external_audio_storage_path || "",
      cache_key: request.external_audio_cache_key || null,
      offset_seconds: request.external_audio_offset_seconds || 0,
      mix_mode: request.external_audio_mix_mode || "external_only",
    };
  }
  return null;
};

const getPersistedMulticamStorageSignature = request => {
  const sourcePaths = (request?.sources || []).map(
    source => source.storagePath || source.storage_path || ""
  );
  const external = getPersistedMulticamExternalAudio(request);
  return JSON.stringify([
    ...sourcePaths,
    external?.storagePath || external?.storage_path || "",
  ]);
};

const getPersistedMulticamDuration = request =>
  Math.max(
    0,
    Number(
      request?.fullTimelineDuration ??
        request?.full_timeline_duration ??
        request?.totalDurationSeconds ??
        request?.total_duration_seconds ??
        request?.overlapDuration ??
        request?.overlap_duration ??
        0
    ) || 0
  );

const estimateCleanAudioSyncCredits = () => CREDIT_COSTS["clean-audio-sync"] || 18;

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
  const primaryUrl = `${primaryWorkerUrl}${endpoint}`;
  try {
    const requestConfig = await buildWorkerRequestConfig(primaryUrl, { timeout });
    return await axios.post(primaryUrl, payload, requestConfig);
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
    const targetUrl = `${MEDIA_WORKER_URL}${endpoint}`;
    const requestConfig = await buildWorkerRequestConfig(targetUrl, { timeout });
    return await axios.get(targetUrl, requestConfig);
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
    const targetUrl = `${CAM_COMBINER_WORKER_URL}${endpoint}`;
    const requestConfig = await buildWorkerRequestConfig(targetUrl, { timeout });
    return await axios.get(targetUrl, requestConfig);
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

const chargeVideoEditorCredits = async (userId, amount, routeName, metadata = {}) => {
  if (VIDEO_EDITOR_CREDITS_DISABLED) {
    console.log(
      `[MediaRoute] Credit billing bypassed for ${routeName}. User ${userId}, amount ${amount}`
    );
    return { success: true, remaining: null, skipped: true };
  }

  return deductCredits(userId, amount, routeName, metadata);
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
  const approvalView = normalizeRenderApproval(doc.id, data);
  const outputUrl = approvalView.outputUrl;
  const thumbnailUrl =
    approvalView.thumbnailUrl ||
    data.thumbnailUrl ||
    data.thumbnail_url ||
    result.thumbnailUrl ||
    result.thumbnail_url ||
    null;
  const status =
    approvalView.approvalStatus === "needs_review" || approvalView.approvalStatus === "rejected"
      ? approvalView.approvalStatus
      : data.status || "queued";
  return {
    jobId: data.jobId || doc.id,
    type: data.type || data.feature || "media_job",
    status,
    stage: data.stage || null,
    progress: Number(data.progress || 0),
    outputUrl,
    output_url: outputUrl,
    previewUrl: approvalView.previewUrl,
    heldOutputUrl: approvalView.heldOutputUrl,
    approvedOutputUrl: approvalView.approvedOutputUrl,
    approvalStatus: approvalView.approvalStatus,
    deliveryStatus: approvalView.deliveryStatus,
    reviewRequired: approvalView.reviewRequired,
    canDownload: approvalView.canDownload,
    qaWarnings: approvalView.qaWarnings,
    qaReport: approvalView.qaReport,
    approval: approvalView.approval,
    thumbnailUrl,
    thumbnail_url: thumbnailUrl,
    duration: data.duration || result.duration || 0,
    renderTier: data.renderTier || result.renderTier || result.render_tier || null,
    renderPurpose:
      data.renderPurpose ||
      data.render_purpose ||
      result.renderPurpose ||
      result.render_purpose ||
      "full_master",
    expiresAt: toIsoString(data.expiresAt || result.expiresAt || result.expires_at),
    retentionDays: data.retentionDays || result.retention_days || null,
    performanceTiming:
      data.performanceTiming || data.performance_timing || result.performanceTiming || result.performance_timing || null,
    executionTelemetry: data.executionTelemetry || data.execution_telemetry || null,
    hiddenFromRenderLibrary: data.hiddenFromRenderLibrary === true,
    createdAt: toIsoString(data.createdAt || data.created_at),
    completedAt: toIsoString(data.completedAt || data.completed_at || data.updated_at),
    detail: data.detail || data.message || null,
    error: data.error || null,
  };
};

const buildSourceRequestError = (statusCode, code, message) =>
  Object.assign(new Error(message), { statusCode, code });

const resolveOwnedMulticamMasterSource = async ({ renderJobId, userId }) => {
  const normalizedJobId = String(renderJobId || "").trim();
  if (!normalizedJobId || normalizedJobId.length > 160) {
    throw buildSourceRequestError(400, "INVALID_RENDER_JOB_ID", "Invalid Cam Combiner render ID");
  }

  const renderRef = admin.firestore().collection("video_edits").doc(normalizedJobId);
  const renderDoc = await renderRef.get();
  if (!renderDoc.exists) {
    throw buildSourceRequestError(404, "MULTICAM_MASTER_NOT_FOUND", "Saved Cam Combiner master was not found");
  }

  const renderData = renderDoc.data() || {};
  if (renderData.userId !== userId) {
    throw buildSourceRequestError(403, "MULTICAM_MASTER_FORBIDDEN", "You do not own this Cam Combiner master");
  }
  if (!isMulticamRenderJob(renderData) || renderData.hiddenFromRenderLibrary === true) {
    throw buildSourceRequestError(409, "MULTICAM_MASTER_UNAVAILABLE", "This Cam Combiner master is not available for clip generation");
  }
  const renderPurpose = normalizeMulticamRenderPurpose(
    renderData.renderPurpose || renderData.render_purpose || renderData.result?.renderPurpose
  );
  if (renderPurpose !== "full_master") {
    throw buildSourceRequestError(
      409,
      "FULL_MULTICAM_MASTER_REQUIRED",
      "Render the full Cam Combiner master before finding viral clips"
    );
  }

  const expiryMs = Date.parse(renderData.expiresAt || renderData.result?.expiresAt || "");
  if (Number.isFinite(expiryMs) && expiryMs <= Date.now()) {
    throw buildSourceRequestError(410, "MULTICAM_MASTER_EXPIRED", "This Cam Combiner master has expired");
  }

  const approvalView = normalizeRenderApproval(normalizedJobId, renderData);
  const outputUrl = approvalView.outputUrl;
  const outputStoragePath = getMulticamStoragePaths(renderData).find(path =>
    path.startsWith("processed/multicam_")
  );
  if (!outputUrl || !outputStoragePath) {
    throw buildSourceRequestError(409, "MULTICAM_MASTER_INCOMPLETE", "The saved Cam Combiner master is incomplete");
  }

  const [exists] = await admin.storage().bucket().file(outputStoragePath).exists();
  if (!exists) {
    throw buildSourceRequestError(410, "MULTICAM_MASTER_DELETED", "The saved Cam Combiner master is no longer in storage");
  }

  return {
    outputUrl,
    outputStoragePath,
    renderJobId: normalizedJobId,
  };
};

const resolveRequestedMediaSource = async ({ fileUrl, localPath, renderJobId, userId }) => {
  if (renderJobId) {
    return resolveOwnedMulticamMasterSource({ renderJobId, userId });
  }
  return {
    outputUrl: fileUrl || localPath || "",
    outputStoragePath: null,
    renderJobId: null,
  };
};

const isAdminRequester = user =>
  Boolean(
    user?.admin ||
      user?.isAdmin ||
      user?.role === "admin" ||
      user?.token?.admin ||
      user?.claims?.admin ||
      user?.customClaims?.admin
  );

const canReviewRenderJob = (user, data = {}) => data.userId === user?.uid || isAdminRequester(user);

const isFailedJobStatus = status => {
  const normalized = String(status || "").toLowerCase();
  return normalized === "failed" || normalized.endsWith("_failed") || normalized.includes("failed");
};

const validateTrustedDirectorChannelMapRequest = body => {
  const sources = Array.isArray(body?.sources) ? body.sources : [];
  const autoSwitch = body?.autoSwitch === true || body?.auto_switch === true;
  const externalAudioUrl = body?.externalAudio?.url || body?.external_audio_url || null;
  if (!autoSwitch || !externalAudioUrl || sources.length < 2) {
    return { ok: true, required: false };
  }

  const requestedIds = Array.isArray(body?.directorChannelCameraIds)
    ? body.directorChannelCameraIds
    : Array.isArray(body?.director_channel_camera_ids)
      ? body.director_channel_camera_ids
      : [];
  const channelMap = body?.trustedDirectorChannelMap || body?.trusted_director_channel_map;
  const status = String(
    channelMap?.status || channelMap?.overall_status || channelMap?.overallStatus || ""
  ).toLowerCase();
  const mappedIds = Array.isArray(channelMap?.channel_camera_ids)
    ? channelMap.channel_camera_ids
    : Array.isArray(channelMap?.channelCameraIds)
      ? channelMap.channelCameraIds
      : [];
  const normalizedMappedIds = mappedIds.map(value => String(value || "").trim()).filter(Boolean);
  const normalizedRequestedIds = requestedIds
    .map(value => String(value || "").trim())
    .filter(Boolean);
  const sourceIds = new Set(
    sources.map(source => String(source?.id || "").trim()).filter(Boolean)
  );
  const trustedStatus = ["approved", "locked", "safe", "passed", "trusted"].includes(status);
  const knownSources = normalizedMappedIds.slice(0, 2).every(id => sourceIds.has(id));
  const matchesRequest =
    normalizedRequestedIds.length >= 2 &&
    normalizedRequestedIds.slice(0, 2).every((id, index) => id === normalizedMappedIds[index]);

  if (!trustedStatus || normalizedMappedIds.length < 2 || !knownSources || !matchesRequest) {
    return {
      ok: false,
      required: true,
      reason: "A confirmed left/right clean-audio channel mapping is required before charging",
    };
  }
  return { ok: true, required: true, channelCameraIds: normalizedMappedIds.slice(0, 2) };
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

const refundMulticamRenderJobIfNeeded = async (userId, jobId, data, reason = "worker_failed") => {
  if (
    !userId ||
    !jobId ||
    !isMulticamRenderJob(data) ||
    !(data?.refundRequired || isFailedJobStatus(data?.status)) ||
    !data?.creditReceipt ||
    data?.creditReceipt?.skipped ||
    data?.creditsRefunded
  ) {
    return null;
  }

  const refundResult = await refundCredits(userId, data.creditReceipt, "render-multicam-refund", {
    jobId,
    reason,
    idempotencyKey: `render-multicam-refund:${jobId}`,
  });

  if (refundResult.success) {
    await admin.firestore().collection("video_edits").doc(jobId).set(
      {
        creditsRefunded: true,
        creditRefund: refundResult,
        creditRefundedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundRequired: false,
        refundReason: reason,
      },
      { merge: true }
    );
  }

  return refundResult;
};

const getRequestedMulticamDuration = body => {
  const candidates = [
    body?.totalDurationSeconds,
    body?.total_duration_seconds,
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

// Cloud Run render Jobs cannot carry a Firebase user token. This callback is
// intentionally mounted before user auth and protected by a dedicated managed
// secret; its only authority is to reconcile a failed job's existing receipt.
router.post("/internal/multicam-job-failed", async (req, res) => {
  const jobId = String(req.body?.jobId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(jobId)) {
    return res.status(400).json({ success: false, message: "Invalid job ID" });
  }

  try {
    const ref = admin.firestore().collection("video_edits").doc(jobId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    const data = snapshot.data() || {};
    const expectedSecret = String(process.env.MULTICAM_JOB_CALLBACK_SECRET || "");
    const providedSecret = String(req.get("x-multicam-job-secret") || "");
    const secretMatches =
      expectedSecret.length > 0 &&
      expectedSecret.length === providedSecret.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSecret), Buffer.from(providedSecret));
    const providedDispatchToken = String(req.get("x-multicam-dispatch-token") || "");
    const expectedDispatchHash = String(data.dispatchTokenHash || "");
    const providedDispatchHash = providedDispatchToken
      ? crypto.createHash("sha256").update(providedDispatchToken).digest("hex")
      : "";
    const dispatchTokenMatches =
      providedDispatchToken.length >= 16 &&
      expectedDispatchHash.length === providedDispatchHash.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedDispatchHash),
        Buffer.from(providedDispatchHash)
      );
    if (!secretMatches && !dispatchTokenMatches) {
      return res.status(401).json({ success: false, message: "Invalid render job callback" });
    }
    const refund = await refundMulticamRenderJobIfNeeded(
      data.userId,
      jobId,
      data,
      String(req.body?.reason || "cloud_run_job_failed").slice(0, 1000)
    );
    await releaseMulticamRenderCapacity(jobId, "cloud_run_job_failed");
    return res.json({ success: true, refund });
  } catch (error) {
    console.error("[MediaRoute] Multicam failure callback failed:", error.message);
    return res.status(500).json({ success: false, message: "Refund reconciliation failed" });
  }
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
  const { fileUrl: requestedFileUrl, renderJobId, options } = req.body;
  const isViralClipRender = options?.renderViral === true;
  const cost = isViralClipRender
    ? CREDIT_COSTS["render-clip"] || 5
    : CREDIT_COSTS.process || 10;

  if (!requestedFileUrl && !renderJobId) {
    return res.status(400).json({ message: "No file provided" });
  }

  let resolvedSource;
  try {
    resolvedSource = await resolveRequestedMediaSource({
      fileUrl: requestedFileUrl,
      renderJobId,
      userId,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Could not load the requested source",
      code: error.code || "SOURCE_RESOLUTION_FAILED",
    });
  }

  const fileUrl = resolvedSource.outputUrl;
  const resolvedOptions = options?.viralData
    ? {
        ...options,
        viralData: {
          ...options.viralData,
          video_url: fileUrl,
          timeline_segments: Array.isArray(options.viralData.timeline_segments)
            ? options.viralData.timeline_segments.map(segment =>
                segment?.id === "main" ? { ...segment, url: fileUrl } : segment
              )
            : options.viralData.timeline_segments,
        },
      }
    : options;
  console.log("[MediaRoute] Received request:", {
    fileUrl,
    renderJobId: resolvedSource.renderJobId,
    options: resolvedOptions,
  });

  // 1. Deduct Credits
  try {
    const result = await chargeVideoEditorCredits(
      userId,
      cost,
      isViralClipRender ? "render-clip" : "process"
    );
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
    const job = await videoEditingService.startProcessingJob(fileUrl, resolvedOptions, userId);

    // 3. Return Job ID + remaining credits (or defer credit check)
    // Note: The frontend needs to poll /status/:jobId now.
    res.json({
      success: true,
      jobId: job.jobId,
      message: "Processing started",
      remainingCredits: result.remaining,
      billingDisabled: !!result.skipped,
      reusedMulticamMaster: Boolean(resolvedSource.renderJobId),
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

router.post("/multicam/uploads/start", async (req, res) => {
  try {
    const userId = req.user?.uid || req.userId;
    const tierSnapshot = await getEffectiveTierSnapshot(userId);
    const capabilities = getPlanCapabilities(tierSnapshot.tierId);
    if (!capabilities.multicam) {
      return res.status(403).json({
        success: false,
        code: "MULTICAM_PLAN_REQUIRED",
        message: `${capabilities.planName} plan does not include multi-camera rendering.`,
      });
    }

    const uploadSession = await startMulticamUpload({
      userId,
      fileName: req.body?.fileName,
      contentType: req.body?.contentType,
      sizeBytes: req.body?.sizeBytes,
      lastModified: req.body?.lastModified,
      fingerprint: req.body?.fingerprint,
      purpose: req.body?.purpose,
      origin: req.get("origin") || undefined,
    });
    res.status(201).json({ success: true, ...uploadSession });
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);
    console.error("[MediaRoute] Multicam upload start failed:", error.message);
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      message: error.message || "Could not start multicam upload",
    });
  }
});

router.post("/multicam/uploads/complete", async (req, res) => {
  try {
    const result = await completeMulticamUpload({
      userId: req.user?.uid || req.userId,
      storagePath: req.body?.storagePath,
      downloadToken: req.body?.downloadToken,
      sizeBytes: req.body?.sizeBytes,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);
    console.error("[MediaRoute] Multicam upload completion failed:", error.message);
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      message: error.message || "Could not verify multicam upload",
    });
  }
});

router.post("/multicam/uploads/abort", async (req, res) => {
  try {
    const result = await abortMulticamUpload({
      userId: req.user?.uid || req.userId,
      storagePath: req.body?.storagePath,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);
    console.error("[MediaRoute] Multicam upload abort failed:", error.message);
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      message: error.message || "Could not abort multicam upload",
    });
  }
});

router.get("/multicam/recoverable-project", async (req, res) => {
  try {
    const userId = req.user?.uid || req.userId;
    const snapshot = await admin
      .firestore()
      .collection("video_edits")
      .where("userId", "==", userId)
      .limit(50)
      .get();
    const candidates = snapshot.docs
      .map(doc => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter(item => {
        const request = item.multicamRequest || {};
        return item.type === "multicam_render" && Array.isArray(request.sources) && request.sources.length >= 2;
      })
      .sort((left, right) => {
        const toMillis = value => {
          if (value?.toMillis) return value.toMillis();
          return Date.parse(value || "") || 0;
        };
        return toMillis(right.updatedAt || right.createdAt) - toMillis(left.updatedAt || left.createdAt);
      });
    let recoveredProject = null;
    for (const candidate of candidates) {
      const candidateRequest = candidate.multicamRequest || {};
      const candidateSources = Array.isArray(candidateRequest.sources)
        ? candidateRequest.sources
        : [];
      const external = getPersistedMulticamExternalAudio(candidateRequest);
      const hasStoredCameraObjects =
        candidateSources.length >= 2 &&
        candidateSources.every(source => source.storagePath || source.storage_path);
      const hasStoredExternalObject =
        !external || Boolean(external.storagePath || external.storage_path);
      if (!hasStoredCameraObjects || !hasStoredExternalObject) continue;

      try {
        const recoveredSources = await Promise.all(
          candidateSources.map(source =>
            recoverMulticamUpload({
              userId,
              source,
              purpose: "camera_original",
            })
          )
        );
        const recoveredExternal = external
          ? await recoverMulticamUpload({
              userId,
              source: external,
              purpose: "external_audio",
            })
          : null;
        recoveredProject = {
          candidate,
          request: candidateRequest,
          recoveredSources,
          recoveredExternal,
        };
        break;
      } catch (recoveryError) {
        console.warn(
          `[MediaRoute] Skipping non-recoverable multicam job ${candidate.id}: ${recoveryError.message}`
        );
      }
    }

    if (!recoveredProject) {
      return res.status(404).json({
        success: false,
        message: "No reusable Firebase Cam Combiner originals were found",
      });
    }

    const { candidate: latest, request, recoveredSources, recoveredExternal } = recoveredProject;
    const storageSignature = getPersistedMulticamStorageSignature(request);
    const duration = candidates.reduce((maximum, candidate) => {
      const candidateRequest = candidate.multicamRequest || {};
      if (getPersistedMulticamStorageSignature(candidateRequest) !== storageSignature) {
        return maximum;
      }
      return Math.max(maximum, getPersistedMulticamDuration(candidateRequest));
    }, getPersistedMulticamDuration(request));
    let failureDetail = {};
    try {
      failureDetail = typeof latest.error === "string" ? JSON.parse(latest.error) : latest.error || {};
    } catch (_parseError) {
      failureDetail = {};
    }
    const trustedChannelMap =
      request.trustedDirectorChannelMap || request.trusted_director_channel_map || null;
    const trustedChannelCameraIds =
      trustedChannelMap?.channel_camera_ids || trustedChannelMap?.channelCameraIds || [];
    const channelMapApproved =
      trustedChannelMap?.status === "approved" &&
      Array.isArray(trustedChannelCameraIds) &&
      trustedChannelCameraIds.length >= 2;
    const suggestedChannelCameraIds = channelMapApproved
      ? trustedChannelCameraIds
      : failureDetail?.director_audio?.auto_mapping?.mapped_camera_ids ||
        failureDetail?.director_audio?.auto_mapping?.mappedCameraIds ||
        request.directorChannelCameraIds ||
        request.director_channel_camera_ids ||
        [];
    const sources = request.sources.map((source, index) => ({
      id: source.id,
      label: source.label,
      url: recoveredSources[index].url,
      storagePath: recoveredSources[index].storagePath,
      cacheKey: recoveredSources[index].cacheKey || source.cache_key || source.cacheKey || "",
      offsetSeconds: Number(source.offset_seconds || 0),
      syncRate: Number(source.syncRate ?? source.sync_rate ?? 1) || 1,
      rotationDegrees: Number(source.rotationDegrees ?? source.rotation_degrees ?? 0) || 0,
      reactionSide: source.reactionSide || source.reaction_side || null,
    }));
    const external = getPersistedMulticamExternalAudio(request);
    return res.json({
      success: true,
      project: {
        previousJobId: latest.id,
        status: latest.status,
        duration,
        outputAspectRatio: request.outputAspectRatio || request.output_aspect_ratio || "16:9",
        renderTier: request.renderTier || request.render_tier || "premium",
        sources,
        externalAudio: external
          ? {
              url: recoveredExternal.url,
              storagePath: recoveredExternal.storagePath,
              cacheKey: recoveredExternal.cacheKey || external.cache_key || external.cacheKey || "",
              offsetSeconds: Number(external.offset_seconds || 0),
              mixMode: external.mix_mode || "external_only",
            }
          : null,
        suggestedChannelCameraIds: Array.isArray(suggestedChannelCameraIds)
          ? suggestedChannelCameraIds.slice(0, 2)
          : [],
        channelMapApproved,
      },
    });
  } catch (error) {
    console.error("[MediaRoute] Recoverable multicam project lookup failed:", error.message);
    return res.status(500).json({ success: false, message: "Could not recover uploaded originals" });
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
    if (isDurableMulticamRenderEnabled()) {
      await verifyMulticamRenderInputs({
        userId,
        sources,
        externalAudio: req.body?.externalAudio || {
          url: externalAudioUrl,
          storage_path: req.body?.external_audio_storage_path,
        },
      });
    }
    const externalAudioOffsetSeconds = Number(
      req.body?.external_audio_offset_seconds ??
        req.body?.externalAudio?.offset_seconds ??
        0
    ) || 0;
    const result = await videoEditingService.preflightMulticamSync({
      sources,
      external_audio_url: externalAudioUrl,
      externalAudio: req.body?.externalAudio || null,
      external_audio_offset_seconds: externalAudioOffsetSeconds,
      external_audio_sync_trim_start: req.body?.external_audio_sync_trim_start,
      external_audio_sync_trim_duration: req.body?.external_audio_sync_trim_duration,
      timeline_start: Number(
        req.body?.timeline_start ??
          req.body?.timelineStart ??
          req.body?.overlap_start ??
          req.body?.overlapStart ??
          0
      ) || 0,
      overlap_duration: Number(
        req.body?.overlap_duration ??
          req.body?.overlapDuration ??
          req.body?.timeline_duration ??
          req.body?.timelineDuration ??
          0
      ) || 0,
    });
    res.json(result);
  } catch (error) {
    const statusCode = Number(error.statusCode || error.response?.status || 500);
    const safeStatus = statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    const details = error.workerDetail || error.response?.data?.detail || error.response?.data?.message || error.message;
    console.error("[MediaRoute] Multicam preflight sync error:", details);
    res.status(safeStatus).json({
      message: "Preflight sync check failed",
      details,
    });
  }
});

router.post("/render-multicam", async (req, res) => {
  const userId = req.user?.uid || req.userId;
  const renderTier = normalizeMulticamRenderTier(req.body?.renderTier || req.body?.render_tier);
  const requestedDuration = getRequestedMulticamDuration(req.body);
  const renderPurpose = normalizeMulticamRenderPurpose(
    req.body?.renderPurpose || req.body?.render_purpose
  );
  const billingUnits = getMulticamBillingUnits(requestedDuration);
  const expectedCheckpointCount = Math.max(
    1,
    Math.ceil(requestedDuration / MULTICAM_CHECKPOINT_SECONDS)
  );
  const checkpointedRender = expectedCheckpointCount > 1;
  const cost =
    renderPurpose === "production_proof"
      ? MULTICAM_PRODUCTION_PROOF_CREDITS
      : estimateMulticamRenderCredits({
          renderTier,
          durationSeconds: requestedDuration,
          baseCost: CREDIT_COSTS["render-multicam"] || 15,
        });
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
  const durableRenderEnabled = isDurableMulticamRenderEnabled();
  const durableJobId = durableRenderEnabled ? uuidv4() : null;
  let capacityReserved = false;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (sources.length < 2) {
    return res.status(400).json({ message: "At least two camera sources are required" });
  }

  if (requestedDuration > MULTICAM_MAX_TOTAL_RENDER_SECONDS + 0.5) {
    return res.status(400).json({
      message: "Cam Combiner renders are capped at 3 hours. Please select a shorter range.",
      code: "MULTICAM_DURATION_LIMIT",
      maxDurationSeconds: MULTICAM_MAX_TOTAL_RENDER_SECONDS,
    });
  }

  if (
    renderPurpose === "production_proof" &&
    (requestedDuration <= 0 || requestedDuration > MULTICAM_PRODUCTION_PROOF_SECONDS + 0.5)
  ) {
    return res.status(400).json({
      message: "Production proof renders must be 60 seconds or shorter.",
      code: "MULTICAM_PROOF_DURATION_LIMIT",
      maxDurationSeconds: MULTICAM_PRODUCTION_PROOF_SECONDS,
    });
  }

  const directorChannelMapValidation = validateTrustedDirectorChannelMapRequest(req.body);
  if (!directorChannelMapValidation.ok) {
    return res.status(422).json({
      message: directorChannelMapValidation.reason,
      code: "MULTICAM_CHANNEL_MAP_CONFIRMATION_REQUIRED",
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

    if (durableRenderEnabled) {
      await verifyMulticamRenderInputs({
        userId,
        sources,
        externalAudio: req.body?.externalAudio || null,
      });
      await reserveMulticamRenderCapacity({ jobId: durableJobId, userId });
      capacityReserved = true;
    }

    let creditResult = null;
    let creditBreakdown = null;
    const deferCreditCharge =
      MULTICAM_SERVER_PROOF_REQUIRED &&
      !VIDEO_EDITOR_CREDITS_DISABLED &&
      !durableRenderEnabled;
    if (durableRenderEnabled) {
      // A Cloud Run Job can outlive this request. Reserve the credits before
      // dispatch, then refund idempotently if proof or render fails.
      creditResult = await chargeVideoEditorCredits(userId, cost, "render-multicam", {
        jobId: durableJobId,
        idempotencyKey: `render-multicam-charge:${durableJobId}`,
      });
    } else if (MULTICAM_SERVER_PROOF_REQUIRED) {
      if (deferCreditCharge) {
        creditBreakdown = await getCreditBreakdown(userId);
        if (Number(creditBreakdown.totalAvailable || 0) < cost) {
          return res.status(403).json({
            message: `Multicam rendering costs ${cost} credits. You have ${creditBreakdown.totalAvailable || 0} credits available.`,
            required: cost,
            remaining: creditBreakdown.totalAvailable || 0,
            topUpPacks: CREDIT_TOP_UP_PACKS,
          });
        }
      } else {
        creditResult = { success: true, remaining: null, skipped: true };
      }
    } else {
      creditResult = await chargeVideoEditorCredits(userId, cost, "render-multicam");
    }
    if (creditResult && !creditResult.success) {
      if (capacityReserved) {
        await releaseMulticamRenderCapacity(durableJobId, "insufficient_credits");
        capacityReserved = false;
      }
      return res.status(403).json({
        message: `Multicam rendering costs ${cost} credits. You have ${creditResult.remaining || 0} credits available.`,
        required: cost,
        remaining: creditResult.remaining || 0,
        topUpPacks: CREDIT_TOP_UP_PACKS,
      });
    }

    const multicamJobRequest = {
        sources,
        segments: Array.isArray(req.body?.segments) ? req.body.segments : [],
        switches: Array.isArray(req.body?.switches) ? req.body.switches : [],
        autoSwitch: !!req.body?.autoSwitch,
        audioBasedAutoSwitch: req.body?.audioBasedAutoSwitch !== false,
        autoSwitchInterval: Number(req.body?.autoSwitchInterval ?? 2),
        autoSwitchAggressiveness:
          typeof req.body?.autoSwitchAggressiveness === "string"
            ? req.body.autoSwitchAggressiveness
            : "balanced",
        renderTier,
        render_tier: renderTier,
        renderPurpose,
        render_purpose: renderPurpose,
        primaryAudioCameraId:
          typeof req.body?.primaryAudioCameraId === "string" ? req.body.primaryAudioCameraId : null,
        directorChannelCameraIds: Array.isArray(req.body?.directorChannelCameraIds)
          ? req.body.directorChannelCameraIds
          : Array.isArray(req.body?.director_channel_camera_ids)
            ? req.body.director_channel_camera_ids
            : null,
        overlapStart: Number(req.body?.overlapStart ?? 0),
        overlapDuration: Number(req.body?.overlapDuration ?? 0),
        timelineStart: Number(
          req.body?.timelineStart ??
            req.body?.timeline_start ??
            req.body?.overlapStart ??
            req.body?.overlap_start ??
            0
        ),
        outputAspectRatio:
          typeof req.body?.outputAspectRatio === "string" ? req.body.outputAspectRatio : "16:9",
        reactionOverlays:
          req.body?.reactionOverlays === true || req.body?.reaction_overlays === true,
        preSyncClapAlignment:
          req.body?.preSyncClapAlignment === true ||
          req.body?.pre_sync_clap_alignment === true,
        trustedSyncContract:
          req.body?.trustedSyncContract || req.body?.trusted_sync_contract || null,
        trustedDirectorChannelMap:
          req.body?.trustedDirectorChannelMap ||
          req.body?.trusted_director_channel_map ||
          null,
        externalAudio: req.body?.externalAudio || null,
        brandWatermark: req.body?.brandWatermark === true || req.body?.brand_watermark === true,
        burnCaptions: req.body?.burnCaptions === true || req.body?.burn_captions === true,
        captionStyle:
          typeof req.body?.captionStyle === "string" && req.body.captionStyle.trim()
            ? req.body.captionStyle.trim()
            : typeof req.body?.caption_style === "string" && req.body.caption_style.trim()
              ? req.body.caption_style.trim()
              : "podcast_clean",
        watermarkText:
          typeof req.body?.watermarkText === "string" && req.body.watermarkText.trim()
            ? req.body.watermarkText.trim()
            : "AutoPromote Cam Combiner",
        generateThumbnail: req.body?.generateThumbnail === true || req.body?.generate_thumbnail === true,
        renderSpecVersion: 2,
        totalDurationSeconds: requestedDuration,
        checkpointSeconds: MULTICAM_CHECKPOINT_SECONDS,
        checkpointedRender,
        expectedCheckpointCount,
        creditReceipt: creditResult,
        pendingCreditCost: deferCreditCharge ? cost : 0,
      requireServerProof: MULTICAM_SERVER_PROOF_REQUIRED,
    };
    const job = durableRenderEnabled
      ? await videoEditingService.startMulticamRenderJob(multicamJobRequest, userId, {
          jobId: durableJobId,
          capacityReserved: true,
        })
      : await videoEditingService.startMulticamRenderJob(multicamJobRequest, userId);
    capacityReserved = false;

    res.json({
      success: true,
      jobId: job.jobId,
      message: MULTICAM_SERVER_PROOF_REQUIRED
        ? durableRenderEnabled
          ? "Multi-camera render reserved and queued for durable server proof"
          : "Multi-camera render queued for server proof"
        : "Multi-camera render started",
      renderTier,
      renderPurpose,
      renderSpecVersion: 2,
      totalDurationSeconds: requestedDuration,
      checkpointSeconds: MULTICAM_CHECKPOINT_SECONDS,
      checkpointedRender,
      expectedCheckpointCount,
      billingUnits,
      chargedCredits:
        (!MULTICAM_SERVER_PROOF_REQUIRED || durableRenderEnabled) && creditResult && !creditResult.skipped
          ? cost
          : 0,
      reservedCredits: durableRenderEnabled && creditResult && !creditResult.skipped ? cost : 0,
      pendingCredits: deferCreditCharge ? cost : 0,
      remainingCredits: creditResult ? creditResult.remaining : creditBreakdown?.totalAvailable,
      billingDisabled: !!creditResult?.skipped,
      serverProofRequired: MULTICAM_SERVER_PROOF_REQUIRED,
      dispatchMode: job.dispatchMode,
    });
  } catch (error) {
    console.error("[MediaRoute] Multicam render error:", error.message);
    if (capacityReserved && durableJobId) {
      await releaseMulticamRenderCapacity(durableJobId, "request_failed").catch(releaseError => {
        console.error("[MediaRoute] Multicam capacity release failed:", releaseError.message);
      });
    }
    const statusCode = [409, 429, 503].includes(Number(error.statusCode))
      ? Number(error.statusCode)
      : 500;
    if (error.retryAfterSeconds) {
      res.set("Retry-After", String(error.retryAfterSeconds));
    }
    res.status(statusCode).json({
      message:
        statusCode === 500 ? "Multi-camera render failed" : error.message,
      details: error.message,
      code: error.code || undefined,
    });
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
  const estimatedCredits = estimateCleanAudioSyncCredits();
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
      output_aspect_ratio: req.body?.outputAspectRatio || "16:9",
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
        const hasReviewState = ["needs_review", "approved", "rejected"].includes(
          job.approvalStatus
        );
        const hasDownloadUrl = Boolean(job.outputUrl || job.output_url);
        return (
          job.type === "multicam_render" &&
          !job.hiddenFromRenderLibrary &&
          (hasReviewState || hasDownloadUrl)
        );
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
      retentionDays: parseInt(process.env.MULTICAM_MASTER_RETENTION_DAYS || "7", 10) || 7,
    });
  } catch (error) {
    console.error("[MediaRoute] Failed to list renders:", error.message);
    res.status(500).json({ success: false, message: "Could not load recent renders" });
  }
});

router.delete("/render-jobs/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.uid;
    const ref = admin.firestore().collection("video_edits").doc(jobId);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Render not found" });
    }

    const data = { ...(doc.data() || {}), jobId };
    if (data.userId !== userId && !isAdminRequester(req.user)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to render" });
    }
    if (!isMulticamRenderJob(data)) {
      return res.status(400).json({ success: false, message: "Only Cam Combiner renders can be cleared" });
    }

    const storagePaths = getMulticamStoragePaths(data);
    const bucket = admin.storage().bucket();
    const deletedStoragePaths = await Promise.all(
      storagePaths.map(async storagePath => {
        try {
          await bucket.file(storagePath).delete({ ignoreNotFound: true });
          return { path: storagePath, status: "deleted" };
        } catch (error) {
          return { path: storagePath, status: "failed", error: error.message };
        }
      })
    );
    const failedDeletes = deletedStoragePaths.filter(item => item.status === "failed");
    if (failedDeletes.length) {
      return res.status(502).json({
        success: false,
        message: "Could not clear every saved render file",
        deletedStoragePaths,
      });
    }

    const clearedAt = new Date().toISOString();
    await ref.set(
      {
        hiddenFromRenderLibrary: true,
        retentionStatus: "cleared_by_user",
        masterDeletedAt: clearedAt,
        deletedStoragePaths,
        outputUrl: null,
        output_url: null,
        outputStoragePath: null,
        output_storage_path: null,
        heldOutputUrl: null,
        approvedOutputUrl: null,
        thumbnailUrl: null,
        thumbnail_url: null,
        manifestUrl: null,
        manifest_url: null,
        result: {
          url: null,
          outputUrl: null,
          output_url: null,
          firebase_output_url: null,
          downloadUrl: null,
          download_url: null,
          outputStoragePath: null,
          output_storage_path: null,
          thumbnailUrl: null,
          thumbnail_url: null,
          manifestUrl: null,
          manifest_url: null,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({ success: true, jobId, clearedAt, deletedStoragePaths });
  } catch (error) {
    console.error("[MediaRoute] Failed to clear saved render:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Could not clear saved render",
    });
  }
});

router.post("/render-jobs/:jobId/approve", async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.uid;
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 1000) : null;
    const ref = admin.firestore().collection("video_edits").doc(jobId);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    const data = { ...(doc.data() || {}), jobId };
    if (!canReviewRenderJob(req.user, data)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to job" });
    }
    if (!isMulticamRenderJob(data)) {
      return res.status(400).json({ success: false, message: "Only multicam renders can be approved" });
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const update = buildApprovalUpdate({ data, approvedBy: userId, notes, timestamp });
    await ref.set(update, { merge: true });

    const updatedDoc = await ref.get();
    res.json({
      success: true,
      job: normalizeRenderJob(updatedDoc, updatedDoc.data() || {}),
    });
  } catch (error) {
    console.error("[MediaRoute] Render approval failed:", error.message);
    res.status(500).json({ success: false, message: error.message || "Render approval failed" });
  }
});

router.post("/render-jobs/:jobId/reject", async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.uid;
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 1000) : null;
    const ref = admin.firestore().collection("video_edits").doc(jobId);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    const data = { ...(doc.data() || {}), jobId };
    if (!canReviewRenderJob(req.user, data)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to job" });
    }
    if (!isMulticamRenderJob(data)) {
      return res.status(400).json({ success: false, message: "Only multicam renders can be rejected" });
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const update = buildRejectionUpdate({ data, rejectedBy: userId, notes, timestamp });
    await ref.set(update, { merge: true });

    const updatedDoc = await ref.get();
    res.json({
      success: true,
      job: normalizeRenderJob(updatedDoc, updatedDoc.data() || {}),
    });
  } catch (error) {
    console.error("[MediaRoute] Render rejection failed:", error.message);
    res.status(500).json({ success: false, message: error.message || "Render rejection failed" });
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
    await refundMulticamRenderJobIfNeeded(userId, jobId, data, "status_poll_failed_job");
    if (data.status === "completed" || isFailedJobStatus(data.status)) {
      await releaseMulticamRenderCapacity(jobId, `status_poll_${data.status}`).catch(() => null);
    }

    const approvalView = normalizeRenderApproval(jobId, data);
    const status =
      approvalView.approvalStatus === "needs_review" || approvalView.approvalStatus === "rejected"
        ? approvalView.approvalStatus
        : data.status;
    const sanitizedResult = sanitizeResultForApproval(data.result, approvalView);
    const rawRenderCheckpoint =
      data.renderCheckpoint && typeof data.renderCheckpoint === "object"
        ? data.renderCheckpoint
        : data.result?.renderCheckpoint && typeof data.result.renderCheckpoint === "object"
          ? data.result.renderCheckpoint
          : null;
    const expectedCheckpointCount = Number(
      data.expectedCheckpointCount ??
        data.result?.expectedCheckpointCount ??
        rawRenderCheckpoint?.expectedCount ??
        rawRenderCheckpoint?.totalChunks ??
        0
    );
    const renderCheckpoint = rawRenderCheckpoint || expectedCheckpointCount > 0
      ? {
          stage: rawRenderCheckpoint?.stage || data.stage || null,
          status: rawRenderCheckpoint?.status || null,
          resumable: rawRenderCheckpoint?.resumable === true,
          currentIndex: rawRenderCheckpoint?.currentIndex ?? null,
          completedCount: Number(rawRenderCheckpoint?.completedCount || 0),
          expectedCount: expectedCheckpointCount,
          completedDurationSeconds: Number(rawRenderCheckpoint?.completedDurationSeconds || 0),
          totalDurationSeconds: Number(
            rawRenderCheckpoint?.totalDurationSeconds ??
              data.totalDurationSeconds ??
              data.result?.totalDurationSeconds ??
              0
          ),
        }
      : null;
    const manifestUrl =
      data.manifestUrl ||
      data.manifest_url ||
      data.result?.manifestUrl ||
      data.result?.manifest_url ||
      null;
    const manifestStoragePath =
      data.manifestStoragePath ||
      data.manifest_storage_path ||
      data.result?.manifestStoragePath ||
      data.result?.manifest_storage_path ||
      null;

    res.json({
      success: true,
      status,
      stage: data.stage,
      progress: data.progress,
      renderSpecVersion: data.renderSpecVersion || data.result?.renderSpecVersion || null,
      totalDurationSeconds: data.totalDurationSeconds || data.result?.totalDurationSeconds || 0,
      checkpointSeconds: data.checkpointSeconds || data.result?.checkpointSeconds || 0,
      checkpointedRender: data.checkpointedRender === true || data.result?.checkpointedRender === true,
      expectedCheckpointCount,
      renderCheckpoint,
      manifestUrl,
      manifestStoragePath,
      result: sanitizedResult, // Node worker result, gated until approval
      output_url: approvalView.output_url, // Python worker result, gated until approval
      audio_url: data.audio_url,
      outputUrl: approvalView.outputUrl, // Legacy Node worker result, gated until approval
      previewUrl: approvalView.previewUrl,
      heldOutputUrl: approvalView.heldOutputUrl,
      approvedOutputUrl: approvalView.approvedOutputUrl,
      approvalStatus: approvalView.approvalStatus,
      deliveryStatus: approvalView.deliveryStatus,
      reviewRequired: approvalView.reviewRequired,
      canDownload: approvalView.canDownload,
      qaWarnings: approvalView.qaWarnings,
      qaReport: approvalView.qaReport,
      approval: approvalView.approval,
      thumbnailUrl: approvalView.thumbnailUrl || data.thumbnailUrl || data.thumbnail_url || data.result?.thumbnailUrl || data.result?.thumbnail_url,
      expiresAt: data.expiresAt || data.result?.expiresAt || data.result?.expires_at || null,
      retentionDays: data.retentionDays || data.result?.retention_days || null,
      performanceTiming:
        data.performanceTiming || data.performance_timing || data.result?.performanceTiming || data.result?.performance_timing || null,
      executionTelemetry: data.executionTelemetry || data.execution_telemetry || null,
      clipSuggestions: data.clipSuggestions, // Viral clips
      detail: data.detail,
      message: data.message,
      offsets: data.offsets,
      error: data.error,
      workerError: data.workerError || null,
      workerStatus: data.workerStatus || null,
      serverProof: data.serverProof || null,
      creditsRefunded: data.creditsRefunded || false,
      creditRefund: data.creditRefund || null,
    });
  } catch (e) {
    console.error("Status check failed:", e);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// Phase 2: Viral Clip Analysis
router.post("/analyze", async (req, res) => {
  const userId = req.user.uid;
  const {
    fileUrl,
    localPath = null,
    renderJobId = null,
    forceFresh = false,
    scanNonce = "",
  } = req.body;
  const cost = CREDIT_COSTS.analyze || 8;
  let resolvedSource;
  try {
    resolvedSource = await resolveRequestedMediaSource({
      fileUrl,
      localPath,
      renderJobId,
      userId,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Could not load the requested source",
      code: error.code || "SOURCE_RESOLUTION_FAILED",
    });
  }
  const analysisSource = resolvedSource.outputUrl;
  const billingOperationId = `viral-analysis:${userId}:${crypto.randomUUID()}`;
  let creditReceipt = null;

  try {
    console.log(
      `[MediaRoute] Analyze clip request for user ${userId}, forceFresh=${Boolean(forceFresh)}, nonce=${scanNonce ? "set" : "none"}`
    );

    if (!analysisSource) {
      return res.status(400).json({ error: "Missing fileUrl or localPath" });
    }

    // Check and deduct credits first
    const credits = await chargeVideoEditorCredits(userId, cost, "/analyze", {
      idempotencyKey: billingOperationId,
    });
    creditReceipt = credits;
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
    const learningProfile = await getClipLearningProfile(userId).catch(error => {
      console.warn(
        "[MediaRoute] Clip learning profile unavailable for %s: %s",
        userId,
        error?.message || "Unknown error"
      );
      return null;
    });
    const scenes = await videoEditingService.analyzeVideo(analysisSource, userId, {
      forceFresh: Boolean(forceFresh),
      scanNonce: typeof scanNonce === "string" ? scanNonce : "",
      localPath: resolvedSource.renderJobId ? null : localPath || null,
      learningProfile,
    });
    res.json({
      success: true,
      scenes: scenes,
      remainingCredits: credits.remaining,
      billingDisabled: !!credits.skipped,
      learning: {
        status: learningProfile?.status || "warming_up",
        sampleCount: Number(learningProfile?.sampleCount || 0),
        confidence: Number(learningProfile?.confidence || 0),
      },
      reusedMulticamMaster: Boolean(resolvedSource.renderJobId),
      sourceRenderJobId: resolvedSource.renderJobId,
    });
  } catch (error) {
    console.error(`[MediaRoute] Analyze error:`, error);
    let creditRefund = null;
    if (creditReceipt?.success && !creditReceipt?.skipped && Number(creditReceipt?.deducted || 0) > 0) {
      creditRefund = await refundCredits(userId, creditReceipt, "viral-analysis-refund", {
        idempotencyKey: `${billingOperationId}:refund`,
        reason: "analysis_failed",
      });
    }
    res.status(500).json({
      message: "Analysis failed",
      details: error.message,
      creditsRefunded: Boolean(creditRefund?.success),
      creditRefund,
    });
  }
});

// Phase 2: Render Specific Clip
router.post("/render-clip", async (req, res) => {
  const userId = req.user.uid;
  const { fileUrl, renderJobId = null, startTime, endTime } = req.body;
  const cost = CREDIT_COSTS["render-clip"] || 5;
  const billingOperationId = `viral-render:${userId}:${crypto.randomUUID()}`;
  let creditReceipt = null;

  try {
    const resolvedSource = await resolveRequestedMediaSource({
      fileUrl,
      renderJobId,
      userId,
    });
    const creditRes = await chargeVideoEditorCredits(userId, cost, "/render-clip", {
      idempotencyKey: billingOperationId,
    });
    creditReceipt = creditRes;
    if (!creditRes.success) return res.status(403).json({ message: "Insufficient credits" });

    const result = await videoEditingService.renderClip(
      resolvedSource.outputUrl,
      startTime,
      endTime,
      userId
    );
    res.json({
      success: true,
      url: result.url,
      remainingCredits: creditRes.remaining,
      billingDisabled: !!creditRes.skipped,
      reusedMulticamMaster: Boolean(resolvedSource.renderJobId),
    });
  } catch (error) {
    if (!creditReceipt && error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message || "Could not load the requested source",
        code: error.code || "SOURCE_RESOLUTION_FAILED",
      });
    }
    let creditRefund = null;
    if (creditReceipt?.success && !creditReceipt?.skipped && Number(creditReceipt?.deducted || 0) > 0) {
      creditRefund = await refundCredits(userId, creditReceipt, "viral-render-refund", {
        idempotencyKey: `${billingOperationId}:refund`,
        reason: "render_failed",
      });
    }
    res.status(500).json({
      message: "Rendering failed",
      details: error.message,
      creditsRefunded: Boolean(creditRefund?.success),
      creditRefund,
    });
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

router.validateTrustedDirectorChannelMapRequest = validateTrustedDirectorChannelMapRequest;

module.exports = router;
