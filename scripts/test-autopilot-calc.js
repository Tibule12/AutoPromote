const { calculateConfidenceForVariants } = require('../src/utils/statistics');

function runCase(variants) {
  const confidence = calculateConfidenceForVariants(variants);
  console.log('variants:', variants.map(v => ({ id: v.id, views: v.metrics.views, conv: v.metrics.conversions })), '=> confidence:', confidence + '%');
}

function run() {
  console.log('Case: strong difference (should be high confidence)');
  runCase([
    { id: 'A', metrics: { views: 1000, conversions: 60 } },
    { id: 'B', metrics: { views: 800, conversions: 18 } },
  ]);

  console.log('Case: weak difference (should be low confidence)');
  runCase([
    { id: 'A', metrics: { views: 1000, conversions: 25 } },
    { id: 'B', metrics: { views: 900, conversions: 23 } },
  ]);
}

run();
