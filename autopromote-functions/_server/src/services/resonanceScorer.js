/* resonanceScorer
 * Lightweight scoring function for ranking variants. This is a placeholder
 * for a learned model; it uses a weighted linear combination of features.
 */

function scoreVariant(v) {
  // weights tuned heuristically for MVP
  const w = {
    predictedWT: 0.9,
    shareability: 10.0,
    hookStrength: 3.0,
    remixProbability: 8.0,
    ctaIntensity: 1.5,
    tempoBonus: 0.5,
  };

  const tempoBonus = v.tempo && Math.abs(v.tempo - 1.0) < 0.12 ? w.tempoBonus : 0;

  const score =
    (v.predictedWT || 0) * w.predictedWT +
    (v.shareability || 0) * w.shareability +
    (v.hookStrength || 0) * w.hookStrength +
    (v.remixProbability || 0) * w.remixProbability +
    (v.ctaIntensity || 0) * w.ctaIntensity +
    tempoBonus;

  return score;
}

module.exports = { scoreVariant };
