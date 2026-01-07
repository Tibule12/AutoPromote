/* eslint-disable no-undef */
// Reworked tests: mock firebaseAdmin and authMiddleware before requiring routes
const request = require("supertest");
const express = require("express");

const uid = "test-kyc-user";

// (Removed local in-memory helper) The test uses the mocked `db` exported
// by the `jest.mock` below which stores data on `global.__AUTOPROMOTE_TEST_DB`.

// Ensure a global store is available for the mock (shared between mock and tests)
global.__AUTOPROMOTE_TEST_DB = global.__AUTOPROMOTE_TEST_DB || new Map();

// Mock firebaseAdmin to export admin/db/auth/storage before requiring routes
jest.mock("../../firebaseAdmin", () => {
  const store = global.__AUTOPROMOTE_TEST_DB;
  function docRef(path) {
    return {
      path,
      id: path.split("/").pop(),
      async set(data, opt) {
        if (opt && opt.merge) {
          const existing = store.get(path) || { data: {} };
          existing.data = { ...(existing.data || {}), ...(data || {}) };
          store.set(path, existing);
        } else {
          store.set(path, { data: data || {} });
        }
        return true;
      },
      async get() {
        const v = store.get(path);
        if (v) return { exists: true, data: () => v.data };
        return { exists: false, data: () => ({}) };
      },
      async update(data) {
        const existing = store.get(path) || { data: {} };
        existing.data = { ...(existing.data || {}), ...(data || {}) };
        store.set(path, existing);
        return true;
      },
      async delete() {
        store.delete(path);
        return true;
      },
      collection(sub) {
        return collectionStub(`${path}/${sub}`);
      },
    };
  }
  function collectionStub(name) {
    return {
      doc(id) {
        const p = `${name}/${id}`;
        return docRef(p);
      },
      async add(data) {
        const id = "stub-" + Math.random().toString(36).slice(2, 9);
        const p = `${name}/${id}`;
        store.set(p, { data: data || {} });
        return { id, get: async () => ({ exists: true, data: () => data || {} }) };
      },
      where() {
        return { get: async () => ({ empty: true, docs: [], size: 0 }) };
      },
      orderBy() {
        return { get: async () => ({ empty: true, docs: [], size: 0 }) };
      },
      async get() {
        return { empty: true, docs: [], size: 0 };
      },
    };
  }

  const admin = {
    firestore: {
      Timestamp: { fromDate: d => d },
      FieldValue: { serverTimestamp: () => new Date() },
    },
  };
  const db = { collection: name => collectionStub(name) };
  const auth = { verifyIdToken: async () => ({ uid: "stub-uid" }) };
  const storage = {};
  return { admin, db, auth, storage };
});

// Mock authMiddleware to just attach a test user id and skip real verification
jest.mock("../../authMiddleware", () => {
  return (req, res, next) => {
    req.userId = req.headers["x-test-user"] || uid;
    req.user = { uid: req.userId, email: `${req.userId}@example.com` };
    next();
  };
});

// Now require the routes under test (they'll pick up the mocked firebaseAdmin)
const userRoutes = require("../../userRoutes");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/users", userRoutes);
  return app;
}

describe("KYC endpoints (mocked firebaseAdmin)", () => {
  const { db } = require("../../firebaseAdmin");
  beforeAll(async () => {
    // create test user using the mocked db
    await db.collection("users").doc(uid).set({ email: "kyc@example.com", name: "KYC User" });
  });

  afterAll(async () => {
    try {
      const { db } = require("../../firebaseAdmin");
      await db.collection("users").doc(uid).delete();
    } catch (e) {}
  });

  test("POST /api/users/me/kyc/start returns attestationToken", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/users/me/kyc/start").set("x-test-user", uid).send();
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("attestationToken");
    expect(typeof res.body.attestationToken).toBe("string");
  });

  test("POST /api/users/me/kyc/attest fallback accepts synthetic token", async () => {
    const app = makeApp();
    const token = "attest_manual_" + Math.random().toString(36).slice(2, 12);
    const res = await request(app)
      .post("/api/users/me/kyc/attest")
      .set("x-test-user", uid)
      .send({ attestationToken: token });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.flags && res.body.user.flags.afterDarkAccess).toBe(true);
  });

  test("POST /api/users/me/kyc/provider/callback with persisted token grants access", async () => {
    const app = makeApp();
    const token = "provtoken_" + Math.random().toString(36).slice(2, 12);
    const { db } = require("../../firebaseAdmin");
    await db
      .collection("kyc_tokens")
      .doc(token)
      .set({ userId: uid, provider: "persona", used: false, createdAt: new Date() });
    const res = await request(app)
      .post("/api/users/me/kyc/provider/callback")
      .set("x-test-user", uid)
      .send({ attestationToken: token, providerSessionId: "sess-1", providerPayload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.flags && res.body.user.flags.afterDarkAccess).toBe(true);
  });
});
