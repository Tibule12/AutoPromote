const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");

// Ensure demo bypass is disabled for these tests unless explicitly set per-case
delete process.env.FIREBASE_ADMIN_BYPASS;
const firebaseAdmin = require("../../../firebaseAdmin");

describe("tiktok /creator_info", () => {
  let app;
  beforeEach(async () => {
    // Ensure DEMO_MODE is off so tests exercise the non-demo path
    delete process.env.TIKTOK_DEMO_MODE;
    delete process.env.FIREBASE_ADMIN_BYPASS;

    // Clear any existing test data for user123 so tests start clean
    try {
      await firebaseAdmin.db.collection("users").doc("user123").delete();
    } catch (e) {
      // ignore if delete not supported by stub
    }

    // Load the router after ensuring db is in a clean state
    delete require.cache[require.resolve("../../routes/tiktokRoutes")];
    const router = require("../../routes/tiktokRoutes");
    app = express();
    app.use(bodyParser.json());
    app.use("/", router);
  });

  test("returns connected=false and creator null when not connected", async () => {
    const res = await request(app)
      .get("/creator_info")
      .set("Authorization", "Bearer test-token-for-user123")
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.connected).toBe(false);
    expect(res.body.creator).toBeNull();
  });

  test("returns demo info when DEMO_MODE=true", async () => {
    process.env.TIKTOK_DEMO_MODE = "true";
    const res = await request(app)
      .get("/creator_info")
      .set("Authorization", "Bearer test-token-for-user123")
      .expect(200);
    delete process.env.TIKTOK_DEMO_MODE;

    expect(res.body.ok).toBe(true);
    expect(res.body.demo).toBe(true);
    expect(res.body.creator).toBeDefined();
    expect(res.body.creator.max_video_post_duration_sec).toBeDefined();
  });

  test("returns connected true and creator null when connection exists but no access token", async () => {
    // Create a fake db stub and patch the module cache so the route picks it up
    // Provide a simple stub: top-level user doc contains the connection (open_id + access_token null)
    firebaseAdmin.db.collection = _name => ({
      doc: _id => ({
        get: async () => ({ exists: true, data: () => ({ open_id: "x", access_token: null }) }),
      }),
    });

    // Mock the firebaseAdmin module before loading the router so the route uses the fake db at runtime
    jest.resetModules();
    jest.doMock("../../firebaseAdmin", () => ({
      admin: { firestore: { FieldValue: { serverTimestamp: () => Date.now() } } },
      db: {
        collection: _name => ({
          doc: _id => ({
            collection: _sub => ({
              doc: _id2 => ({
                get: async () => ({
                  exists: true,
                  data: () => ({ open_id: "x", access_token: null }),
                }),
              }),
            }),
            get: async () => ({ exists: false, data: () => ({}) }),
            set: async () => true,
          }),
          add: async () => ({ id: "stub" }),
        }),
      },
      auth: () => ({ verifyIdToken: async () => ({ uid: "user123" }) }),
      storage: {},
    }));

    // Load router after mocking
    const router = require("../../routes/tiktokRoutes");
    app = express();
    app.use(bodyParser.json());
    app.use("/", router);

    // Call the real route and assert the behavior is an object indicating connected but no creator
    const res = await request(app)
      .get("/creator_info")
      .set("Authorization", "Bearer test-token-for-user123")
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.connected).toBe(true);
    expect(res.body.creator).toBeNull();
    // No debug payload in final route; ensure normal behavior asserted above
  });
});
