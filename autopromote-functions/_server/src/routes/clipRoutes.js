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
const PROMO_SUMMARY_MAX_DURATION_SECONDS = parseInt(
  process.env.SMART_PROMO_MAX_VIDEO_DURATION_SECONDS || "1800",
  10
);
const PROMO_VISUALS_PER_CLIP = parseInt(process.env.SMART_PROMO_VISUALS_PER_CLIP || "3", 10);

function estimatePromoSummaryCredits({
  videoDurationSeconds = 0,
  clipCount = PROMO_SUMMARY_CLIP_COUNT,
  outputMode = "campaign_set",
  includeCaptions = true,
  includeVisuals = true,
} = {}) {
  const duration = Math.max(0, Number(videoDurationSeconds || 0) || 0);
  const safeClipCount = Math.max(1, Math.min(10, Number(clipCount || PROMO_SUMMARY_CLIP_COUNT) || 1));
  const visualCount = includeVisuals ? safeClipCount * PROMO_VISUALS_PER_CLIP : 0;
  const durationBuckets = Math.max(1, Math.ceil(Math.max(duration, 60) / 180));
  const storyModeBoost = String(outputMode).toLowerCase() === "story_edit" ? 8 : 0;
  const captionCost = includeCaptions ? Math.ceil(safeClipCount * 1.5) : 0;
  const visualCost = includeVisuals ? Math.ceil(visualCount * 0.5) : 0;
  const durationCost = durationBuckets * 4;
  const clipCost = safeClipCount * 3;
  const estimated = PROMO_SUMMARY_COST + durationCost + clipCost + captionCost + visualCost + storyModeBoost;
  return {
    credits: Math.max(PROMO_SUMMARY_COST, estimated),
    videoDurationSeconds: duration,
    clipCount: safeClipCount,
    visualCount,
    maxDurationSeconds: PROMO_SUMMARY_MAX_DURATION_SECONDS,
    breakdown: {
      baseAnalysis: PROMO_SUMMARY_COST,
      duration: durationCost,
      clips: clipCost,
      captions: captionCost,
      visuals: visualCost,
      storyMode: storyModeBoost,
    },
  };
}

const PROMO_STYLE_MAP = {
  clean: {
    label: "Clean",
    captionStyle: "minimal",
    smartCropMode: "speaker_track",
    defaultTemplate: "story",
  },
  hype: {
    label: "Hype",
    captionStyle: "bold_pop",
    smartCropMode: "speaker_track",
    defaultTemplate: "reaction",
  },
  minimal: {
    label: "Minimal",
    captionStyle: "minimal",
    smartCropMode: "center",
    defaultTemplate: "tutorial",
  },
};

