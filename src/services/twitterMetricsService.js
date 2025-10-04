// twitterMetricsService.js - fetch real Twitter metrics for recent posts
// Requires a bearer token (user-level preferred). Falls back silently if missing.
const fetch = require('node-fetch');
const { db } = require('../firebaseAdmin');

async function getBearer(uid) {
  // Try user connection tokens
  if (uid) {
    try {
      const userConn = await db.collection('users').doc(uid).collection('connections').doc('twitter').get();
      if (userConn.exists) {
        const d = userConn.data();
        if (d.access_token) return d.access_token; // OAuth2 user token
      }
    } catch(_){}
  }
  return process.env.TWITTER_BEARER_TOKEN || null;
}

async function fetchTweetMetrics(ids, bearer) {
  if (!ids.length || !bearer) return {};
  const url = `https://api.twitter.com/2/tweets?ids=${ids.join(',')}&tweet.fields=public_metrics`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` }});
  if (!res.ok) return {};
  const json = await res.json();
  const map = {};
  (json.data || []).forEach(t => { map[t.id] = t.public_metrics || {}; });
  return map;
}

async function ingestRecentTwitterMetrics({ limit = 50 }) {
  // Sample recent twitter platform_posts lacking fresh metrics
  const snap = await db.collection('platform_posts')
    .where('platform','==','twitter')
    .orderBy('createdAt','desc')
    .limit(limit)
    .get().catch(()=>({ empty: true, docs: [] }));
  if (snap.empty) return { processed: 0 };
  const posts = []; const ids = [];
  snap.docs.forEach(d => {
    const v = d.data();
    const tweetId = v.externalId || v.tweetId || v.rawOutcome?.tweetId;
    if (tweetId) { posts.push({ ref: d.ref, data: v, tweetId }); ids.push(tweetId); }
  });
  // Batch in groups of 100 max
  let processed = 0;
  for (let i=0;i<ids.length;i+=100) {
    const batchIds = ids.slice(i,i+100);
    // Use first post's uid for user-level bearer preference
    const sampleUid = posts.find(p=> batchIds.includes(p.tweetId))?.data?.uid;
    const bearer = await getBearer(sampleUid);
    if (!bearer) continue;
    let metricsMap = {};
    try { metricsMap = await fetchTweetMetrics(batchIds, bearer); } catch(_){}
    for (const p of posts.filter(pp=> batchIds.includes(pp.tweetId))) {
      const m = metricsMap[p.tweetId];
      if (m) {
        try {
          await p.ref.set({ metrics: {
            impressions: m.impression_count || m.impressions || 0,
            likes: m.like_count || 0,
            replies: m.reply_count || 0,
            retweets: m.retweet_count || 0,
            quotes: m.quote_count || 0
          }, metricsFetchedAt: new Date().toISOString() }, { merge: true });
          processed++;
        } catch(_){}
      }
    }
  }
  return { processed };
}

module.exports = { ingestRecentTwitterMetrics };