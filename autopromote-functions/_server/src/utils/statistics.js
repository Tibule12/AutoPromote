function _zToPValue(z) {
  // approximate two-tailed p-value for z using error function approximation
  const t = 1 / (1 + 0.3275911 * z);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  const phi = 0.5 * (1 + erf);
  const pValue = 2 * (1 - phi);
  return Math.max(0, Math.min(1, pValue));
}

function twoSampleProportionZTest(conversions1, n1, conversions2, n2) {
  if (!n1 || !n2) return { z: 0, pValue: 1 };
  const p1 = conversions1 / n1;
  const p2 = conversions2 / n2;
  const p = (conversions1 + conversions2) / (n1 + n2);
  const numerator = p1 - p2;
  const denominator = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!denominator) return { z: 0, pValue: 1 };
  const z = numerator / denominator;
  const pValue = _zToPValue(Math.abs(z));
  return { z, pValue };
}

function calculateConfidenceForVariants(variants) {
  try {
    if (!variants || variants.length < 2) return 0;
    const rates = variants.map(v => ({
      id: v.id,
      conversions: v.metrics.conversions || 0,
      views: v.metrics.views || 0,
      rate: v.metrics.views ? (v.metrics.conversions || 0) / v.metrics.views : 0,
    }));
    let top = rates.reduce((p, c) => (c.rate > p.rate ? c : p), rates[0]);
    const others = rates.filter(r => r.id !== top.id);
    if (!others.length) return 0;
    const combinedConversions = others.reduce((acc, r) => acc + r.conversions, 0);
    void combinedConversions;
    const combinedViews = others.reduce((acc, r) => acc + r.views, 0);
    void combinedViews;
    // For more robust handling, use a Bayesian Monte Carlo approximation of
    // P(top > others). This tends to handle low-conversion cases better.
    const bayesConfidence = calculateBayesianConfidence(variants);
    const confidence = Math.max(0, Math.min(100, Math.round(bayesConfidence * 100)));
    return confidence;
  } catch (e) {
    console.warn("[statistics] calculateConfidenceForVariants error", e.message || e);
    return 0;
  }
}

function calculateBayesianConfidence(variants, samples = 4000) {
  if (!variants || variants.length < 2) return 0;
  // Identify top by raw rate
  const rates = variants.map(v => ({
    id: v.id,
    conversions: v.metrics.conversions || 0,
    views: v.metrics.views || 0,
    rate: v.metrics.views ? (v.metrics.conversions || 0) / v.metrics.views : 0,
  }));
  let top = rates.reduce((p, c) => (c.rate > p.rate ? c : p), rates[0]);
  const others = rates.filter(r => r.id !== top.id);
  if (!others.length) return 0;

  let wins = 0;
  for (let s = 0; s < samples; s++) {
    // draw from Beta posterior for top
    const topDraw = betaSample(top.conversions + 1, top.views - top.conversions + 1);
    // compute max draw across others' posteriors
    let otherMax = 0;
    for (const o of others) {
      const draw = betaSample(o.conversions + 1, o.views - o.conversions + 1);
      if (draw > otherMax) otherMax = draw;
    }
    if (topDraw > otherMax) wins++;
  }
  return wins / samples;
}

function betaSample(alpha, beta) {
  // sample Beta(alpha, beta) as Gamma(alpha)/ (Gamma(alpha)+Gamma(beta))
  const a = gammaSample(alpha);
  const b = gammaSample(beta);
  if (a + b === 0) return 0;
  return a / (a + b);
}

function gammaSample(k) {
  // Marsaglia and Tsang method for k > 0
  if (k <= 0) return 0;
  if (k < 1) {
    // Use boost: Gamma(k) = Gamma(k+1) * U^(1/k)
    return gammaSample(1 + k) * Math.pow(Math.random(), 1 / k);
  }
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x = normalSample();
    let v = 1 + c * x;
    if (v <= 0) continue;
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * Math.pow(x, 4)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function normalSample() {
  // Box-Muller transform
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

module.exports = {
  twoSampleProportionZTest,
  calculateConfidenceForVariants,
  calculateBayesianConfidence,
};

// generate posterior samples for difference between top variant and baseline combined
function generatePosteriorSamplesForTopVsBaseline(variants, samples = 400) {
  if (!variants || variants.length < 2) return [];
  const rates = variants.map(v => ({
    id: v.id,
    conversions: v.metrics.conversions || 0,
    views: v.metrics.views || 0,
  }));
  let top = rates.reduce(
    (p, c) =>
      c.views && c.conversions / c.views > (p.views ? p.conversions / p.views : 0) ? c : p,
    rates[0]
  );
  const others = rates.filter(r => r.id !== top.id);
  if (!others.length) return [];
  const baseline = others.reduce(
    (acc, r) => ({ conversions: acc.conversions + r.conversions, views: acc.views + r.views }),
    { conversions: 0, views: 0 }
  );
  const out = [];
  for (let i = 0; i < samples; i++) {
    const topDraw = betaSample(top.conversions + 1, top.views - top.conversions + 1);
    const baseDraw = betaSample(
      baseline.conversions + 1,
      baseline.views - baseline.conversions + 1
    );
    out.push(topDraw - baseDraw);
  }
  return out;
}

module.exports.generatePosteriorSamplesForTopVsBaseline = generatePosteriorSamplesForTopVsBaseline;

// Deterministic PRNG: Mulberry32 (seed -> uniform random generator)
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    var r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// RNG-backed versions of normal/gamma/beta sampling
function normalSampleRNG(rng) {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function gammaSampleRNG(k, rng) {
  if (k <= 0) return 0;
  if (k < 1) {
    return gammaSampleRNG(1 + k, rng) * Math.pow(rng(), 1 / k);
  }
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x = normalSampleRNG(rng);
    let v = 1 + c * x;
    if (v <= 0) continue;
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * Math.pow(x, 4)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function betaSampleRNG(alpha, beta, rng) {
  const a = gammaSampleRNG(alpha, rng);
  const b = gammaSampleRNG(beta, rng);
  if (a + b === 0) return 0;
  return a / (a + b);
}

function generatePosteriorSamplesForTopVsBaselineDeterministic(variants, samples = 400, seed = 42) {
  if (!variants || variants.length < 2) return [];
  const rng = mulberry32(seed);
  const rates = variants.map(v => ({
    id: v.id,
    conversions: v.metrics.conversions || 0,
    views: v.metrics.views || 0,
  }));
  let top = rates.reduce(
    (p, c) =>
      c.views && c.conversions / c.views > (p.views ? p.conversions / p.views : 0) ? c : p,
    rates[0]
  );
  const others = rates.filter(r => r.id !== top.id);
  if (!others.length) return [];
  const baseline = others.reduce(
    (acc, r) => ({ conversions: acc.conversions + r.conversions, views: acc.views + r.views }),
    { conversions: 0, views: 0 }
  );
  const out = [];
  for (let i = 0; i < samples; i++) {
    const topDraw = betaSampleRNG(top.conversions + 1, top.views - top.conversions + 1, rng);
    const baseDraw = betaSampleRNG(
      baseline.conversions + 1,
      baseline.views - baseline.conversions + 1,
      rng
    );
    out.push(topDraw - baseDraw);
  }
  return out;
}

module.exports.generatePosteriorSamplesForTopVsBaselineDeterministic =
  generatePosteriorSamplesForTopVsBaselineDeterministic;
