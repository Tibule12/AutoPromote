/* eslint-disable no-undef */
const request = require("supertest");
const express = require("express");
const { db } = require("../../firebaseAdmin");

// Mount adminRoutes behind a simple auth stub that sets req.user as admin
const adminRoutes = require("../../adminRoutes");

function makeApp(user) {
  const app = express();
  app.use(express.json());
  // simple auth middleware stub
  app.use((req, res, next) => {
    req.user = user || null;
    req.userId = user && user.uid;
    next();
  });
  app.use("/api/admin", adminRoutes);
  return app;
}

describe("Admin KYC endpoints", () => {
  beforeAll(async () => {
    // ensure test user exists
    await db.collection("users").doc("test-user-1").set({ email: "u1@example.com", name: "U1" });
  });

  afterAll(async () => {
    try {
      await db.collection("users").doc("test-user-1").delete();
    } catch (e) {}
  });

  test("GET /api/admin/users returns list for admin", async () => {
    const app = makeApp({ uid: "admin-1", role: "admin" });
    const res = await request(app).get("/api/admin/users");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("users");
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  test("PUT /api/admin/users/:id/kyc sets kycVerified for admin", async () => {
    const app = makeApp({ uid: "admin-1", role: "admin" });
    const res = await request(app)
      .put("/api/admin/users/test-user-1/kyc")
      .send({ kycVerified: true });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.kycVerified).toBe(true);

    // cleanup: unset
    await db.collection("users").doc("test-user-1").update({ kycVerified: false });
  });

  test("PUT /api/admin/users/:id/kyc denied for non-admin", async () => {
    const app = makeApp({ uid: "user-2", role: "user" });
    const res = await request(app)
      .put("/api/admin/users/test-user-1/kyc")
      .send({ kycVerified: true });
    expect(res.statusCode).toBe(403);
  });
});
