const express = require("express");
const request = require("supertest");
const mockFinancial = { deductCredits: jest.fn(), refundCredits: jest.fn() };
const mockCollection = jest.fn();
jest.mock("../firebaseAdmin", () => ({ db: { collection: (...args) => mockCollection(...args) } }));
jest.mock("../creditSystem", () => ({
  deductCredits: (...a) => mockFinancial.deductCredits(...a),
  refundCredits: (...a) => mockFinancial.refundCredits(...a),
}));
jest.mock("../authMiddleware", () => (req, _res, next) => {
  req.user = { uid: "owner-1" };
  req.userId = "owner-1";
  next();
});
jest.mock("../services/videoClippingService", () => ({}));
jest.mock("../services/clipOutcomeLearningService", () => ({}));
jest.mock("../services/billingService", () => ({
  getEffectiveTierSnapshot: async () => ({ tierId: "premium" }),
}));
const retiredResponse = require("../retiredFeatureResponse");
const {
  SUBSCRIPTION_PLANS,
  CREDIT_TOP_UP_PACKS,
  getPlanCapabilities,
} = require("../config/subscriptionPlans");
function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/ai-video", retiredResponse);
  a.use("/api/clips", require("../routes/clipRoutes"));
  a.use("/api/analytics", require("../analyticsRoutes"));
  return a;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockCollection.mockImplementation(() => {
    throw Error("Unexpected database call");
  });
});
test.each([
  "/api/ai-video/script",
  "/api/ai-video/generate",
  "/api/clips/promo-summary",
  "/api/clips/promo-summary/estimate",
])("%s rejects stale requests before database, charges or providers", async path => {
  const r = await request(app())
    .post(path)
    .send({ idea: "try", videoUrl: "https://example.invalid/source.mp4" })
    .expect(410);
  expect(r.body.error).toBe("FEATURE_RETIRED");
  expect(mockCollection).not.toHaveBeenCalled();
  expect(mockFinancial.deductCredits).not.toHaveBeenCalled();
  expect(mockFinancial.refundCredits).not.toHaveBeenCalled();
});
test("old Analytics dashboard API cannot run collection aggregations", async () => {
  await request(app()).get("/api/analytics/user?range=all").expect(410);
  expect(mockCollection).not.toHaveBeenCalled();
});
test("remaining reward progress uses owned, real published receipts without changing balances", async () => {
  const posts = [
    {
      id: "real",
      uid: "owner-1",
      success: true,
      platform: "youtube",
      createdAt: new Date().toISOString(),
      metrics: { views: 60200 },
    },
    {
      id: "simulated",
      uid: "owner-1",
      success: true,
      simulated: true,
      platform: "youtube",
      createdAt: new Date().toISOString(),
      metrics: { views: 999999 },
    },
    {
      id: "foreign",
      uid: "other",
      success: true,
      platform: "youtube",
      createdAt: new Date().toISOString(),
      metrics: { views: 999999 },
    },
  ];
  const before = JSON.stringify(posts);
  mockCollection.mockImplementation(name => ({
    doc: id => ({
      get: async () => {
        expect(id).toBe("owner-1");
        return {
          exists: true,
          data: () =>
            name === "users"
              ? { referralCode: "legacy-referral" }
              : { totalReferrals: 12, balance: 99 },
        };
      },
    }),
    where: (field, _operator, uid) => ({
      limit: () => ({
        get: async () => {
          const docs = posts.filter(p => p[field] === uid).map(p => ({ id: p.id, data: () => p }));
          return { size: docs.length, docs, forEach: fn => docs.forEach(fn) };
        },
      }),
    }),
  }));
  const r = await request(app()).get("/api/analytics/rewards").expect(200);
  expect(r.body).toMatchObject({
    referralCode: "legacy-referral",
    referralTracker: { total: 12, nextGoal: 20, potentialBonus: 15 },
    viralityTracker: { views: 60200, nextGoal: 100000, potentialBonus: 0 },
  });
  expect(JSON.stringify(posts)).toBe(before);
  expect(mockFinancial.deductCredits).not.toHaveBeenCalled();
  expect(mockFinancial.refundCredits).not.toHaveBeenCalled();
});
test("owned historical generated media remains readable without dispatch or repeat charges", async () => {
  const legacy = {
    userId: "owner-1",
    type: "promo_summary",
    status: "completed",
    outputsPersistedAt: "2026-10-20T00:00:00Z",
    clips: [{ id: "clip-1", url: "https://example.invalid/existing.mp4" }],
  };
  const before = JSON.stringify(legacy);
  mockCollection.mockReturnValue({
    doc: () => ({ get: async () => ({ exists: true, id: "old-job", data: () => legacy }) }),
  });
  const r = await request(app()).get("/api/clips/analysis/old-job").expect(200);
  expect(r.body.analysis.id).toBe("old-job");
  expect(JSON.stringify(legacy)).toBe(before);
  expect(mockFinancial.deductCredits).not.toHaveBeenCalled();
  expect(mockFinancial.refundCredits).not.toHaveBeenCalled();
  mockCollection.mockReturnValue({
    doc: () => ({
      get: async () => ({ exists: true, data: () => ({ ...legacy, userId: "another-owner" }) }),
    }),
  });
  await request(app()).get("/api/clips/analysis/old-job").expect(403);
});
test("plan identities, prices, credit allocations, top-ups and active editing access stay compatible", () => {
  expect(
    Object.values(SUBSCRIPTION_PLANS).map(p => [p.id, p.price, p.features.monthlyCredits])
  ).toEqual([
    ["free", 0, 15],
    ["premium", 14.99, 150],
    ["pro", 34.99, 500],
    ["enterprise", 99.99, 2000],
  ]);
  expect(CREDIT_TOP_UP_PACKS.map(p => [p.credits, p.price])).toEqual([
    [50, 4.99],
    [200, 14.99],
    [500, 29.99],
  ]);
  for (const id of ["premium", "pro", "enterprise"]) {
    const c = getPlanCapabilities(id);
    expect(c.analytics).toBeUndefined();
    expect(c.editing.features.smartPromoSummary).toBeUndefined();
    for (const feature of [
      "autoDirector",
      "multicam",
      "viralClipStudio",
      "findViralClips",
      "clipRender",
    ])
      expect(c.editing.features[feature].enabled).toBe(true);
  }
  expect(getPlanCapabilities("basic").planId).toBe("premium");
});
