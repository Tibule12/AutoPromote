const { simulateVariant } = require("../services/memeticSimulator");

describe("memeticSimulator", () => {
  test("higher shareability yields higher resonance", () => {
    const base = { hookStrength: 0.6, shareability: 0.04, predictedWT: 0.6 };
    const low = simulateVariant({
      variant: { ...base, shareability: 0.02 },
      seedSize: 100,
      steps: 6,
      randomness: 0,
    });
    const high = simulateVariant({
      variant: { ...base, shareability: 0.12 },
      seedSize: 100,
      steps: 6,
      randomness: 0,
    });
    expect(high.resonanceScore).toBeGreaterThan(low.resonanceScore);
  });

  test("hook strength increases immediate views", () => {
    const base = { hookStrength: 0.3, shareability: 0.02, predictedWT: 0.6 };
    const weak = simulateVariant({
      variant: { ...base, hookStrength: 0.2 },
      seedSize: 100,
      steps: 4,
      randomness: 0,
    });
    const strong = simulateVariant({
      variant: { ...base, hookStrength: 0.8 },
      seedSize: 100,
      steps: 4,
      randomness: 0,
    });
    expect(strong.cumulative.views).toBeGreaterThan(weak.cumulative.views);
  });
});
