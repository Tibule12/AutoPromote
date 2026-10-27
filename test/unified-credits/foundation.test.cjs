const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const {
  assertSandbox,
  createSandboxDatabase,
} = require("../../src/services/unifiedCredits/runtime");
const { validatePolicy, quoteOperation } = require("../../src/services/unifiedCredits/policy");
const { createMockVerifier } = require("../../src/services/unifiedCredits/rewardProof");
const { createWalletService } = require("../../src/services/unifiedCredits/wallet");
const { createSandboxApp } = require("../../src/routes/unifiedCreditsSandboxRoutes");
const {
  analyseEconomics,
  estimateComputeMicros,
} = require("../../src/services/unifiedCredits/economics");
const example = require("../../config/unified-credits.sandbox.example.json");
const hash = (...parts) => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const code = expected => error => error.code === expected;
const db = createSandboxDatabase();
const verifier = createMockVerifier("local-test-secret-not-a-provider-key-000000");
let service, time;
const now = () => time;
const make = changes =>
  createWalletService({ db, verifier, now, policy: { ...example, ...changes } });
const wallet = uid => db.collection("credits_v2_wallets").doc(hash(uid));
const budget = cycle => db.collection("credits_v2_budgets").doc(cycle || "2026-10");
const control = () => db.collection("credits_v2_control").doc("global");
async function enroll(uid = "alice", options = {}) {
  await service.enroll(uid, options);
  return service.getAccount(uid);
}
function reservation(requestId = crypto.randomUUID(), operation = "queue.dispatch", units = 1) {
  const q = service.quote(operation, units);
  return {
    operation,
    units,
    requestId,
    approvedCredits: q.credits,
    pricingRevision: q.pricingRevision,
  };
}
async function reward(uid = "alice", eventId) {
  const session = await service.beginReward(uid);
  const proof = verifier.issue({
    userId: uid,
    sessionId: session.sessionId,
    eventId: eventId || crypto.randomUUID(),
    completedAt: time,
  });
  return { session, proof };
}
beforeEach(async () => {
  assertSandbox(process.env, db);
  const collections = await db.listCollections();
  for (const collection of collections) {
    assert.match(collection.id, /^credits_v2_/);
    await db.recursiveDelete(collection);
  }
  time = Date.UTC(2026, 9, 26, 12);
  service = make();
  await service.initialiseControl();
});
after(async () => {
  await db.terminate();
});

