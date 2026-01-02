/*
  Memetic Simulator POC
  Exposes a simulateVariant function that runs a simple agent-based propagation
  simulation and returns a resonance score and timeseries.
*/

function clamp(v, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v));
}

function defaultAudienceClusters() {
  // three clusters: fans, casuals, strangers
  return [
    { name: "fans", size: 1000, shareFactor: 0.08, remixFactor: 0.02 },
    { name: "casual", size: 10000, shareFactor: 0.02, remixFactor: 0.005 },
    { name: "stranger", size: 100000, shareFactor: 0.004, remixFactor: 0.001 },
  ];
}

function stepPropagation(state, variant, clusters, stepParams) {
  const next = { ...state };
  let stepViews = 0;
  let stepShares = 0;
  let stepRemixes = 0;

  clusters.forEach(cluster => {
    const clusterSeed = state.seeds[cluster.name] || 0;
    // Views this step from seeds.
    const visibilityBoost =
      typeof stepParams.visibilityBoost === "number" ? stepParams.visibilityBoost : 0;
    const views = clusterSeed * clamp(variant.hookStrength, 0, 1) * (1 + visibilityBoost);
    const baseShareRate = cluster.shareFactor * clamp(variant.shareability, 0, 1);
    const shares = views * baseShareRate * (1 + variant.ctaIntensity * 0.3);
    const remixes = shares * cluster.remixFactor * clamp(variant.remixProbability || 0, 0, 1);

    stepViews += views;
    stepShares += shares;
    stepRemixes += remixes;

    // Distribute new seeds: assume each share reaches an average of 'reachPerShare' users across clusters proportionally
    const reachPerShare =
      typeof stepParams.reachPerShare === "number" ? stepParams.reachPerShare : 10;
    const newImpressions = shares * reachPerShare;
    // Distribute impressions into clusters proportionally to size
    const totalSize = clusters.reduce((s, c) => s + c.size, 0);
    clusters.forEach(c2 => {
      const proportion = c2.size / totalSize;
      next.seeds[c2.name] = (next.seeds[c2.name] || 0) + newImpressions * proportion * 0.01; // small fraction becomes seeds
    });
  });

  next.cumulative.views += stepViews;
  next.cumulative.shares += stepShares;
  next.cumulative.remixes += stepRemixes;

  return { next, stepViews, stepShares, stepRemixes };
}

function simulateVariant({
  variant = {},
  clusters = null,
  initialSeeds = {},
  seedSize = 100,
  steps = 10,
  randomness = 0.1,
  stepParams = {},
} = {}) {
  clusters = clusters || defaultAudienceClusters();

  // normalize variant features with defaults
  const v = {
    hookStrength: clamp(variant.hookStrength ?? 0.6), // 0-1
    shareability: clamp(variant.shareability ?? 0.05),
    remixProbability: clamp(variant.remixProbability ?? 0.01),
    ctaIntensity: clamp(variant.ctaIntensity ?? 0.2),
    predictedWT: clamp(variant.predictedWT ?? 0.6),
  };

  // seed distribution
  const seeds = {};
  if (Object.keys(initialSeeds).length === 0) {
    // distribute seedSize into fans primarily
    const fans = clusters.find(c => c.name === "fans");
    const casual = clusters.find(c => c.name === "casual");
    const stranger = clusters.find(c => c.name === "stranger");
    seeds[fans.name] = Math.round(seedSize * 0.6);
    seeds[casual.name] = Math.round(seedSize * 0.3);
    seeds[stranger.name] = Math.round(seedSize * 0.1);
  } else {
    Object.assign(seeds, initialSeeds);
  }

  const initialState = { seeds, cumulative: { views: 0, shares: 0, remixes: 0 } };

  let state = JSON.parse(JSON.stringify(initialState));
  const timeline = [];

  for (let t = 0; t < steps; t++) {
    // Introduce small randomness in variant features
    const noisyVariant = {
      ...v,
      hookStrength: clamp(v.hookStrength * (1 + (Math.random() - 0.5) * randomness)),
      shareability: clamp(v.shareability * (1 + (Math.random() - 0.5) * randomness)),
    };

    const { next, stepViews, stepShares, stepRemixes } = stepPropagation(
      state,
      noisyVariant,
      clusters,
      stepParams
    );
    timeline.push({
      step: t,
      views: stepViews,
      shares: stepShares,
      remixes: stepRemixes,
      seeds: { ...next.seeds },
    });
    state = next;
  }

  // resonance score: weighted sum (views * predictedWT + shares * 3 + remixes * 5) normalized by seedSize
  const score =
    (state.cumulative.views * v.predictedWT +
      state.cumulative.shares * 3 +
      state.cumulative.remixes * 5) /
    (seedSize || 1);

  return {
    variant: v,
    clusters,
    initialSeeds: initialState.seeds,
    timeline,
    cumulative: state.cumulative,
    resonanceScore: score,
  };
}

module.exports = { simulateVariant, defaultAudienceClusters };
