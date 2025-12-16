// simulateVariantSelection.js - Monte Carlo test for variant selection strategies
// Usage: npm run simulate:variants
const { randomUUID } = require("crypto");

function ucb1Select(stats) {
  const total = stats.reduce((s, v) => s + v.trials, 0) || 1;
  const logTotal = Math.log(total + 1);
  return stats
    .map((v, i) => {
      if (v.trials === 0) return { i, score: Infinity };
      const avg = v.reward / v.trials;
      const bonus = Math.sqrt((2 * logTotal) / v.trials);
      return { i, score: avg + bonus };
    })
    .sort((a, b) => b.score - a.score)[0].i;
}

function rotationSelect(stats, idx) {
  return idx % stats.length;
}

function runSimulation({ variants = 5, rounds = 5000, trueRates, strategy = "ucb1" }) {
  const stats = Array.from({ length: variants }, () => ({ trials: 0, reward: 0 }));
  if (!trueRates) trueRates = Array.from({ length: variants }, () => Math.random() * 0.2 + 0.05);
  let rotIdx = 0;
  for (let r = 0; r < rounds; r++) {
    let choice;
    if (strategy === "ucb1") choice = ucb1Select(stats);
    else choice = rotationSelect(stats, rotIdx++);
    // Bernoulli reward
    const reward = Math.random() < trueRates[choice] ? 1 : 0;
    stats[choice].trials++;
    stats[choice].reward += reward;
  }
  const estimated = stats.map(v => v.reward / (v.trials || 1));
  return { strategy, trueRates, stats, estimated };
}

function main() {
  const trueRates = [0.05, 0.07, 0.06, 0.11, 0.09];
  const bandit = runSimulation({ trueRates, strategy: "ucb1" });
  const rotation = runSimulation({ trueRates, strategy: "rotation" });
  console.log("UCB1 stats:", bandit.stats);
  console.log("Rotation stats:", rotation.stats);
  // Compare best variant selection frequency
  function freq(stats) {
    return stats.map(s => s.trials);
  }
  console.log("Trials (ucb1):", freq(bandit.stats));
  console.log("Trials (rotation):", freq(rotation.stats));
  console.log("True rates:", trueRates);
  console.log("Estimated (ucb1):", bandit.estimated);
  console.log("Estimated (rotation):", rotation.estimated);
}

if (require.main === module) main();
module.exports = { runSimulation };
