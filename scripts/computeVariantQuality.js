// computeVariantQuality.js - retroactively compute quality scores for existing variant_stats
const { db } = require('../src/firebaseAdmin');
const { computeQualityScore } = require('../src/services/variantQualityService');

(async function(){
  console.log('Computing variant quality scores...');
  const snap = await db.collection('variant_stats').limit(5000).get().catch(()=>({ empty:true, docs:[] }));
  let updated=0;
  for (const d of snap.docs) {
    const data = d.data();
    if (!data.platforms) continue;
    let changed = false;
    for (const plat of Object.keys(data.platforms)) {
      const pv = data.platforms[plat]; if (!pv.variants) continue;
      pv.variants.forEach(v => {
        if (v.value && (v.qualityScore == null)) {
          v.qualityScore = computeQualityScore(v.value);
          changed = true;
        }
      });
    }
    if (changed) { await d.ref.set(data, { merge:true }); updated++; }
    if (updated % 100 === 0) console.log('Updated', updated, 'docs');
  }
  console.log('Quality scoring complete. Updated', updated, 'documents.');
})();