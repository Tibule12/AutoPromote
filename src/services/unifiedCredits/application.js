// Opt-in application integration. The ordinary route handlers and services still run.
// Async context replaces only their legacy credit/usage calls in the local cohort.
const { AsyncLocalStorage } = require("node:async_hooks");
const crypto = require("node:crypto");
const { assertSandbox } = require("./runtime");
const { fail } = require("./policy");
const storage = new AsyncLocalStorage();
const hash = value =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, stable(value[key])])
    );
  return value;
}
function getApplicationContext(uid) {
  const ctx = storage.getStore();
  if (!ctx) return null;
  assertSandbox(process.env, ctx.db);
  if (process.env.UNIFIED_CREDITS_APPLICATION !== "true") fail("LOCAL_INTEGRATION_DISABLED", 503);
  if (uid && uid !== ctx.uid) fail("CREDIT_IDENTITY_CONFLICT", 403);
  return ctx;
}
function owned(data, uid) {
  const aliases = [data.userId, data.user_id, data.uid].filter(Boolean);
  return aliases.length > 0 && aliases.every(owner => owner === uid);
}
function assertApplicationDatabase(candidate) {
  const ctx = getApplicationContext();
  if (!ctx) return;
  if (typeof candidate === "function") candidate = candidate();
  assertSandbox(process.env, candidate);
  if (candidate !== ctx.db) fail("APPLICATION_DATABASE_CONFLICT", 503);
}
function assertApplicationTransport(url) {
  if (getApplicationContext() && !/^http:\/\/127\.0\.0\.1:[0-9]{1,5}$/.test(url || ""))
    fail("APPLICATION_TRANSPORT_CONFLICT", 503);
}
function applicationCreditRoute(operation, applicationDatabase) {
  return async (req, res, next) => {
    if (process.env.UNIFIED_CREDITS_APPLICATION !== "true") return next();
    try {
      assertSandbox();
      const integration = req.app.locals.sharedCreditPilot;
      if (!integration) fail("LOCAL_INTEGRATION_NOT_CONFIGURED", 503);
      if (applicationDatabase)
        integration.assertDatabase(
          typeof applicationDatabase === "function" ? applicationDatabase() : applicationDatabase
        );
      return await integration.enter(operation, req, res, next);
    } catch (error) {
      return next(error);
    }
  };
}

