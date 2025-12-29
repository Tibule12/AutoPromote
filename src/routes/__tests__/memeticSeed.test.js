const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");

process.env.FIREBASE_ADMIN_BYPASS = "1";
const firebaseAdmin = require("../../../firebaseAdmin");

const makeDoc = data => ({ exists: true, data: () => data, update: async () => true });

describe("memetic seed route", () => {
  beforeEach(() => {
    // default collection stub
    firebaseAdmin.db.collection = _name => ({
      doc: _id => ({ get: async () => ({ exists: false, data: () => ({}) }) }),
      add: async doc => ({ id: "exp123", ...doc }),
    });
    try {
      require("../../firebaseAdmin").db.collection = firebaseAdmin.db.collection;
    } catch (e) {}
  });

  test("POST /api/clips/memetic/seed with plan succeeds", async () => {
    const app = express();
    app.use(bodyParser.json());
    delete require.cache[require.resolve("../../routes/clipRoutes")];
    app.use("/api/clips", require("../../routes/clipRoutes"));

    const res = await request(app)
      .post("/api/clips/memetic/seed")
      .set("Authorization", "Bearer test-token-for-testUser")
      .send({
        plan: [
          { variantId: "v1", variant: { hookStrength: 0.6, shareability: 0.05 } },
          { variantId: "v2", variant: { hookStrength: 0.55, shareability: 0.08 } },
        ],
        options: { seedSize: 100 },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.experimentId).toBeDefined();
  });

  test("POST /api/clips/memetic/seed with contentId enforces ownership", async () => {
    // stub content doc owned by other user
    firebaseAdmin.db.collection = _name => ({
      doc: _id => ({ get: async () => makeDoc({ user_id: "otherUser" }) }),
      add: async doc => ({ id: "exp123", ...doc }),
    });
    try {
      require("../../firebaseAdmin").db.collection = firebaseAdmin.db.collection;
    } catch (e) {}

    const app = express();
    app.use(bodyParser.json());
    app.use("/api/clips", require("../../routes/clipRoutes"));

    const res = await request(app)
      .post("/api/clips/memetic/seed")
      .set("Authorization", "Bearer test-token-for-testUser")
      .send({ contentId: "content123", plan: [{ variantId: "v1", variant: {} }] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Unauthorized");
  });
});
