// variantRegeneratorService.js
// Generates replacement variants when diversity is low or too many suppressed/quarantined.
// Simple heuristic template-based generation (placeholder for LLM integration).

const { db } = require("../firebaseAdmin");
const { generateVariants } = require("./variantGenerationProviders");

async function regenerateIfNeeded({ contentId, platform }) {
  const statsRef = db.collection("variant_stats").doc(contentId);
  const snap = await statsRef.get();
  if (!snap.exists) return { skipped: true, reason: "no_stats" };
  const data = snap.data();
  if (!data.platforms || !data.platforms[platform])
    return { skipped: true, reason: "platform_absent" };
  const variants = data.platforms[platform].variants || [];
  const active = variants.filter(v => !v.suppressed && !v.quarantined);
  const suppressed = variants.filter(v => v.suppressed || v.quarantined);
  const diversityLow =
    active.length < parseInt(process.env.VARIANT_MIN_ACTIVE || "2", 10) && variants.length >= 1;
  const suppressionHeavy = suppressed.length >= Math.max(2, Math.floor(variants.length / 2));
  if (!diversityLow && !suppressionHeavy) return { skipped: true, reason: "conditions_not_met" };
  // Fetch content title for seed
  const contentSnap = await db.collection("content").doc(contentId).get();
  const title = contentSnap.exists ? contentSnap.data().title : "Your Content";
  const need = parseInt(process.env.VARIANT_REGENERATE_TARGET || "3", 10) - active.length;
  if (need <= 0) return { skipped: true, reason: "already_sufficient" };
  const strategy = process.env.VARIANT_GENERATION_STRATEGY || "heuristic";
  const existingValues = variants.map(v => v.value);
  const generated = await generateVariants({
    title,
    targetCount: need,
    existingVariants: existingValues,
    strategy,
  });
  if (!generated.length) return { skipped: true, reason: "no_unique_generated" };
  generated.forEach(g => {
    if (variants.some(v => v.value === g.value)) return;
    variants.push({
      value: g.value,
      posts: 0,
      clicks: 0,
      impressions: 0,
      decayedClicks: 0,
      decayedPosts: 0,
      lastDecayAt: Date.now(),
      lastPostAt: null,
      anomaly: false,
      suppressed: false,
      quarantined: false,
      qualityScore: g.qualityScore,
    });
  });
  const added = generated.length;
  await statsRef.set(data, { merge: true });
  try {
    await db
      .collection("events")
      .add({
        type: "variant_regenerated",
        contentId,
        platform,
        added,
        strategy,
        at: new Date().toISOString(),
      });
  } catch (_) {}
  return { added };
}

module.exports = { regenerateIfNeeded };
