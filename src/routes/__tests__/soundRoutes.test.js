const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");

let hasRulesUnitTesting = true;
let initializeTestEnvironment;
try {
  ({ initializeTestEnvironment } = require("@firebase/rules-unit-testing"));
} catch (e) {
  hasRulesUnitTesting = false;
}

// Allow extra time for emulator startup
jest.setTimeout(30000);

const firebaseAdmin = require("../../../firebaseAdmin");

describe("soundRoutes", () => {
  if (hasRulesUnitTesting) {
    let testEnv, testDb, originalDb;
    beforeAll(async () => {
      testEnv = await initializeTestEnvironment({ projectId: "sound-routes" });
    });
    beforeEach(async () => {
      const ctx = testEnv.unauthenticatedContext();
      testDb = ctx.firestore();
      global.__testDb = testDb;
      originalDb = require("../../../firebaseAdmin").db;
    });
    afterEach(async () => {
      await testEnv.clearFirestore();
      delete global.__testDb;
    });
    afterAll(async () => {
      await testEnv.cleanup();
    });

    test("GET /api/sounds returns list", async () => {
      // inject db early
      require("../../firebaseAdmin").db = testDb;
      // seed
      await testDb.collection("sounds").add({ title: "S1", createdAt: new Date().toISOString() });

      const app = express();
      app.use(bodyParser.json());
      app.use("/api/sounds", require("../../routes/soundRoutes"));
      const res = await request(app).get("/api/sounds");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.sounds)).toBe(true);

      require("../../firebaseAdmin").db = originalDb;
    });

    test("POST /api/sounds/import requires providerName and feed", async () => {
      require("../../firebaseAdmin").db = testDb;
      const app = express();
      app.use(bodyParser.json());
      app.use("/api/sounds", require("../../routes/soundRoutes"));
      const res = await request(app).post("/api/sounds/import").send({});
      expect(res.status).toBe(400);
      require("../../firebaseAdmin").db = originalDb;
    });
  } else {
    beforeEach(() => {
      /* fallback stub */
    });

    test("GET /api/sounds works (stub)", async () => {
      const app = express();
      app.use(bodyParser.json());
      app.use("/api/sounds", require("../../routes/soundRoutes"));
      const res = await request(app).get("/api/sounds");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.sounds)).toBe(true);
    });
  }
});
