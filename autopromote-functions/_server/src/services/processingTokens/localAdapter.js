// Reuses the existing signed local-process worker and the canonical renderer.
// This adapter cannot be enabled against production or a paid GPU.
const { assertSandbox } = require("../unifiedCredits/runtime");
const { digest, createLocalProcessVerifier } = require("../unifiedCredits/workerVerification");
const runtime = require("./runtime");
const { fail } = require("../unifiedCredits/policy");
function createLocalAdapter({ db, worker, resolveSource, now = Date.now }) {
  assertSandbox(process.env, db);
  const verifier = createLocalProcessVerifier({ db, ...worker });
  const bindings = db.collection("processing_local_bindings");
  async function reconcile(binding, service) {
    const outcome = await verifier.verifyOperation(binding.op);
    if (!["succeeded", "failed"].includes(outcome.state)) return null;
    const seconds = outcome.evidence.reduce(
      (sum, proof) =>
        sum + (proof.noDispatch ? 0 : Math.max(0, (Date.parse(proof.finishedAt) - Date.parse(proof.startedAt)) / 1000)),
      0
    );
    if (!Number.isFinite(seconds)) fail("VERIFIED_WORKER_DURATION_REQUIRED", 503);
    const modeledMicros = outcome.evidence.every(proof => proof.noDispatch) ? 0 : Math.ceil(seconds * 116) + 1000;
    let delivered = outcome.state === "succeeded";
    if (binding.nativeJobId) {
      const native = (await db.collection("video_edits").doc(binding.nativeJobId).get()).data();
      if (!native || native.userId !== binding.uid || !["completed", "failed", "cancelled"].includes(native.status)) return null;
      delivered = delivered && native.status === "completed";
    }
    const settled = await service.settle(binding.uid, binding.requestId, {
      eventId: digest(outcome.executions),
      success: delivered,
      actualMicros: modeledMicros,
      stopped: true,
    });
    await bindings.doc(binding.op.operationId).set({ state: "settled" }, { merge: true });
    return {
      requestId: settled.requestId,
      consumedTokens: settled.consumedTokens,
      measuredWallSeconds: seconds,
      costBasis: "local-wall-time-reference-estimate",
      actualCloudSpendMicros: 0,
    };
  }
  return {
    async reconcilePending(service) {
      assertSandbox(process.env, db);
      const pending = await bindings.where("state", "==", "pending").limit(25).get();
      for (const doc of pending.docs) await reconcile(doc.data(), service);
    },
    enforcesCostBound: true,
    async handle(req, res, next, q) {
      const ctx = runtime.current();
      try {
        const source = await resolveSource(ctx.uid, req.body);
        // Server-owned descriptors, not browser claims. All media reads are hash-bound.
        if (!source?.sources?.length || !/^[a-f0-9]{64}$/.test(source.contentHash || ""))
          fail("OWNED_SOURCE_REQUIRED", 403);
        ctx.op = {
          operationId: digest([ctx.uid, ctx.reservation.requestId]),
          fingerprint: ctx.reservation.fingerprint,
          sourceDescriptor: { ...source, workflowInput: { sources: source.sources } },
        };
        ctx.stage = q.operation;
        const binding = {
          uid: ctx.uid,
          requestId: ctx.reservation.requestId,
          op: ctx.op,
          state: "pending",
        };
        await bindings.doc(ctx.op.operationId).create(binding);
        ctx.prepare = async (target, body) => {
          if (ctx.dispatched || ctx.preparing || ctx.finalized) fail("WORKER_RETRY_NOT_ALLOWED", 409);
          ctx.preparing = true;
          // Provider owns finite subprocess wall/CPU/file limits. Its configured wall
          // limit must fit the reserved envelope; the caller cannot shorten billing.
          try {
            if (worker.timeoutMs > q.maxSeconds * 1000)
              fail("WORKER_DEADLINE_EXCEEDS_RESERVATION", 503);
            const headers = await verifier.prepare(ctx, target, body);
            // prepare only validates/persists the expected execution; no worker
            // receives credentials until this returns. Claim dispatch last.
            await ctx.service.authorizeDispatch(ctx.uid, ctx.reservation.requestId);
            ctx.dispatched = true;
            return headers;
          } catch (error) {
            await ctx.service.settle(ctx.uid, ctx.reservation.requestId, {
              eventId: "refused-before-credentials", success: false, actualMicros: 0, stopped: true,
            });
            await bindings.doc(ctx.op.operationId).set({state:"settled"},{merge:true});
            ctx.refused = true;
            ctx.finalized = true;
            throw error;
          } finally { ctx.preparing = false; }
        };
        const send = res.json.bind(res);
        res.json = body => {
          (async () => {
            if (typeof body.jobId === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(body.jobId)) {
              binding.nativeJobId = body.jobId;
              await bindings.doc(ctx.op.operationId).set({ nativeJobId: body.jobId }, { merge: true });
            }
            // A queued/uncertain job is still a liability. Polling the durable binding
            // reconciles it after its signed terminal worker receipt becomes available.
            const processing = ctx.dispatched ? await reconcile(binding, ctx.service) : null;
            if (processing) return send({ ...body, processing });
            if (ctx.refused) return send({...body,processing:{state:"refused",requestId:ctx.reservation.requestId}});
            if (!ctx.dispatched && !ctx.preparing && body.reused === true && binding.nativeJobId) {
              const original=(await db.collection("video_edits").doc(binding.nativeJobId).get()).data();
              if (!original || original.userId!==ctx.uid) fail("CACHED_RESULT_OWNERSHIP_REQUIRED",403);
              ctx.finalized=true;
              await ctx.service.settle(ctx.uid,ctx.reservation.requestId,{
                eventId:"owned-native-work-reused",success:true,actualMicros:0,stopped:true,
              });
              await bindings.doc(ctx.op.operationId).set({state:"settled"},{merge:true});
              return send({...body,processing:{state:"reused",consumedTokens:0,requestId:ctx.reservation.requestId}});
            }
            if (!ctx.dispatched && !ctx.preparing && res.statusCode >= 400 && !body.jobId) {
              ctx.finalized=true;
              await ctx.service.settle(ctx.uid, ctx.reservation.requestId, {
                eventId: "refused-before-worker",
                success: false,
                actualMicros: 0,
                stopped: true,
              });
              await bindings.doc(ctx.op.operationId).set({ state: "settled" }, { merge: true });
            }
            return send({
              ...body,
              processing: { state: "pending", requestId: ctx.reservation.requestId },
            });
          })().catch(() =>
            send({
              ...body,
              processing: { state: "uncertain", requestId: ctx.reservation.requestId },
            })
          );
          return res;
        };
        return next();
      } catch (error) {
        // No worker credentials have been issued: this is an undispatched refusal.
        await ctx.service.settle(ctx.uid, ctx.reservation.requestId, {
          eventId: "source-refused",
          success: false,
          actualMicros: 0,
          stopped: true,
        });
        return res
          .status(error.status || 503)
          .json({ error: error.code || "LOCAL_SOURCE_UNAVAILABLE" });
      }
    },
  };
}
module.exports = { createLocalAdapter };
