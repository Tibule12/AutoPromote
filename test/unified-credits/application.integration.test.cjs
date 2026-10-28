const { before, beforeEach, after, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createSandboxDatabase,
  assertSandbox,
} = require("../../src/services/unifiedCredits/runtime");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { createWalletService } = require("../../src/services/unifiedCredits/wallet");
const { createMockVerifier } = require("../../src/services/unifiedCredits/rewardProof");
const { createAdmission } = require("../../src/services/unifiedCredits/admission");
const {
  createApplicationIntegration,
  getApplicationContext,
} = require("../../src/services/unifiedCredits/application");
const express = require("express");
const rateLimit = require("express-rate-limit");
const request = require("supertest");
const db = createSandboxDatabase();
const uid = "demo-pilot-alice";
const hash = (...parts) => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-application-"));
let worker, origin, app, service, admission, integration, clock, legacyBefore;
let workerFailure = false;
let closed = false;
const egress = [];

// Block network connections outside loopback before importing application modules.
const net = require("node:net");
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host =
    typeof first === "object"
      ? first.host || "127.0.0.1"
      : typeof args[1] === "string"
        ? args[1]
        : "127.0.0.1";
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    egress.push(host);
    throw new Error("NONPRODUCTION_EGRESS_DENIED");
  }
  return originalConnect.apply(this, args);
};

