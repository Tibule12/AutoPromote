// attributionUpdater.js - denormalized counters on shortlink resolve
const { db } = require('../firebaseAdmin');

async function applyShortlinkClick(code, data) {
  try {
    if (!code || !data || !data.contentId) return;
    const { contentId, variantIndex, usedVariant, platform } = data;
    // Update content doc counters
    const contentRef = db.collection('content').doc(contentId);
    await db.runTransaction(async tx => {
      const snap = await tx.get(contentRef);
      const updates = {};
      updates.clicksTotal = (snap.exists && snap.data().clicksTotal || 0) + 1;
      if (typeof variantIndex === 'number') {
        const key = `variantClicks.${variantIndex}`;
        updates[key] = ((snap.exists && snap.data().variantClicks && snap.data().variantClicks[variantIndex]) || 0) + 1;
      }
      if (usedVariant) {
        const k2 = `variantStringClicks.${usedVariant.replace(/\./g,'_').slice(0,120)}`;
        updates[k2] = ((snap.exists && snap.data().variantStringClicks && snap.data().variantStringClicks[usedVariant]) || 0) + 1;
      }
      tx.set(contentRef, updates, { merge: true });
    });
    // Update platform_posts doc if exists (by shortlinkCode)
    if (code) {
      try {
        const postSnap = await db.collection('platform_posts').where('shortlinkCode','==', code).limit(1).get();
        if (!postSnap.empty) {
          const ref = postSnap.docs[0].ref;
            await ref.update({ clicks: (postSnap.docs[0].data().clicks||0)+1, updatedAt: new Date().toISOString() });
        }
      } catch(_){}
    }
  } catch (e) {
    // best-effort only
  }
}

module.exports = { applyShortlinkClick };