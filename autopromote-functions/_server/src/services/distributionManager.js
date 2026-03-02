const { db } = require("../firebaseAdmin");
const youtubeService = require("./youtubeService");
const tiktokService = require("./tiktokService");
const logger = require("../utils/logger");

/**
 * Distribution Manager
 * Handles the orchestration of cross-platform publishing.
 * Designed to run asynchronously so the user doesn't wait.
 */

const distributeContent = async (contentId, userId) => {
  logger.info(`[DistributionManager] Starting distribution for content: ${contentId}`);

  try {
    // 1. Fetch the full content record
    const contentRef = db.collection("content").doc(contentId);
    const doc = await contentRef.get();

    if (!doc.exists) {
      throw new Error(`Content ${contentId} not found`);
    }

    const content = doc.data();
    const { url, title, description, target_platforms, platform_options } = content;

    if (!target_platforms || target_platforms.length === 0) {
      logger.info(`[DistributionManager] No target platforms for ${contentId}`);
      return;
    }

    // 2. Iterate through platforms and publish
    // We run these in parallel-ish (awaiting each to prevent memory overload, or Promise.all if robust)

    const results = {};

    // --- YOUTUBE ---
    if (target_platforms.includes("youtube")) {
      try {
        await updatePlatformStatus(contentId, "youtube", "processing");

        const opts = platform_options?.youtube || {};
        const uploadUrl = opts.media_url || url; // Prefer specific file, fallback to global

        const result = await youtubeService.uploadVideo({
          uid: userId,
          title: title,
          description: description,
          fileUrl: uploadUrl,
          contentId: contentId,
          shortsMode: opts.shortsMode || false,
          skipIfDuplicate: true,
        });

        results.youtube = { success: true, id: result.videoId };
        await updatePlatformStatus(contentId, "youtube", "published", result);
      } catch (err) {
        logger.error(`[DistributionManager] YouTube upload failed: ${err.message}`);
        results.youtube = { success: false, error: err.message };
        await updatePlatformStatus(contentId, "youtube", "failed", { error: err.message });
      }
    }

    // --- TIKTOK ---
    if (target_platforms.includes("tiktok")) {
      try {
        await updatePlatformStatus(contentId, "tiktok", "processing");

        const opts = platform_options?.tiktok || {};
        const uploadUrl = opts.media_url || url; // Prefer specific file, fallback to global

        // Use the tiktokService (assuming it has an upload/post method exposed)
        // If not yet fully implemented, we utilize the postToTikTok logic
        // Note: Real TikTok API requires 'video_upload' capability which is restricted.
        // For MVP/Simulation:
        const result = await tiktokService.postToTikTok({
          userId,
          fileUrl: uploadUrl,
          caption: title, // TikTok uses title as caption usually
          privacy: opts.privacy || "public_readers",
        });

        results.tiktok = { success: true, id: result.itemId };
        await updatePlatformStatus(contentId, "tiktok", "published", result);
      } catch (err) {
        logger.error(`[DistributionManager] TikTok upload failed: ${err.message}`);
        results.tiktok = { success: false, error: err.message };
        await updatePlatformStatus(contentId, "tiktok", "failed", { error: err.message });
      }
    }

    // --- FACEBOOK / INSTAGRAM / OTHERS ---
    // (Add similar blocks here using socialPlatformHelpers or specific services)

    logger.info(`[DistributionManager] Distribution complete for ${contentId}`, results);
    return results;
  } catch (err) {
    logger.error(`[DistributionManager] Critical failure: ${err.message}`);
    throw err;
  }
};

// Helper: Update the status in Firestore so the Frontend can see it live
async function updatePlatformStatus(contentId, platform, status, details = {}) {
  await db
    .collection("content")
    .doc(contentId)
    .update({
      [`distribution.${platform}.status`]: status,
      [`distribution.${platform}.updatedAt`]: new Date().toISOString(),
      [`distribution.${platform}.details`]: details,
    });
}

module.exports = {
  distributeContent,
};