describe("isolation and server pricing", () => {
  it("does not assume ad revenue and detects unfunded reward exposure", () => {
    const input = require("../../config/unified-credits.economics.example.json");
    const result = analyseEconomics(input);
    assert.equal(result.maxRevenueFundedRewardCredits, 0);
    assert.equal(result.maximumMonthlyLiabilityMicros, 35000000);
    assert.equal(result.unfundedExposureMicros, 20000000);
    assert.equal(
      analyseEconomics({
        ...input,
        finalizedAdRevenueMicros: 100000,
        verifiedRewardCompletions: 10,
      }).maxRevenueFundedRewardCredits,
      5
    );
    assert.equal(
      analyseEconomics({ ...input, finalizedAdRevenueMicros: 100000, verifiedRewardCompletions: 0 })
        .maxRevenueFundedRewardCredits,
      0
    );
    assert.throws(() => analyseEconomics({ ...input, spendableBps: 10001 }));
  });
  it("prices CPU and GPU runtime separately with conservative rounding", () => {
    assert.equal(
      estimateComputeMicros({
        seconds: 60,
        vcpu: 4,
        memoryGiB: 4,
        cpuNanoUsdPerSecond: 24000,
        memoryNanoUsdPerSecond: 2500,
        gpuNanoUsdPerSecond: 0,
      }),
      6360
    );
    assert.equal(
      estimateComputeMicros({
        seconds: 60,
        vcpu: 20,
        memoryGiB: 80,
        cpuNanoUsdPerSecond: 18000,
        memoryNanoUsdPerSecond: 2000,
        gpuNanoUsdPerSecond: 365220,
      }),
      53114
    );
  });
  it("fails closed without every sandbox guard, even with production runtime markers", () => {
    for (const changes of [
      { UNIFIED_CREDITS_SANDBOX: "false" },
      { UNIFIED_CREDITS_PROJECT_ID: "autopromote-cc6d3" },
      { FIRESTORE_EMULATOR_HOST: "example.org:8080" },
      { FIRESTORE_EMULATOR_HOST: "127.0.0.1:0" },
      { NODE_ENV: "production" },
      { K_SERVICE: "worker" },
      { FUNCTION_TARGET: "handler" },
      { RENDER: "true" },
    ]) {
      assert.throws(() => assertSandbox({ ...process.env, ...changes }), code("SANDBOX_ONLY"));
    }
    assert.throws(
      () => assertSandbox(process.env, { projectId: "live", _settings: db._settings }),
      code("SANDBOX_ONLY")
    );
    assert.throws(
      () =>
        assertSandbox(process.env, {
          projectId: db.projectId,
          _settings: { servicePath: "remote", port: 443, ssl: true },
        }),
      code("SANDBOX_ONLY")
    );
  });
  it("rejects invalid pricing, unknown features and unsafe arithmetic", () => {
    for (const value of [-1, 0, NaN, Infinity, 1.5, "1"])
      assert.throws(() => validatePolicy({ ...example, microsPerCredit: value }));
    const policy = validatePolicy(example);
    for (const units of [-1, 0, NaN, Infinity, 1.5, "1", Number.MAX_SAFE_INTEGER])
      assert.throws(() => quoteOperation(policy, "studio.render", units));
    for (const operation of ["render-multicam", "cam-combiner", "__proto__", "unknown"])
      assert.throws(() => service.quote(operation, 1), code("UNSUPPORTED_OPERATION"));
    assert.throws(() =>
      validatePolicy({
        ...example,
        operations: {
          ...example.operations,
          "studio.render": {
            unit: "seconds",
            baseMicros: 1,
            microsPerUnit: Number.MAX_SAFE_INTEGER,
            maxUnits: 2,
          },
        },
      })
    );
    assert.ok(Object.isFrozen(service.policy.operations["studio.render"]));
  });
  it("provides resource prices for all four supported tools", () => {
    for (const op of Object.keys(example.operations)) {
      const q = service.quote(op, 2);
      assert.ok(q.credits > 0);
      assert.ok(q.credits * service.policy.microsPerCredit >= q.maxCostMicros);
    }
  });
  it("rejects stale price consent and client-supplied low credit costs", async () => {
    await enroll();
    const r = reservation();
    await assert.rejects(
      service.reserve("alice", { ...r, approvedCredits: 0 }),
      code("PRICE_CHANGED")
    );
    await assert.rejects(
      service.reserve("alice", { ...r, pricingRevision: "invented" }),
      code("PRICE_CHANGED")
    );
    assert.equal((await service.getAccount("alice")).balance, 15);
  });
});

describe("allowances and source accounting", () => {
  it("issues one monthly grant under concurrent renewals and never resets on enrollment", async () => {
    await service.enroll("alice");
    const accounts = await Promise.all([service.getAccount("alice"), service.getAccount("alice")]);
    assert.deepEqual(
      accounts.map(a => a.balance),
      [15, 15]
    );
    await service.enroll("alice", { tier: "enterprise", openingBalance: 500 });
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 15);
    assert.equal(a.tier, "free");
    assert.equal(
      (await db.collection("credits_v2_ledger").where("kind", "==", "monthly_grant").get()).size,
      1
    );
  });
  it("renews at UTC month boundaries, expires grants/rewards and preserves purchased credits", async () => {
    await enroll();
    await service.grantPurchased("alice", 10, "payment1");
    const { proof } = await reward();
    await service.completeReward(proof);
    time = Date.UTC(2026, 10, 1);
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 25);
    assert.equal(a.totals.expired, 16);
    assert.equal(a.totals.granted, 30);
    assert.equal(a.totals.purchased, 10);
    assert.equal(a.totals.earned, 1);
    assert.equal(a.renewsAt, "2026-12-01T00:00:00.000Z");
  });
  it("does not accumulate grants for months spent inactive", async () => {
    await enroll();
    time = Date.UTC(2027, 0, 5);
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 15);
    assert.equal(a.totals.granted, 30);
  });
  it("permits the entire monthly allowance in one day across tools", async () => {
    await enroll();
    for (let i = 0; i < 15; i++) {
      const op = await service.reserve("alice", reservation(String(i)));
      await service.start("alice", op.operationId);
      await service.settle("alice", op.operationId, "succeeded");
    }
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 0);
    assert.equal(a.totals.consumed, 15);
    await assert.rejects(service.reserve("alice", reservation()), code("INSUFFICIENT_CREDITS"));
  });
  it("binds purchase events globally to their owner and amount", async () => {
    await enroll();
    await enroll("bob");
    await Promise.all([
      service.grantPurchased("alice", 10, "paid"),
      service.grantPurchased("alice", 10, "paid"),
    ]);
    assert.equal((await service.getAccount("alice")).balance, 25);
    await assert.rejects(service.grantPurchased("bob", 10, "paid"), code("EVENT_CONFLICT"));
    await assert.rejects(service.grantPurchased("alice", 100, "paid"), code("EVENT_CONFLICT"));
    for (const amount of [-1, 0, NaN, 1.5, "10"])
      await assert.rejects(service.grantPurchased("alice", amount, "bad"));
  });
});

