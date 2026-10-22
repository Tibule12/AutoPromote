const express = require("express"),
  request = require("supertest");
describe("account upload allowance authorization", () => {
  let app, db;
  beforeEach(async () => {
    jest.resetModules();
    db = require("../src/firebaseAdmin").db;
    // This repository's src Firebase unit stub has no transaction adapter.
    db.runTransaction = async run => {
      const writes = [];
      const result = await run({ get: ref => ref.get(), set: (...args) => writes.push(args) });
      for (const [ref, data, options] of writes) await ref.set(data, options);
      return result;
    };
    await db.collection("users").doc("allowance-admin").set({ role: "admin", isAdmin: true });
    await db.collection("users").doc("allowance-owner").set({ role: "user" });
    app = express();
    app.use(express.json());
    app.use("/api/admin", require("../src/adminRoutes"));
  });
  test("a normal account cannot grant itself more uploads", async () => {
    const response = await request(app)
      .put("/api/admin/users/allowance-owner/upload-allowance")
      .set("Authorization", "Bearer test-token-for-allowance-owner")
      .send({ monthlyLimit: 150, reason: "Four daily releases" });
    expect(response.status).toBe(403);
    expect(
      (await db.collection("user_billing").doc("allowance-owner").get()).data()?.uploadAllowance
    ).toBeUndefined();
  });
  test("an authenticated administrator can set the allowance without upgrading the owner", async () => {
    const response = await request(app)
      .put("/api/admin/users/allowance-owner/upload-allowance")
      .set("Authorization", "Bearer test-token-for-allowance-admin")
      .send({ monthlyLimit: 150, reason: "Four daily releases" });
    expect(response.status).toBe(200);
    expect(
      (await db.collection("user_billing").doc("allowance-owner").get()).data().uploadAllowance
        .monthlyLimit
    ).toBe(150);
    expect(
      (await db.collection("users").doc("allowance-owner").get()).data().subscriptionTier
    ).toBeUndefined();
  });
});
