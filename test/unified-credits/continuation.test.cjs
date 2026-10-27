const { beforeEach, after, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");
const {
  createSandboxDatabase,
  assertSandbox,
} = require("../../src/services/unifiedCredits/runtime");
const { createWalletService } = require("../../src/services/unifiedCredits/wallet");
const { createMockVerifier } = require("../../src/services/unifiedCredits/rewardProof");
const {
  createDispatcher,
  createEmulatorWorker,
} = require("../../src/services/unifiedCredits/dispatch");
const { createAdmission } = require("../../src/services/unifiedCredits/admission");
const {
  COMPONENTS,
  analyseCostEvidence,
} = require("../../src/services/unifiedCredits/costEvidence");
const { createSandboxApp } = require("../../src/routes/unifiedCreditsSandboxRoutes");
const policy = require("../../config/unified-credits.sandbox.example.json");
const db = createSandboxDatabase();
const hash = (...args) => crypto.createHash("sha256").update(JSON.stringify(args)).digest("hex");
const code = value => error => error.code === value;
const verifier = createMockVerifier("continuation-local-fixture-secret-000000000000");
let service, worker, dispatcher, clock;
const now = () => clock;
const reserveArgs = (id = crypto.randomUUID(), operation = "queue.dispatch", units = 1) => {
  const q = service.quote(operation, units);
  return {
    operation,
    units,
    requestId: id,
    approvedCredits: q.credits,
    pricingRevision: q.pricingRevision,
  };
};
async function enroll(uid = "alice", options) {
  await service.enroll(uid, options);
  return service.getAccount(uid);
}
async function seedSource(uid = "alice", sourceId = "source1", fields = {}) {
  const value = {
    userId: uid,
    contentHash: "a".repeat(64),
    objectGeneration: "1",
    resourceClass: "media-cpu",
    gpu: false,
    enforcedMaxSeconds: 20.1,
    allowedDestinations: ["youtube", "tiktok"],
    ...fields,
  };
  await db.collection("credits_v2_inputs").doc(hash(uid, sourceId)).set(value);
  return value;
}
beforeEach(async () => {
  assertSandbox(process.env, db);
  for (const c of await db.listCollections()) {
    assert.match(c.id, /^credits_v2_/);
    await db.recursiveDelete(c);
  }
  clock = Date.UTC(2026, 9, 27, 12);
  service = createWalletService({ db, verifier, policy, now });
  await service.initialiseControl();
  worker = createEmulatorWorker({ db });
  dispatcher = createDispatcher({ db, service, worker });
});
after(() => db.terminate());
describe("durable shared-wallet admission and execution", () => {
  it("creates one durable outbox intent atomically with a deduplicated reservation", async () => {
    await enroll();
    const r = reserveArgs("stable");
    const [a, b] = await Promise.all([service.reserve("alice", r), service.reserve("alice", r)]);
    assert.equal(a.operationId, b.operationId);
    assert.equal((await db.collection("credits_v2_outbox").get()).size, 1);
    assert.equal((await service.getAccount("alice")).balance, 14);
  });
  it("allows only one dispatcher to submit under duplicate delivery", async () => {
    await enroll();
    const op = await service.reserve("alice", reserveArgs());
    const results = await Promise.allSettled([
      dispatcher.dispatch("alice", op.operationId),
      dispatcher.dispatch("alice", op.operationId),
    ]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await db.collection("credits_v2_worker_executions").get()).size, 1);
    await worker.finish(op.operationId, "succeeded");
    await Promise.all([
      dispatcher.reconcile("alice", op.operationId),
      dispatcher.reconcile("alice", op.operationId),
    ]);
    const a = await service.getAccount("alice");
    assert.equal(a.totals.consumed, 1);
    assert.equal(a.reserved, 0);
  });
  it("recovers a crash after submission but before execution binding without submitting twice", async () => {
    await enroll();
    const op = await service.reserve("alice", reserveArgs());
    const uncertain = createDispatcher({
      db,
      service,
      worker: {
        ...worker,
        submitOnce: async x => {
          await worker.submitOnce(x);
          throw new Error("connection lost");
        },
      },
    });
    await assert.rejects(uncertain.dispatch("alice", op.operationId));
    assert.equal((await service.getAccount("alice")).reserved, 1);
    await worker.finish(op.operationId, "succeeded");
    await dispatcher.reconcile("alice", op.operationId);
    assert.equal((await db.collection("credits_v2_worker_executions").get()).size, 1);
    assert.equal((await service.getAccount("alice")).totals.consumed, 1);
  });
  it("keeps uncertainty held after a crash before actual submission", async () => {
    await enroll();
    const op = await service.reserve("alice", reserveArgs());
    await service.start("alice", op.operationId);
    assert.equal((await dispatcher.reconcile("alice", op.operationId)).state, "unknown");
    assert.equal((await service.getAccount("alice")).reserved, 1);
    await assert.rejects(
      service.settle("alice", op.operationId, "cancelled"),
      code("WORKER_TERMINATION_REQUIRED")
    );
  });
  it("rejects wrong execution binding and untrusted settlement without consuming credits", async () => {
    await enroll();
    const op = await service.reserve("alice", reserveArgs());
    const execution = await dispatcher.dispatch("alice", op.operationId);
    await assert.rejects(
      service.attachExecution("alice", op.operationId, "another"),
      code("EXECUTION_CONFLICT")
    );
    await assert.rejects(
      service.settle("alice", op.operationId, "succeeded"),
      code("UNVERIFIED_WORKER_OUTCOME")
    );
    await assert.rejects(
      service.settle("alice", op.operationId, "succeeded", "another"),
      code("UNVERIFIED_WORKER_OUTCOME")
    );
    assert.equal((await service.getAccount("alice")).reserved, 1);
    assert.ok(execution.executionId);
  });
  it("rejects substituted worker ownership and cross-user reconciliation", async () => {
    await enroll();
    const op = await service.reserve("alice", reserveArgs());
    await dispatcher.dispatch("alice", op.operationId);
    const forged = createDispatcher({
      db,
      service,
      worker: { find: async id => ({ ...(await worker.find(id)), userId: "mallory" }) },
    });
    await assert.rejects(
      forged.reconcile("alice", op.operationId),
      code("UNVERIFIED_WORKER_OUTCOME")
    );
    await assert.rejects(
      dispatcher.reconcile("mallory", op.operationId),
      code("OPERATION_NOT_FOUND")
    );
  });
  it("refunds a confirmed cross-month failure once and retains its original infrastructure cost", async () => {
    await enroll();
    const op = await service.reserve("alice", reserveArgs());
    await dispatcher.dispatch("alice", op.operationId);
    clock = Date.UTC(2026, 10, 1);
    await worker.finish(op.operationId, "failed");
    await dispatcher.reconcile("alice", op.operationId);
    await dispatcher.reconcile("alice", op.operationId);
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 16);
    assert.equal(a.totals.refunded, 1);
    assert.equal(
      (await db.collection("credits_v2_budgets").doc("2026-10").get()).data().spentMicros,
      1000
    );
  });
  it("spends one monthly balance across all supported tools in a day without feature quotas", async () => {
    await enroll();
    for (const op of Object.keys(policy.operations))
      await dispatcher.runMock("alice", reserveArgs(crypto.randomUUID(), op, 1));
    while ((await service.getAccount("alice")).balance > 0)
      await dispatcher.runMock("alice", reserveArgs());
    assert.equal((await service.getAccount("alice")).totals.consumed, 15);
    await assert.rejects(dispatcher.runMock("alice", reserveArgs()), code("INSUFFICIENT_CREDITS"));
  });
});
describe("trusted metadata quotes and Queue to Publisher handoff", () => {
  it("derives processing cost from a versioned server source, ignoring browser units", async () => {
    await enroll();
    await seedSource();
    const admission = createAdmission({ db, service, now });
    const q = await admission.quote("alice", {
      sourceId: "source1",
      operation: "studio.render",
      units: 0,
    });
    assert.equal(q.units, 21);
    const op = await admission.reserveApproved("alice", {
      quoteId: q.quoteId,
      requestId: "derived",
      approvedCredits: q.credits,
      pricingRevision: q.pricingRevision,
      units: 0,
    });
    assert.equal(op.units, 21);
    assert.equal(op.sourceFingerprint, q.sourceFingerprint);
    assert.equal(op.sourceDescriptor.objectGeneration, "1");
    assert.equal(op.sourceDescriptor.contentHash, "a".repeat(64));
  });
  it("rejects cheaper price consent, stale sources, expired quotes and foreign quotes", async () => {
    await enroll();
    await seedSource();
    const admission = createAdmission({ db, service, now });
    const q = await admission.quote("alice", { sourceId: "source1", operation: "clips.analyze" });
    const args = {
      quoteId: q.quoteId,
      requestId: "q",
      approvedCredits: q.credits,
      pricingRevision: q.pricingRevision,
    };
    await assert.rejects(
      admission.reserveApproved("alice", { ...args, approvedCredits: 0 }),
      code("PRICE_CHANGED")
    );
    await assert.rejects(admission.reserveApproved("mallory", args), code("QUOTE_NOT_FOUND"));
    await seedSource("alice", "source1", { objectGeneration: "2" });
    await assert.rejects(admission.reserveApproved("alice", args), code("SOURCE_CHANGED"));
    clock += 600001;
    await assert.rejects(admission.reserveApproved("alice", args), code("QUOTE_EXPIRED"));
  });
  it("rejects GPU/unversioned sources, foreign ownership, Cam Combiner and invalid destinations", async () => {
    await enroll();
    const admission = createAdmission({ db, service, now });
    await seedSource("alice", "gpu", { gpu: true });
    await assert.rejects(
      admission.quote("alice", { sourceId: "gpu", operation: "studio.render" }),
      code("UNCALIBRATED_RESOURCE")
    );
    await seedSource("alice", "bad", { objectGeneration: "" });
    await assert.rejects(
      admission.quote("alice", { sourceId: "bad", operation: "studio.render" }),
      code("UNVERSIONED_SOURCE")
    );
    await seedSource();
    await assert.rejects(
      admission.quote("mallory", { sourceId: "source1", operation: "studio.render" }),
      code("SOURCE_NOT_FOUND")
    );
    await assert.rejects(
      admission.quote("alice", { sourceId: "source1", operation: "cam-combiner" }),
      code("UNSUPPORTED_OPERATION")
    );
    for (const destinations of [["youtube", "youtube"], ["unknown"], []])
      await assert.rejects(
        admission.quote("alice", {
          sourceId: "source1",
          operation: "publisher.publish",
          destinations,
        }),
        code("INVALID_DESTINATIONS")
      );
  });
  it("binds idempotency to the source and hands Queue work to Publisher without a second reserve", async () => {
    await enroll();
    await seedSource();
    await seedSource("alice", "source2");
    const admission = createAdmission({ db, service, now });
    const q = await admission.quote("alice", {
      sourceId: "source1",
      operation: "queue.dispatch",
      destinations: ["youtube"],
    });
    const args = {
      quoteId: q.quoteId,
      requestId: "publish-unit",
      approvedCredits: q.credits,
      pricingRevision: q.pricingRevision,
    };
    const op = await admission.reserveApproved("alice", args);
    const before = (await service.getAccount("alice")).balance;
    const handed = await admission.continueOperation("alice", op.operationId);
    assert.equal(handed.operationId, op.operationId);
    assert.equal((await service.getAccount("alice")).balance, before);
    const other = await admission.quote("alice", {
      sourceId: "source2",
      operation: "queue.dispatch",
      destinations: ["youtube"],
    });
    await assert.rejects(
      admission.reserveApproved("alice", { ...args, quoteId: other.quoteId }),
      code("IDEMPOTENCY_CONFLICT")
    );
  });
});
describe("ad availability, provider trust and costs", () => {
  const authed = app =>
    request(app)
      .post("/api/rewards")
      .set("X-Credits-Sandbox", "local")
      .set("X-Credits-Sandbox-User", "demo-free");
  it("releases no-fill/unsupported/blocked/timeout reward holds without spending the monthly allowance", async () => {
    await enroll("demo-free");
    const app = createSandboxApp({
      service,
      verifier,
      dispatcher,
      origin: "http://127.0.0.1:8190",
      now,
    });
    for (const availability of ["no_fill", "unsupported", "blocked", "timeout"]) {
      const response = await authed(app).send({ consent: true, availability }).expect(200);
      assert.equal(response.body.status, "unavailable");
      const a = await service.getAccount("demo-free");
      assert.equal(a.balance, 15);
      assert.equal(a.adsRemaining, 20);
      assert.equal(a.activeReward, null);
      assert.equal(
        (await db.collection("credits_v2_budgets").doc("2026-10").get()).data().pendingRewardMicros,
        0
      );
    }
  });
  it("rejects an unreviewed provider adapter even before reward processing", () => {
    assert.throws(
      () =>
        createWalletService({
          db,
          policy,
          now,
          verifier: { provider: "google-web", verify: () => ({ completed: true }) },
        }),
      code("PROVIDER_ADAPTER_NOT_REVIEWED")
    );
  });
  it("never accepts a GPT event, timer or local client claim as Google proof", async () => {
    await enroll("demo-free");
    const app = createSandboxApp({
      service,
      verifier,
      dispatcher,
      origin: "http://127.0.0.1:8190",
      now,
    });
    for (const proof of [
      { event: "rewardedSlotGranted", amount: 999 },
      { completed: true },
      { signature: "our-hmac", completed: true },
    ])
      await request(app)
        .post("/api/rewards/google-completion")
        .set("X-Credits-Sandbox", "local")
        .set("X-Credits-Sandbox-User", "demo-free")
        .send(proof)
        .expect(403);
    assert.equal((await service.getAccount("demo-free")).totals.earned, 0);
  });
  it("provides no numerical production recommendation without complete per-operation cost evidence", () => {
    const result = analyseCostEvidence({ microsPerCredit: 1000 });
    for (const value of Object.values(result.operations))
      assert.equal(value.recommendedCredits, null);
    const sample = {
      operationId: "fixture",
      operation: "studio.render",
      outcome: "succeeded",
      evidenceType: "billing_export",
      costMicros: { cpu: 1000 },
    };
    assert.throws(() => analyseCostEvidence({ microsPerCredit: 1000, samples: [sample] }));
  });
  it("includes failed-operation evidence, margin and duplicate/overflow rejection in cost review", () => {
    const costs = cpu => Object.fromEntries(COMPONENTS.map(c => [c, c === "cpu" ? cpu : 0]));
    const samples = [
      {
        operationId: "fixture1",
        operation: "studio.render",
        outcome: "succeeded",
        evidenceType: "billing_export",
        costMicros: costs(1000),
      },
      {
        operationId: "fixture2",
        operation: "studio.render",
        outcome: "failed",
        evidenceType: "provider_invoice",
        costMicros: costs(10000),
      },
    ];
    assert.equal(
      analyseCostEvidence({ microsPerCredit: 1000, samples }).operations["studio.render"]
        .recommendedCredits,
      null
    );
    const r = analyseCostEvidence({
      microsPerCredit: 1000,
      samples,
      enforcedCeilingMicros: { "studio.render": 10000 },
    });
    assert.equal(r.operations["studio.render"].recommendedCredits, 13);
    assert.equal(r.operations["studio.render"].failedSamples, 1);
    assert.equal(r.commerciallyApproved, false);
    assert.throws(() =>
      analyseCostEvidence({ microsPerCredit: 1000, samples: [samples[0], samples[0]] })
    );
    assert.throws(() =>
      analyseCostEvidence({
        microsPerCredit: 1,
        samples: [
          {
            ...samples[0],
            costMicros: { ...costs(Number.MAX_SAFE_INTEGER), gpu: Number.MAX_SAFE_INTEGER },
          },
        ],
      })
    );
  });
  it("recognises every repaired hosted-runtime marker", () => {
    for (const changes of [
      { RENDER_SERVICE_ID: "svc" },
      { RENDER_EXTERNAL_HOSTNAME: "host" },
      { RENDER: " TRUE " },
      { FUNCTION_TARGET: "handler" },
      { K_SERVICE: "worker" },
    ])
      assert.throws(() => assertSandbox({ ...process.env, ...changes }), code("SANDBOX_ONLY"));
  });
});
