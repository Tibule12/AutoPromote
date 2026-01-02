/* Mutation Lab
 * Generate variants from a base variant using parameterized mutation operators.
 */

function clamp(v, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v));
}

function mutateNumeric(value, pct) {
  return value * (1 + (Math.random() * 2 - 1) * pct);
}

function generateVariants(baseVariant, options = {}) {
  const { count = 5, mutationPct = 0.25 } = options;
  const variants = [];
  for (let i = 0; i < count; i++) {
    const v = { ...baseVariant };
    // Hook strength 0-1
    v.hookStrength = clamp(mutateNumeric(baseVariant.hookStrength ?? 0.6, mutationPct));
    // shareability 0-1
    v.shareability = clamp(mutateNumeric(baseVariant.shareability ?? 0.05, mutationPct));
    // ctaIntensity 0-1
    v.ctaIntensity = clamp(mutateNumeric(baseVariant.ctaIntensity ?? 0.2, mutationPct));
    // remixProbability 0-1
    v.remixProbability = clamp(mutateNumeric(baseVariant.remixProbability ?? 0.01, mutationPct));
    // tempo (0.7 - 1.4)
    v.tempo =
      Math.round(clamp(mutateNumeric(baseVariant.tempo ?? 1.0, mutationPct), 0.7, 1.4) * 100) / 100;
    // captionStyle: pick one of ['direct','narrative','provocative'] randomly influenced by mutation
    const styles = ["direct", "narrative", "provocative"];
    v.captionStyle = styles[Math.floor(Math.random() * styles.length)];
    // thumbnailStyle
    const thumbs = ["face", "text_overlay", "action"];
    v.thumbnailStyle = thumbs[Math.floor(Math.random() * thumbs.length)];
    // predictedWT small modification
    v.predictedWT = clamp(mutateNumeric(baseVariant.predictedWT ?? 0.6, mutationPct));
    v.id = `variant-${Date.now()}-${i}-${Math.floor(Math.random() * 10000)}`;
    variants.push(v);
  }
  return variants;
}

module.exports = { generateVariants };
