const { db } = require("../firebaseAdmin");
const logger = require("../utils/logger");
const path = require("path");
const sanitizeForFirestore = require(path.join(__dirname, "../utils", "sanitizeForFirestore"));
const billingService = require("./billingService"); // Cost Control
const notificationEngine = require("./notificationEngine"); // User Awareness

// Lazy-load internal engines to avoid circular deps or startup lag
let hashtagEngine;
let smartDistributionEngine;
let viralImpactEngine;
let algorithmExploitationEngine;
let mediaTransform;

/**
 * Ensures all viral engines are loaded.
 */
function loadEngines() {
  if (!hashtagEngine) hashtagEngine = require("./hashtagEngine");
  if (!smartDistributionEngine) smartDistributionEngine = require("./smartDistributionEngine");
  if (!viralImpactEngine) viralImpactEngine = require("./viralImpactEngine");
  if (!algorithmExploitationEngine)
    algorithmExploitationEngine = require("./algorithmExploitationEngine");
  if (!mediaTransform) mediaTransform = require("./mediaTransform");
}

/**
 * Performs the heavy-lifting viral optimization in the background.
 * @param {string} contentId - The Firestore Doc ID.
 * @param {string} userId - The owner ID.
 * @param {Object} contentData - The content object (title, type, url, etc.).
 * @param {Object} options - Configuration overrides (bypassViral, flags, etc.).
 */
