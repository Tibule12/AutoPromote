// tiktokService.js
// Phase D scaffold: minimal TikTok upload abstraction (placeholder, non-functional without real API integration)
// TikTok API requires app review; this stub simulates success for now.

async function uploadTikTokVideo({ contentId, payload }) {
  // TODO: Implement: startUploadSession -> upload parts -> finalize -> set metadata
  // For now just simulate deterministic pseudo videoId
  const src = (payload && (payload.videoUrl || payload.mediaUrl || '')) + '|' + contentId;
  const crypto = require('crypto');
  const videoId = crypto.createHash('md5').update(src).digest('hex').slice(0,16);
  return { videoId, simulated: true };
}

module.exports = { uploadTikTokVideo };