function cache(relative, value) {
  const file = require.resolve(relative);
  require.cache[file] = { id: file, filename: file, loaded: true, exports: value };
}
async function terminal(collection, id) {
  for (let i = 0; i < 150; i++) {
    const snap = await db.collection(collection).doc(id).get();
    if (["completed", "failed"].includes(snap.data()?.status)) return snap.data();
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Job did not become terminal: ${collection}/${id}`);
}
async function quote(operation, body, destinations = []) {
  const sourceId = `input-${crypto.randomUUID()}`;
  await db
    .collection("credits_v2_inputs")
    .doc(hash(uid, sourceId))
    .create({
      userId: uid,
      resourceClass: "media-cpu",
      gpu: false,
      contentHash: "a".repeat(64),
      objectGeneration: "1",
      enforcedMaxSeconds: 1,
      allowedDestinations: ["facebook"],
      workflowInput: { requestBody: body },
    });
  const result = await request(app)
    .post("/api/credit-pilot/quote")
    .set("X-Demo-User", uid)
    .send({ sourceId, operation, destinations })
    .expect(200);
  return result.body;
}
function post(url, body, q, requestId = crypto.randomUUID()) {
  return request(app)
    .post(url)
    .set("X-Demo-User", uid)
    .set("X-Credits-Quote", q.quoteId)
    .set("X-Credits-Request", requestId)
    .set("X-Credits-Approved", String(q.credits))
    .set("X-Credits-Revision", q.pricingRevision)
    .send(body);
}

before(async () => {
  const api = express();
  api.use(rateLimit({ windowMs: 60000, max: 1000, standardHeaders: true, legacyHeaders: false }));
  api.use(express.json());
  api.get("/status", (_req, res) => res.json({ status: "ready" }));
  api.get("/health", (_req, res) => res.json({ status: "ok", worker_state: { status: "idle" } }));
  api.post("/analyze-clips", (_req, res) => {
    if (workerFailure) return res.status(500).json({ detail: "Injected terminal worker failure" });
    res.json({
      duration: 1,
      clipSuggestions: [{ id: "clip1", start: 0, end: 1, text: "Fixture", viralScore: 50 }],
    });
  });
  api.post(["/process-video", "/process", "/render-viral", "/render-clip"], (_req, res) => {
    if (workerFailure) return res.status(500).json({ detail: "Injected terminal worker failure" });
    const output = path.join(scratch, `${crypto.randomUUID()}.mp4`);
    fs.writeFileSync(output, "local-boundary-fixture-not-a-qualified-movie");
    res.json({ success: true, output_path: output, duration: 1 });
  });
  api.get("/objects/*path", (_req, res) => res.send("local storage fixture"));
  worker = api.listen(0, "127.0.0.1");
  await new Promise(resolve => worker.once("listening", resolve));
  origin = `http://127.0.0.1:${worker.address().port}`;
  Object.assign(process.env, {
    UNIFIED_CREDITS_APPLICATION: "true",
    MEDIA_WORKER_URL: origin,
    LOCAL_MEDIA_WORKER_URL: origin,
    FIREBASE_STORAGE_BUCKET: "demo-autopromote-credits",
    GOOGLE_CLOUD_PROJECT: "demo-autopromote-credits",
    GCLOUD_PROJECT: "demo-autopromote-credits",
    CI_ROUTE_IMPORTS: "1",
    FIREBASE_ADMIN_BYPASS: "1",
    ENABLE_BACKGROUND_JOBS: "false",
    OPENAI_LOGGING_ENABLED: "1",
    NO_VIRAL_OPTIMIZATION: "true",
  });
  process.env.LOCAL_EDITING_CREDIT_BYPASS = "false";
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.FIREBASE_TOKEN;
  const bucket = {
    name: "demo-autopromote-credits",
    async upload(file) {
      assert.ok(file.startsWith(scratch));
    },
    file(name) {
      return {
        async exists() {
          return [true];
        },
        async getMetadata() {
          return [
            {
              size: "100",
              contentType: "video/mp4",
              generation: "1",
              metadata: { userId: uid, ownerUid: uid, purpose: "studio_source" },
            },
          ];
        },
        async getSignedUrl() {
          return [`${origin}/objects/${encodeURIComponent(name)}`];
        },
        async makePublic() {
          throw new Error("ACL changes forbidden in pilot");
        },
      };
    },
  };
  const firestore = Object.assign(() => db, { FieldValue, Timestamp });
  const admin = {
    firestore,
    apps: [{ name: "explicit-emulator-fixture" }],
    storage: () => ({
      bucket: name => {
        assert.ok(!name || name === bucket.name);
        return bucket;
      },
    }),
    auth: () => {
      throw new Error("Production Auth initialization forbidden");
    },
  };
  cache("firebase-admin", admin);
  cache("../../src/firebaseAdmin", { db, admin, storage: admin.storage() });
  cache("../../firebaseAdmin", { db, admin, storage: admin.storage() });
  cache("../../src/authMiddleware", (req, res, next) => {
    const user = req.get("X-Demo-User");
    if (!/^demo-pilot-[a-z-]+$/.test(user || "")) return res.sendStatus(401);
    req.user = { uid: user, email: `${user}@example.test`, role: "user", isAdmin: false };
    req.userId = user;
    return next();
  });
  // Media transport and Storage are boundary fixtures. The real controller,
  // startProcessingJob and processJobBackground manage the ordinary job records.
  const Editing = require("../../src/services/videoEditingService");
  Editing.prototype.processVideo = async () => {
    if (workerFailure) throw new Error("Injected terminal render failure");
    return { success: true, url: `${origin}/objects/render.mp4` };
  };
  app = express();
  app.use(rateLimit({ windowMs: 60000, max: 1000, standardHeaders: true, legacyHeaders: false }));
  app.use(express.json());
  app.use(require("../../src/authMiddleware"));
  app.use((req, res, next) => app.locals.sharedCreditPilot.requestGuard(req, res, next));
  app.use("/api/credit-pilot", (req, res, next) =>
    app.locals.sharedCreditPilot.router(req, res, next)
  );
  app.use("/api/content", require("../../src/contentRoutes"));
  app.use("/api/media", require("../../src/mediaRoutes"));
  app.use("/api/clips", require("../../src/routes/clipRoutes"));
  app.use("/api/promotion-tasks", require("../../src/routes/promotionTaskRoutes"));
  app.use((err, _req, res, _next) =>
    res.status(err.status || 500).json({ error: err.code || err.message })
  );
});
beforeEach(async () => {
  for (const c of await db.listCollections()) await db.recursiveDelete(c);
  clock = Date.UTC(2026, 9, 27);
  workerFailure = false;
  const policy = {
    ...require("../../config/unified-credits.sandbox.example.json"),
    lifetimeSpendMicros: 50000,
    spendScope: "local-application-pilot-v1",
    rewardsDisabled: true,
  };
  service = createWalletService({
    db,
    policy,
    verifier: createMockVerifier("application-fixture-secret-at-least-32-characters"),
    now: () => clock,
  });
  await service.initialiseControl();
  await service.enroll(uid);
  await service.getAccount(uid);
  admission = createAdmission({ db, service, now: () => clock });
  integration = createApplicationIntegration({ db, service, admission, cohort: [uid] });
  app.locals.sharedCreditPilot = integration;
  legacyBefore = { credits: 47, subscriptionTier: "free", displayName: "Pilot fixture" };
  await db.collection("users").doc(uid).set(legacyBefore);
  await db.collection("user_billing").doc(uid).set({ tier: "free", uploads_this_month: 999 });
});
after(async () => {
  closed = true;
  await new Promise(resolve => worker.close(resolve));
  assertSandbox(process.env, db);
  for (const collection of await db.listCollections()) await db.recursiveDelete(collection);
  await db.terminate();
  fs.rmSync(scratch, { recursive: true, force: true });
  net.Socket.prototype.connect = originalConnect;
});

