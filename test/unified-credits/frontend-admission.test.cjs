// Frontend consent/transport contracts. Quotes are fixtures, never execution proofs.
const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const code = require("@babel/core").transformSync(
  fs.readFileSync(path.join(__dirname, "../../frontend/src/utils/creditPilot.js"), "utf8"),
  {
    babelrc: false,
    configFile: false,
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
  }
).code;
function client(enabled = true, balance = 15) {
  const auth = { currentUser: { uid: "alice", getIdToken: async () => "demo-only-token" } };
  const window = new EventTarget();
  window.location = { hostname: "127.0.0.1" };
  const stored = new Map(),
    calls = [];
  const context = {
    exports: {},
    require: name =>
      name.includes("firebaseClient") ? { auth } : { API_BASE_URL: "http://127.0.0.1:8190" },
    window,
    process: {
      env: {
        REACT_APP_CREDITS_PILOT: String(enabled),
        REACT_APP_FIREBASE_PROJECT_ID: "demo-autopromote-credits",
      },
    },
    crypto: { subtle: crypto.webcrypto.subtle, randomUUID: crypto.randomUUID },
    TextEncoder,
    URL,
    Headers,
    Response,
    CustomEvent,
    localStorage: {
      getItem: key => stored.get(key),
      setItem: (key, value) => stored.set(key, value),
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        quoteId: "server-quote",
        credits: 2,
        pricingRevision: "reviewed-revision",
        balance,
        canAfford: balance >= 2,
      });
    },
  };
  vm.runInNewContext(code, context);
  return { api: context.exports, auth, window, stored, calls };
}
const url = "http://127.0.0.1:8190/api/media/process";
const options = {
  method: "POST",
  body: JSON.stringify({ sourceStoragePath: "studio/sources/alice/source.mp4" }),
  headers: { Authorization: "Bearer demo-only-token" },
};
it("preserves the original transport exactly when the pilot flag is off", async () => {
  const c = client(false);
  const transportOptions = { timeoutMs: 1000 };
  let seen;
  const response = await c.api.creditFetch(
    url,
    options,
    async (...args) => {
      seen = args;
      return "original-response";
    },
    transportOptions
  );
  assert.equal(response, "original-response");
  assert.equal(seen[1], options);
  assert.equal(seen[2], transportOptions);
  assert.equal(c.calls.length, 0);
});
it("does not admit Cam Combiner or unpriced AI routes", () => {
  const c = client();
  for (const endpoint of [
    "/api/media/render-multicam",
    "/api/media/multicam/analyze",
    "/api/media/plan-story-visuals",
  ])
    assert.equal(c.api.pilotOperationFor(endpoint), null);
});
it("declining consent submits no processing request and saves no financial intent", async () => {
  const c = client();
  let dispatched = false;
  c.window.addEventListener("autopromote-credit-consent", event => event.detail.resolve(false));
  const response = await c.api.creditFetch(url, options, async () => {
    dispatched = true;
  });
  assert.equal(response.status, 409);
  assert.equal(dispatched, false);
  assert.equal(c.stored.size, 0);
  assert.equal(c.calls.length, 1);
});
it("insufficient credits preserve the project without offering consent or dispatching", async () => {
  const c = client(true, 0);
  let consents = 0,
    jobs = 0;
  c.window.addEventListener("autopromote-credit-consent", () => consents++);
  const response = await c.api.creditFetch(url, options, async () => jobs++);
  assert.equal(response.status, 402);
  assert.equal(consents, 0);
  assert.equal(jobs, 0);
  assert.equal(c.stored.size, 0);
});
it("persists the stable operation identity before transmitting an approved request", async () => {
  const c = client();
  c.window.addEventListener("autopromote-credit-consent", event => event.detail.resolve(true));
  await c.api.creditFetch(url, options, async (_url, request) => {
    const saved = Object.values(JSON.parse(c.stored.get("autopromote-credit-operations:alice")))[0];
    assert.equal(
      saved.operationId,
      crypto
        .createHash("sha256")
        .update(JSON.stringify(["alice", request.headers.get("X-Credits-Request")]))
        .digest("hex")
    );
    assert.equal(request.headers.get("X-Credits-Approved"), "2");
    assert.equal(request.headers.get("X-Credits-Quote"), "server-quote");
    return Response.json({ creditOperationId: saved.operationId });
  });
});
it("a lost response reuses the admitted request ID without another consent", async () => {
  const c = client();
  let consents = 0;
  const ids = [];
  c.window.addEventListener("autopromote-credit-consent", event => {
    consents++;
    event.detail.resolve(true);
  });
  await assert.rejects(
    c.api.creditFetch(url, options, async (_url, request) => {
      ids.push(request.headers.get("X-Credits-Request"));
      throw new Error("connection lost");
    })
  );
  await c.api.creditFetch(url, options, async (_url, request) => {
    ids.push(request.headers.get("X-Credits-Request"));
    return Response.json({});
  });
  assert.equal(consents, 1);
  assert.equal(ids[0], ids[1]);
});
it("an account switch during consent cannot submit the previous user's operation", async () => {
  const c = client();
  let jobs = 0;
  c.window.addEventListener("autopromote-credit-consent", event => {
    c.auth.currentUser = { uid: "bob" };
    event.detail.resolve(true);
  });
  const response = await c.api.creditFetch(url, options, async () => jobs++);
  assert.equal(response.status, 409);
  assert.equal(jobs, 0);
  assert.equal(c.stored.size, 0);
});
