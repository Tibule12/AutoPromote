const runtime = require("../services/processingTokens/runtime");
const { fail } = require("../services/unifiedCredits/policy");
// Unknown mutating media operations fail closed during migration. Project authoring,
// polling, cancellation and supported browser-local editing do not reserve compute.
function cloudOperation(path) {
  if (/^\/api\/media\/(?:estimate|internal\/multicam-job-failed|render-jobs\/[^/]+\/approve|studio-assets\/(?:resolve|source-frame|source-frame-rate|import-render|voice-bus-preview))$/.test(path)) return null;
  if (/^\/api\/clips\/analyze$/.test(path)) return 'clips.analyze';
  if (/^\/api\/clips\/generate$/.test(path)) return 'studio.render';
  if (/^\/api\/clips\/auto-generate$/.test(path)) return 'studio.render';
  if (/^\/api\/media\/preview-(?:silence|music|audio-remix|watermark-cleanup)$/.test(path)) return 'studio.render';
  if (/^\/api\/media\/(analyze)$/.test(path)) return "clips.analyze";
  if (/^\/api\/media\/(render-clip|process)$/.test(path)) return "studio.render";
  if (/^\/api\/media\/extract-audio$/.test(path)) return "audio.extract";
  if (/^\/api\/media\/transcribe(?:-source)?$/.test(path)) return "audio.transcribe";
  if (/^\/api\/media\/multicam\/(?:clean-audio-sync|preflight-sync)$/.test(path)) return "audio.sync";
  if (/^\/api\/media\/render-multicam$/.test(path)) return "multicam.render";
  if (/^\/api\/(captions|hashtags|chat)\//.test(path)) return "captions.generate";
  if (/^\/api\/media\/multicam\/uploads\/(start|complete|abort)$/.test(path)) return null;
  if (/^\/api\/studio\/director\/creative-plan/.test(path)) return "captions.generate";
  if (/^\/api\/media\//.test(path) && !/\/(cancel|reject|review|complete|abort)$/.test(path))
    return "unpriced";
  return null;
}
function createProcessingGuard({ service, authenticate, adapters = {} }) {
  return (req, res, next) => {
    if (runtime.enabled() && req.method === 'GET' && /^\/api\/(?:media\/(?:jobs|render-jobs)\/|clips\/analysis\/)/.test(req.path))
      return authenticate(req,res,async()=>{
        try { await runtime.reconcilePending(req.userId || req.user?.uid); return next(); }
        catch(error) { return res.status(error.status||503).json({error:error.code||'PROCESSING_RECONCILIATION_PENDING'}); }
      });
    if (!runtime.enabled() || !["POST", "PUT", "PATCH"].includes(req.method)) return next();
    if (
      process.env.FREE_FIRST_DEMO === "true" &&
      /^127\.0\.0\.1:/.test(process.env.FIRESTORE_EMULATOR_HOST || "") &&
      /^\/api\/media\/studio-assets\/(resolve|source-frame|source-frame-rate)$/.test(req.path)
    )
      return next();
    const operation = cloudOperation(req.path);
    if (!operation) return next();
    return authenticate(req, res, async () => {
      try {
        const uid = req.userId || req.user?.uid;
        if (!uid || req.user?.claims?.email_verified !== true) fail("VERIFIED_ACCOUNT_REQUIRED", 403);
        const adapter = adapters.select ? adapters.select(operation, req) : adapters[operation];
        const q = service.quote(operation, adapter?.profileId);
        // A configured URL/timeout alone cannot attest worker termination or maximum cost.
        if (!adapter?.enforcesCostBound) fail("BOUNDED_PROCESSING_ADAPTER_REQUIRED", 503);
        adapter.validateQuote?.(q);
        adapter.validateRequest?.(req, q);
        const requestId = req.body?.renderRequestId || req.get("Idempotency-Key");
        const fingerprint = require("../services/unifiedCredits/workerVerification").workerRequestDigest({
          path: req.path, body: req.body,
        });
        const approvedTokens = Number(req.get("X-Processing-Tokens-Approved"));
        let r;
        const reserve=()=>service.reserve(uid, { operation, profileId: q.profileId, requestId, fingerprint, approvedTokens });
        try { r=await reserve(); }
        catch(error) {
          if(error.code!=='CONCURRENT_JOB_LIMIT'||service!==runtime.service())throw error;
          // Reconcile a terminal abandoned worker on demand. No idle timer,
          // repeated :run, or dependency on its original browser remaining open.
          await runtime.reconcilePending();
          r=await reserve();
        }
        if (r.duplicate)
          return res
            .status(409)
            .json({ error: "REQUEST_ALREADY_RESERVED", state: r.state, requestId });
        await service.start(uid, requestId);
        return await runtime.context.run({ uid, service, reservation: r, boundedWorker: adapter }, () =>
          adapter.handle(req, res, next, q)
        );
      } catch (error) {
        return res
          .status(error.status || 503)
          .json({
            error: error.code || "PROCESSING_UNAVAILABLE",
            message:
              "Cloud processing is unavailable for this request. Your projects and supported local editing remain available.",
            localEditingAvailable: true,
          });
      }
    });
  };
}
module.exports = { createProcessingGuard, cloudOperation };
