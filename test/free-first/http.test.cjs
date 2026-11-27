const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const rateLimit = require("express-rate-limit");
const request = require("supertest");
const { createSandboxDatabase } = require("../../src/services/unifiedCredits/runtime");
const db = createSandboxDatabase();
const cache = (file, exports) => {
  const id = require.resolve(file);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
// Route integration fixture authenticates only this test identity; public requests still fail.
cache("../../src/firebaseAdmin", { db });
cache("../../src/authMiddleware", (req, res, next) => {
  if (req.get("Authorization") !== "Bearer authenticated-fixture") return res.status(401).end();
  req.user = { uid: "http-user", claims: { email_verified: true } };
  req.userId = req.user.uid;
  next();
});
const app = express();
app.use(rateLimit({windowMs:60000,max:300}));
app.use(express.json());
app.use("/api/usage", require("../../src/routes/usageRoutes"));
after(async () => db.terminate());
test("mounted legacy upgrade route is permanently retired and cannot mutate entitlements", async () => {
  assert.equal((await request(app).post("/api/usage/upgrade").send({ tier: "plus" })).status, 401);
  const response = await request(app)
    .post("/api/usage/upgrade")
    .set("Authorization", "Bearer authenticated-fixture")
    .send({ tier: "pro", paymentMethodId: "unverified" });
  assert.equal(response.status, 410);
  assert.equal(response.body.error, "VERIFIED_PAYMENT_REQUIRED");
  assert.equal((await db.collection("users").doc("http-user").get()).exists, false);
});
test("public pricing returns precisely two USD plans", async () => {
  const r = await request(app).get("/api/usage/pricing");
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.tiers), ["free", "plus"]);
  assert.ok(
    Object.values(r.body.tiers).every(p => p.currency === "USD" && p.limits.platforms === 6)
  );
});
test("processing guard refuses an unbounded expensive worker and client test headers do not bypass it", async () => {
  const { createProcessingGuard } = require("../../src/middlewares/processingBudgetMiddleware");
  const { createProcessingService } = require("../../src/services/processingTokens/service");
  const runtime = require("../../src/services/processingTokens/runtime");
  process.env.FREE_FIRST_USAGE_ENABLED = "true";
  const guarded = express();
  guarded.use(rateLimit({windowMs:60000,max:300}));
  guarded.use(express.json());
  guarded.use(
    createProcessingGuard({
      service: createProcessingService({ db }),
      authenticate: require("../../src/authMiddleware"),
    })
  );
  let dispatched = false;
  guarded.post("/api/media/render-clip", (_req, res) => {
    dispatched = true;
    res.json({ success: true });
  });
  try {
    const r = await request(guarded)
      .post("/api/media/render-clip")
      .set("Authorization", "Bearer authenticated-fixture")
      .set("X-Playwright-E2E", "1")
      .set("User-Agent", "node-fetch")
      .send({ tokens: 0 });
    assert.equal(r.status, 503);
    assert.equal(dispatched, false);
    assert.throws(() => runtime.assertDispatch(), { code: "BOUNDED_PROCESSING_ADAPTER_REQUIRED" });
  } finally {
    delete process.env.FREE_FIRST_USAGE_ENABLED;
  }
});
test("default transactional entitlement resolver reads server billing and rejects forged Plus flags or expired payments", async () => {
  const { createProcessingService } = require("../../src/services/processingTokens/service");
  const service = createProcessingService({ db });
  await service.configure({ enabled: true });
  const user = "default-entitlement";
  const ref = db.collection("user_billing").doc(user);
  await db
    .collection("users")
    .doc(user)
    .set({ subscriptionTier: "plus", subscriptionStatus: "active", isPaid: true });
  await ref.set({
    tier: "plus",
    status: "active",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal((await service.status(user)).planId, "free");
  await ref.set({ paymentVerified: true }, { merge: true });
  assert.equal((await service.status(user)).planId, "plus");
  await ref.set({ expiresAt: new Date(Date.now() - 1000).toISOString() }, { merge: true });
  assert.equal((await service.status(user)).planId, "free");
  assert.equal((await service.status(user)).allowance, 100);
});
test('a verified-looking profile field cannot replace the trusted token verification claim', async () => {
  const {createProcessingGuard}=require('../../src/middlewares/processingBudgetMiddleware');
  const app=express();app.use(rateLimit({windowMs:60000,max:300}));app.use(express.json());
  app.use(createProcessingGuard({service:{quote:()=>{throw Error('must not quote');}},authenticate:(req,_res,next)=>{
    req.user={uid:'spoof',email_verified:true,claims:{email_verified:false}};next();
  }}));
  process.env.FREE_FIRST_USAGE_ENABLED='true';
  try {const r=await request(app).post('/api/media/process').send({});assert.equal(r.status,403);assert.equal(r.body.error,'VERIFIED_ACCOUNT_REQUIRED');}
  finally {delete process.env.FREE_FIRST_USAGE_ENABLED;}
});
test("support assistant keeps built-in help available without bypassing external API budgets", async () => {
  const names = ["ASSISTANT_ENABLED", "ASSISTANT_OPENAI_API_KEY", "FREE_FIRST_USAGE_ENABLED"];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  let externalCalls = 0;
  try {
    process.env.ASSISTANT_ENABLED = "true";
    process.env.ASSISTANT_OPENAI_API_KEY = "not-a-real-key";
    process.env.FREE_FIRST_USAGE_ENABLED = "true";
    global.fetch = async () => { externalCalls++; throw Error("unexpected provider request"); };
    const support = express();
    support.use(rateLimit({windowMs:60000,max:300}));
    support.use(express.json());
    support.use("/api/assistant", require("../../src/authMiddleware"), require("../../src/routes/assistantRoutes"));
    const response = await request(support).post("/api/assistant/query")
      .set("Authorization", "Bearer authenticated-fixture").send({prompt: "How do I upload?"});
    assert.equal(response.status, 200);
    assert.match(response.body.reply, /Uploads usually fail/);
    assert.equal(externalCalls, 0);
  } finally {
    global.fetch = originalFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});
