const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const oauth = require("../../src/services/snapchatOAuth");
const projectId = "demo-autopromote-snapchat";
if (
  process.env.SNAPCHAT_TEST_PROJECT !== projectId ||
  !/^127\.0\.0\.1:[0-9]+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") ||
  require("../../src/utils/authAuthority").isHostedRuntime()
) {
  throw new Error("Own local Snapchat test emulator required");
}
const cfg = {
  publicClientId: "public-fixture",
  confidentialClientId: "different-confidential-fixture",
  secret: "fixture-only-secret",
  redirect: "https://api.autopromote.org/api/snapchat/auth/callback",
};
let db,
  app,
  request,
  providerCalls = [],
  rejectToken = false,
  rejectProfile = false;
const cache = (relative, exports) => {
  const file = require.resolve(path.resolve(__dirname, "../..", relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
const challenge = verifier => crypto.createHash("sha256").update(verifier).digest("base64url");
before(() => {
  const { Firestore } = require("firebase-admin/firestore");
  db = new Firestore({ projectId, host: process.env.FIRESTORE_EMULATOR_HOST, ssl: false });
  process.env.SNAPCHAT_PUBLIC_CLIENT_ID = cfg.publicClientId;
  process.env.SNAPCHAT_CONFIDENTIAL_CLIENT_ID = cfg.confidentialClientId;
  process.env.SNAPCHAT_CLIENT_SECRET = cfg.secret;
  process.env.SNAPCHAT_REDIRECT_URI = cfg.redirect;
  process.env.SNAPCHAT_DEFAULT_SCOPE = "display_name";
  process.env.DASHBOARD_URL = "https://www.autopromote.org/";
  process.env.GENERIC_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  cache("src/firebaseAdmin.js", { db, admin: {} });
  // Auth cryptography is exercised by the separate real Auth/App browser run.
  cache("src/authMiddleware.js", (req, res, next) => {
    if (req.headers.authorization !== "Bearer verified-fixture") return res.sendStatus(401);
    req.userId = "snapchat-owner";
    next();
  });
  cache("src/utils/ssrfGuard.js", {
    safeFetch: async (url, _fetch, options) => {
      providerCalls.push({ url, options });
      const isToken = url.startsWith("https://accounts.snapchat.com/");
      const rejected = isToken ? rejectToken : rejectProfile;
      return {
        ok: !rejected,
        status: rejected ? 400 : 200,
        json: async () =>
          rejected
            ? { error: "fixture_provider_error" }
            : isToken
              ? {
                  access_token: "private-fixture-access",
                  refresh_token: "private-fixture-refresh",
                  expires_in: 3600,
                }
              : url.startsWith("https://kit.snapchat.com/")
                ? { data: { me: { displayName: "Fixture Snapchat Identity" } } }
                : { me: { id: "marketing-fixture" } },
      };
    },
  });
  const express = require("express");
  app = express();
  app.use(express.json());
  app.use(require("../../src/snapchatRoutes"));
  request = require("supertest");
});
after(async () => {
  await db?.terminate();
});

test("public Login Kit sends S256 and exchanges with the same client, without another client's secret", () => {
  const { authUrl, request: saved } = oauth.createRequest(cfg, "display_name");
  const url = new URL(authUrl);
  assert.equal(url.pathname, "/accounts/oauth2/auth");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), challenge(saved.codeVerifier));
  assert.equal(saved.codeVerifier.length, 43);
  assert.equal(url.searchParams.has("code_verifier"), false);
  const token = oauth.tokenRequest(cfg, saved, "fixture-code");
  assert.equal(token.endpoint, "https://accounts.snapchat.com/accounts/oauth2/token");
  assert.equal(token.body.get("client_id"), url.searchParams.get("client_id"));
  assert.equal(token.body.get("code_verifier"), saved.codeVerifier);
  assert.equal(token.body.has("client_secret"), false);
});
test("independent requests have different state and verifier and expire after ten minutes", () => {
  const a = oauth.createRequest(cfg, "display_name", 10),
    b = oauth.createRequest(cfg, "display_name", 10);
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.request.codeVerifier, b.request.codeVerifier);
  assert.equal(a.request.expiresAt - a.request.createdAt, 600000);
});
test("Marketing uses its confidential client consistently and the documented literal scope", () => {
  const result = oauth.createRequest(cfg, "https://auth.snapchat.com/oauth2/api/marketing-api");
  const url = new URL(result.authUrl),
    token = oauth.tokenRequest(cfg, result.request, "fixture-code");
  assert.equal(url.pathname, "/login/oauth2/authorize");
  assert.equal(url.searchParams.get("scope"), "snapchat-marketing-api");
  assert.equal(url.searchParams.get("client_id"), cfg.confidentialClientId);
  assert.equal(token.body.get("client_id"), cfg.confidentialClientId);
  assert.equal(token.body.get("client_secret"), cfg.secret);
  assert.equal(token.endpoint, "https://accounts.snapchat.com/login/oauth2/access_token");
});
test("confidential Login Kit fallback retains the same client and its secret", () => {
  const config = { ...cfg, publicClientId: null };
  const result = oauth.createRequest(config, "display_name");
  const token = oauth.tokenRequest(config, result.request, "fixture-code");
  assert.equal(new URL(result.authUrl).searchParams.get("client_id"), cfg.confidentialClientId);
  assert.equal(token.body.get("client_secret"), cfg.secret);
});
test("mixed products, unknown scopes, missing clients and insecure redirects fail closed", () => {
  for (const scope of ["unknown", "display_name snapchat-marketing-api"])
    assert.throws(() => oauth.createRequest(cfg, scope));
  for (const config of [
    { ...cfg, publicClientId: null, confidentialClientId: null },
    { ...cfg, publicClientId: null, secret: null },
    { ...cfg, redirect: "http://example.test/callback" },
  ])
    assert.throws(() => oauth.createRequest(config, "display_name"));
});
test("client or redirect configuration changes cannot exchange an in-flight request", () => {
  const saved = oauth.createRequest(cfg, "display_name").request;
  assert.throws(() => oauth.tokenRequest({ ...cfg, publicClientId: "changed" }, saved, "code"));
  assert.throws(() =>
    oauth.tokenRequest({ ...cfg, redirect: "https://example.test" }, saved, "code")
  );
});
test("Login Kit profile queries request only the consented fields and never the Ads API", () => {
  const saved = oauth.createRequest(cfg, "display_name").request;
  const profile = new URL(oauth.profileRequest(saved, "token").url);
  assert.equal(profile.hostname, "kit.snapchat.com");
  assert.equal(profile.searchParams.get("query"), "{me { displayName }}");
});
async function prepare(scope = "display_name", popup = false) {
  const response = await request(app)
    .post("/oauth/prepare")
    .set("Authorization", "Bearer verified-fixture")
    .send({ test_scope: scope, popup });
  assert.equal(response.status, 200);
  return response.body;
}
test("unauthenticated preparation cannot persist a connection request", async () => {
  const before = (await db.collection("oauth_states").get()).size;
  assert.equal((await request(app).post("/oauth/prepare").send({})).status, 401);
  assert.equal((await db.collection("oauth_states").get()).size, before);
});
test("public diagnostic URL has PKCE but no persisted state or private verifier", async () => {
  const response = await request(app).get("/oauth/preflight");
  assert.equal(response.status, 200);
  const url = new URL(response.body.authUrl);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(response.body.requiresAuthenticatedPrepare, true);
  assert.equal(
    (await db.collection("oauth_states").doc(url.searchParams.get("state")).get()).exists,
    false
  );
  assert.equal(JSON.stringify(response.body).includes("codeVerifier"), false);
});
test("prepare, callback, encrypted owned connection and status complete with a verified provider boundary fixture", async () => {
  providerCalls = [];
  const response = await prepare();
  const saved = (await db.collection("oauth_states").doc(response.state).get()).data();
  const cacheKey = "platform_connections_status_snapchat-owner";
  const { setCache, getCache } = require("../../src/utils/simpleCache");
  setCache(cacheKey, { raw: { snapchat: { connected: false } } });
  assert.equal(saved.uid, "snapchat-owner");
  assert.equal(JSON.stringify(response).includes(saved.codeVerifier), false);
  const completed = await request(app)
    .post("/auth/callback")
    .send({ state: response.state, code: "fixture-code" });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.oauthProduct, "login_kit");
  assert.equal(getCache(cacheKey), null);
  assert.equal(providerCalls.length, 2);
  const body = providerCalls[0].options.fetchOptions.body;
  assert.equal(body.get("client_id"), cfg.publicClientId);
  assert.equal(
    challenge(body.get("code_verifier")),
    new URL(response.authUrl).searchParams.get("code_challenge")
  );
  assert.equal(providerCalls[0].options.fetchOptions.redirect, "error");
  assert.equal(new URL(providerCalls[1].url).hostname, "kit.snapchat.com");
  const connection = (await db.doc("users/snapchat-owner/connections/snapchat").get()).data();
  assert.equal(connection.oauthProduct, "login_kit");
  assert.equal(connection.capabilities.publishing, false);
  assert.equal(connection.tokens.includes("private-fixture-access"), false);
  const { decryptToken } = require("../../src/services/secretVault");
  assert.equal(JSON.parse(decryptToken(connection.tokens)).access_token, "private-fixture-access");
  assert.equal((await db.doc("users/anonymous/connections/snapchat").get()).exists, false);
  assert.equal((await db.collection("oauth_states").doc(response.state).get()).exists, false);
  const status = await request(app).get("/status").set("Authorization", "Bearer verified-fixture");
  assert.equal(status.body.identityOnly, true);
  assert.equal(JSON.stringify(status.body).includes("private-fixture"), false);
});
test("a callback replay cannot exchange a code or overwrite the existing connection", async () => {
  const response = await prepare();
  await request(app).post("/auth/callback").send({ state: response.state, code: "code" });
  providerCalls = [];
  const before = (await db.doc("users/snapchat-owner/connections/snapchat").get()).updateTime;
  const replay = await request(app)
    .post("/auth/callback")
    .send({ state: response.state, code: "code" });
  assert.equal(replay.status, 400);
  assert.equal(providerCalls.length, 0);
  assert.equal(
    (await db.doc("users/snapchat-owner/connections/snapchat").get()).updateTime.isEqual(before),
    true
  );
});
test("concurrent callback consumers commit exactly one state consumption in real Firestore", async () => {
  const result = oauth.createRequest(cfg, "display_name");
  await db
    .collection("oauth_states")
    .doc(result.state)
    .create({ ...result.request, uid: "snapchat-owner" });
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => oauth.consumeRequest(db, result.state))
  );
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
});
for (const [name, change] of Object.entries({
  expired: { expiresAt: 1 },
  anonymous: { uid: "anonymous" },
  unowned: { uid: null },
  wrongPlatform: { platform: "twitter" },
  legacy: { version: 1 },
  invalidVerifier: { codeVerifier: "short" },
})) {
  test(`${name} state cannot reach a token exchange`, async () => {
    const response = await prepare();
    await db.collection("oauth_states").doc(response.state).update(change);
    providerCalls = [];
    const result = await request(app)
      .post("/auth/callback")
      .send({ state: response.state, code: "code" });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, "invalid_oauth_state");
    assert.equal(providerCalls.length, 0);
  });
}
test("missing state and authorization denial cannot exchange tokens", async () => {
  providerCalls = [];
  assert.equal((await request(app).post("/auth/callback").send({ code: "code" })).status, 400);
  const response = await prepare();
  const denied = await request(app)
    .post("/auth/callback")
    .send({ state: response.state, error: "access_denied" });
  assert.equal(denied.status, 400);
  assert.equal(providerCalls.length, 0);
});
for (const kind of ["token", "profile"]) {
  test(`${kind} rejection preserves the last connection`, async () => {
    const before = (await db.doc("users/snapchat-owner/connections/snapchat").get()).updateTime;
    const response = await prepare();
    rejectToken = kind === "token";
    rejectProfile = kind === "profile";
    try {
      const result = await request(app)
        .post("/auth/callback")
        .send({ state: response.state, code: "code" });
      assert.equal(result.status, 400);
      assert.equal(JSON.stringify(result.body).includes("fixture_provider_error"), false);
      assert.equal(
        (await db.doc("users/snapchat-owner/connections/snapchat").get()).updateTime.isEqual(
          before
        ),
        true
      );
    } finally {
      rejectToken = false;
      rejectProfile = false;
    }
  });
}
test("identity-only connections cannot send tokens to Marketing endpoints", async () => {
  providerCalls = [];
  const headers = { Authorization: "Bearer verified-fixture" };
  assert.equal(
    (await request(app).post("/creative").set(headers).send({ title: "fixture" })).status,
    403
  );
  assert.equal((await request(app).get("/analytics/fixture").set(headers)).status, 403);
  const metadata = await request(app).get("/metadata").set(headers);
  assert.equal(metadata.body.meta.publishingReady, false);
  assert.equal(providerCalls.length, 0);
});
test("popup callback targets the canonical frontend origin and returns no credentials", async () => {
  const response = await prepare("display_name", true);
  const popup = await request(app)
    .get("/auth/callback")
    .query({ state: response.state, code: "fixture-code" });
  assert.equal(popup.status, 200);
  assert.match(popup.text, /postMessage\('snapchat_oauth_complete', "https:\/\/autopromote.org"\)/);
  const nonce = popup.text.match(/<script nonce="([^"]+)"/)[1];
  assert.ok(popup.headers["content-security-policy"].includes(`'nonce-${nonce}'`));
  assert.equal(popup.headers["cache-control"], "no-store");
  assert.equal(popup.text.includes("private-fixture"), false);
});
test("normal callback uses the existing dashboard success query contract", async () => {
  const response = await prepare();
  const callback = await request(app)
    .get("/auth/callback")
    .query({ state: response.state, code: "fixture-code" });
  const target = new URL(callback.headers.location);
  assert.equal(target.origin, "https://autopromote.org");
  assert.equal(target.searchParams.get("oauth"), "snapchat");
  assert.equal(target.searchParams.get("status"), "success");
});
test("Marketing callbacks still use the Ads profile endpoint with their own client", async () => {
  providerCalls = [];
  const response = await prepare("snapchat-marketing-api");
  const callback = await request(app)
    .post("/auth/callback")
    .send({ state: response.state, code: "fixture-code" });
  assert.equal(callback.status, 200);
  assert.equal(
    providerCalls[0].options.fetchOptions.body.get("client_id"),
    cfg.confidentialClientId
  );
  assert.equal(new URL(providerCalls[1].url).hostname, "adsapi.snapchat.com");
});
test("the publishing service rejects identity-only credentials before any provider request", async () => {
  const ref = db.doc("users/snapchat-owner/connections/snapchat");
  const previous = (await ref.get()).data();
  await ref.update({ oauthProduct: "login_kit" });
  const names = ["NODE_ENV", "CI_ROUTE_IMPORTS", "FIREBASE_ADMIN_BYPASS", "JEST_WORKER_ID"];
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.NODE_ENV = "development";
    providerCalls = [];
    const result = await require("../../src/services/snapchatService").postToSnapchat({
      contentId: "fixture",
      uid: "snapchat-owner",
      payload: {},
    });
    assert.equal(result.error, "snapchat_publishing_permission_required");
    assert.equal(providerCalls.length, 0);
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
    await ref.set(previous);
  }
});
test("deployed Rules sources deny client reads and writes of the private OAuth state and credentials", async () => {
  const { initializeTestEnvironment, assertFails } = require("@firebase/rules-unit-testing");
  const { getDoc, setDoc, doc } = require("firebase/firestore");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: { host, port: Number(port) },
  });
  try {
    const response = await prepare();
    const client = environment
      .authenticatedContext("snapchat-owner", { email_verified: true })
      .firestore();
    for (const pathname of [
      `oauth_states/${response.state}`,
      "users/snapchat-owner/connections/snapchat",
    ]) {
      await assertFails(getDoc(doc(client, pathname)));
      await assertFails(setDoc(doc(client, pathname), { uid: "snapchat-owner", tokens: "forged" }));
    }
  } finally {
    await environment.cleanup();
  }
});
