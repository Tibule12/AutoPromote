const express = require("express");
const request = require("supertest");

describe("snapchat preflight endpoint", () => {
  let app;
  beforeAll(() => {
    process.env.SNAPCHAT_PUBLIC_CLIENT_ID = "test_public_id";
    process.env.SNAPCHAT_CONFIDENTIAL_CLIENT_ID = "test_conf_id";
    // Ensure redirect canonicalization uses default
    process.env.CANONICAL_HOST = "www.autopromote.org";
    const router = require("../src/snapchatRoutes");
    app = express();
    app.use("/", router);
  });

  test("returns scopeList and canonical display_name URL for alias", async () => {
    const res = await request(app)
      .get("/oauth/preflight")
      .query({ test_scope: "display_name" })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.scope).toBeDefined();
    expect(Array.isArray(res.body.scopeList)).toBe(true);
    expect(res.body.scopeList.length).toBeGreaterThanOrEqual(1);
    expect(res.body.scopeList[0]).toMatch(/user.display_name/);
  });

  test("accepts full scope URL and returns same in scopeList", async () => {
    const input = "https://auth.snapchat.com/oauth2/api/user.display_name";
    const res = await request(app).get("/oauth/preflight").query({ test_scope: input }).expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.scopeList[0]).toBe(input);
  });
});
