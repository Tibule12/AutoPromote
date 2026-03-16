describe("viralOptimizationService scheduling", () => {
  let updateMock;
  let addMock;
  let notificationMock;
  let performViralOptimization;

  beforeEach(() => {
    jest.resetModules();

    updateMock = jest.fn().mockResolvedValue(undefined);
    addMock = jest.fn().mockResolvedValue({ id: "schedule-1" });
    notificationMock = jest.fn().mockResolvedValue(undefined);

    jest.doMock("../src/firebaseAdmin", () => ({
      db: {
        collection: jest.fn(name => {
          if (name === "content") {
            return {
              doc: jest.fn(() => ({
                update: updateMock,
              })),
            };
          }

          if (name === "promotion_schedules") {
            return {
              add: addMock,
            };
          }

          throw new Error(`Unexpected collection: ${name}`);
        }),
      },
    }));

    jest.doMock("../src/utils/logger", () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));
    jest.doMock("../src/utils/sanitizeForFirestore", () => value => value);
    jest.doMock("../src/services/billingService", () => ({
      checkAILimit: jest.fn().mockResolvedValue({ allowed: true, limit: 100 }),
      trackAIUsage: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("../src/services/notificationEngine", () => ({
      sendNotification: notificationMock,
    }));
    jest.doMock("../src/services/hashtagEngine", () => ({
      generateCustomHashtags: jest.fn().mockResolvedValue({ hashtags: ["#autopromote"] }),
    }));
    jest.doMock("../src/services/smartDistributionEngine", () => ({
      generateDistributionStrategy: jest.fn().mockResolvedValue({ platforms: [] }),
    }));
    jest.doMock("../src/services/viralImpactEngine", () => ({
      seedContentToVisibilityZones: jest.fn().mockResolvedValue({ seedingResults: [] }),
      orchestrateBoostChain: jest.fn().mockResolvedValue({ chainId: null, squadSize: 0 }),
    }));
    jest.doMock("../src/services/algorithmExploitationEngine", () => ({
      optimizeForAlgorithm: jest.fn().mockResolvedValue({ optimizationScore: 42 }),
    }));
    jest.doMock("../src/services/mediaTransform", () => ({
      enqueueMediaTransformTask: jest.fn().mockResolvedValue(undefined),
    }));

    ({ performViralOptimization } = require("../src/services/viralOptimizationService"));
  });

  test("does not create a promotion schedule for immediate optimization", async () => {
    const result = await performViralOptimization(
      "content-1",
      "user-1",
      { title: "Immediate Post", type: "video", url: "https://example.com/video.mp4" },
      {
        bypassViral: true,
        enhance_quality: false,
        target_platforms: ["tiktok", "youtube"],
      }
    );

    expect(result.success).toBe(true);
    expect(addMock).not.toHaveBeenCalled();
    expect(notificationMock).toHaveBeenLastCalledWith(
      "user-1",
      "Content optimized successfully",
      "success",
      expect.objectContaining({ contentId: "content-1", platform: null })
    );
  });

  test("creates one schedule per requested platform for future publishing", async () => {
    const futureTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const result = await performViralOptimization(
      "content-2",
      "user-2",
      { title: "Scheduled Post", type: "video", url: "https://example.com/video.mp4" },
      {
        bypassViral: true,
        enhance_quality: false,
        target_platforms: ["tiktok", "youtube"],
        scheduled_promotion_time: futureTime,
        platform_options: {
          tiktok: { privacy: "public" },
          youtube: { visibility: "unlisted" },
        },
        repost_boost: true,
        share_boost: false,
      }
    );

    expect(result.success).toBe(true);
    expect(addMock).toHaveBeenCalledTimes(2);
    expect(addMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        contentId: "content-2",
        user_id: "user-2",
        platform: "tiktok",
        startTime: futureTime,
        platformSpecificSettings: expect.objectContaining({
          privacy: "public",
          repost_boost: true,
          share_boost: false,
        }),
      })
    );
    expect(addMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        contentId: "content-2",
        user_id: "user-2",
        platform: "youtube",
        startTime: futureTime,
        platformSpecificSettings: expect.objectContaining({
          visibility: "unlisted",
          repost_boost: true,
          share_boost: false,
        }),
      })
    );
  });
});