describe("atomic reservations, worker transitions and financial abuse", () => {
  it("prevents simultaneous overspending and negative balances", async () => {
    await enroll();
    const results = await Promise.allSettled([
      service.reserve("alice", reservation("r1", "studio.render", 100)),
      service.reserve("alice", reservation("r2", "studio.render", 100)),
    ]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.find(r => r.status === "rejected").reason.code, "INSUFFICIENT_CREDITS");
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 3);
    assert.equal(a.reserved, 12);
  });
  it("deduplicates reservations and rejects request ID payload substitution", async () => {
    await enroll();
    const r = reservation("same");
    const results = await Promise.all([service.reserve("alice", r), service.reserve("alice", r)]);
    assert.equal(results[0].operationId, results[1].operationId);
    assert.equal((await service.getAccount("alice")).balance, 14);
    await assert.rejects(
      service.reserve("alice", reservation("same", "publisher.publish", 1)),
      code("IDEMPOTENCY_CONFLICT")
    );
  });
  it("allows only one dispatch and consumes exactly once under duplicate callbacks", async () => {
    await enroll();
    const op = await service.reserve("alice", reservation());
    const starts = await Promise.allSettled([
      service.start("alice", op.operationId),
      service.start("alice", op.operationId),
    ]);
    assert.equal(starts.filter(r => r.status === "fulfilled").length, 1);
    await Promise.all([
      service.settle("alice", op.operationId, "succeeded"),
      service.settle("alice", op.operationId, "succeeded"),
    ]);
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 14);
    assert.equal(a.reserved, 0);
    assert.equal(a.totals.consumed, 1);
    await assert.rejects(
      service.settle("alice", op.operationId, "failed"),
      code("SETTLEMENT_CONFLICT")
    );
  });
  it("releases queued cancellation without spend and prevents cross-user settlement", async () => {
    await enroll();
    const op = await service.reserve("alice", reservation());
    await assert.rejects(
      service.settle("mallory", op.operationId, "failed"),
      code("OPERATION_NOT_FOUND")
    );
    await service.settle("alice", op.operationId, "cancelled");
    assert.equal((await service.getAccount("alice")).balance, 15);
    assert.equal((await budget().get()).data().spentMicros, 0);
  });
  it("refunds failure once but retains started infrastructure cost", async () => {
    await enroll();
    const op = await service.reserve("alice", reservation());
    await service.start("alice", op.operationId);
    await assert.rejects(
      service.settle("alice", op.operationId, "cancelled"),
      code("WORKER_TERMINATION_REQUIRED")
    );
    await Promise.all([
      service.settle("alice", op.operationId, "failed"),
      service.settle("alice", op.operationId, "failed"),
    ]);
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 15);
    assert.equal(a.totals.refunded, 1);
    assert.equal((await budget().get()).data().spentMicros, op.maxCostMicros);
  });
  it("keeps uncertain running work reserved across renewal and preserves a later refund", async () => {
    await enroll();
    const op = await service.reserve("alice", reservation());
    await service.start("alice", op.operationId);
    time = Date.UTC(2026, 10, 1);
    let a = await service.getAccount("alice");
    assert.equal(a.reserved, 1);
    assert.equal(a.balance, 15);
    await service.settle("alice", op.operationId, "failed");
    a = await service.getAccount("alice");
    assert.equal(a.balance, 16);
    assert.equal(a.reserved, 0);
    assert.equal((await budget("2026-10").get()).data().spentMicros, 1000);
    assert.equal((await budget("2026-11").get()).data().spentMicros, 0);
  });
  it("preserves a cross-month refund even before lazy renewal", async () => {
    await enroll();
    const op = await service.reserve("alice", reservation());
    await service.start("alice", op.operationId);
    time = Date.UTC(2026, 10, 1);
    await service.settle("alice", op.operationId, "failed");
    assert.equal((await service.getAccount("alice")).balance, 16);
  });
  it("prevents queued cancellation from laundering old allowances into rollover credits", async () => {
    await enroll("alice", { openingBalance: 10 });
    const op = await service.reserve("alice", reservation("cross-cycle", "studio.render", 180));
    assert.equal(op.fromExpiring, 15);
    assert.equal(op.fromPermanent, 6);
    time = Date.UTC(2026, 10, 1);
    await service.getAccount("alice");
    const released = await service.settle("alice", op.operationId, "cancelled");
    assert.equal(released.refunded, 6);
    assert.equal(released.expired, 15);
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 25);
    assert.equal(a.totals.expired, 15);
    assert.equal(a.totals.refunded, 6);
  });
  it("prevents old queued reservations from starting in a new cycle", async () => {
    await enroll();
    const op = await service.reserve("alice", reservation());
    time = Date.UTC(2026, 10, 1);
    await assert.rejects(service.start("alice", op.operationId), code("RESERVATION_EXPIRED"));
    await service.settle("alice", op.operationId, "cancelled");
  });
  it("atomically enforces global and per-user spend budgets", async () => {
    service = make({ monthlySpendMicros: 1000, userMonthlySpendMicros: 1000 });
    await enroll();
    await enroll("bob");
    const results = await Promise.allSettled([
      service.reserve("alice", reservation()),
      service.reserve("bob", reservation()),
    ]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.find(r => r.status === "rejected").reason.code, "SPEND_BUDGET_EXCEEDED");
    const held = results.find(r => r.status === "fulfilled").value;
    await service.start(held.userId, held.operationId);
    await service.settle(held.userId, held.operationId, "failed");
    await assert.rejects(
      service.reserve(held.userId, reservation()),
      code("SPEND_BUDGET_EXCEEDED")
    );
  });
  it("applies user budgets independently of global capacity", async () => {
    service = make({ userMonthlySpendMicros: 1000 });
    await enroll();
    await enroll("bob");
    await service.reserve("alice", reservation());
    await assert.rejects(service.reserve("alice", reservation()), code("SPEND_BUDGET_EXCEEDED"));
    await service.reserve("bob", reservation());
  });
  it("enforces concurrency caps across month boundaries and honours kill switches", async () => {
    service = make({ maxActiveGlobal: 1 });
    await enroll();
    await enroll("bob");
    const op = await service.reserve("alice", reservation());
    time = Date.UTC(2026, 10, 1);
    await assert.rejects(service.reserve("bob", reservation()), code("CAPACITY_LIMIT"));
    await service.settle("alice", op.operationId, "cancelled");
    await control().update({ spendingEnabled: false });
    await assert.rejects(service.reserve("bob", reservation()), code("SPENDING_PAUSED"));
    assert.ok((await service.getAccount("alice")).balance >= 0);
  });
  it("limits grant liability globally against account farming", async () => {
    service = make({ monthlyIssuanceMicros: 15000 });
    await enroll();
    await service.enroll("bob");
    await assert.rejects(service.getAccount("bob"), code("ISSUANCE_BUDGET_EXCEEDED"));
    await assert.rejects(service.beginReward("alice"), code("ISSUANCE_BUDGET_EXCEEDED"));
    assert.equal((await wallet("bob").get()).data().balance, 0);
  });
});

