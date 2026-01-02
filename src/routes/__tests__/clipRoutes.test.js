const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");

// Use test-token bypass in auth middleware
process.env.FIREBASE_ADMIN_BYPASS = "1";
const firebaseAdmin = require("../../../firebaseAdmin");
// Also stub the functions emulator's server-side firebaseAdmin used by clipRoutes
const serverFirebaseAdmin = require("../../../autopromote-functions/_server/src/firebaseAdmin");

// Allow extra time for emulator startup
jest.setTimeout(30000);

let hasRulesUnitTesting = true;
let initializeTestEnvironment;
try {
  ({ initializeTestEnvironment } = require("@firebase/rules-unit-testing"));
} catch (e) {
  hasRulesUnitTesting = false;
}

// Simple collection/doc stub helper
const makeDoc = data => ({ exists: true, data: () => data, update: async () => true });

describe("clipRoutes", () => {
  if (hasRulesUnitTesting) {
    let testEnv;
    let testDb;

    beforeAll(async () => {
      const { initializeTestEnvironmentWithDiscovery } = require("../../testUtils/initTestEnv");
      testEnv = await initializeTestEnvironmentWithDiscovery("clip-routes-test");
    });

    beforeEach(async () => {
      const ctx = testEnv.unauthenticatedContext();
      testDb = ctx.firestore();
      // expose for tests that use a simple global reference
      global.__testDb = testDb;
    });

    afterEach(async () => {
      // clear and remove global reference
      await testEnv.clearFirestore();
      delete global.__testDb;
    });

    afterAll(async () => {
      await testEnv.cleanup();
    });

    // Tests will run with testDb injected
  } else {
    beforeEach(() => {
      // Default db.collection stub; tests will override specific collection() usages
      firebaseAdmin.db.collection = _name => ({
        doc: _id => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set: async () => true,
          update: async () => true,
        }),
      });
      // Ensure src-level firebaseAdmin (used by src routes) sees the same stub
      try {
        require("../../firebaseAdmin").db.collection = firebaseAdmin.db.collection;
      } catch (e) {
        /* best-effort */
      }
      // Also stub server-side firebase admin used by /autopromote-functions/_server routes
      serverFirebaseAdmin.db.collection = _name => ({
        doc: _id => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set: async () => true,
        }),
      });
    });
  }

  test("POST /api/clips/analyze succeeds when content owner matches token (user_id schema)", async () => {
    // Arrange: content doc owned by testUser123
    if (hasRulesUnitTesting) {
      // emulator path: seed content doc
      const cdoc = await global.__testDb.collection("content").add({ user_id: "testUser123" });
      // inject emulator db into runtime
      const originalDb = require("../../firebaseAdmin").db;
      require("../../firebaseAdmin").db = global.__testDb;

      // Stub analyzeVideo to avoid heavy work
      const videoClippingService = require("../../services/videoClippingService");
      videoClippingService.analyzeVideo = async () => ({
        analysisId: "analysis123",
        clipsGenerated: 2,
      });

      const app = express();
      app.use(bodyParser.json());
      delete require.cache[require.resolve("../../routes/clipRoutes")];
      app.use("/api/clips", require("../../routes/clipRoutes"));

      const res = await request(app)
        .post("/api/clips/analyze")
        .set("Authorization", "Bearer test-token-for-testUser123")
        .send({ contentId: cdoc.id, videoUrl: "https://storage.googleapis.com/bucket/video.mp4" });

      expect(res.status).toBe(200);
      expect(res.body.analysisId).toBe("analysis123");
      expect(res.body.clipsGenerated).toBe(2);

      // restore
      require("../../firebaseAdmin").db = originalDb;
    } else {
      // stub path: keep existing behavior
      firebaseAdmin.db.collection = _name => ({
        doc: _id => ({
          get: async () => makeDoc({ user_id: "testUser123" }),
          update: async () => true,
        }),
      });
      let srcFb;
      try {
        srcFb = require("../../firebaseAdmin");
        srcFb.db.collection = _name => ({
          doc: _id => ({
            get: async () => makeDoc({ user_id: "testUser123" }),
            update: async () => true,
          }),
        });
      } catch (e) {}

      // Stub analyzeVideo to avoid heavy work
      const videoClippingService = require("../../services/videoClippingService");
      videoClippingService.analyzeVideo = async () => ({
        analysisId: "analysis123",
        clipsGenerated: 2,
      });

      // Mount app after stubbing to ensure route resolves the stubbed db
      const app = express();
      app.use(bodyParser.json());
      delete require.cache[require.resolve("../../routes/clipRoutes")];
      app.use("/api/clips", require("../../routes/clipRoutes"));

      const res = await request(app)
        .post("/api/clips/analyze")
        .set("Authorization", "Bearer test-token-for-testUser123")
        .send({
          contentId: "content123",
          videoUrl: "https://storage.googleapis.com/bucket/video.mp4",
        });

      expect(res.status).toBe(200);
      expect(res.body.analysisId).toBe("analysis123");
      expect(res.body.clipsGenerated).toBe(2);
    }
  });

  test("POST /api/clips/analyze returns 403 when content owned by another user", async () => {
    if (hasRulesUnitTesting) {
      // seed content owned by otherUser
      const cdoc = await global.__testDb.collection("content").add({ user_id: "otherUser" });
      const originalDb = require("../../firebaseAdmin").db;
      require("../../firebaseAdmin").db = global.__testDb;

      const app = express();
      app.use(bodyParser.json());
      app.use("/api/clips", require("../../routes/clipRoutes"));

      const res = await request(app)
        .post("/api/clips/analyze")
        .set("Authorization", "Bearer test-token-for-testUser123")
        .send({ contentId: cdoc.id, videoUrl: "https://storage.googleapis.com/bucket/video.mp4" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();

      require("../../firebaseAdmin").db = originalDb;
    } else {
      // Stub content owner to a different user on the default firebaseAdmin used by root routes
      firebaseAdmin.db.collection = _name => ({
        doc: _id => ({
          get: async () => makeDoc({ user_id: "otherUser" }),
          update: async () => true,
        }),
      });
      let srcFb;
      try {
        srcFb = require("../../firebaseAdmin");
        srcFb.db.collection = _name => ({
          doc: _id => ({
            get: async () => makeDoc({ user_id: "otherUser" }),
            update: async () => true,
          }),
        });
      } catch (e) {}

      // Mount app after stubbing to ensure route resolves the stubbed db
      const app = express();
      app.use(bodyParser.json());
      app.use("/api/clips", require("../../routes/clipRoutes"));

      const res = await request(app)
        .post("/api/clips/analyze")
        .set("Authorization", "Bearer test-token-for-testUser123")
        .send({
          contentId: "content123",
          videoUrl: "https://storage.googleapis.com/bucket/video.mp4",
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Unauthorized");
    }
  });
});
