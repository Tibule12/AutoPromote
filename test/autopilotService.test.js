const autopilotService = require("../src/services/autopilotService");

describe("autopilotService.decideAutoApply", () => {
  test("recommends a winner when above threshold", () => {
    const testData = {
      autopilot: { enabled: true, confidenceThreshold: 50, minSample: 10, mode: "recommend" },
      variants: [
        {
          id: "A",
          metrics: { views: 1200, conversions: 50, engagement: 200 },
          promotionSettings: { budget: 100 },
        },
        {
          id: "B",
          metrics: { views: 300, conversions: 5, engagement: 100 },
          promotionSettings: { budget: 100 },
        },
      ],
    };
    const decision = autopilotService.decideAutoApply(testData);
    expect(decision.shouldApply).toBe(true);
    expect(decision.confidence).toBeGreaterThanOrEqual(80);
    expect(typeof decision.predictedUplift).toBe("number");
    expect(typeof decision.incConversionsPer1000Views).toBe("number");
    expect(typeof decision.estimatedRevenueChangePer1000Views).toBe("number");
    expect(typeof decision.baselineRate).toBe("number");
    expect(typeof decision.topRate).toBe("number");
    expect(typeof decision.riskScore).toBe("number");
    expect(decision.simulation).toBeDefined();
    expect(Array.isArray(decision.simulation.samples)).toBe(true);
  });

  test("does not recommend when disabled or sample size too low", () => {
    const testData = {
      autopilot: { enabled: false, confidenceThreshold: 50, minSample: 100, mode: "recommend" },
      variants: [
        {
          id: "A",
          metrics: { views: 10, conversions: 1, engagement: 2 },
          promotionSettings: { budget: 10 },
        },
        {
          id: "B",
          metrics: { views: 12, conversions: 1, engagement: 2 },
          promotionSettings: { budget: 10 },
        },
      ],
    };
    const decision = autopilotService.decideAutoApply(testData);
    expect(decision.shouldApply).toBe(false);
    expect(decision.reason).toBe("autopilot_disabled" || "min_sample_not_met");
  });
});

describe("autopilotService.canApplyAuto", () => {
  test("returns false when requiresApproval is true and not approved", () => {
    const testData = { autopilot: { enabled: true, requiresApproval: true, approvedBy: null } };
    const ok = autopilotService.canApplyAuto(testData);
    expect(ok).toBe(false);
  });
  test("returns true when requiresApproval is true and approvedBy exists", () => {
    const testData = {
      autopilot: { enabled: true, requiresApproval: true, approvedBy: "admin123" },
    };
    const ok = autopilotService.canApplyAuto(testData);
    expect(ok).toBe(true);
  });
});

describe("autopilotService.buildCanaryScheduleData", () => {
  test("builds schedule from previous budget when present", () => {
    const service = require("../src/services/autopilotService");
    const fakeTestData = { autopilot: { previousPromotionSettings: { budget: 500 } } };
    const winningVariant = { id: "A", promotionSettings: { budget: 400, platform: "facebook" } };
    const schedule = service.buildCanaryScheduleData(fakeTestData, winningVariant, {
      canaryPct: 10,
      rampHours: 6,
    });
    expect(schedule).toBeDefined();
    expect(schedule.budget).toBeGreaterThanOrEqual(1);
    // expected budget is 10% of 500 -> 50
    expect(schedule.budget).toBe(50);
    expect(schedule.platform).toBe("facebook");
    expect(new Date(schedule.start_time) < new Date(schedule.end_time)).toBe(true);
  });

  test("builds schedule from new budget when previousBudget missing", () => {
    const service = require("../src/services/autopilotService");
    const fakeTestData = { autopilot: {} };
    const winningVariant = { id: "B", promotionSettings: { budget: 120, platform: "instagram" } };
    const schedule = service.buildCanaryScheduleData(fakeTestData, winningVariant, {
      canaryPct: 25,
      rampHours: 2,
    });
    // expected 25% of 120 -> 30
    expect(schedule.budget).toBe(30);
    expect(schedule.platform).toBe("instagram");
  });
});

