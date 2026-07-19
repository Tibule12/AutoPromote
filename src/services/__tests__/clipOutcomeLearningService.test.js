const {
  buildClipLearningProfile,
  calculateClipOutcomeScore,
  durationBucket,
  resolveClipLearningMetadata,
} = require("../clipOutcomeLearningService");

describe("clip outcome learning", () => {
  test("scores high-retention, high-sharing outcomes above weak outcomes", () => {
    const strong = calculateClipOutcomeScore({
      metrics: {
        views: 10000,
        likes: 900,
        comments: 160,
        shares: 300,
        completion_rate: 0.82,
      },
      normalizedPlatformScore: 88,
      duration: 20,
    });
    const weak = calculateClipOutcomeScore({
      metrics: {
        views: 10000,
        likes: 80,
        comments: 5,
        shares: 3,
        completion_rate: 0.18,
      },
      normalizedPlatformScore: 18,
      duration: 20,
    });

    expect(strong.outcomeScore).toBeGreaterThan(weak.outcomeScore);
    expect(strong.retentionScore).toBe(82);
    expect(strong.sampleWeight).toBeGreaterThanOrEqual(0.9);
  });

  test("warms up before three outcomes and learns bounded preferences afterwards", () => {
    const outcomes = [
      {
        outcomeScore: 90,
        sampleWeight: 1,
        platform: "tiktok",
        features: {
          strategyLabel: "Hero Clip",
          contentType: "podcast_conversation",
          durationBucket: "10_20s",
        },
      },
      {
        outcomeScore: 82,
        sampleWeight: 0.9,
        platform: "youtube",
        features: {
          strategyLabel: "Hero Clip",
          contentType: "podcast_conversation",
          durationBucket: "10_20s",
        },
      },
      {
        outcomeScore: 30,
        sampleWeight: 0.8,
        platform: "instagram",
        features: {
          strategyLabel: "Support Clip",
          contentType: "podcast_conversation",
          durationBucket: "35_60s",
        },
      },
    ];

    expect(buildClipLearningProfile("user-1", outcomes.slice(0, 2)).status).toBe("warming_up");
    const profile = buildClipLearningProfile("user-1", outcomes);
    expect(profile.status).toBe("active");
    expect(profile.strategyWeights.hero_clip.multiplier).toBeGreaterThan(1);
    expect(profile.strategyWeights.support_clip.multiplier).toBeLessThan(1);
    expect(profile.strategyWeights.hero_clip.multiplier).toBeLessThanOrEqual(1.15);
  });

  test("resolves scanner lineage from persisted content metadata", () => {
    const metadata = resolveClipLearningMetadata(
      { payload: {} },
      { meta: { clipLearning: { scanSessionId: "scan-1", clipId: "clip-2" } } }
    );
    expect(metadata).toEqual({ scanSessionId: "scan-1", clipId: "clip-2" });
    expect(durationBucket(8)).toBe("under_10s");
    expect(durationBucket(28)).toBe("20_35s");
  });
});
