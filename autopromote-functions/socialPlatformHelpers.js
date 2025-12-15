const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

const region = "us-central1";

// Helper: Post to Instagram (placeholder)
async function postToInstagram({ message, url, instagramAccessToken, instagramUserId }) {
  // Instagram Graph API: POST /{ig-user-id}/media then /{ig-user-id}/media_publish
  // This is a placeholder. Real implementation requires Instagram Business Account and Facebook App review.
  // https://developers.facebook.com/docs/instagram-api/guides/content-publishing/
  return { success: true, platform: "instagram", note: "Instagram posting simulated." };
}

// Helper: Post to TikTok (placeholder)
async function postToTikTok({ message, url, tiktokAccessToken }) {
  // TikTok API: https://developers.tiktok.com/doc/content-post-api/
  // This is a placeholder. Real implementation requires TikTok for Developers access.
  return { success: true, platform: "tiktok", note: "TikTok posting simulated." };
}

// Helper: Post to YouTube (delegates to backend service when queueing not yet implemented)
// Expected shape (future): { videoFileUrl, title, description, uid }
async function postToYouTube({
  message,
  url,
  youtubeAccessToken,
  videoFileUrl,
  title,
  description,
  uid,
}) {
  // Backwards compatibility: if no videoFileUrl, simulate (Phase 1 limitation inside functions env)
  if (!videoFileUrl || !uid) {
    return {
      success: true,
      platform: "youtube",
      simulated: true,
      note: "No videoFileUrl/uid provided; upload skipped.",
    };
  }
  try {
    // Dynamically require only if available (this file runs inside functions folder; backend service lives outside)
    const path = require("path");
    const servicePath = path.join(process.cwd(), "../src/services/youtubeService.js");
    let uploadVideo;
    try {
      ({ uploadVideo } = require(servicePath));
    } catch (_) {
      return {
        success: true,
        platform: "youtube",
        simulated: true,
        note: "youtubeService not accessible from functions runtime.",
      };
    }
    const outcome = await uploadVideo({
      uid,
      title: title || message || "Untitled Upload",
      description: description || message || "",
      fileUrl: videoFileUrl,
      mimeType: "video/mp4",
      contentId: null,
      shortsMode: false,
    });
    return { success: true, platform: "youtube", delegated: true, videoId: outcome.videoId };
  } catch (err) {
    return { success: false, platform: "youtube", error: err.message };
  }
}

module.exports = {
  postToInstagram,
  postToTikTok,
  postToYouTube,
};
