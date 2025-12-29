const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");

// Bypass auth tokens
process.env.FIREBASE_ADMIN_BYPASS = "1";
const firebaseAdmin = require("../../../firebaseAdmin");

const makeDoc = data => ({ exists: true, data: () => data, update: async () => true });

// Allow extra time for memetic planner computations in CI
jest.setTimeout(20000);

describe("memetic plan route", () => {
  beforeEach(() => {
    firebaseAdmin.db.collection = _name => ({
      doc: _id => ({
        get: async () => ({ exists: false, data: () => ({}) }),
        update: async () => true,
      }),
    });
    try {
      require("../../firebaseAdmin").db.collection = firebaseAdmin.db.collection;
    } catch (e) {}
  });

  test("POST /api/clips/memetic/plan with baseVariant succeeds", async () => {
    const app = express();
    app.use(bodyParser.json());
    delete require.cache[require.resolve("../../routes/clipRoutes")];
    app.use("/api/clips", require("../../routes/clipRoutes"));

    const res = await request(app)
      .post("/api/clips/memetic/plan")
      .set("Authorization", "Bearer test-token-for-testUser")
      .send({
        baseVariant: { hookStrength: 0.6, shareability: 0.05, predictedWT: 0.6 },
        options: { count: 4 },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.plan)).toBe(true);
    expect(res.body.plan.length).toBe(4);
    expect(typeof res.body.plan[0].combined).toBe("number");
  });

  test("POST /api/clips/memetic/plan without baseVariant or contentId returns 400", async () => {
    const app = express();
    app.use(bodyParser.json());
    app.use("/api/clips", require("../../routes/clipRoutes"));

    const res = await request(app)
      .post("/api/clips/memetic/plan")
      .set("Authorization", "Bearer test-token-for-testUser")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test("POST /api/clips/memetic/plan with contentId derives a baseVariant", async () => {
    // stub content doc owned by the user
    firebaseAdmin.db.collection = _name => ({
      doc: _id => ({ get: async () => makeDoc({ user_id: "testUser" }) }),
    });
    try {
      require("../../firebaseAdmin").db.collection = firebaseAdmin.db.collection;
    } catch (e) {}

    const app = express();
    app.use(bodyParser.json());
    delete require.cache[require.resolve("../../routes/clipRoutes")];
    app.use("/api/clips", require("../../routes/clipRoutes"));

    const res = await request(app)
      .post("/api/clips/memetic/plan")
      .set("Authorization", "Bearer test-token-for-testUser")
      .send({ contentId: "content123", options: { count: 3 } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.plan)).toBe(true);
    expect(res.body.plan.length).toBe(3);
  });
});
