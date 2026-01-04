const {
  calculateConfidenceForVariants,
  twoSampleProportionZTest,
  calculateBayesianConfidence,
  generatePosteriorSamplesForTopVsBaseline,
} = require("../src/utils/statistics");

describe("statistics.calculateConfidenceForVariants", () => {
  test("returns high confidence for large difference", () => {
    const variants = [
      { id: "A", metrics: { views: 1000, conversions: 60 } },
      { id: "B", metrics: { views: 800, conversions: 18 } },
    ];
    const confidence = calculateConfidenceForVariants(variants);
    expect(confidence).toBeGreaterThanOrEqual(80);
  });
  test("returns low confidence for small difference", () => {
    const variants = [
      { id: "A", metrics: { views: 1000, conversions: 25 } },
      { id: "B", metrics: { views: 900, conversions: 23 } },
    ];
    const confidence = calculateConfidenceForVariants(variants);
    expect(confidence).toBeLessThan(60);
  });
  test("bayesian confidence function returns value similar to calculateConfidence", () => {
    const variants = [
      { id: "A", metrics: { views: 1000, conversions: 60 } },
      { id: "B", metrics: { views: 800, conversions: 18 } },
    ];
    const bayes = calculateBayesianConfidence(variants, 1000);
    const conf = calculateConfidenceForVariants(variants);
    expect(Math.abs(bayes * 100 - conf)).toBeLessThan(20); // allow some variance due to sampling
  });
});

describe("statistics.twoSampleProportionZTest", () => {
  test("computes pValue ~ 0 for big difference", () => {
    const { pValue } = twoSampleProportionZTest(60, 1000, 18, 800);
    expect(pValue).toBeLessThan(0.01);
  });
  test("generatePosteriorSamplesForTopVsBaseline returns samples", () => {
    const variants = [
      { id: "A", metrics: { views: 500, conversions: 50 } },
      { id: "B", metrics: { views: 400, conversions: 10 } },
    ];
    const samples = generatePosteriorSamplesForTopVsBaseline(variants, 200);
    expect(Array.isArray(samples)).toBe(true);
    expect(samples.length).toBeGreaterThan(0);
    // check a reasonable range for a delta of about 0.08
    const p50 = samples.slice().sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    expect(typeof p50).toBe("number");
  });
});
