const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");

process.env.FIREBASE_ADMIN_BYPASS = "1";
const firebaseAdmin = require("../../../firebaseAdmin");

let hasRulesUnitTesting = true;
let initializeTestEnvironment;
try {
  ({ initializeTestEnvironment } = require("@firebase/rules-unit-testing"));
} catch (e) {
  hasRulesUnitTesting = false;
}
// If an emulator host isn't configured/discoverable, fall back to the non-emulator test path
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  // No emulator host set — fall back to non-emulator test path to keep local runs green
  hasRulesUnitTesting = false;
}

// Allow extra time for emulator startup
jest.setTimeout(60000);

const makeDoc = data => ({ exists: true, data: () => data, update: async () => true });

describe("memetic seed route", () => {
  if (hasRulesUnitTesting) {
    let testEnv;
    let testDb;

    beforeAll(async () => {
      const { initializeTestEnvironmentWithDiscovery } = require("../../testUtils/initTestEnv");
      testEnv = await initializeTestEnvironmentWithDiscovery("memetic-seed-test");
    });

    beforeEach(async () => {
      const ctx = testEnv.authenticatedContext("service-account", {
        firebase: { sign_in_provider: "service_account" },
      });
      testDb = ctx.firestore();
    });

    afterEach(async () => {
      await testEnv.clearFirestore();
    });

    afterAll(async () => {
      await testEnv.cleanup();
    });

    test("POST /api/clips/memetic/seed with plan succeeds (emulator)", async () => {
      const app = express();
      app.use(bodyParser.json());
      // inject the emulator db into the route by temporarily replacing firebaseAdmin.db
      const originalDb = require("../../../firebaseAdmin").db;
      require("../../firebaseAdmin").db = testDb;
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

      // verify experiment doc exists
      const exDoc = await testDb.collection("memetic_experiments").doc(res.body.experimentId).get();
      expect(exDoc.exists).toBeTruthy();
      const ex = exDoc.data();
      expect(ex.plan.length).toBe(2);
      expect(ex.options.seedSize).toBe(100);

      // memetic_seeds will be created by the worker; none should exist yet
      const seeds = await testDb
        .collection("memetic_seeds")
        .where("experimentId", "==", res.body.experimentId)
        .get();
      expect(seeds.docs.length).toBe(0);

      // restore
      require("../../firebaseAdmin").db = originalDb;
    });

    test("POST /api/clips/memetic/seed with contentId enforces ownership (emulator)", async () => {
      // seed a content doc owned by otherUser
      const cdoc = await testDb.collection("content").add({ user_id: "otherUser" });

      const app = express();
      app.use(bodyParser.json());
      const originalDb = require("../../../firebaseAdmin").db;
      require("../../firebaseAdmin").db = testDb;
      app.use("/api/clips", require("../../routes/clipRoutes"));

      const res = await request(app)
        .post("/api/clips/memetic/seed")
        .set("Authorization", "Bearer test-token-for-testUser")
        .send({ contentId: cdoc.id, plan: [{ variantId: "v1", variant: {} }] });

      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();

      require("../../firebaseAdmin").db = originalDb;
    });
  } else {
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
  }
});
