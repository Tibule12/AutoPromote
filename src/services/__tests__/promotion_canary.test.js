/**
 * Lightweight smoke tests for TikTok canary gating in enqueuePlatformPostTask.
 * Uses fast-path test behavior (JEST_WORKER_ID) and module mocks to avoid hitting emulator.
 */

jest.setTimeout(10000);

describe("TIKTOK canary gating (fast-path smoke)", () => {
  beforeEach(() => {
    // Ensure fresh module state for each scenario
    jest.resetModules();
    // Always pretend we're in test worker to hit fast-path in code
    process.env.JEST_WORKER_ID = "1";
  });

  afterEach(() => {
    delete process.env.TIKTOK_ENABLED;
    delete process.env.TIKTOK_CANARY_UIDS;
  });

  test("skips when TIKTOK_ENABLED=false and uid not in canary", async () => {
    process.env.TIKTOK_ENABLED = "false";
    process.env.TIKTOK_CANARY_UIDS = "";

    // stub firebaseAdmin to avoid any external IO
    jest.doMock("../../firebaseAdmin", () => ({
      db: {
        collection: () => ({
          doc: () => ({
            id: `stub-${Math.random().toString(36).slice(2, 8)}`,
            set: async () => {},
          }),
        }),
      },
      admin: {},
    }));

    // stub metricsRecorder so the incrCounter call doesn't throw
    jest.doMock("../metricsRecorder", () => ({ incrCounter: jest.fn() }));

    const { enqueuePlatformPostTask } = require("../promotionTaskQueue");

    const res = await enqueuePlatformPostTask({
      contentId: "c1",
      uid: "not-in-canary",
      platform: "tiktok",
      reason: "approved",
      payload: {},
    });

    expect(res).toBeTruthy();
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe("disabled_by_feature_flag");
  });

  test("allows when UID is present in TIKTOK_CANARY_UIDS even if disabled", async () => {
    process.env.TIKTOK_ENABLED = "false";
    process.env.TIKTOK_CANARY_UIDS = "canary-1, canary-2";

    jest.doMock("../../firebaseAdmin", () => ({
      db: {
        collection: () => ({
          doc: () => ({
            id: `stub-${Math.random().toString(36).slice(2, 8)}`,
            set: async () => {},
          }),
        }),
      },
      admin: {},
    }));
    jest.doMock("../metricsRecorder", () => ({ incrCounter: jest.fn() }));

    const { enqueuePlatformPostTask } = require("../promotionTaskQueue");

    const res = await enqueuePlatformPostTask({
      contentId: "c2",
      uid: "canary-2",
      platform: "tiktok",
      reason: "approved",
      payload: {},
    });

    expect(res).toBeTruthy();
    expect(res).toHaveProperty("id");
    expect(res).not.toHaveProperty("skipped");
  });

  test("allows when TIKTOK_ENABLED=true regardless of canary", async () => {
    process.env.TIKTOK_ENABLED = "true";
    process.env.TIKTOK_CANARY_UIDS = ""; // ignored

    jest.doMock("../../firebaseAdmin", () => ({
      db: {
        collection: () => ({
          doc: () => ({
            id: `stub-${Math.random().toString(36).slice(2, 8)}`,
            set: async () => {},
          }),
        }),
      },
      admin: {},
    }));
    jest.doMock("../metricsRecorder", () => ({ incrCounter: jest.fn() }));

    const { enqueuePlatformPostTask } = require("../promotionTaskQueue");

    const res = await enqueuePlatformPostTask({
      contentId: "c3",
      uid: "some-user",
      platform: "tiktok",
      reason: "approved",
      payload: {},
    });

    expect(res).toBeTruthy();
    expect(res).toHaveProperty("id");
  });
});
