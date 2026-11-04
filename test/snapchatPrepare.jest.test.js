const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");

// Scope normalization is local logic; a live provider probe is a separate integration.
jest.mock("../src/utils/ssrfGuard", () => ({
  safeFetch: jest.fn(async () => ({
    status: 302,
    headers: { get: () => null },
    text: async () => "",
  })),
}));

describe("snapchat prepare endpoint", () => {
  jest.setTimeout(10000);
  let app;
  let restoreCollection;
  beforeAll(() => {
    process.env.FIREBASE_ADMIN_BYPASS = "1";
    process.env.SNAPCHAT_PUBLIC_CLIENT_ID = "test_public_id";
    process.env.SNAPCHAT_CONFIDENTIAL_CLIENT_ID = "test_conf_id";
    process.env.SNAPCHAT_CLIENT_SECRET = "test_secret";
    process.env.CANONICAL_HOST = "www.autopromote.org";
    // This legacy unit suite uses the in-memory Admin shim. Real atomic state
    // persistence/replay tests run in test:snapchat:oauth's owned emulator.
    const { db } = require("../src/firebaseAdmin");
    const originalCollection = db.collection.bind(db);
    restoreCollection = jest.spyOn(db, "collection").mockImplementation(name => {
      const collection = originalCollection(name);
      if (name !== "oauth_states") return collection;
      return { doc: state => ({ create: data => collection.doc(state).set(data) }) };
    });
    const router = require("../src/snapchatRoutes");
    app = express();
    app.use(bodyParser.json());
    app.use("/", router);
  });
  afterAll(() => restoreCollection.mockRestore());

  test("authenticated prepare accepts test_scope alias and returns scopeList with source=request", async () => {
    const res = await request(app)
      .post("/oauth/prepare")
      .set("Authorization", "Bearer test-token-for-testuser")
      .send({ test_scope: "display_name", popup: false });
    expect(res.status).toBe(200);

    expect(res.body.scope).toBeDefined();
    expect(Array.isArray(res.body.scopeList)).toBe(true);
    expect(res.body.scopeList[0]).toMatch(/user.display_name/);
    expect(res.body.scopeSource).toBe("request");
    expect(res.body.state).toBeDefined();
    expect(res.body.authUrl).toBeDefined();
    expect(new URL(res.body.authUrl).searchParams.get("code_challenge_method")).toBe("S256");
    expect(res.body.codeVerifier).toBeUndefined();
  });
});