describe("reward authenticity, caps and replay", () => {
  it("rejects browser flags, tampered proofs and another verifier's signature", async () => {
    await enroll();
    const { proof } = await reward();
    for (const bad of [
      { completed: true },
      { ...proof, payload: proof.payload.replace("alice", "bob") },
      { ...proof, signature: "0".repeat(64) },
      createMockVerifier("another-test-secret-00000000000000").issue({
        userId: "alice",
        sessionId: "fake",
        eventId: "fake",
        completedAt: time,
      }),
    ]) {
      await assert.rejects(service.completeReward(bad), code("UNVERIFIED_REWARD"));
    }
    assert.equal((await service.getAccount("alice")).balance, 15);
  });
  it("awards a completed session exactly once under replay and concurrency", async () => {
    await enroll();
    const { proof } = await reward();
    await Promise.all([service.completeReward(proof), service.completeReward(proof)]);
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 16);
    assert.equal(a.totals.earned, 1);
    assert.equal(a.adsRemaining, 19);
  });
  it("rejects session ownership substitution and reused provider event IDs", async () => {
    await enroll();
    await enroll("bob");
    const a = await reward("alice", "shared");
    const forgedOwner = verifier.issue({
      userId: "bob",
      sessionId: a.session.sessionId,
      eventId: "another",
      completedAt: time,
    });
    await assert.rejects(service.completeReward(forgedOwner), code("REWARD_NOT_FOUND"));
    await service.completeReward(a.proof);
    const b = await reward("bob", "shared");
    await assert.rejects(service.completeReward(b.proof), code("EVENT_CONFLICT"));
  });
  it("enforces one in-flight ad and the monthly cap server-side", async () => {
    service = make({ rewardMonthlyCap: 1 });
    await enroll();
    const { proof } = await reward();
    await assert.rejects(service.beginReward("alice"), code("REWARD_IN_PROGRESS"));
    await service.completeReward(proof);
    await assert.rejects(service.beginReward("alice"), code("MONTHLY_AD_CAP"));
    time = Date.UTC(2026, 10, 1);
    await service.getAccount("alice");
    await service.beginReward("alice");
  });
  it("gives no reward for skip, expiry, old cycle or fabricated future time", async () => {
    await enroll();
    let r = await reward();
    await service.closeReward("alice", r.session.sessionId);
    await assert.rejects(service.completeReward(r.proof), code("REWARD_ALREADY_CLOSED"));
    r = await reward();
    time += (example.rewardTtlSeconds + 1) * 1000;
    await assert.rejects(service.completeReward(r.proof), code("REWARD_EXPIRED"));
    await service.closeReward("alice", r.session.sessionId);
    r = await reward();
    const future = verifier.issue({
      userId: "alice",
      sessionId: r.session.sessionId,
      eventId: "future",
      completedAt: time + 1,
    });
    await assert.rejects(service.completeReward(future), code("REWARD_EXPIRED"));
    time = Date.UTC(2026, 10, 1);
    await service.getAccount("alice");
    await assert.rejects(service.completeReward(r.proof), code("REWARD_EXPIRED"));
    await service.closeReward("alice", r.session.sessionId);
    assert.equal((await service.getAccount("alice")).totals.earned, 0);
  });
  it("reserves reward liability and wallet space before promising the reward", async () => {
    service = make({ monthlyIssuanceMicros: 16000 });
    await enroll();
    const r = await reward();
    assert.equal((await budget().get()).data().pendingRewardMicros, 1000);
    await assert.rejects(
      service.grantPurchased("alice", 1, "topup"),
      code("ISSUANCE_BUDGET_EXCEEDED")
    );
    await control().update({ rewardsEnabled: false, issuanceEnabled: false });
    await service.completeReward(r.proof); // Honour the already promised reward.
    assert.equal((await service.getAccount("alice")).balance, 16);
    assert.equal((await budget().get()).data().pendingRewardMicros, 0);
  });
  it("does not overfill a wallet with purchases while a reward is pending", async () => {
    service = make({ maxBalance: 2000 });
    await enroll();
    const r = await reward();
    await assert.rejects(service.grantPurchased("alice", 1985, "too-full"), code("WALLET_CAP"));
    await service.completeReward(r.proof);
    assert.equal((await service.getAccount("alice")).balance, 16);
  });
  it("keeps paid subscribers ad-free with their larger monthly grants", async () => {
    const a = await enroll("paid", { tier: "premium" });
    assert.equal(a.balance, 150);
    assert.equal(a.adFree, true);
    await assert.rejects(service.beginReward("paid"), code("SUBSCRIBER_AD_FREE"));
  });
});

