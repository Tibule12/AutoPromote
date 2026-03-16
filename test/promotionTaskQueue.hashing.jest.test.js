describe("promotionTaskQueue buildPlatformPostHash", () => {
  beforeEach(() => {
    jest.resetModules();

    jest.doMock("../src/firebaseAdmin", () => ({
      db: {},
      admin: {},
    }));
    jest.doMock("../src/services/aggregationService", () => ({
      recordTaskCompletion: jest.fn(),
      recordRateLimitEvent: jest.fn(),
    }));
    jest.doMock("../src/services/rateLimitTracker", () => ({
      getCooldown: jest.fn().mockResolvedValue(null),
      noteRateLimit: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("../src/services/notificationEngine", () => ({
      sendNotification: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("../src/services/billingService", () => ({
      trackUsage: jest.fn().mockResolvedValue(undefined),
      trackAIUsage: jest.fn().mockResolvedValue(undefined),
    }));
  });

  test("returns the same hash for the same post payload regardless of reason label", () => {
    const { buildPlatformPostHash } = require("../src/services/promotionTaskQueue");

    const first = buildPlatformPostHash({
      platform: "tiktok",
      contentId: "content-1",
      payload: {
        caption: "Launch clip",
        link: "https://example.com/post",
        videoUrl: "https://cdn.example.com/video.mp4",
      },
    });

    const second = buildPlatformPostHash({
      platform: "tiktok",
      contentId: "content-1",
      payload: {
        caption: "Launch clip",
        link: "https://example.com/post",
        videoUrl: "https://cdn.example.com/video.mp4",
      },
    });

    expect(first).toBe(second);
  });

  test("changes when the canonical publish payload changes", () => {
    const { buildPlatformPostHash } = require("../src/services/promotionTaskQueue");

    const first = buildPlatformPostHash({
      platform: "instagram",
      contentId: "content-2",
      payload: {
        caption: "Version A",
        imageUrl: "https://cdn.example.com/image-a.jpg",
      },
    });

    const second = buildPlatformPostHash({
      platform: "instagram",
      contentId: "content-2",
      payload: {
        caption: "Version B",
        imageUrl: "https://cdn.example.com/image-a.jpg",
      },
    });

    expect(first).not.toBe(second);
  });
});
