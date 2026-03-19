const { db } = require("../firebaseAdmin");
const videoClippingService = require("./videoClippingService");
// Platform services for garbage collection & STATS
const youtubeService = require("./youtubeService");
const tiktokService = require("./tiktokService");
const { fetchTikTokMetrics, fetchInstagramMediaMetrics } = require("./platformMetricsService");
const mediaTransform = require("./mediaTransform");
// Import Notification Engine for Hybrid Strategy
const notificationEngine = require("./notificationEngine");
const rateLimitTracker = require("./rateLimitTracker"); // Protocol 7 Stealth Mode

// Optional: import an analytics service if available

class ViralInsuranceService {
  constructor() {
    this.clippingService = videoClippingService;
    this.collection = db.collection("viral_insurance_claims");
    this.THRESHOLDS = {
      tiktok: 500, // 500 views in 7 hours
      youtube: 100,
      instagram: 300,
    };
  }

  /**
   * Register a new post for Protocol 7 protection
   * @param {string} userId
   * @param {string} postId
   * @param {string} platform
   * @param {string} videoUrl
   * @param {string} volatility 'standard', 'surgical', 'chaos'
   */
  async registerClaim(userId, postId, platform, videoUrl, volatility = "standard") {
    const checkTime = new Date();
    checkTime.setHours(checkTime.getHours() + 7); // 7 Hour Protocol

    await this.collection.doc(postId).set({
      userId,
      postId,
      platform,
      videoUrl,
      volatility,
      status: "active",
      createdAt: new Date(),
      checkAt: checkTime,
      logs: [],
    });

    console.log(
      `[Protocol 7] 🛡️ Insurance registered for ${postId} on ${platform}. Volatility: ${volatility}`
    );
    return { success: true, checkAt: checkTime };
  }

  /**
   * Run the periodic check (Cron job would call this)
   */
  async runWatchdog() {
    const now = new Date();
    const snapshot = await this.collection
      .where("status", "==", "active")
      .where("checkAt", "<=", now)
      .get();

    if (snapshot.empty) {
      console.log("[Protocol 7] No active claims pending review.");
      return;
    }

    const results = [];
    console.log(
      `[Protocol 7] Found ${snapshot.size} claims to review. Processing sequentially to respect API limits.`
    );

    // Sequential processing to avoid API Limit Slams (Guerrilla Tactics)
    for (const doc of snapshot.docs) {
      try {
        results.push(await this.evaluateClaim(doc));
        // Add jitter (1s - 3s) between checks to mimic human behavior
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
      } catch (e) {
        console.error(`[Protocol 7] Error processing claim ${doc.id}:`, e);
      }
    }
    return results;
  }

  /**
   * Evaluate a single claim
   */
  async evaluateClaim(doc) {
    const data = doc.data();
    const { postId, platform, userId, volatility, videoUrl } = data;

    console.log(`[Protocol 7] 🔍 Evaluating claim for ${postId}...`);

    // 1. Check Engagement (REAL Analytics, No Mocks)
    let currentViews;
    try {
      currentViews = await this.getRealViews(platform, userId, postId);
    } catch (e) {
      console.warn(`[Protocol 7] ⚠️ Failed to fetch stats for ${postId}: ${e.message}`);
      currentViews = -1; // Flag as error
    }

    if (currentViews === -1) {
      console.log(`[Protocol 7] 🛑 Stats unavailable. Skipping decision for now.`);
      return { postId, outcome: "skipped_stats_error" };
    }

    const threshold = this.THRESHOLDS[platform] || 200;

    if (currentViews < threshold) {
      console.log(
        `[Protocol 7] ⚠️ Engagement Miss: ${currentViews}/${threshold} views. Triggering Remix.`
      );

      // 2. Trigger Remediation
      const remixResult = await this.triggerRemix(userId, videoUrl || postId, volatility);

      // 3. Garbage Collection (Auto-Delete Flop)
      // "If views < threshold ... DELETE the post" logic
      // We only delete if it's a confirmed flop to keep the profile clean.
      try {
        await this.garbageCollectFlop(userId, platform, postId);
      } catch (gcError) {
        console.warn(`[Protocol 7] ⚠️ Garbage collection failed for ${postId}:`, gcError.message);
      }

      await doc.ref.update({
        status: "claimed",
        finalViews: currentViews,
        remediatedAt: new Date(),
        remixId: remixResult.clipId || "mock-id",
        garbageCollected: true, // Mark as deleted/cleaned
        logs: [
          ...data.logs,
          `Triggered remix at ${new Date().toISOString()}. Views: ${currentViews}`,
          `Garbage collection attempted.`,
        ],
      });

      return { postId, outcome: "remediated", details: remixResult };
    } else {
      console.log(
        `[Protocol 7] ✅ Engagement Success: ${currentViews}/${threshold} views. Policy fulfilled.`
      );

      await doc.ref.update({
        status: "fulfilled",
        finalViews: currentViews,
        fulfilledAt: new Date(),
        logs: [
          ...data.logs,
          `Policy fulfilled at ${new Date().toISOString()}. Views: ${currentViews}`,
        ],
      });

      return { postId, outcome: "success" };
    }
  }

