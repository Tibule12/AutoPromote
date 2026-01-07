const { generateVariants } = require("./mutationLab");
const { simulateVariant } = require("./memeticSimulator");
const { scoreVariant } = require("./resonanceScorer");

// Plan variants: generate N variants, simulate each, compute combined score
function planVariants(baseVariant, options = {}) {
  const {
    count = 6,
    simulationSteps = 8,
    seedSize = 200,
    weightResonance = 0.7,
    weightScore = 0.3,
  } = options;
  const variants = generateVariants(baseVariant, { count });

  const evaluated = variants.map(v => {
    const sim = simulateVariant({ variant: v, steps: simulationSteps, seedSize, randomness: 0.05 });
    const modelScore = scoreVariant(v);
    const combined = sim.resonanceScore * weightResonance + modelScore * weightScore;
    return { v, sim, modelScore, combined };
  });

  evaluated.sort((a, b) => b.combined - a.combined);
  return evaluated;
}

module.exports = { planVariants };
