/* eslint-disable no-undef */
const request = require("supertest");
const express = require("express");

// Provide a global store for the mock
global.__AUTOPROMOTE_TEST_DB = global.__AUTOPROMOTE_TEST_DB || new Map();

// Mock firebaseAdmin with a small collection store and where scanning
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
      where(firstField, op, val) {
        // support chained where by returning a query-like object
        const filters = [{ field: firstField, val }];
        function queryBuilder(filtersSoFar) {
          return {
            where(field, _op, _val) {
              return queryBuilder([...filtersSoFar, { field, val: _val }]);
            },
            async get() {
              const docs = [];
              for (const [k, v] of store.entries()) {
                if (!k.startsWith(name + "/")) continue;
                const d = v.data || {};
                let ok = true;
                for (const f of filtersSoFar) {
                  if (d[f.field] !== f.val) {
                    ok = false;
                    break;
                  }
                }
                if (ok) docs.push({ id: k.split("/").pop(), data: () => d, exists: true });
              }
              return { empty: docs.length === 0, docs, size: docs.length };
            },
          };
        }
        return queryBuilder(filters);
      },
      orderBy() {
        return { get: async () => ({ empty: true, docs: [], size: 0 }) };
      },
      async get() {
        // list all under this collection prefix
        const docs = [];
        for (const [k, v] of store.entries()) {
          if (!k.startsWith(name + "/")) continue;
          docs.push({ id: k.split("/").pop(), data: () => v.data || {} });
        }
        return { empty: docs.length === 0, docs, size: docs.length };
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

// Mock authMiddleware to attach test user
jest.mock("../../authMiddleware", () => {
  return (req, res, next) => {
    req.userId = req.headers["x-test-user"] || "streamer-1";
    req.user = { uid: req.userId };
    next();
  };
});

const liveRoutes = require("../liveRoutes");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/live", liveRoutes);
  return app;
}

describe("Live routes", () => {
  test("create -> redeem -> validate -> list -> revoke flow", async () => {
    const app = makeApp();
    // Create token
    const createRes = await request(app)
      .post("/api/live/my-live/create-token")
      .set("x-test-user", "streamer-1")
      .send({ maxUses: 0 });
    expect(createRes.statusCode).toBe(200);
    expect(createRes.body).toHaveProperty("token");
    const token = createRes.body.token;

    // Redeem token (viewer confirms age)
    const redeemRes = await request(app)
      .post("/api/live/redeem")
      .send({ token, ageConfirmed: true });
    expect(redeemRes.statusCode).toBe(200);

    // Validate token (expect playbackUrl when CDN_SIGNING_SECRET set)
    process.env.CDN_SIGNING_SECRET = "test-secret";
    const validateRes = await request(app).get("/api/live/validate").query({ token });
    expect(validateRes.statusCode).toBe(200);
    expect(validateRes.body.valid).toBe(true);
    expect(validateRes.body.playbackUrl).toBeTruthy();

    // List tokens as streamer
    const listRes = await request(app)
      .get("/api/live/my-live/tokens")
      .set("x-test-user", "streamer-1")
      .send();
    expect(listRes.statusCode).toBe(200);
    expect(Array.isArray(listRes.body.tokens)).toBe(true);
    expect(listRes.body.tokens.length).toBeGreaterThan(0);

    // Revoke token
    const revokeRes = await request(app)
      .post(`/api/live/${encodeURIComponent(token)}/revoke`)
      .set("x-test-user", "streamer-1")
      .send();
    expect(revokeRes.statusCode).toBe(200);

    // Validate after revoke should fail
    const validateAfter = await request(app).get("/api/live/validate").query({ token });
    expect(validateAfter.statusCode).toBe(400);
    expect(validateAfter.body.valid).toBe(false);
  });
});
