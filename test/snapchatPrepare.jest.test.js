const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");

describe("snapchat prepare endpoint", () => {
  let app;
  beforeAll(() => {
    process.env.FIREBASE_ADMIN_BYPASS = "1";
    process.env.SNAPCHAT_PUBLIC_CLIENT_ID = "test_public_id";
    process.env.SNAPCHAT_CONFIDENTIAL_CLIENT_ID = "test_conf_id";
    process.env.SNAPCHAT_CLIENT_SECRET = "test_secret";
    process.env.CANONICAL_HOST = "www.autopromote.org";
    const router = require("../src/snapchatRoutes");
    app = express();
    app.use(bodyParser.json());
    app.use("/", router);
  });

  test("authenticated prepare accepts test_scope alias and returns scopeList with source=request", async () => {
    const res = await request(app)
      .post("/oauth/prepare")
      .set("Authorization", "Bearer test-token-for-testuser")
      .send({ test_scope: "display_name", popup: false });
    // Log for debugging
    // eslint-disable-next-line no-console
    console.error(
      "prepare res status",
      res.status,
      "body",
      res.body,
      "text",
      res.text,
      "headers",
      res.headers
    );
    expect(res.status).toBe(200);

    expect(res.body.scope).toBeDefined();
    expect(Array.isArray(res.body.scopeList)).toBe(true);
    expect(res.body.scopeList[0]).toMatch(/user.display_name/);
    expect(res.body.scopeSource).toBe("request");
    expect(res.body.state).toBeDefined();
    expect(res.body.authUrl).toBeDefined();
  });
});
