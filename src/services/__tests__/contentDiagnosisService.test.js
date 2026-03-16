const {
  buildPerformanceSnapshot,
  diagnoseContentPerformance,
  generateRecommendations,
} = require("../contentDiagnosisService");

describe("contentDiagnosisService", () => {
  test("builds normalized snapshot from content and analytics", () => {
    const snapshot = buildPerformanceSnapshot(
      {
        title: "Short",
        hashtags: ["growth"],
        thumbnailUrl: "https://example.com/t.jpg",
      },
      {
        views: 1000,
        engagements: 10,
        shares: 1,
        comments: 1,
        cost: 20,
        revenue: 10,
      }
    );

    expect(snapshot.views).toBe(1000);
    expect(snapshot.engagementRate).toBeCloseTo(0.01, 6);
    expect(snapshot.roi).toBeCloseTo(0.5, 6);
    expect(snapshot.hasHashtags).toBe(true);
    expect(snapshot.hasThumbnail).toBe(true);
  });

  test("flags at-risk content with actionable issues", () => {
    const diagnosis = diagnoseContentPerformance({
      views: 300,
      engagements: 2,
      shares: 0,
      comments: 0,
      engagementRate: 2 / 300,
      conversionRate: 0.01,
      roi: 0.4,
      hasThumbnail: false,
      titleLength: 12,
      hasHashtags: false,
    });

    expect(diagnosis.status).toBe("at_risk");
    expect(diagnosis.issues.length).toBeGreaterThan(0);
    expect(diagnosis.issues.some(i => i.type === "hook")).toBe(true);
    expect(diagnosis.issues.some(i => i.type === "monetization")).toBe(true);
  });

  test("returns recommendations mapped from detected issues", () => {
    const result = generateRecommendations(
      {
        title: "Tiny",
      },
      {
        views: 120,
        engagements: 1,
        shares: 0,
        comments: 0,
        cost: 10,
        revenue: 0,
      }
    );

    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0]).toHaveProperty("recommendation");
    expect(result.recommendations[0]).toHaveProperty("reason");
  });
});