const PROMO_ANGLE_MAP = {
  stop_scroll: {
    label: "Stop Scroll",
    workerTemplate: "reaction",
    hookReason: "Lead with the sharpest attention spike so the clip earns the thumb stop fast.",
    travelReason: "Optimized for interruption and early retention.",
    roleBlueprints: [
      {
        id: "hook_slap",
        label: "Stop Scroll",
        bestFor: "Reels, Shorts, TikTok",
        captionFallback: "Wait For This",
        hookReason: "Opens on the most interruptive moment.",
        travelReason: "Built to win the first second.",
      },
      {
        id: "proof_snap",
        label: "Proof Snap",
        bestFor: "Shorts, product promos",
        captionFallback: "Here Is Proof",
        hookReason: "Shows the payoff quickly so attention converts into trust.",
        travelReason: "Pairs curiosity with visible proof.",
      },
      {
        id: "replay_angle",
        label: "Replay Angle",
        bestFor: "TikTok, repost sets",
        captionFallback: "Watch That Again",
        hookReason: "Frames the strongest moment so it feels replayable.",
        travelReason: "Leans into rewatch energy and repeat value.",
      },
      {
        id: "last_hit",
        label: "Last Hit",
        bestFor: "Story promos, ad retargeting",
        captionFallback: "Stay For This",
        hookReason: "Holds one final payoff so the promo lands with punch.",
        travelReason: "Ends with enough contrast to stay memorable.",
      },
    ],
  },
  proof_angle: {
    label: "Proof Angle",
    workerTemplate: "podcast",
    hookReason: "Favor moments that sound credible and visibly back up the point.",
    travelReason: "Optimized for trust, clarity, and receipt-heavy promos.",
    roleBlueprints: [
      {
        id: "receipt_open",
        label: "Receipt Open",
        bestFor: "LinkedIn, authority reels",
        captionFallback: "It Actually Works",
        hookReason: "Starts with the strongest receipt or confident statement.",
        travelReason: "Makes the pitch feel earned instead of exaggerated.",
      },
      {
        id: "proof_stack",
        label: "Proof Stack",
        bestFor: "Case studies, product demos",
        captionFallback: "Watch The Proof",
        hookReason: "Builds the clip around cumulative evidence.",
        travelReason: "Useful when conviction beats hype.",
      },
      {
        id: "result_glimpse",
        label: "Result Glimpse",
        bestFor: "Creator offers, launches",
        captionFallback: "Results On Screen",
        hookReason: "Highlights the before/after or visible result moment.",
        travelReason: "Turns interest into belief quickly.",
      },
      {
        id: "trust_close",
        label: "Trust Close",
        bestFor: "Long-form promo followups",
        captionFallback: "Why It Lands",
        hookReason: "Finishes with a reason the viewer can trust.",
        travelReason: "Closes the promo with confidence, not noise.",
      },
    ],
  },
  problem_solution: {
    label: "Problem / Solution",
    workerTemplate: "tutorial",
    hookReason: "Frame the pain first, then pivot into the useful shift or fix.",
    travelReason: "Optimized for clarity and teachable promos.",
    roleBlueprints: [
      {
        id: "pain_first",
        label: "Pain First",
        bestFor: "Educational reels, B2B promos",
        captionFallback: "Here Is The Problem",
        hookReason: "Names the tension before offering relief.",
        travelReason: "Makes the next beat feel necessary.",
      },
      {
        id: "turning_point",
        label: "Turning Point",
        bestFor: "How-to, solution clips",
        captionFallback: "Now Watch The Shift",
        hookReason: "Centers the exact moment the story changes.",
        travelReason: "Gives the promo shape instead of random highlights.",
      },
      {
        id: "clean_fix",
        label: "Clean Fix",
        bestFor: "Tutorial teasers, product explainers",
        captionFallback: "Here Is The Fix",
        hookReason: "Leans into a concise, useful payoff.",
        travelReason: "Useful for viewers who respond to fast value.",
      },
      {
        id: "after_state",
        label: "After State",
        bestFor: "Follow-up promos, reels",
        captionFallback: "That Changes Everything",
        hookReason: "Shows the calmer after-state after the solution lands.",
        travelReason: "Creates satisfying closure instead of abrupt cutoffs.",
      },
    ],
  },
  emotional_pull: {
    label: "Emotional Pull",
    workerTemplate: "story",
    hookReason: "Let the strongest human feeling carry the promo instead of over-cutting it.",
    travelReason: "Optimized for resonance, replay, and performance emotion.",
    roleBlueprints: [
      {
        id: "feel_this",
        label: "Feel This",
        bestFor: "Music, choir, testimony, stories",
        captionFallback: "Feel This Moment",
        hookReason: "Opens on a line or look that already carries emotion.",
        travelReason: "Makes the promo felt before it is processed.",
      },
      {
        id: "breathing_space",
        label: "Breathing Space",
        bestFor: "Performance highlights, reels",
        captionFallback: "Let It Breathe",
        hookReason: "Allows the emotional note to hang a little longer.",
        travelReason: "Creates contrast against more frantic social edits.",
      },
      {
        id: "crescendo_pull",
        label: "Crescendo Pull",
        bestFor: "Choir, singer, stage builds",
        captionFallback: "Then It Hits",
        hookReason: "Climbs toward the emotional peak instead of cutting away too early.",
        travelReason: "Turns buildup into payoff.",
      },
      {
        id: "stay_close",
        label: "Stay Close",
        bestFor: "Story-led promos, community clips",
        captionFallback: "Stay To The End",
        hookReason: "Closes on a line or visual that lingers.",
        travelReason: "Finishes soft but memorable.",
      },
    ],
  },
  authority_burst: {
    label: "Authority Burst",
    workerTemplate: "podcast",
    hookReason: "Package the source like it came from someone who knows exactly what matters.",
    travelReason: "Optimized for conviction, clarity, and expert feel.",
    roleBlueprints: [
      {
        id: "sharp_claim",
        label: "Sharp Claim",
        bestFor: "Authority clips, Shorts, LinkedIn",
        captionFallback: "Listen To This",
        hookReason: "Starts on the strongest confident statement.",
        travelReason: "Gives the promo instant stance.",
      },
      {
        id: "edge_clip",
        label: "Edge Clip",
        bestFor: "Thought leadership, explainers",
        captionFallback: "Here Is The Edge",
        hookReason: "Highlights what makes the insight sharper than average.",
        travelReason: "Useful when distinctiveness matters more than hype.",
      },
      {
        id: "why_it_matters",
        label: "Why It Matters",
        bestFor: "Product pitch, conversion reels",
        captionFallback: "Why It Matters",
        hookReason: "Connects the claim to relevance fast.",
        travelReason: "Turns expertise into actual user value.",
      },
      {
        id: "final_move",
        label: "Final Move",
        bestFor: "Closing promos, campaign sets",
        captionFallback: "This Is The Move",
        hookReason: "Ends on a crisp takeaway or decisive line.",
        travelReason: "Leaves viewers with a clear next thought.",
      },
    ],
  },
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const getPromoStyleConfig = style => {
  const key = String(style || "clean").trim().toLowerCase();
  return PROMO_STYLE_MAP[key] || PROMO_STYLE_MAP.clean;
};

const getPromoAngleConfig = angle => {
  const key = String(angle || "stop_scroll").trim().toLowerCase();
  return PROMO_ANGLE_MAP[key] || PROMO_ANGLE_MAP.stop_scroll;
};

const buildPromoCampaignRoles = (angle, durationSeconds, style) => {
  const angleConfig = getPromoAngleConfig(angle);
  const styleConfig = getPromoStyleConfig(style);
  return angleConfig.roleBlueprints.map((role, index) => ({
    ...role,
    index,
    promoAngle: angle,
    promoAngleLabel: angleConfig.label,
    preferredDurationSeconds: durationSeconds,
    visualStyle: style,
    styleLabel: styleConfig.label,
  }));
};

const _buildStoryEditCampaignRoles = (angle, durationSeconds, style) => {
  const angleConfig = getPromoAngleConfig(angle);
  const styleConfig = getPromoStyleConfig(style);
  const shortRoles = angleConfig.roleBlueprints.slice(0, Math.max(1, PROMO_SUMMARY_CLIP_COUNT - 1));
  return [
    {
      id: "story_master",
      label: "Story Master",
      bestFor: "Product demos, founder videos, feature walkthroughs",
      captionFallback: "The Full Story",
      hookReason: "Builds one complete edited story from the strongest chapters.",
      travelReason: "For users who need the platform to turn a raw full video into a polished promo.",
      storyMaster: true,
      preferredDurationSeconds: durationSeconds,
      promoAngle: angle,
      promoAngleLabel: angleConfig.label,
      visualStyle: style,
      styleLabel: styleConfig.label,
      index: 0,
    },
    ...shortRoles.map((role, index) => ({
      ...role,
      index: index + 1,
      promoAngle: angle,
      promoAngleLabel: angleConfig.label,
      preferredDurationSeconds: Math.min(60, Math.max(15, Math.round(Number(durationSeconds || 120) / 3))),
      visualStyle: style,
      styleLabel: styleConfig.label,
    })),
  ];
};

const getPromoWorkerProfile = (style, angle, durationSeconds) => {
  const styleConfig = getPromoStyleConfig(style);
  const angleConfig = getPromoAngleConfig(angle);
  const isShort = Number(durationSeconds || 30) <= 20;

  let template = angleConfig.workerTemplate || styleConfig.defaultTemplate || "story";
  if (style === "hype" && !isShort) template = "reaction";
  if (style === "minimal") template = "tutorial";
  if (angle === "emotional_pull" && style === "clean") template = "story";

  return {
    captionStyle: styleConfig.captionStyle,
    smartCropMode: styleConfig.smartCropMode,
    template,
    promoAngleLabel: angleConfig.label,
    angleHookReason: angleConfig.hookReason,
    angleTravelReason: angleConfig.travelReason,
  };
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

const buildPromoCaption = (clip, index, role) => {
  const text = String(clip?.text || "").trim();
  const reason = String(clip?.reason || "").trim();
  const fallback = role?.captionFallback || `Promo Cut ${index + 1}`;
  const normalizedText = text ? normalizePromoCaption(text, fallback) : "";
  const normalizedReason = reason ? normalizePromoCaption(reason, fallback) : "";

  if (normalizedText && normalizedText.split(" ").length <= 5) return normalizedText;
  if (normalizedReason && normalizedReason.split(" ").length <= 5) return normalizedReason;
  if (normalizedText && normalizedText.length >= 8) return normalizedText;
  if (normalizedReason && normalizedReason.length >= 8) return normalizedReason;
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
  const campaignRoles = Array.isArray(data.campaignRoles) && data.campaignRoles.length
    ? data.campaignRoles
    : buildPromoCampaignRoles(data.promoAngle, data.targetDurationSeconds, data.style);

  renderedClips.forEach((clip, index) => {
    const clipId = `promo-${docRef.id}-${index + 1}`;
    const campaignRole = campaignRoles[index % campaignRoles.length] || null;
    const promoCaption = buildPromoCaption(clip, index, campaignRole);
    const visualAssets = (Array.isArray(clip.visualAssets) ? clip.visualAssets : [])
      .filter(asset => asset?.url)
      .slice(0, 4)
      .map(asset => ({
        ...asset,
        expiresAt,
        sourceClipId: clipId,
      }));
    const thumbnailOptions = visualAssets.filter(asset => asset.type === "thumbnail");
    const posterOptions = visualAssets.filter(asset => ["poster", "story"].includes(asset.type));
    const payload = {
      id: clipId,
      userId: data.userId,
      url: clip.url,
      storagePath: clip.storagePath || null,
      title: clip.titleSuggestion || clip.hookText || promoCaption,
      description: clip.reason || "AI-generated promotional clip",
      promoCaption: clip.promoCaption || promoCaption,
      hookText: clip.hookText || clip.titleSuggestion || promoCaption,
      titleSuggestion: clip.titleSuggestion || clip.hookText || promoCaption,
      subtitleText: clip.subtitleText || promoCaption,
      captions: Array.isArray(clip.captions) ? clip.captions.slice(0, 24) : [],
      visualAssets,
      thumbnailOptions,
      posterOptions,
      promoPackage: {
        ...(clip.promoPackage || {}),
        hook: clip.hookText || clip.titleSuggestion || promoCaption,
        title: clip.titleSuggestion || clip.hookText || promoCaption,
        subtitle: clip.subtitleText || promoCaption,
        assets: visualAssets,
        assetCount: visualAssets.length,
      },
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
      promoStyleLabel: getPromoStyleConfig(data.style).label,
      promoAngle: data.promoAngle || "stop_scroll",
      promoAngleLabel: getPromoAngleConfig(data.promoAngle).label,
      outputMode: data.outputMode || "campaign_set",
      campaignRole: campaignRole?.id || null,
      campaignRoleLabel: campaignRole?.label || null,
      bestFor: campaignRole?.bestFor || null,
      hookReason: campaignRole?.hookReason || getPromoAngleConfig(data.promoAngle).hookReason,
      travelReason: campaignRole?.travelReason || getPromoAngleConfig(data.promoAngle).travelReason,
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

async function cleanupPromoSummarySource(data, platformTag) {
  if (data?.cleanupTempSourceOnComplete && data?.videoUrl) {
    await cleanupSourceFile(data.videoUrl, {
      currentPlatform: platformTag,
    }).catch(() => {});
  }
}

function hasPromoSummaryConsumedCompute(data) {
  const status = String(data?.status || "").trim().toLowerCase();
  const phase = String(data?.phase || data?.stage || "").trim().toLowerCase();
  const progress = Number(data?.progress || 0);
  const clipSuggestions = Array.isArray(data?.clipSuggestions) ? data.clipSuggestions.length : 0;
  const clips = Array.isArray(data?.clips) ? data.clips.length : 0;

  return (
    status === "analyzing" ||
    status === "rendering" ||
    status === "completed" ||
    phase === "analyzing" ||
    phase === "rendering" ||
    progress > 0 ||
    clipSuggestions > 0 ||
    clips > 0
  );
}

async function markPromoSummaryNonRefundable(docRef, data, reason = "compute_consumed") {
  const noRefundAt = new Date().toISOString();
  await docRef.set(
    {
      billing: {
        ...(data?.billing || {}),
        noRefundAt,
        noRefundReason: reason,
      },
    },
    { merge: true }
  );

  await cleanupPromoSummarySource(data, "smart_promo_summary_failed");

  return {
    ...data,
    billing: {
      ...(data?.billing || {}),
      noRefundAt,
      noRefundReason: reason,
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
      return markPromoSummaryNonRefundable(docRef, failedData, "persist_failed_after_compute");
    }
  }

  if (data.status === "failed") {
    if (hasPromoSummaryConsumedCompute(data)) {
      return markPromoSummaryNonRefundable(
        docRef,
        data,
        data.error || "worker_failed_after_compute"
      );
    }
    return refundPromoSummaryJob(docRef, data, data.error || "worker_failed_before_compute");
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
  const failedTimeoutData = {
    ...timeoutData,
    status: "failed",
    error: "Promo summary timed out while waiting for worker completion.",
  };
  if (hasPromoSummaryConsumedCompute(failedTimeoutData)) {
    await markPromoSummaryNonRefundable(jobRef, failedTimeoutData, "timeout_after_compute");
  } else {
    await refundPromoSummaryJob(jobRef, failedTimeoutData, "timeout_before_compute");
  }
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
 * @route POST /promo-summary/estimate
 * @desc Estimate Smart Promo Summary credits before processing
 * @access Private
 */
router.post("/promo-summary/estimate", authMiddleware, async (req, res) => {
  const estimate = estimatePromoSummaryCredits({
    videoDurationSeconds: req.body?.videoDurationSeconds,
    clipCount: req.body?.clipCount || PROMO_SUMMARY_CLIP_COUNT,
    outputMode: req.body?.outputMode,
    includeCaptions: req.body?.includeCaptions !== false,
    includeVisuals: req.body?.includeVisuals !== false,
  });

  if (
    estimate.videoDurationSeconds > 0 &&
    estimate.videoDurationSeconds > PROMO_SUMMARY_MAX_DURATION_SECONDS
  ) {
    return res.status(413).json({
      success: false,
      error: "Video too long",
      message: `Smart Promo currently supports videos up to ${Math.round(PROMO_SUMMARY_MAX_DURATION_SECONDS / 60)} minutes for one job.`,
      estimate,
    });
  }

  res.json({
    success: true,
    estimate,
  });
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
    promoAngle = "stop_scroll",
    outputMode = "campaign_set",
    sourceStoragePath = null,
    sourceFingerprint = null,
    videoDurationSeconds = 0,
  } = req.body || {};
  const userId = req.user.uid;

  const requestedOutputMode = String(outputMode || "visual_edit").trim().toLowerCase();
  const normalizedOutputMode =
    requestedOutputMode === "visual_edit" || requestedOutputMode === "story_edit"
      ? "visual_edit"
      : "campaign_set";
  const allowedDurations =
    normalizedOutputMode === "visual_edit" ? [60, 120, 180, 300] : [15, 30, 60];
  const targetDurationSeconds = allowedDurations.includes(Number(durationSeconds))
    ? Number(durationSeconds)
    : normalizedOutputMode === "visual_edit"
      ? 120
      : 30;
  const normalizedStyle = String(style || "clean").trim().toLowerCase();
  const normalizedPromoAngle = String(promoAngle || "stop_scroll").trim().toLowerCase();
  const workerProfile = getPromoWorkerProfile(
    normalizedStyle,
    normalizedPromoAngle,
    targetDurationSeconds
  );
  const campaignRoles =
    normalizedOutputMode === "visual_edit"
      ? []
      : buildPromoCampaignRoles(normalizedPromoAngle, targetDurationSeconds, normalizedStyle);
  const workflowType =
    normalizedOutputMode === "visual_edit" ? "smart_promo_visual_v1" : "campaign_set_v1";
  const analysisCacheKey =
    sourceFingerprint ||
    sourceStoragePath ||
    contentId ||
    `${videoUrl}|${Math.round(Number(videoDurationSeconds || 0))}`;

  if (!videoUrl) {
    return res.status(400).json({ error: "Missing videoUrl" });
  }

  try {
    const estimate = estimatePromoSummaryCredits({
      videoDurationSeconds,
      clipCount: PROMO_SUMMARY_CLIP_COUNT,
      outputMode: normalizedOutputMode,
      includeCaptions: normalizedOutputMode !== "visual_edit",
      includeVisuals: true,
    });
    if (
      estimate.videoDurationSeconds > 0 &&
      estimate.videoDurationSeconds > PROMO_SUMMARY_MAX_DURATION_SECONDS
    ) {
      return res.status(413).json({
        error: "Video too long",
        message: `Smart Promo currently supports videos up to ${Math.round(PROMO_SUMMARY_MAX_DURATION_SECONDS / 60)} minutes for one job.`,
        estimate,
      });
    }

    const credits = await deductCredits(userId, estimate.credits, "promo-summary");
    if (!credits.success) {
      return res.status(402).json({
        error: "Insufficient credits",
        message: "Smart Promo Summary is a premium feature and requires credits.",
        required: estimate.credits,
        remaining: credits.remaining || 0,
        estimate,
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
        promoAngle: normalizedPromoAngle,
        promoAngleLabel: getPromoAngleConfig(normalizedPromoAngle).label,
        outputMode: normalizedOutputMode,
        workflowType,
        captionStyle: workerProfile.captionStyle,
        smartCropMode: workerProfile.smartCropMode,
        template: workerProfile.template,
        campaignRoles,
        clips: [],
        createdAt: new Date().toISOString(),
        cleanupTempSourceOnComplete: Boolean(
          sourceStoragePath &&
            /^(temp_uploads|temp_sources)\//.test(String(sourceStoragePath))
        ),
        sourceStoragePath: sourceStoragePath || null,
        sourceFingerprint: sourceFingerprint || null,
        analysisCacheKey,
        billing: {
          charged: true,
          cost: estimate.credits,
          estimate,
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
          caption_style: workerProfile.captionStyle,
          smart_crop_mode: workerProfile.smartCropMode,
          target_aspect_ratio: "9:16",
          template: workerProfile.template,
          style: normalizedStyle,
          promo_angle: normalizedPromoAngle,
          output_mode: normalizedOutputMode,
          workflow_type: workflowType,
          analysis_cache_key: analysisCacheKey,
          campaign_roles: campaignRoles,
          creative_brief: {
            promo_angle: normalizedPromoAngle,
            promo_angle_label: getPromoAngleConfig(normalizedPromoAngle).label,
            hook_reason: workerProfile.angleHookReason,
            travel_reason: workerProfile.angleTravelReason,
            style: normalizedStyle,
          },
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
      cost: estimate.credits,
      estimate,
      creditsRemaining: credits.remaining,
      clipCount: PROMO_SUMMARY_CLIP_COUNT,
      promoAngle: normalizedPromoAngle,
      outputMode: normalizedOutputMode,
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
