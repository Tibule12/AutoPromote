#!/usr/bin/env node
const { simulateVariant, defaultAudienceClusters } = require('../src/services/memeticSimulator');

function pretty(obj) { return JSON.stringify(obj, null, 2); }

const variants = [
  { name: 'A - Hook heavy', hookStrength: 0.9, shareability: 0.06, ctaIntensity: 0.1, predictedWT: 0.75 },
  { name: 'B - Shareable', hookStrength: 0.6, shareability: 0.12, ctaIntensity: 0.3, predictedWT: 0.65 },
  { name: 'C - Remixable', hookStrength: 0.55, shareability: 0.05, remixProbability: 0.06, predictedWT: 0.6 },
];

variants.forEach(v => {
  const res = simulateVariant({ variant: v, steps: 8, seedSize: 200 });
  console.log('\n=== Variant:', v.name, '===');
  console.log('Resonance score:', res.resonanceScore.toFixed(2));
  console.log('Cumulative:', res.cumulative);
});