describe("sandbox HTTP boundaries", () => {
  let app;
  beforeEach(async () => {
    await enroll("demo-free");
    await enroll("demo-premium", { tier: "premium" });
    app = createSandboxApp({ service, verifier, origin: "http://127.0.0.1:8190", now });
  });
  const client = () => request(app);
  const auth = req =>
    req.set("X-Credits-Sandbox", "local").set("X-Credits-Sandbox-User", "demo-free");
  it("requires explicit demo identity and rejects cross-origin requests", async () => {
    await client().get("/api/account").expect(401);
    await auth(client().get("/api/account")).set("Origin", "https://attacker.example").expect(403);
    await auth(client().get("/api/account")).expect(200);
  });
  it("requires ad opt-in and does not expose live callback or purchase endpoints", async () => {
    await auth(client().post("/api/rewards")).send({}).expect(400);
    await auth(client().post("/api/reward-callback")).send({ completed: true }).expect(404);
    await auth(client().post("/api/purchase")).send({ amount: 100 }).expect(404);
    const r = await auth(client().post("/api/rewards")).send({ consent: true }).expect(200);
    await auth(client().post(`/api/rewards/${r.body.sessionId}/mock-completion`))
      .send({})
      .expect(200);
    assert.equal((await service.getAccount("demo-free")).balance, 16);
  });
  it("keeps preview and saving assets accessible with exhausted credits", async () => {
    await wallet("demo-free").update({ balance: 0, expiring: 0, permanent: 0 });
    const q = await auth(client().post("/api/quote"))
      .send({ operation: "studio.render", units: 1 })
      .expect(200);
    assert.equal(q.body.canAfford, false);
    await client()
      .get("/")
      .expect(200)
      .expect(/Save notes on this device/);
    await client()
      .get("/app.js")
      .expect(200)
      .expect(/localStorage.setItem/);
  });
});

