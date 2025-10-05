// rebuildVariantStats.js - backfill/materialize variant_stats from historical platform_posts
// Usage: node scripts/rebuildVariantStats.js [--limit=10000]

const { db } = require('../src/firebaseAdmin');

(async function main(){
  const argLimit = process.argv.find(a=> a.startsWith('--limit='));
  const limit = argLimit ? parseInt(argLimit.split('=')[1],10) : 10000;
  console.log('Rebuilding variant_stats from last', limit, 'platform_posts');
  const snap = await db.collection('platform_posts').orderBy('createdAt','desc').limit(limit).get().catch(()=>({ empty:true, docs:[] }));
  if (snap.empty){ console.log('No platform_posts found.'); return; }
  const grouped = new Map(); // key: contentId -> { platform -> { variant -> { posts, clicks } } }
  for (const d of snap.docs){
    const v = d.data();
    if (!v.contentId || !v.platform) continue;
    if (!grouped.has(v.contentId)) grouped.set(v.contentId, {});
    const perContent = grouped.get(v.contentId);
    if (!perContent[v.platform]) perContent[v.platform] = {};
    const perPlat = perContent[v.platform];
    if (v.usedVariant) {
      if (!perPlat[v.usedVariant]) perPlat[v.usedVariant] = { posts:0, clicks:0 };
      perPlat[v.usedVariant].posts += 1;
      perPlat[v.usedVariant].clicks += (v.outcome && typeof v.outcome.clicks === 'number') ? v.outcome.clicks : 0;
    }
  }
  let writes = 0;
  for (const [contentId, platMap] of grouped.entries()) {
    const doc = { contentId, platforms:{}, updatedAt: new Date().toISOString() };
    for (const [platform, variants] of Object.entries(platMap)) {
      doc.platforms[platform] = { variants: Object.entries(variants).map(([value, stats]) => ({ value, posts: stats.posts, clicks: stats.clicks })), updatedAt: new Date().toISOString() };
    }
    await db.collection('variant_stats').doc(contentId).set(doc, { merge:true });
    writes++;
    if (writes % 100 === 0) console.log('Wrote', writes, 'variant_stats docs...');
  }
  console.log('Rebuild complete. Wrote', writes, 'documents.');
})();