function createApplicationIntegration({
  db,
  service,
  admission,
  cohort,
  workerVerifier = null,
  sourceGateway = null,
  afterResponse = null,
  recoverOutcome = null,
}) {
  assertSandbox(process.env, db);
  if (!/^http:\/\/127\.0\.0\.1:[0-9]{1,5}$/.test(process.env.MEDIA_WORKER_URL || ""))
    fail("LOOPBACK_MEDIA_WORKER_REQUIRED");
  if (!service.policy.lifetimeSpendMicros) fail("PILOT_TOTAL_BUDGET_REQUIRED");
  if (service.policy.rewardsDisabled !== true) fail("AD_INDEPENDENT_PILOT_REQUIRED");
  if (
    !Array.isArray(cohort) ||
    !cohort.length ||
    cohort.length > 10 ||
    !cohort.every(uid => /^demo-pilot-[a-z0-9-]{1,40}$/.test(uid))
  )
    fail("DEMO_COHORT_REQUIRED");
  const steps = db.collection("credits_v2_application_steps");
  const receipts = db.collection("credits_v2_application_receipts");
  const executionId = id => `application-${id}`;
  const api = {
    allowsStudioSource(uid) {
      assertSandbox(process.env, db);
      return process.env.UNIFIED_CREDITS_APPLICATION === "true" && cohort.includes(uid);
    },
    assertDatabase(candidate) {
      assertSandbox(process.env, candidate);
      if (candidate !== db) fail("APPLICATION_DATABASE_CONFLICT", 503);
    },
    requestGuard(req, res, next) {
      if (process.env.UNIFIED_CREDITS_APPLICATION !== "true") return next();
      try {
        assertSandbox(process.env, db);
        if (!cohort.includes(req.user?.uid)) fail("PILOT_COHORT_REQUIRED", 403);
        const target = `${req.method} ${req.path}`;
        const allowed = new Set([
          "POST /api/content/upload",
          "POST /api/media/process",
          "POST /api/clips/analyze",
          "POST /api/clips/generate",
          "POST /api/promotion-tasks/platform/enqueue",
          "POST /api/credit-pilot/quote",
          "POST /api/credit-pilot/prepare",
          "POST /api/media/analyze",
          "POST /api/media/render-clip",
          "GET /api/credit-pilot/account",
          "GET /api/content/my-content",
          "GET /api/clips/history",
          "GET /api/clips/user",
        ]);
        if (
          !allowed.has(target) &&
          !/^GET \/api\/credit-pilot\/operations\/[a-f0-9]{64}$/.test(target) &&
          !/^POST \/api\/credit-pilot\/reconcile\/[a-f0-9]{64}$/.test(target) &&
          !/^GET \/api\/media\/(?:status|viral-render-attempt)\/[^/]+$/.test(target) &&
          !/^POST \/api\/content\/(?:promotion-schedules\/[^/]+\/(?:resume|reschedule|pause)|[^/]+\/promotion-schedules)$/.test(
            target
          )
        )
          fail("OUTSIDE_PILOT_SCOPE", 403);
        return next();
      } catch (error) {
        return next(error);
      }
    },
    async enter(operation, req, res, next) {
      assertSandbox(process.env, db);
      const uid = req.user?.uid;
      req.body = req.body || {};
      if (!cohort.includes(uid) || (req.userId && req.userId !== uid))
        fail("PILOT_COHORT_REQUIRED", 403);
      if (
        [
          "bounty",
          "viral_boost",
          "repost_boost",
          "share_boost",
          "growth_guarantee",
          "monetization_settings",
        ].some(k =>
          k === "bounty"
            ? Number(req.body[k]?.amount || 0) > 0
            : k === "monetization_settings"
              ? Object.entries(req.body[k] || {}).some(
                  ([field, value]) =>
                    !(field === "niche" && value === "general") &&
                    value !== false &&
                    value !== "" &&
                    value !== 0 &&
                    value != null
                )
              : req.body[k]
        )
      )
        fail("UNPRICED_PILOT_FEATURE", 400);
      let op,
        handoff = false;
      const continued = req.get("X-Credits-Operation");
      if (continued) {
        if (operation !== "queue.dispatch") fail("INVALID_HANDOFF", 409);
        op = await service.getOperation(uid, continued);
        const scheduleId = req.params.id;
        const schedule = scheduleId
          ? await db.collection("promotion_schedules").doc(scheduleId).get()
          : null;
        if (
          schedule?.exists &&
          owned(schedule.data(), uid) &&
          schedule.data().creditOperationId === continued
        ) {
          if (op.state !== "running") fail("HANDOFF_ALREADY_SETTLED", 409);
          return next(); // Time/pause changes reuse a previously funded delivery, never another charge.
        }
        const prior = await steps
          .where("operationId", "==", continued)
          .where("operation", "==", "publisher.publish")
          .get();
        const content = prior.docs
          .flatMap(doc => doc.data().bindings || [])
          .find(b => b.collection === "content");
        if (
          op.operation !== "publisher.publish" ||
          !content ||
          req.body.contentId !== content.id ||
          !op.sourceDescriptor.destinations.includes(req.body.platform) ||
          Object.keys(req.body).some(k => !["contentId", "platform"].includes(k))
        )
          fail("INVALID_HANDOFF", 409);
        handoff = true;
      } else {
        op = await admission.reserveApproved(
          uid,
          {
            quoteId: req.get("X-Credits-Quote"),
            requestId: req.get("X-Credits-Request"),
            approvedCredits: Number(req.get("X-Credits-Approved")),
            pricingRevision: req.get("X-Credits-Revision"),
          },
          (quote, source) => {
            if (
              quote.operation !== operation ||
              !source.workflowInput?.requestBody ||
              hash(source.workflowInput.requestBody) !== hash(req.body)
            )
              fail("WORKFLOW_INPUT_CHANGED", 409);
          }
        );
      }
      const stage = handoff ? `${operation}:${req.body.platform}` : operation;
      const ref = steps.doc(hash([op.operationId, stage]));
      const previous = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists) {
          if (snap.data().bodyHash !== hash(req.body)) fail("IDEMPOTENCY_CONFLICT", 409);
          return snap.data();
        }
        tx.create(ref, {
          userId: uid,
          operationId: op.operationId,
          operation,
          bodyHash: hash(req.body),
          bindings: [],
          state: "claimed",
          sandbox: true,
        });
        return null;
      });
      if (previous) {
        if (previous.response) return res.status(previous.statusCode).json(previous.response);
        if (workerVerifier && ["succeeded", "failed"].includes(op.state)) {
          const result = await db
            .collection("credits_v2_application_results")
            .doc(op.operationId)
            .get();
          if (result.exists && result.data().userId === uid)
            return res
              .status(op.state === "succeeded" ? 200 : 500)
              .json({
                success: op.state === "succeeded",
                ...result.data(),
                creditOperationId: op.operationId,
                alreadyProcessed: true,
              });
        }
        return res
          .status(202)
          .json({ operationId: op.operationId, state: "unknown", creditsHeld: true });
      }
      if (!handoff) {
        await service.start(uid, op.operationId);
        await service.attachExecution(uid, op.operationId, executionId(op.operationId));
      } else if (op.state !== "running") fail("HANDOFF_ALREADY_SETTLED", 409);
      const ctx = {
        db,
        uid,
        op,
        service,
        stage,
        workerVerifier,
        sourceGateway,
        async balance() {
          return service.getAccount(uid);
        },
        async confirmNoDispatch() {
          await ref.update({ state: "no_dispatch" });
        },
        async bindJob(collection, id) {
          if (
            ![
              "content",
              "promotion_tasks",
              "video_edits",
              "clip_analyses",
              "generated_clips",
              "promotion_schedules",
            ].includes(collection) ||
            typeof id !== "string" ||
            !id ||
            id.includes("/")
          )
            fail("INVALID_APPLICATION_JOB");
          const doc = await db.collection(collection).doc(id).get();
          if (!doc.exists || !owned(doc.data(), uid)) fail("APPLICATION_JOB_OWNER_CONFLICT", 403);
          if (workerVerifier)
            await doc.ref.set({ creditOperationId: op.operationId }, { merge: true });
          await db.runTransaction(async tx => {
            const snapshot = await tx.get(ref);
            const bindings = snapshot.data().bindings;
            if (!bindings.some(b => b.collection === collection && b.id === id))
              tx.update(ref, { bindings: [...bindings, { collection, id }] });
          });
        },
      };
      const respond = res.json.bind(res);
      res.json = async body => {
        const response = { ...body, creditOperationId: op.operationId };
        try {
          if (afterResponse && res.statusCode < 400) await afterResponse(ctx, operation, req, body);
          const syncSuccess =
            operation === "clips.render" &&
            res.statusCode < 400 &&
            body.success === true &&
            !!body.data?.url;
          const current = await ref.get();
          await ref.update({
            response: JSON.parse(JSON.stringify(response)),
            statusCode: res.statusCode,
            state:
              current.data().state === "no_dispatch"
                ? "no_dispatch"
                : syncSuccess
                  ? "succeeded"
                  : "waiting_for_trusted_jobs",
          });
          if (current.data().state === "no_dispatch") await api.reconcile(uid, op.operationId);
          return respond(response);
        } catch (error) {
          return next(error);
        }
      };
      return storage.run(ctx, next);
    },
    // Only the local test worker/operator can supply this explicit fixture. There
    // is no HTTP endpoint, Google proof or deployable provider verifier here.
    async confirmFixtureOutcome(uid, operationId, collection, id, outcome) {
      assertSandbox(process.env, db);
      if (workerVerifier) fail("FIXTURE_RECEIPTS_DISABLED", 403);
      if (!cohort.includes(uid) || !["succeeded", "failed"].includes(outcome))
        fail("INVALID_LOCAL_OUTCOME");
      const op = await service.getOperation(uid, operationId);
      const records = await steps.where("operationId", "==", operationId).get();
      if (
        !records.docs.some(doc =>
          doc.data().bindings.some(b => b.collection === collection && b.id === id)
        )
      )
        fail("UNBOUND_APPLICATION_JOB", 403);
      const job = await db.collection(collection).doc(id).get();
      if (
        !job.exists ||
        !owned(job.data(), uid) ||
        (outcome === "failed"
          ? job.data().status !== "failed"
          : !["completed", "succeeded"].includes(job.data().status))
      )
        fail("APPLICATION_OUTCOME_CONFLICT", 409);
      const ref = receipts.doc(hash([operationId, collection, id]));
      const value = {
        userId: uid,
        operationId,
        collection,
        id,
        outcome,
        executionId: op.executionId,
        provider: "local-fixture",
        sandbox: true,
      };
      await db.runTransaction(async tx => {
        const previous = await tx.get(ref);
        if (previous.exists) {
          if (hash(previous.data()) !== hash(value)) fail("SETTLEMENT_CONFLICT", 409);
        } else tx.create(ref, value);
      });
    },
    async reconcile(uid, operationId) {
      assertSandbox(process.env, db);
      if (!cohort.includes(uid)) fail("PILOT_COHORT_REQUIRED", 403);
      const op = await service.getOperation(uid, operationId);
      if (["succeeded", "failed", "cancelled"].includes(op.state))
        return { state: op.state, alreadySettled: true };
      if (op.state !== "running") return { state: op.state, creditsHeld: true };
      const snapshots = await steps.where("operationId", "==", operationId).get();
      const records = snapshots.docs.map(doc => doc.data());
      if (!records.length || records.some(s => s.userId !== uid))
        fail("APPLICATION_STATE_CONFLICT", 503);
      if (workerVerifier) {
        const noDispatch = records.every(record => record.state === "no_dispatch");
        const outcome = noDispatch
          ? { state: "failed", noDispatch: true }
          : await workerVerifier.verifyOperation(op);
        if (!["succeeded", "failed"].includes(outcome.state))
          return { state: outcome.state, creditsHeld: true };
        if (recoverOutcome) await recoverOutcome(op, outcome, records);
        return service.settle(uid, operationId, outcome.state, executionId(operationId));
      }
      if (op.operation === "publisher.publish") {
        const handed = records.filter(s => s.operation === "queue.dispatch");
        if (handed.length !== op.sourceDescriptor.destinations.length)
          return { state: "awaiting_queue", creditsHeld: true };
      }
      const outcomes = [];
      for (const step of records) {
        if (step.state === "no_dispatch") {
          outcomes.push("failed");
          continue;
        }
        if (step.operation === "clips.render" && step.state === "succeeded") {
          outcomes.push("succeeded");
          continue;
        }
        const bindings = step.bindings.filter(b => b.collection !== "content");
        if (step.operation === "publisher.publish") continue;
        if (!bindings.length) return { state: "unknown", creditsHeld: true };
        for (const binding of bindings) {
          const job = await db.collection(binding.collection).doc(binding.id).get();
          if (!job.exists || !owned(job.data(), uid)) fail("APPLICATION_JOB_OWNER_CONFLICT", 403);
          const receipt = await receipts
            .doc(hash([operationId, binding.collection, binding.id]))
            .get();
          // A legacy HTTP timeout can mark a job failed while it still runs.
          if (!receipt.exists) return { state: "awaiting_verified_worker", creditsHeld: true };
          const proof = receipt.data();
          if (
            proof.userId !== uid ||
            proof.operationId !== operationId ||
            proof.executionId !== op.executionId ||
            proof.collection !== binding.collection ||
            proof.id !== binding.id ||
            !["succeeded", "failed"].includes(proof.outcome) ||
            proof.provider !== "local-fixture"
          )
            fail("UNVERIFIED_WORKER_OUTCOME", 403);
          outcomes.push(proof.outcome);
        }
      }
      if (!outcomes.length) return { state: "unknown", creditsHeld: true };
      return service.settle(
        uid,
        operationId,
        outcomes.includes("failed") ? "failed" : "succeeded",
        executionId(operationId)
      );
    },
    async reconcilePending(limit = 25) {
      assertSandbox(process.env, db);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail("INVALID_RECONCILE_LIMIT");
      const pending = await db
        .collection("credits_v2_operations")
        .where("userId", "in", cohort)
        .where("state", "==", "running")
        .limit(limit)
        .get();
      const outcomes = [];
      for (const snapshot of pending.docs) {
        const op = snapshot.data();
        try {
          outcomes.push({
            operationId: op.operationId,
            ...(await api.reconcile(op.userId, op.operationId)),
          });
        } catch (error) {
          outcomes.push({
            operationId: op.operationId,
            state: "unknown",
            creditsHeld: true,
            error: error.code || "RECONCILIATION_FAILED",
          });
        }
      }
      return outcomes;
    },
  };
  const express = require("express");
  const rateLimit = require("express-rate-limit");
  const router = express.Router();
  router.use(rateLimit({ windowMs: 60000, max: 240, standardHeaders: true, legacyHeaders: false }));
  router.use(
    ["/quote", "/prepare"],
    rateLimit({ windowMs: 60000, max: 20, standardHeaders: true, legacyHeaders: false })
  );
  router.use((req, res, next) => {
    try {
      assertSandbox(process.env, db);
      if (!cohort.includes(req.user?.uid)) fail("PILOT_COHORT_REQUIRED", 403);
      next();
    } catch (error) {
      next(error);
    }
  });
  router.get("/account", async (req, res) => res.json(await service.getAccount(req.user.uid)));
  router.post("/quote", async (req, res) => {
    if (Object.keys(req.body).some(key => !["sourceId", "operation", "destinations"].includes(key)))
      fail("INVALID_QUOTE_REQUEST");
    res.json(await admission.quote(req.user.uid, req.body));
  });
  if (sourceGateway)
    router.post("/prepare", async (req, res) =>
      res.json(await sourceGateway.prepare(req.user.uid, req.body))
    );
  router.get("/operations/:id", async (req, res) => {
    const op = await service.getOperation(req.user.uid, req.params.id);
    const result = workerVerifier
      ? await db.collection("credits_v2_application_results").doc(req.params.id).get()
      : null;
    res.json({
      ...op,
      ...(result?.exists && result.data().userId === req.user.uid
        ? { workflowResult: result.data() }
        : {}),
    });
  });
  router.post("/reconcile/:id", async (req, res) =>
    res.json(await api.reconcile(req.user.uid, req.params.id))
  );
  api.router = router;
  return api;
}
module.exports = {
  applicationCreditRoute,
  createApplicationIntegration,
  getApplicationContext,
  assertApplicationDatabase,
  assertApplicationTransport,
};