describe("Firestore client security rules", () => {
  let environment;
  before(async () => {
    const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
    environment = await initializeTestEnvironment({
      projectId: "demo-autopromote-credits",
      firestore: {
        host,
        port: Number(port),
        rules: fs.readFileSync(path.join(__dirname, "firestore.rules"), "utf8"),
      },
    });
  });
  after(async () => {
    await environment?.cleanup();
  });
  it("denies financial writes, forged admin roles, cross-user reads and anonymous reads", async () => {
    const { assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
    const { doc, getDoc, setDoc, updateDoc } = require("firebase/firestore");
    await enroll();
    const alice = environment.authenticatedContext("alice").firestore();
    const bob = environment.authenticatedContext("bob", { role: "admin", admin: true }).firestore();
    const anon = environment.unauthenticatedContext().firestore();
    const p = `credits_v2_wallets/${hash("alice")}`;
    await assertSucceeds(getDoc(doc(alice, p)));
    await assertFails(updateDoc(doc(alice, p), { balance: 1000000, tier: "enterprise" }));
    await assertFails(setDoc(doc(alice, "users/alice"), { role: "admin", credits: 1000000 }));
    await assertFails(getDoc(doc(bob, p)));
    await assertFails(getDoc(doc(anon, p)));
    for (const collection of [
      "ledger",
      "operations",
      "events",
      "reward_sessions",
      "budgets",
      "user_budgets",
      "control",
      "outbox",
      "worker_executions",
      "quotes",
      "inputs",
    ]) {
      await assertFails(setDoc(doc(bob, `credits_v2_${collection}/forged`), { amount: 1000 }));
    }
  });
});
