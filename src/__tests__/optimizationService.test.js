const optimizationService = require("../optimizationService");

describe("optimizationService", () => {
  test("generateOptimizationRecommendations returns compatibility array", () => {
    const recs = optimizationService.generateOptimizationRecommendations(
      { title: "Quick tip", hashtags: ["tips"] },
      { views: 200, engagements: 2, cost: 10, revenue: 1 }
    );

    expect(Array.isArray(recs)).toBe(true);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]).toHaveProperty("recommendation");
    expect(recs[0]).toHaveProperty("reason");
  });

  test("diagnoseContentPerformance exposes richer diagnosis payload", () => {
    const result = optimizationService.diagnoseContentPerformance(
      { title: "Short" },
      { views: 100, engagements: 0, cost: 20, revenue: 0 }
    );

    expect(result).toHaveProperty("snapshot");
    expect(result).toHaveProperty("diagnosis");
    expect(result).toHaveProperty("recommendations");
    expect(result.diagnosis).toHaveProperty("healthScore");
  });
});
