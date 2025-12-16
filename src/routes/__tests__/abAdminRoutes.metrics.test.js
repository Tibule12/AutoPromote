const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");
// Bypass Firebase Admin initialization
process.env.FIREBASE_ADMIN_BYPASS = "1";
const firebaseAdmin = require("../../firebaseAdmin");
firebaseAdmin.admin.auth = () => ({ verifyIdToken: async token => ({ uid: "test-admin" }) });
// Provide stubbed ab_tests and platform_posts
const samplePlatformPosts = [
  {
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    platform: "facebook",
    contentId: "c1",
    usedVariant: "A",
    metrics: { views: 100, conversions: 10 },
  },
  {
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    platform: "facebook",
    contentId: "c1",
    usedVariant: "B",
    metrics: { views: 80, conversions: 6 },
  },
  {
    createdAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    platform: "tiktok",
    contentId: "c1",
    usedVariant: "A",
    metrics: { views: 150, conversions: 12 },
  },
];
// Override collection function to return our fake docs
const stubCollection = name => {
  if (name === "ab_tests") {
    return {
      doc: id => ({
        get: async () => ({
          exists: true,
          data: () => ({
            id,
            contentId: "c1",
            autopilotActions: [
              {
                variantId: "A",
                triggeredAt: new Date().toISOString(),
                reason: "autopilot_auto_apply",
              },
            ],
          }),
        }),
      }),
    };
  }
  if (name === "platform_posts") {
    return {
      where: (field, op, value) => ({
        orderBy: () => ({
          get: async () => ({
            empty: false,
            docs: samplePlatformPosts.map(d => ({
              id: `p-${Math.random()}`,
              data: () => ({ ...d, createdAt: { toDate: () => new Date(d.createdAt) } }),
            })),
          }),
        }),
      }),
    };
  }
  // default
  return { doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) };
};
firebaseAdmin.db.collection = stubCollection;
firebaseAdmin.admin.firestore.FieldValue = { serverTimestamp: () => new Date() };

const app = express();
app.use(bodyParser.json());
app.use("/api/admin/ab_tests", require("../abAdminRoutes"));

describe("abAdminRoutes metrics", () => {
  test("returns timeseries, variants, and actions for given test id", async () => {
    const res = await request(app)
      .get("/api/admin/ab_tests/testA/metrics")
      .set("Authorization", "Bearer test-token-for-adminUser");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.timeseries).toBeDefined();
    expect(Array.isArray(res.body.timeseries)).toBe(true);
    expect(res.body.variants).toBeDefined();
    expect(Array.isArray(res.body.variants)).toBe(true);
    expect(res.body.actions && Array.isArray(res.body.actions)).toBe(true);
  });
});
