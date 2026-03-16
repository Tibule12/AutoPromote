const { db } = require("../firebaseAdmin");
const { enqueuePlatformPostTask } = require("./promotionTaskQueue");
const logger = require("../utils/logger");

/**
 * Distribution Manager
 * Handles the orchestration of cross-platform publishing.
 * Designed to run asynchronously so the user doesn't wait.
 */

function buildPlatformPayload(content, platform) {
  const { url, title, description, platform_options = {} } = content;
  const opts = platform_options[platform] || {};

  switch (platform) {
    case "youtube":
      return {
        title,
        description,
        mediaUrl: opts.media_url || url,
        fileUrl: opts.media_url || url,
        shortsMode: !!opts.shortsMode,
        privacy: opts.privacy || opts.visibility,
        platformOptions: opts,
      };
    case "tiktok":
      return {
        title,
        caption: opts.caption || description || title,
        description,
        mediaUrl: opts.media_url || url,
        videoUrl: opts.media_url || url,
        privacy: opts.privacy || "public_readers",
        platformOptions: opts,
      };
    case "facebook":
      return {
        title,
        description,
        message: opts.message || description || title,
        mediaUrl: opts.media_url || url,
        videoUrl: opts.media_url || url,
        pageId: opts.pageId,
        platformOptions: opts,
      };
    case "instagram":
      return {
        title,
        description,
        caption: opts.caption || description || title,
        mediaUrl: opts.media_url || url,
        media_type: opts.media_type || "VIDEO",
        pageId: opts.pageId,
        platformOptions: opts,
      };
    case "reddit":
      return {
        title: opts.title || title,
        description,
        text: opts.text || description || title,
        subreddit: opts.subreddit,
        kind: opts.kind || "video",
        mediaUrl: opts.media_url || url,
        videoUrl: opts.media_url || url,
        url: opts.url || url,
        platformOptions: opts,
      };
    case "linkedin":
      return {
        title: opts.title || title,
        description,
        text: opts.commentary || description || title,
        commentary: opts.commentary || description || title,
        mediaUrl: opts.media_url || url,
        videoUrl: opts.media_url || url,
        postType: opts.postType || "video",
        platformOptions: opts,
      };
    default:
      return {
        title,
        description,
        message: description || title,
        mediaUrl: opts.media_url || url,
        url: opts.url || url,
        platformOptions: opts,
      };
  }
}

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
    const { target_platforms, distribution = {} } = content;

    if (!target_platforms || target_platforms.length === 0) {
      logger.info(`[DistributionManager] No target platforms for ${contentId}`);
      return;
    }

    // Guard: Prevent duplicate distribution for the same platform/content.
    // If a previous run is already processing/published, skip that platform.
    const platformsToPublish = target_platforms.filter(p => {
      const status = distribution[p]?.status;
      if (status === "processing" || status === "published") {
        logger.info(
          `[DistributionManager] Skipping ${p} for ${contentId} because status is '${status}'`);
        return false;
      }
      return true;
    });

    if (platformsToPublish.length === 0) {
      logger.info(`[DistributionManager] All platforms already processed for ${contentId}`);
      return;
    }

    const results = {};
    for (const platform of platformsToPublish) {
      try {
        const task = await enqueuePlatformPostTask({
          platform,
          contentId,
          uid: userId,
          payload: buildPlatformPayload(content, platform),
          reason: "immediate_distribution",
          skipIfDuplicate: true,
        });

        if (task && task.id) {
          results[platform] = { queued: true, taskId: task.id };
          await updatePlatformStatus(contentId, platform, "queued", {
            taskId: task.id,
            queuedAt: new Date().toISOString(),
          });
          continue;
        }

        if (task && task.skipped) {
          results[platform] = {
            skipped: true,
            reason: task.reason,
            status: task.status || null,
          };
          if (task.reason !== "already_distributed") {
            await updatePlatformStatus(contentId, platform, "skipped", {
              reason: task.reason,
              status: task.status || null,
            });
          }
          continue;
        }

        throw new Error((task && task.error) || "Failed to queue platform post");
      } catch (err) {
        logger.error(`[DistributionManager] ${platform} queue failed: ${err.message}`);
        results[platform] = { success: false, error: err.message };
        await updatePlatformStatus(contentId, platform, "failed", { error: err.message });
      }
    }
    
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
