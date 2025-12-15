// youtubeStatsPoller.js
// Phase 3: Batch polling of YouTube stats for content with youtube.videoId present

const { db } = require("../firebaseAdmin");
const { updateContentVideoStats } = require("./youtubeService");

// Fetch content docs needing update (simple heuristic: missing lastStatsCheck OR older than interval)
async function findStaleYouTubeContent({ limit = 10, maxAgeMinutes = 30 }) {
  const cutoff = Date.now() - maxAgeMinutes * 60000;
  // Basic approach: pull some recent docs with youtube.videoId then filter in memory (Firestore composite queries can be added later)
  const snapshot = await db
    .collection("content")
    .where("youtube.videoId", "!=", null)
    .orderBy("youtube.videoId")
    .limit(50)
    .get();
  const stale = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const lastCheck = data.youtube?.lastStatsCheck?.toMillis
      ? data.youtube.lastStatsCheck.toMillis()
      : null;
    if (!lastCheck || lastCheck < cutoff) {
      stale.push({ id: doc.id, ...data });
    }
  });
  return stale.slice(0, limit);
}

async function pollYouTubeStatsBatch({ uid, velocityThreshold, batchSize = 5 }) {
  const candidates = await findStaleYouTubeContent({ limit: batchSize });
  const results = [];
  for (const contentDoc of candidates) {
    try {
      const r = await updateContentVideoStats({ contentDoc, uid, velocityThreshold });
      results.push({ success: true, ...r });
    } catch (err) {
      results.push({ success: false, contentId: contentDoc.id, error: err.message });
    }
  }
  return { processed: results.length, results };
}

module.exports = { pollYouTubeStatsBatch };