async function performViralOptimization(contentId, userId, contentData, options = {}) {
  const contentRef = db.collection("content").doc(contentId);
  const startTime = Date.now();

  try {
    loadEngines();

    // 0. Update Status to Processing (if not already)
    // This helps recovery scripts know it's being worked on.
    await contentRef.update({
      optimizationStatus: "processing",
      lastOptimizedAt: new Date().toISOString(),
    });

    // Notify User: Optimization Started
    notificationEngine
      .sendNotification(
        userId,
        `Viral Optimization initiated for "${contentData.title || "Untitled"}"`,
        "info",
        { contentId: contentId }
      )
      .catch(e => logger.warn("Notification failed:", e.message));

    const {
      bypassViral = false,
      enhance_quality = true,
      custom_hashtags = [],
      growth_guarantee = true,
      viral_boost = {},
      repost_boost = false,
      share_boost = false,
      target_platforms = [],
      scheduled_promotion_time,
      platform_options = {},
    } = options;

    const type = contentData.type;
    const url = contentData.url;
    const quality_score = contentData.quality_score;

    // 1. AI Content Enhancement (Media Transform)
    if (type === "video" && enhance_quality !== false) {
      try {
        await mediaTransform.enqueueMediaTransformTask({
          contentId: contentId,
          uid: userId,
          url: url,
          meta: { quality_enhanced: true, original_quality: quality_score || "standard" },
        });
      } catch (e) {
        logger.warn(`[Optimization] Failed to queue enhancement for ${contentId}:`, e.message);
      }
    }

    let hashtagOptimization = { hashtags: [] };
    let distributionStrategy = { platforms: [] };
    let algorithmOptimization = { optimizationScore: 0 };
    let viralSeeding = { seedingResults: [] };
    let boostChain = { chainId: null, squadSize: 0 };

    if (!bypassViral) {
      // COST CONTROL: Check AI Limits
      let aiAllowed = false;
      try {
        const userAILimit = await billingService.checkAILimit(userId);
        if (userAILimit.allowed) {
          aiAllowed = true;
          // Optimistically track usage (we commit to using it)
          // In production, you might track *after* a successful API call
          billingService
            .trackAIUsage(userId)
            .catch(e => logger.warn(`[Billing] Failed to track AI usage for ${userId}`, e));
        } else {
          logger.info(
            `[Optimization] User ${userId} exceeded AI limit (${userAILimit.limit}). Using heuristic mode.`
          );

          // Notify User: Limited Mode
          notificationEngine
            .sendNotification(
              userId,
              "AI Optimization Limited: You've reached your monthly AI usage cap. Using standard algorithms instead.",
              "warning",
              { type: "usage_limit" }
            )
            .catch(e => logger.warn("Notification failed:", e.message));
        }
      } catch (billingErr) {
        logger.warn(`[Billing] Failed to check AI limit for ${userId}:`, billingErr.message);
        // Fail open or closed? Here we fail open to basic heuristics (aiAllowed = false)
      }

      // 2. Hashtag Generation
      hashtagOptimization = await hashtagEngine.generateCustomHashtags({
        content: contentData,
        platform: target_platforms[0] || "tiktok",
        customTags: custom_hashtags || [],
        growthGuarantee: growth_guarantee !== false,
      });

      // 3. Smart Distribution
      distributionStrategy = await smartDistributionEngine.generateDistributionStrategy(
        contentData,
        target_platforms,
        { timezone: "UTC", growthGuarantee: growth_guarantee !== false }
      );

      // 4. Algorithm Exploitation
      algorithmOptimization = await algorithmExploitationEngine.optimizeForAlgorithm(
        contentData,
        target_platforms[0] || "tiktok",
        { useAI: aiAllowed }
      );

      // 5. Viral Seeding
      viralSeeding = await viralImpactEngine.seedContentToVisibilityZones(
        contentData,
        target_platforms[0] || null,
        { forceAll: viral_boost?.force_seeding || false }
      );

      // 6. Boost Chain
      boostChain = await viralImpactEngine.orchestrateBoostChain(contentData, target_platforms, {
        userId,
        squadUserIds: viral_boost?.squad_user_ids || [],
      });

      // 7. Persist Results
      await contentRef.update({
        viral_optimization: sanitizeForFirestore({
          hashtags: hashtagOptimization,
          distribution: distributionStrategy,
          algorithm: algorithmOptimization,
          seeding: viralSeeding,
          boost_chain: boostChain,
          optimized_at: new Date().toISOString(),
        }),
        viral_velocity: { current: 0, category: "new", status: "optimized" },
        optimizationStatus: "completed", // Key for recovery check
        growth_guarantee_badge: {
          enabled: true,
          message: "AutoPromote Boosted: Guaranteed to Grow or Retried Free",
          viral_score: algorithmOptimization.optimizationScore || 0,
        },
      });
    } else {
      // Mark as skipped/completed if bypassed
      await contentRef.update({ optimizationStatus: "skipped_bypass" });
    }

    // 8. Schedule Promotion
    const optimalTiming =
      distributionStrategy.platforms?.[0]?.timing?.optimalTime ||
      scheduled_promotion_time ||
      new Date().toISOString();

    const selectedPlatform =
      Array.isArray(target_platforms) && target_platforms.length > 0 ? target_platforms[0] : null;

    if (selectedPlatform) {
      const scheduleData = {
        contentId: contentId,
        user_id: userId,
        platform: selectedPlatform,
        startTime: optimalTiming,
        status: "pending",
        isActive: true,
        repost_boost: repost_boost,
        share_boost: share_boost,
        platformSpecificSettings: {
          ...(platform_options || {}),
          repost_boost,
          share_boost,
        },
      };
      await db.collection("promotion_schedules").add(scheduleData);
    } else {
      logger.warn(`[Optimization] No platform selected for scheduling ${contentId}`);
    }

    // Success Notification
    const successMsg = selectedPlatform
      ? `Content optimized & scheduled for ${selectedPlatform} at ${new Date(optimalTiming).toLocaleString()}`
      : `Content optimized successfully (No platform scheduled)`;

    await notificationEngine.sendNotification(userId, successMsg, "success", {
      contentId,
      platform: selectedPlatform,
    });

    logger.info(`[Optimization] Completed for ${contentId} in ${Date.now() - startTime}ms`);
    return { success: true };
  } catch (err) {
    logger.error(`[Optimization] Failed for ${contentId}:`, err);
    await contentRef.update({
      viral_velocity: { status: "optimization_failed", error: err.message },
      optimizationStatus: "failed",
    });

    // Failure Notification
    await notificationEngine
      .sendNotification(userId, `Optimization failed: ${err.message}`, "error", { contentId })
      .catch(e => logger.warn("Notification failed:", e.message));

    return { success: false, error: err };
  }
}

/**
 * Scans for 'processing' jobs that are older than X minutes and re-queues them.
 * Call this on server startup.
 */
async function recoverStuckOptimizations() {
  const STUCK_THRESHOLD_MIN = 5;
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MIN * 60 * 1000);

  try {
    const snap = await db
      .collection("content")
      .where("optimizationStatus", "==", "processing")
      .where("lastOptimizedAt", "<=", cutoff.toISOString())
      .limit(10) // Process in batches
      .get();

    if (snap.empty) return;

    logger.info(`[Recovery] Found ${snap.size} stuck optimization jobs. Restarting...`);

    for (const doc of snap.docs) {
      const data = doc.data();
      // We might lose some transient options (like isDryRun or volatile flags)
      // but we can recover the core content optimization.
      const options = {
        // Reconstruct basic options from data where possible
        target_platforms: data.target_platforms || [],
        platform_options: data.platform_options || {},
        bypassViral: false,
      };

      // Re-trigger (fire and forget)
      performViralOptimization(doc.id, data.user_id, data, options);
    }
  } catch (e) {
    logger.error("[Recovery] Failed to scan for stuck jobs:", e);
  }
}

module.exports = {
  performViralOptimization,
  recoverStuckOptimizations,
};
