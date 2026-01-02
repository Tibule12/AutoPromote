const { scoreVariant } = require("../services/resonanceScorer");

describe("resonanceScorer", () => {
  test("higher shareability yields higher score", () => {
    const low = { predictedWT: 0.6, shareability: 0.02, hookStrength: 0.5 };
    const high = { predictedWT: 0.6, shareability: 0.12, hookStrength: 0.5 };
    expect(scoreVariant(high)).toBeGreaterThan(scoreVariant(low));
  });

  test("hook strength affects score", () => {
    const a = { predictedWT: 0.6, shareability: 0.05, hookStrength: 0.2 };
    const b = { predictedWT: 0.6, shareability: 0.05, hookStrength: 0.8 };
    expect(scoreVariant(b)).toBeGreaterThan(scoreVariant(a));
  });
});
