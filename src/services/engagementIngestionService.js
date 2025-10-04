// engagementIngestionService.js - collects or simulates engagement metrics for platform_posts
const { db, admin } = require('../firebaseAdmin');

async function fetchTwitterEngagementSim(post) {
  // Placeholder: In real implementation call Twitter API (v2 metrics) using tweetId.
  // For now, simulate mild engagement growth.
  const base = (post.metrics && post.metrics.impressions) || 0;
  const increment = Math.floor(Math.random() * 20); // 0-19
  return {
    impressions: base + increment,
    likes: (post.metrics?.likes||0) + Math.floor(increment * 0.2),
    reposts: (post.metrics?.reposts||0) + Math.floor(increment * 0.05)
  };
}

async function ingestBatch({ limit = 25 }) {
  const snap = await db.collection('platform_posts')
    .where('platform','==','twitter')
    .orderBy('createdAt','desc')
    .limit(limit)
    .get().catch(()=>({ empty: true, docs: [] }));
  if (snap.empty) return { processed: 0 };
  let processed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.tweetId && !data.externalId && !data.rawOutcome?.tweetId) continue;
    try {
      const metrics = await fetchTwitterEngagementSim(data);
      await doc.ref.set({ metrics, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      processed++;
    } catch(_){}
  }
  return { processed };
}

module.exports = { ingestBatch };
