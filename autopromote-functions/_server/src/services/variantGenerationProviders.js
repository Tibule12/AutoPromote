// variantGenerationProviders.js - pluggable generation strategies
// strategies: heuristic (default), llm (stub)

let computeQualityScore;
try {
  ({ computeQualityScore } = require("./variantQualityService"));
} catch (_) {
  computeQualityScore = () => 50;
}

function heuristicGenerate({ title, need, existing }) {
  const base = (title || "Great Content").replace(/\s+/g, " ").trim();
  const patterns = [
    t => `${t} – Quick Tip`,
    t => `Why ${t} Matters Today`,
    t => `Unlock Growth With ${t}`,
    t => `${t}: Strategy Breakdown`,
    t => `How To Improve ${t}`,
    t => `${t} In 60 Seconds`,
    t => `Common Mistakes in ${t}`,
  ];
  const out = [];
  let idx = 0;
  while (out.length < need && idx < patterns.length * 3) {
    const v = patterns[idx % patterns.length](base);
    if (!existing.has(v)) {
      out.push(v);
      existing.add(v);
    }
    idx++;
  }
  return out;
}

async function llmGenerateStub({ title, need, existing }) {
  // Future: integrate OpenAI or other provider; for now just fallback to heuristic noise
  const seed = heuristicGenerate({ title, need, existing });
  return seed.map(s => s + " ✅");
}

function getGenerationStrategy(name) {
  switch ((name || "heuristic").toLowerCase()) {
    case "llm":
      return llmGenerateStub;
    default:
      return async opts => heuristicGenerate(opts);
  }
}

async function generateVariants({ title, targetCount, existingVariants, strategy }) {
  const existingSet = new Set(existingVariants || []);
  const generate = getGenerationStrategy(strategy);
  const needed = Math.max(0, targetCount);
  const raw = await generate({ title, need: needed, existing: existingSet });
  // Quality score + filter pass (threshold optional)
  const minQuality = parseInt(process.env.VARIANT_REGEN_MIN_QUALITY || "45", 10);
  const accepted = [];
  for (const v of raw) {
    const q = computeQualityScore(v);
    if (q < minQuality) continue;
    accepted.push({ value: v, qualityScore: q });
  }
  return accepted;
}

module.exports = { generateVariants };