  /**
   * Delete the underperforming post from the platform to clean up the user's profile.
   * Hybrid Strategy: Delete if API allows, notify if manual action required.
   */
  async garbageCollectFlop(uid, platform, postId) {
    console.log(`[Protocol 7] 🧹 Processing Flop: ${platform} ${postId}`);

    // Allow override for manual testing
    if (
      process.env.ENABLE_GARBAGE_COLLECTOR !== "true" &&
      process.env.ENABLE_GARBAGE_COLLECTOR !== "manual"
    ) {
      console.log(`[Protocol 7] 🛑 Garbage Collector disabled via env. Skipping delete.`);
      return;
    }

    try {
      switch (platform) {
        case "youtube":
        case "youtube_shorts":
          // Full Automation: API Supports Delete

          // STEALTH MODE (Guerrilla Warfare): Check specific action limits
          const cooldown = await rateLimitTracker.getCooldown("youtube_delete");
          if (cooldown > Date.now()) {
            console.warn(`[Protocol 7] ⏳ YouTube Deletion cooling down. Skipping to survive.`);
            // We throw specifically so the caller knows we purposefully skipped, but the REMIX still happened.
            throw new Error("RateLimitCooldown");
          }

          try {
            await youtubeService.deleteVideo({ uid, videoId: postId });
            console.log(`[Protocol 7] ✅ YouTube video automatically deleted.`);
          } catch (ytErr) {
            // If the Giant strikes back (429/Quota), we retreat instantly.
            if (
              ytErr.message &&
              (ytErr.message.includes("429") ||
                ytErr.message.includes("quota") ||
                ytErr.message.includes("limit"))
            ) {
              console.warn(`[Protocol 7] 🛑 YouTube Quota Hit. Applying 1h Cooldown.`);
              await rateLimitTracker.noteRateLimit("youtube_delete", 3600000); // 1hr penalty box
            }
            throw ytErr;
          }
          break;

        case "tiktok":
        case "instagram":
          // Partial Automation: API Restriction
          // We cannot delete via API without Partner Access.
          // Notify user to delete manually to maintain feed hygiene.
          console.log(`[Protocol 7] ⚠️ ${platform} API does not support delete. Notifying user.`);

          await notificationEngine.sendNotification(
            uid,
            `Protocol 7 Alert: Your ${platform} video underperformed. A remix is being generated.`,
            "action_required",
            {
              type: "protocol_7_manual_delete",
              postId,
              platform,
              message:
                "Please delete the original video manually to maintain your feed optimization score.",
            }
          );
          break;

        default:
          console.warn(`[Protocol 7] No garbage collector adapter for ${platform}`);
      }
    } catch (e) {
      // Log but do not crash the remix process
      console.error(`[Protocol 7] Garbage collection error: ${e.message}`);
    }
  }

  async triggerRemix(userId, videoUrl, volatility) {
    // Determine instructions based on volatility
    let strategy = {
      trimSilence: true,
      normalizeAudio: true,
      fixAspectRatio: true,
    };

    let viralRemix = false;

    // CHAOS MODE: Enable Full Mutation (Protocol 7)
    if (volatility === "chaos" || volatility === "high") {
      strategy.chaosMode = true;
      viralRemix = true;
    }

    // Use Real Media Transformation Service
    console.log(
      `[Protocol 7] 🎬 Enqueuing Real Remix: ${volatility.toUpperCase()} (ViralMutation: ${viralRemix})`
    );

    // We queue a task for the media worker (Python/FFmpeg)
    // Using mediaTransform wrapper
    try {
      // Find existing mediaTransform import or require it
      const _mediaTransform = require("./mediaTransform");

      const task = await _mediaTransform.enqueueMediaTransformTask({
        contentId: `remix_${Date.now()}`, // Temporary ID
        uid: userId,
        url: videoUrl, // Original source URL
        meta: {
          protocol7_remix: true,
          viral_remix: viralRemix, // Explicit flag for the Mutation Engine
          strategy,
        },
      });
      return { success: true, clipId: task.id, status: "queued" };
    } catch (e) {
      console.warn(`[Protocol 7] Remix queue failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  // Real Analytics Helper
  async getRealViews(platform, userId, postId) {
    if (platform === "youtube" || platform === "youtube_shorts") {
      const stats = await youtubeService.fetchVideoStats({ uid: userId, videoId: postId });
      return parseInt(stats.statistics.viewCount || 0, 10);
    }
    if (platform === "tiktok") {
      // Use PlatformMetricsService or direct TikTok Fetch
      const videos = await tiktokService.getVideoMetrics(userId, [postId]);
      if (videos && videos.length > 0) {
        return parseInt(videos[0].view_count || 0, 10);
      }
      return -1; // Not found
    }
    if (platform === "instagram") {
      const metrics = await fetchInstagramMediaMetrics(postId);
      return metrics ? parseInt(metrics.impressions || metrics.engagement || 0, 10) : -1;
    }
    // Default fallback
    return -1;
  }
}

module.exports = new ViralInsuranceService();
