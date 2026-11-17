// youtubeStatsPoller.js
// Phase 3: Batch polling of YouTube stats for content with youtube.videoId present

const { db } = require("../firebaseAdmin");
const youtubeService = require("./youtubeService");

// Fetch content docs needing update (simple heuristic: missing lastStatsCheck OR older than interval)
async function findStaleYouTubeContent({ uid, limit = 10, maxAgeMinutes = 30 }) {
  const cutoff = Date.now() - maxAgeMinutes * 60000;
  // Basic approach: pull some recent docs with youtube.videoId then filter in memory (Firestore composite queries can be added later)
  const snapshot = await db
    .collection("content")
    .where("youtube.videoId", "!=", null)
    .orderBy("youtube.videoId")
    .limit(50)
    .select("youtube", "userId", "user_id", "uid", "owner")
    .get();
  const stale = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const owner = data.userId || data.user_id || data.uid || data.owner;
    if (typeof owner !== "string" || !owner || (uid && owner !== uid)) return;
    const checked = data.youtube?.lastStatsCheck;
    const lastCheck = checked?.toMillis ? checked.toMillis() : Date.parse(checked || "") || null;
    if (!lastCheck || lastCheck < cutoff) {
      stale.push({ id: doc.id, ...data });
    }
  });
  return stale.slice(0, limit);
}

async function pollYouTubeStatsBatch({ uid, velocityThreshold, batchSize = 5 }) {
  const candidates = await findStaleYouTubeContent({ uid, limit: Math.max(1, Math.min(50, Number(batchSize) || 5)) });
  const results = [];
  for (const contentDoc of candidates) {
    try {
      const r = await youtubeService.updateContentVideoStats({ contentDoc,
        uid: uid || contentDoc.userId || contentDoc.user_id || contentDoc.uid || contentDoc.owner, velocityThreshold });
      results.push({ success: true, ...r });
    } catch (err) {
      results.push({ success: false, contentId: contentDoc.id, error: err.message });
    }
  }
  return { processed: results.length, results };
}

module.exports = { pollYouTubeStatsBatch };
