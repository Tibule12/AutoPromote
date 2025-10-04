// backfillClickCounters.js - one-off (or repeatable) script to backfill content & platform post click counters
// Usage: node scripts/backfillClickCounters.js [--dry]
require('dotenv').config();
const { db } = require('../src/firebaseAdmin');

async function run({ dry = false, limit = 20000 }) {
  const snap = await db.collection('events')
    .where('type','==','shortlink_resolve')
    .orderBy('createdAt','desc')
    .limit(limit)
    .get().catch(()=>({ empty:true, docs: [] }));
  console.log('[backfill] events sample', snap.size);
  const byContent = {}; const byShortlink = {};
  snap.docs.forEach(d => {
    const v = d.data();
    if (!v.contentId) return;
    byContent[v.contentId] = byContent[v.contentId] || { clicksTotal:0, variantClicks:{}, variantStringClicks:{} };
    const bucket = byContent[v.contentId];
    bucket.clicksTotal++;
    if (typeof v.variantIndex === 'number') {
      bucket.variantClicks[v.variantIndex] = (bucket.variantClicks[v.variantIndex]||0)+1;
    }
    if (v.usedVariant) {
      bucket.variantStringClicks[v.usedVariant] = (bucket.variantStringClicks[v.usedVariant]||0)+1;
    }
    if (v.code) {
      byShortlink[v.code] = (byShortlink[v.code]||0)+1;
    }
  });
  let updates = 0;
  for (const [contentId, data] of Object.entries(byContent)) {
    if (!dry) {
      await db.collection('content').doc(contentId).set(data, { merge: true });
    }
    updates++;
  }
  // Update platform_posts by shortlinkCode
  for (const [code, clicks] of Object.entries(byShortlink)) {
    try {
      const postSnap = await db.collection('platform_posts').where('shortlinkCode','==', code).limit(1).get();
      if (!postSnap.empty && !dry) {
        const ref = postSnap.docs[0].ref;
        await ref.set({ clicks }, { merge: true });
      }
    } catch(_){}
  }
  console.log('[backfill] content updated:', updates, 'posts sampled shortlinks:', Object.keys(byShortlink).length);
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
run({ dry }).then(()=>{ console.log('[backfill] done'); process.exit(0); }).catch(e=>{ console.error(e); process.exit(1); });
