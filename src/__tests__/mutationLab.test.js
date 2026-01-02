const { generateVariants } = require("../services/mutationLab");

describe("mutationLab", () => {
  test("generates requested number of variants and ensures diversity", () => {
    const base = { hookStrength: 0.6, shareability: 0.05, predictedWT: 0.6 };
    const variants = generateVariants(base, { count: 6, mutationPct: 0.2 });
    expect(Array.isArray(variants)).toBe(true);
    expect(variants.length).toBe(6);
    // Expect at least one variant differs by >1% in hookStrength
    const diffs = variants.map(v => Math.abs(v.hookStrength - base.hookStrength));
    expect(diffs.some(d => d > 0.01)).toBe(true);
  });
});
