#!/usr/bin/env node
const { planVariants } = require('../src/services/memeticPlanner');

const base = { hookStrength: 0.6, shareability: 0.05, predictedWT: 0.6, tempo: 1.0 };
const plan = planVariants(base, { count: 6, simulationSteps: 8, seedSize: 200 });
console.log('Top variants (combined score):');
plan.slice(0, 3).forEach((e, i) => {
  console.log('\n=== Variant', i + 1, '===');
  console.log('id:', e.v.id);
  console.log('modelScore:', e.modelScore.toFixed(3));
  console.log('resonanceScore:', e.sim.resonanceScore.toFixed(3));
  console.log('combined:', e.combined.toFixed(3));
});
