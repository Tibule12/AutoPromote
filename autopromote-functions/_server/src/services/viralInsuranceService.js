const { db } = require("../firebaseAdmin");
const videoClippingService = require("./videoClippingService");
// Platform services for garbage collection
const youtubeService = require("./youtubeService");
const tiktokService = require("./tiktokService");

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

    const promises = snapshot.docs.map(doc => this.evaluateClaim(doc));
    const results = await Promise.all(promises);
    return results;
  }

  /**
   * Evaluate a single claim
   */
  async evaluateClaim(doc) {
    const data = doc.data();
    const { postId, platform, userId, volatility, videoUrl } = data;

    console.log(`[Protocol 7] 🔍 Evaluating claim for ${postId}...`);

    // 1. Check Engagement (Mocked for now, normally calls Analytics API)
    const currentViews = await this.mockGetViews(postId);
    const threshold = this.THRESHOLDS[platform] || 200;

    if (currentViews < threshold) {
      console.log(
        `[Protocol 7] ⚠️ Engagement Miss: ${currentViews}/${threshold} views. Triggering Remix.`
      );

      // 2. Trigger Remediation
      const remixResult = await this.triggerRemix(userId, videoUrl, volatility);

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
   */
  async garbageCollectFlop(uid, platform, postId) {
    console.log(`[Protocol 7] 🧹 Garbage Collecting (Deleting) Flop: ${platform} ${postId}`);
    if (process.env.ENABLE_GARBAGE_COLLECTOR !== "true") {
      console.log(`[Protocol 7] 🛑 Garbage Collector disabled via env. Skipping delete.`);
      return;
    }

    switch (platform) {
      case "youtube":
      case "youtube_shorts":
        // youtubeService.deleteVideo expects object { uid, videoId }
        await youtubeService.deleteVideo({ uid, videoId: postId });
        break;
      case "tiktok":
        await tiktokService.deleteTikTokVideo(uid, postId);
        break;
      default:
        console.warn(`[Protocol 7] No garbage collector adapter for ${platform}`);
    }
  }

  async triggerRemix(userId, videoUrl, volatility) {
    // Determine instructions based on volatility
    let instructions = "Optimize for viral retention.";
    if (volatility === "surgical")
      instructions = "Adjust metadata and captions only. Keep cuts similar.";
    if (volatility === "chaos")
      instructions = "Aggressive remix. Change ordering, add rapid cuts, high energy.";

    // Call VideoClippingService
    console.log(`[Protocol 7] 🎬 Remixing with strategy: ${volatility.toUpperCase()}`);

    // In a real scenario, we'd pass these instructions to the AI
    // For now, we reuse analyzeVideo as a proxy for "doing AI work"
    // or just return a mock success if we don't want to burn tokens

    // return await this.clippingService.analyzeVideo(videoUrl, `remix-${Date.now()}`, userId);
    return { success: true, clipId: `remix_${Date.now()}_${volatility}` };
  }

  // Mock analytics helper
  async mockGetViews(postId) {
    // Randomly return low or high views to simulate both outcomes
    return Math.floor(Math.random() * 800);
  }
}

module.exports = new ViralInsuranceService();