describe("ordinary application routes with one nonproduction wallet", () => {
  it("publishes content and hands it to the real Queue without a second charge or legacy balance writes", async () => {
    const body = {
      title: "Pilot",
      type: "video",
      url: `${origin}/objects/source.mp4`,
      target_platforms: ["facebook"],
    };
    const q = await quote("publisher.publish", body, ["facebook"]);
    const first = await post("/api/content/upload", body, q, "publisher-request").expect(201);
    const replay = await post("/api/content/upload", body, q, "publisher-request").expect(201);
    assert.equal(first.body.content.id, replay.body.content.id);
    const operationId = first.body.creditOperationId;
    assert.equal((await integration.reconcile(uid, operationId)).state, "awaiting_queue");
    const queued = await request(app)
      .post("/api/promotion-tasks/platform/enqueue")
      .set("X-Demo-User", uid)
      .set("X-Credits-Operation", operationId)
      .send({ contentId: first.body.content.id, platform: "facebook" })
      .expect(200);
    assert.equal((await service.getAccount(uid)).balance, 15 - q.credits);
    assert.equal((await integration.reconcile(uid, operationId)).creditsHeld, true);
    await db.collection("promotion_tasks").doc(queued.body.task.id).update({ status: "completed" });
    assert.equal((await integration.reconcile(uid, operationId)).creditsHeld, true);
    await integration.confirmFixtureOutcome(
      uid,
      operationId,
      "promotion_tasks",
      queued.body.task.id,
      "succeeded"
    );
    const restarted = createApplicationIntegration({ db, service, admission, cohort: [uid] });
    await Promise.all([restarted.reconcilePending(), integration.reconcile(uid, operationId)]);
    assert.equal((await service.getAccount(uid)).totals.consumed, q.credits);
    assert.deepEqual((await db.collection("users").doc(uid).get()).data(), legacyBefore);
    assert.equal(
      (await db.collection("user_billing").doc(uid).get()).data().uploads_this_month,
      999
    );
    assert.equal((await db.collection("credit_usage").get()).size, 0);
    assert.equal((await db.collection("credits_v2_operations").get()).size, 1);
  });
  it("runs ordinary Studio job lifecycle and refunds a verified failure exactly once", async () => {
    const body = {
      sourceStoragePath: `studio/sources/${uid}/source.mp4`,
      options: { renderViral: true },
    };
    const q = await quote("studio.render", body);
    workerFailure = true;
    const r = await post("/api/media/process", body, q).expect(200);
    assert.equal((await terminal("video_edits", r.body.jobId)).status, "failed");
    assert.equal((await integration.reconcile(uid, r.body.creditOperationId)).creditsHeld, true);
    await integration.confirmFixtureOutcome(
      uid,
      r.body.creditOperationId,
      "video_edits",
      r.body.jobId,
      "failed"
    );
    await integration.reconcile(uid, r.body.creditOperationId);
    await integration.reconcile(uid, r.body.creditOperationId);
    assert.equal((await service.getAccount(uid)).balance, 15);
    const control = (await db.collection("credits_v2_control").doc("global").get()).data();
    assert.equal(control.lifetimeSpentMicros, q.maxCostMicros);
    assert.equal(control.lifetimeReservedMicros, 0);
    assert.equal((await db.collection("credit_refunds").get()).size, 0);
  });
  it("runs Find Viral Clips analysis and generation through their ordinary services", async () => {
    const body = { videoUrl: `${origin}/objects/source.mp4`, contentId: "source-content" };
    const q = await quote("clips.analyze", body);
    const r = await post("/api/clips/analyze", body, q).expect(200);
    const analysis = await terminal("clip_analyses", r.body.analysisId);
    assert.equal(analysis.status, "completed");
    await integration.confirmFixtureOutcome(
      uid,
      r.body.creditOperationId,
      "clip_analyses",
      r.body.analysisId,
      "succeeded"
    );
    await integration.reconcile(uid, r.body.creditOperationId);
    const generatedBody = { analysisId: r.body.analysisId, clipId: analysis.clipSuggestions[0].id };
    const renderQuote = await quote("clips.render", generatedBody);
    const generated = await post("/api/clips/generate", generatedBody, renderQuote).expect(200);
    assert.ok(generated.body.data.url.startsWith(origin));
    await integration.reconcile(uid, generated.body.creditOperationId);
    assert.equal((await service.getAccount(uid)).totals.consumed, q.credits + renderQuote.credits);
    assert.equal((await db.collection("generated_clips").get()).size, 1);
    assert.deepEqual((await db.collection("users").doc(uid).get()).data(), legacyBefore);
  });
  it("rejects substituted inputs, unenrolled identities and browser rewards without dispatch", async () => {
    const body = { videoUrl: `${origin}/objects/source.mp4`, contentId: "source-content" };
    const q = await quote("clips.analyze", body);
    await post(
      "/api/clips/analyze",
      { ...body, videoUrl: "https://attacker.example/video" },
      q
    ).expect(409);
    await request(app)
      .post("/api/clips/analyze")
      .set("X-Demo-User", "demo-pilot-bob")
      .send(body)
      .expect(403);
    await assert.rejects(service.beginReward(uid), err => err.code === "REWARDS_PAUSED");
    assert.equal((await service.getAccount(uid)).balance, 15);
    assert.equal((await db.collection("clip_analyses").get()).size, 0);
    assert.equal(getApplicationContext(), null);
  });
  it("keeps the absolute pilot ceiling across renewal and prevents budget reset by policy replacement", async () => {
    const base = require("../../config/unified-credits.sandbox.example.json");
    await db.recursiveDelete(db.collection("credits_v2_control"));
    service = createWalletService({
      db,
      policy: { ...base, spendScope: "tight-budget", lifetimeSpendMicros: 2000 },
      verifier: createMockVerifier("application-fixture-secret-at-least-32-characters"),
      now: () => clock,
    });
    await service.initialiseControl();
    const q = service.quote("queue.dispatch", 1);
    const reserve = id => service.reserve(uid, { ...q, requestId: id, approvedCredits: q.credits });
    const op = await reserve("first");
    await service.start(uid, op.operationId);
    await service.settle(uid, op.operationId, "failed");
    clock = Date.UTC(2026, 10, 1);
    const second = await reserve("second");
    await service.start(uid, second.operationId);
    await service.settle(uid, second.operationId, "succeeded");
    await assert.rejects(reserve("third"), err => err.code === "PILOT_TOTAL_BUDGET_EXCEEDED");
    const replacement = createWalletService({
      db,
      policy: base,
      verifier: createMockVerifier("application-fixture-secret-at-least-32-characters"),
    });
    await assert.rejects(
      replacement.initialiseControl(),
      err => err.code === "PILOT_BUDGET_SCOPE_CONFLICT"
    );
  });
  it("does not route Cam Combiner through the shared wallet", async () => {
    const q = await quote("studio.render", { sourceStoragePath: "unused", options: {} });
    await post("/api/media/render-multicam", {}, q).expect(403);
    assert.equal((await service.getAccount(uid)).balance, 15);
    assert.equal((await db.collection("credits_v2_operations").get()).size, 0);
    assert.equal(closed, false);
    assert.ok(
      egress.every(host => ["169.254.169.254", "metadata.google.internal."].includes(host))
    );
  });
  it("retains legacy credit behaviour outside the local asynchronous request context", async () => {
    require("../../src/services/unifiedCredits/application").assertApplicationDatabase(() => {
      throw new Error("Must not resolve a database outside the pilot context");
    });
    assert.throws(
      () => integration.assertDatabase({ projectId: "autopromote-cc6d3" }),
      error => error.code === "SANDBOX_ONLY"
    );
    const legacy = require("../../src/creditSystem");
    assert.equal((await legacy.getCreditBreakdown(uid)).totalAvailable, 62);
    const result = await legacy.deductCredits(uid, 1, "legacy-regression");
    assert.equal(result.success, true);
    assert.equal((await service.getAccount(uid)).balance, 15);
    assert.equal((await db.collection("credit_usage").get()).size, 1);
  });
  it("never applies a shared-wallet receipt through a later legacy status refund", async () => {
    const legacy = require("../../src/creditSystem");
    const before = (await db.collection("users").doc(uid).get()).data();
    const result = await legacy.refundCredits(
      uid,
      { amount: 50, deferredSettlement: true, unifiedOperationId: "a".repeat(64) },
      "status-poll"
    );
    assert.equal(result.deferredSettlement, true);
    assert.equal(result.success, false);
    assert.deepEqual((await db.collection("users").doc(uid).get()).data(), before);
    assert.equal((await db.collection("credit_refunds").get()).size, 0);
    assert.equal((await service.getAccount(uid)).balance, 15);
  });
  it("disables fixture receipts when an execution verifier is configured", async () => {
    const verified = createApplicationIntegration({
      db,
      service,
      admission,
      cohort: [uid],
      workerVerifier: { provider: "local-process" },
    });
    await assert.rejects(
      verified.confirmFixtureOutcome(uid, "a".repeat(64), "video_edits", "fake", "succeeded"),
      error => error.code === "FIXTURE_RECEIPTS_DISABLED"
    );
  });
  it("refuses the integration in a production-marked runtime without changing the wallet", async () => {
    const body = { videoUrl: `${origin}/objects/source.mp4`, contentId: "source-content" };
    const q = await quote("clips.analyze", body);
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      await post("/api/clips/analyze", body, q).expect(503);
    } finally {
      process.env.NODE_ENV = original;
    }
    assert.equal((await service.getAccount(uid)).balance, 15);
  });
  it("reserves the last lifetime budget atomically across users", async () => {
    await db.recursiveDelete(db.collection("credits_v2_control"));
    const base = require("../../config/unified-credits.sandbox.example.json");
    service = createWalletService({
      db,
      policy: { ...base, spendScope: "race", lifetimeSpendMicros: 1000 },
      verifier: createMockVerifier("application-fixture-secret-at-least-32-characters"),
      now: () => clock,
    });
    await service.initialiseControl();
    await service.enroll("demo-pilot-bob");
    await service.getAccount("demo-pilot-bob");
    const q = service.quote("queue.dispatch", 1);
    const results = await Promise.allSettled(
      [uid, "demo-pilot-bob"].map(user =>
        service.reserve(user, { ...q, requestId: "last-slot", approvedCredits: q.credits })
      )
    );
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(
      results.find(r => r.status === "rejected").reason.code,
      "PILOT_TOTAL_BUDGET_EXCEEDED"
    );
  });
  it("stops new spending at pilot expiry while preserving balances and terminal reconciliation", async () => {
    const base = require("../../config/unified-credits.sandbox.example.json");
    const scoped = createWalletService({
      db,
      policy: {
        ...base,
        spendScope: "local-application-pilot-v1",
        lifetimeSpendMicros: 50000,
        spendingEndsAt: clock + 1,
      },
      verifier: createMockVerifier("application-fixture-secret-at-least-32-characters"),
      now: () => clock,
    });
    const q = scoped.quote("queue.dispatch", 1);
    const first = await scoped.reserve(uid, {
      ...q,
      requestId: "before-expiry",
      approvedCredits: q.credits,
    });
    await scoped.start(uid, first.operationId);
    const queued = await scoped.reserve(uid, {
      ...q,
      requestId: "queued-before-expiry",
      approvedCredits: q.credits,
    });
    clock += 2;
    await assert.rejects(scoped.start(uid, queued.operationId), err => err.code === "PILOT_CLOSED");
    await assert.rejects(
      scoped.reserve(uid, { ...q, requestId: "after-expiry", approvedCredits: q.credits }),
      err => err.code === "PILOT_CLOSED"
    );
    await scoped.settle(uid, first.operationId, "failed");
    await scoped.settle(uid, queued.operationId, "cancelled");
    assert.equal((await scoped.getAccount(uid)).balance, 15);
  });
});