describe("autopilotService.applyAuto", () => {
  test("returns requires_approval when requiresApproval is true", async () => {
    await jest.isolateModulesAsync(async () => {
      // ensure firebase admin bypass for tests (avoid real admin init)
      process.env.FIREBASE_ADMIN_BYPASS = "1";
      process.env.CI_ROUTE_IMPORTS = "1";
      // isolate modules to allow controlling the firebaseAdmin mock
      jest.resetModules();
      const fakeTestData = {
        autopilot: { enabled: true, requiresApproval: true, minSample: 1, confidenceThreshold: 1 },
        contentId: "content-123",
        variants: [
          {
            id: "A",
            metrics: { views: 100, conversions: 10, engagement: 10 },
            promotionSettings: { budget: 100 },
          },
          {
            id: "B",
            metrics: { views: 120, conversions: 12, engagement: 12 },
            promotionSettings: { budget: 100 },
          },
        ],
      };
      const doc = {
        get: async () => ({ exists: true, data: () => fakeTestData }),
        update: async () => {},
      };
      const dbMock = { collection: () => ({ doc: () => doc }) };
      const adminMock = { firestore: { FieldValue: { arrayUnion: () => {} } } };

      jest.doMock("../src/firebaseAdmin", () => ({ admin: adminMock, db: dbMock }), {
        virtual: true,
      });
      jest.doMock(
        "../src/abTestingService",
        () => ({
          applyWinningSettings: async (contentId, variant) => ({
            variantId: variant.id || variant.variantId || contentId,
          }),
        }),
        { virtual: true }
      );
      jest.doMock(
        "../src/promotionService",
        () => ({
          getContentPromotionSchedules: async () => [],
          updatePromotionSchedule: async () => {},
        }),
        { virtual: true }
      );
      const service = require("../src/services/autopilotService");
      const result = await service.applyAuto("test-123");
      expect(result.applied).toBe(false);
      expect(result.reason).toBe("requires_approval");
    });
  });

  test("applies canary schedule when canaryPct is provided", async () => {
    await jest.isolateModulesAsync(async () => {
      process.env.FIREBASE_ADMIN_BYPASS = "1";
      jest.resetModules();
      const fakeTestData = {
        autopilot: { enabled: true, requiresApproval: false, minSample: 1, confidenceThreshold: 1 },
        contentId: "content-123",
        variants: [
          {
            id: "A",
            metrics: { views: 1000, conversions: 40, engagement: 200, revenue: 400 },
            promotionSettings: { budget: 200, platform: "facebook" },
          },
          {
            id: "B",
            metrics: { views: 200, conversions: 5, engagement: 50, revenue: 30 },
            promotionSettings: { budget: 100 },
          },
        ],
        autopilotActions: [],
      };
      let lastUpdate = null;
      const doc = {
        get: async () => ({ exists: true, data: () => fakeTestData }),
        update: async u => {
          lastUpdate = u;
          return true;
        },
      };
      const contentDoc = {
        exists: true,
        data: () => ({ optimizedPromotionSettings: { budget: 200 } }),
      };
      const dbMock = {
        collection: name => {
          if (name === "ab_tests") return { doc: id => doc };
          if (name === "content")
            return { doc: id => ({ get: async () => contentDoc, update: async () => true }) };
          return { doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) };
        },
      };
      const adminMock = {
        firestore: {
          FieldValue: { arrayUnion: (...args) => (args.length === 1 ? args[0] : args) },
        },
      };
      // Mock promotion service schedulePromotion
      jest.doMock("../src/firebaseAdmin", () => ({ admin: adminMock, db: dbMock }), {
        virtual: true,
      });
      const path = require("path");
      // Ensure we mock the exact resolved module path for promotion/abTesting services
      const abPath = require.resolve("../abTestingService.js");
      const promoPath = require.resolve("../src/promotionService.js");
      jest.doMock(abPath, () => ({
        applyWinningSettings: async (contentId, variant) => ({
          variantId: variant.id || variant.variantId || contentId,
        }),
      }));
      let lastSchedData = null;
      jest.doMock(promoPath, () => ({
        schedulePromotion: async (contentId, scheduleData) => {
          lastSchedData = scheduleData;
          return { id: "sched-1", ...scheduleData };
        },
        getContentPromotionSchedules: async () => [],
        updatePromotionSchedule: async () => {},
        deletePromotionSchedule: async () => ({ success: true }),
      }));
      // sanity check the mocked module exports
      const promoMock = require(promoPath);
      expect(typeof promoMock.schedulePromotion).toBe("function");
      const service = require("../src/services/autopilotService");
      const promo = require(promoPath);
      const absvc = require(abPath);
      const result = await service.applyAuto("test-123", {
        canaryPct: 10,
        rampHours: 12,
        promotionService: promo,
        abTestingService: absvc,
      });
      expect(result.applied).toBe(true);
      expect(result.winner).toBe("A");
      // Ensure updates were recorded
      expect(lastUpdate).toBeDefined();
      // check autopilotActions update included createdScheduleId
      const autoActions = lastUpdate.autopilotActions || lastUpdate["autopilotActions"];
      expect(autoActions).toBeDefined();
      // The arrayUnion stub may be different; ensure we find createdScheduleId in any object
      const containsSched = JSON.stringify(autoActions).includes("sched-1");
      expect(containsSched).toBe(true);
      expect(lastSchedData).toBeDefined();
      // prevBudget is 200 from content.optimizedPromotionSettings; 10% of 200 -> 20
      expect(lastSchedData.budget).toBe(20);
    });
  });

  test("rollbackAuto deletes created schedule and restores previous settings", async () => {
    await jest.isolateModulesAsync(async () => {
      process.env.FIREBASE_ADMIN_BYPASS = "1";
      jest.resetModules();
      const fakeTestData = {
        autopilot: { enabled: true },
        contentId: "content-123",
        variants: [
          { id: "A", metrics: { views: 100, conversions: 10 }, promotionSettings: { budget: 100 } },
          { id: "B", metrics: { views: 50, conversions: 2 }, promotionSettings: { budget: 50 } },
        ],
        autopilotActions: [
          {
            variantId: "A",
            createdScheduleId: "sched-1",
            previousPromotionSettings: { budget: 100 },
          },
        ],
        winner: "A",
        status: "completed",
      };
      let lastContentUpdate = null;
      let deletedScheduleId = null;
      const doc = {
        get: async () => ({ exists: true, data: () => fakeTestData }),
        update: async u => {
          return true;
        },
      };
      const contentDoc = {
        exists: true,
        data: () => ({ optimizedPromotionSettings: { budget: 200 } }),
      };
      const dbMock = {
        collection: name => {
          if (name === "ab_tests") return { doc: id => doc };
          if (name === "content")
            return {
              doc: id => ({
                get: async () => contentDoc,
                update: async u => {
                  lastContentUpdate = u;
                  return true;
                },
              }),
            };
          return { doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) };
        },
      };
      const adminMock = {
        firestore: {
          FieldValue: { arrayUnion: (...args) => (args.length === 1 ? args[0] : args) },
        },
      };
      jest.doMock("../src/firebaseAdmin", () => ({ admin: adminMock, db: dbMock }));
      const promoPath = require.resolve("../src/promotionService.js");
      jest.doMock(promoPath, () => ({
        deletePromotionSchedule: async id => {
          deletedScheduleId = id;
          return { success: true };
        },
        getContentPromotionSchedules: async () => [
          {
            id: "future-1",
            start_time: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
            budget: 20,
          },
        ],
        updatePromotionSchedule: async (id, u) => {
          lastContentUpdate = lastContentUpdate || {};
          lastContentUpdate.updated = u;
          return { id, ...u };
        },
      }));
      const service = require("../src/services/autopilotService");
      const promo = require(promoPath);
      const result = await service.rollbackAuto("test-123", -1, { promotionService: promo });
      expect(result).toBeDefined();
      expect(result.rolledBack).toBe(true);
      expect(result.action.variantId).toBe("A");
      expect(deletedScheduleId).toBe("sched-1");
      expect(lastContentUpdate).toBeDefined();
    });
  });
});
