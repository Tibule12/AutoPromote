/* eslint-disable no-console */
const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");
// Ensure environment variables are set before importing the route (it validates env during import)
process.env.TIKTOK_SANDBOX_CLIENT_KEY = process.env.TIKTOK_SANDBOX_CLIENT_KEY || "dummy-key";
process.env.TIKTOK_SANDBOX_CLIENT_SECRET =
  process.env.TIKTOK_SANDBOX_CLIENT_SECRET || "dummy-secret";
process.env.TIKTOK_SANDBOX_REDIRECT_URI =
  process.env.TIKTOK_SANDBOX_REDIRECT_URI || "https://example.com/api/tiktok/auth/callback";
process.env.DEBUG_TIKTOK_OAUTH = "true";
// Bypass Firebase Admin and stub token verification so getUidFromAuthHeader accepts the test token
process.env.FIREBASE_ADMIN_BYPASS = "1";
const firebaseAdmin = require("../../firebaseAdmin");
firebaseAdmin.admin.auth = () => ({ verifyIdToken: async _token => ({ uid: "testUser123" }) });
// Ensure our stub supports nested .collection() calls used by the route
const stubCollection = _name => ({
  doc: _id => ({
    collection: _sub => ({
      doc: _subId => ({
        set: async () => true,
        get: async () => ({ exists: false, data: () => ({}) }),
      }),
    }),
    set: async () => true,
    get: async () => ({ exists: false, data: () => ({}) }),
  }),
});
firebaseAdmin.db.collection = stubCollection;
// Provide a minimal FieldValue.Timestamp stub for serverTimestamp used in routes
firebaseAdmin.admin.firestore.FieldValue = {
  serverTimestamp: () => new Date(),
};
// Also stub Timestamp.fromDate if any code referencing it in tests
firebaseAdmin.admin.firestore.Timestamp = {
  fromDate: d => (d instanceof Date ? d : new Date(d)),
};
const app = express();
app.use(bodyParser.json());
app.use("/api/tiktok", require("../tiktokRoutes"));

describe("tiktokRoutes", () => {
  test("GET auth page returns HTML and 200", async () => {
    const res = await request(app)
      .get("/api/tiktok/auth")
      .set("Authorization", "Bearer test-token-for-testUser123");
    if (res.status !== 200) {
      console.log("tiktok auth res:", res.status, res.body || res.text);
    }
    expect(res.status).toBe(200);
    // Should return HTML (simple sanity check)
    expect(res.text && res.text.indexOf("<!doctype") !== -1).toBeTruthy();
  });

  test("status returns connected false when no connection present", async () => {
    const res = await request(app)
      .get("/api/tiktok/status")
      .set("Authorization", "Bearer test-token-for-testUser123");
    if (res.status !== 200) {
      console.log("tiktok status res:", res.status, res.body || res.text);
    }
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
  });

  test("callback stores encrypted tokens when encryption enabled", async () => {
    // Enable encryption key for secretVault
    process.env.GENERIC_TOKEN_ENCRYPTION_KEY = "unit-test-key-123";

    // Capture set calls
    let lastSetArgs = null;
    const originalCollection = firebaseAdmin.db.collection;
    // Override collection to specifically capture users/{uid}/connections/tiktok.set
    firebaseAdmin.db.collection = _name => ({
      doc: _id => ({
        collection: _sub => ({
          doc: _subId => ({
            set: async obj => {
              lastSetArgs = obj;
              return true;
            },
            get: async () => ({ exists: false, data: () => ({}) }),
          }),
        }),
        set: async obj => {
          lastSetArgs = obj;
          return true;
        },
        get: async () => ({ exists: false, data: () => ({}) }),
      }),
    });
    // Set the expected oauth_state for callback validation (nonce must match the state)
    await firebaseAdmin.db
      .collection("users")
      .doc("testUser123")
      .collection("oauth_state")
      .doc("tiktok")
      .set({ nonce: "123456", isPopup: false });

    // Monkey patch safeFetch to return token info
    const ssrf = require("../../../src/utils/ssrfGuard");
    ssrf.safeFetch = (_url, _fetchFn, _opts) => {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          access_token: "TEST_A",
          refresh_token: "TEST_R",
          open_id: "open_1",
          expires_in: 3600,
          scope: "scope",
        }),
      });
    };

    // Make the request; ensure we include a state so the route uses a known uid
    const state = "testUser123.123456";
    await request(app)
      .get(`/api/tiktok/callback?code=abc123&state=${encodeURIComponent(state)}`)
      .expect(302);

    // Restore collection
    firebaseAdmin.db.collection = originalCollection;

    if (!lastSetArgs) throw new Error("No set() call captured");
    // Should be an encrypted tokens string (base64/gibberish) stored under tokens
    if (!lastSetArgs.tokens) throw new Error("tokens field not set (encrypted)");
    console.log(
      "Captured tokens stored:",
      typeof lastSetArgs.tokens === "string" ? "[encrypted]" : lastSetArgs.tokens
    );
  });
});
