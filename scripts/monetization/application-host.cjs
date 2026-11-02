// Actual application routers, isolated demo Auth/Firestore/Storage, no cloud fallback.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = JSON.parse(fs.readFileSync(process.argv[2]));
Object.assign(process.env, config.env);
for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN", "FIREBASE_CONFIG"])
  delete process.env[name];
const {
  assertSandbox,
  createSandboxDatabase,
} = require("../../src/services/unifiedCredits/runtime");
assertSandbox();
const net = require("node:net");
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host =
    typeof first === "object"
      ? first.host || "127.0.0.1"
      : typeof args[1] === "string"
        ? args[1]
        : "127.0.0.1";
  if (!["127.0.0.1", "localhost", "::1"].includes(host))
    throw new Error("NONPRODUCTION_EGRESS_DENIED");
  return connect.apply(this, args);
};
const admin = require("firebase-admin");
const { OAuth2Client } = require("google-auth-library");
admin.initializeApp({
  projectId: "demo-autopromote-credits",
  storageBucket: "demo-autopromote-credits",
  credential: {
    getAccessToken: async () => ({ access_token: "owner", expires_in: 3600 }),
    getCertificate: () => null,
  },
});
const db = createSandboxDatabase();
const { Storage } = require("@google-cloud/storage");
const storageAuth = new OAuth2Client();
storageAuth.setCredentials({ access_token: "owner", expiry_date: Date.now() + 86400000 });
const storage = new Storage({ projectId: "demo-autopromote-credits", authClient: storageAuth });
const rawBucket = storage.bucket("demo-autopromote-credits");
const cache = (file, value) => {
  const id = require.resolve(file);
  require.cache[id] = { id, filename: id, loaded: true, exports: value };
};
const firestore = Object.assign(() => db, {
  FieldValue: admin.firestore.FieldValue,
  Timestamp: admin.firestore.Timestamp,
});
let gateway;
const bucket = new Proxy(rawBucket, {
  get(target, key) {
    if (key === "upload") return async (file, options) => {
      if (options?.destination?.startsWith("temp_studio_3d/") && options.destination.endsWith("/overlay.mov") && fs.statSync(file).size > 100 * 1024 ** 2)
        return require("./upload-local-alpha.cjs")({ file, options, bucket: target, origin: config.storageOrigin, cohort: config.cohort });
      return target.upload(file, options);
    };
    // Firebase's local Storage emulator has no bucket-IAM metadata endpoint.
    // Model its private transport capability; object bytes/metadata still use SDK I/O.
    if (key === "getMetadata")
      return async () => [
        { name: target.name, iamConfiguration: { uniformBucketLevelAccess: { enabled: true } } },
      ];
    if (key === "file")
      return (name, options) => {
        const file = target.file(name, options);
        file.getSignedUrl = async () => {
          const [meta] = await file.getMetadata();
          const uid =
            meta.metadata?.ownerUid ||
            meta.metadata?.userId ||
            config.cohort.find(id => name.split("/").includes(id));
          return [await gateway.signedUrl(uid, name)];
        };
        file.makePublic = async () => {
          throw new Error("PRIVATE_STORAGE_REQUIRED");
        };
        return file;
      };
    const value = target[key];
    return typeof value === "function" ? value.bind(target) : value;
  },
});
const facade = {
  firestore,
  auth: () => admin.auth(),
  apps: admin.apps,
  storage: () => ({
    bucket: name => {
      if (name && name !== bucket.name) throw new Error("DEMO_BUCKET_REQUIRED");
      return bucket;
    },
  }),
};
cache("firebase-admin", facade);
cache("../../src/firebaseAdmin", { admin: facade, db, storage: facade.storage() });
cache("../../firebaseAdmin", { admin: facade, db, storage: facade.storage() });
const { createWalletService } = require("../../src/services/unifiedCredits/wallet");
const { createMockVerifier } = require("../../src/services/unifiedCredits/rewardProof");
const { createAdmission } = require("../../src/services/unifiedCredits/admission");
const { createApplicationIntegration } = require("../../src/services/unifiedCredits/application");
const { createSourceGateway } = require("../../src/services/unifiedCredits/sourceGateway");
const {
  createLocalProcessVerifier,
} = require("../../src/services/unifiedCredits/workerVerification");
const reviewBounds = require('./local-review-bounds.cjs').localReviewBounds(process.env);
if (reviewBounds.longer) {
  // The local wallet must reserve the full enforced local runtime ceiling.
  // Symbolic per-unit test prices remain; no production pricing is loaded.
  for (const operation of ['studio.render', 'clips.render'])
    config.policy.operations[operation].maxUnits = reviewBounds.renderCpuSeconds;
}
const service = createWalletService({
  db,
  policy: config.policy,
  verifier: createMockVerifier(crypto.randomBytes(32).toString("hex")),
});
const admission = createAdmission({ db, service });
gateway = createSourceGateway({
  db,
  bucket: rawBucket,
  origin: config.origin,
  storageOrigin: config.storageOrigin,
  secret: config.sourceSecret,
  cohort: config.cohort,
  admission,
  service,
});
const verifier = createLocalProcessVerifier({ db, ...config.worker });
async function afterResponse(ctx, operation, req, body) {
  if (!["publisher.publish", "queue.dispatch"].includes(operation)) return;
  const source = ctx.op.sourceDescriptor.workflowInput.sources[0];
  const url = await gateway.signedUrl(ctx.uid, source.storagePath);
  const contentId = body.contentId || body.content?.id || body.id || req.body.contentId;
  if (operation === "queue.dispatch" && req.params.id)
    await ctx.bindJob("promotion_schedules", req.params.id);
  for (const schedule of body.schedules || [])
    await ctx.bindJob("promotion_schedules", schedule.id);
  if (operation === "publisher.publish" && contentId) {
    const promotion = require("../../src/promotionService");
    for (const platform of ctx.op.sourceDescriptor.destinations) {
      const schedule = await promotion.schedulePromotion(contentId, {
        platform,
        frequency: "once",
        startTime: new Date().toISOString(),
        timezone: "UTC",
      });
      await db.collection("promotion_schedules").doc(schedule.id).update({
        user_id: ctx.uid,
        creditOperationId: ctx.op.operationId,
        localDeliveryOnly: true,
      });
      await ctx.bindJob("promotion_schedules", schedule.id);
    }
  }
  for (const platform of ctx.op.sourceDescriptor.destinations) {
    const payload = { sourceUrl: url, platform, contentId: contentId || null };
    const headers = await verifier.prepare(
      { ...ctx, stage: `${operation}:${platform}` },
      `${config.worker.origin}/dispatch`,
      payload
    );
    // Local destination only. This never calls a real publishing provider.
    await fetch(`${config.worker.origin}/dispatch`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
}
async function recoverOutcome(op, outcome, records) {
  if (outcome.noDispatch) return;
  let workflowResult = {};
  for (const proof of outcome.evidence) {
    if (op.operation === "clips.analyze" && proof.state === "succeeded")
      workflowResult = { scenes: proof.result.scenes || [] };
    if (proof.output) {
      const bytes = fs.readFileSync(proof.output.path);
      if (
        bytes.length !== proof.output.bytes ||
        crypto.createHash("sha256").update(bytes).digest("hex") !== proof.output.sha256
      )
        throw new Error("OUTPUT_HASH_CONFLICT");
      const { stdout } = await require("node:util").promisify(
        require("node:child_process").execFile
      )(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration:stream=codec_type",
          "-of",
          "json",
          proof.output.path,
        ],
        { timeout: 5000, maxBuffer: 65536 }
      );
      const probe = JSON.parse(stdout);
      if (
        !probe.streams?.some(stream => stream.codec_type === "video") ||
        !Number.isFinite(Number(probe.format?.duration)) ||
        Number(probe.format.duration) <= 0
      )
        throw new Error("UNVERIFIED_MEDIA_ARTIFACT");
      for (const binding of records
        .flatMap(record => record.bindings)
        .filter(binding => binding.collection === "video_edits")) {
        const existing = await db.collection(binding.collection).doc(binding.id).get();
        if (
          existing.data()?.status === "processing" &&
          Date.now() - Date.parse(proof.finishedAt) < 5000
        )
          throw new Error("OUTPUT_DELIVERY_PENDING");
        const storagePath = `studio/exports/${op.userId}/${binding.id}/render.mp4`;
        const file = rawBucket.file(storagePath);
        const [exists] = await file.exists();
        const previous = exists ? (await file.download())[0] : null;
        if (
          !previous ||
          crypto.createHash("sha256").update(previous).digest("hex") !== proof.output.sha256
        )
          await file.save(bytes, {
            metadata: {
              contentType: "video/mp4",
              metadata: {
                ownerUid: op.userId,
                jobId: binding.id,
                sha256: proof.output.sha256,
                purpose: "studio_export",
              },
            },
          });
        const outputUrl = await gateway.signedUrl(op.userId, storagePath);
        await db
          .collection(binding.collection)
          .doc(binding.id)
          .set(
            { status: "completed", outputUrl, outputStoragePath: storagePath, progress: 100 },
            { merge: true }
          );
        workflowResult = {
          ...workflowResult,
          url: outputUrl,
          outputStoragePath: storagePath,
          jobId: binding.id,
        };
      }
    }
  }
  if (outcome.state === "failed")
    for (const binding of records
      .flatMap(record => record.bindings)
      .filter(binding => ["video_edits", "clip_analyses"].includes(binding.collection)))
      await db.collection(binding.collection).doc(binding.id).set(
        {
          status: "failed",
          error: "Verified terminated local worker failure",
          creditSettlement: "shared-wallet",
        },
        { merge: true }
      );
  await db
    .collection("credits_v2_application_results")
    .doc(op.operationId)
    .set({ userId: op.userId, state: outcome.state, ...workflowResult });
  for (const binding of records
    .flatMap(record => record.bindings)
    .filter(binding => binding.collection === "promotion_schedules"))
    await db
      .collection(binding.collection)
      .doc(binding.id)
      .set(
        { status: outcome.state === "succeeded" ? "completed" : "failed", localDeliveryOnly: true },
        { merge: true }
      );
}
const integration = createApplicationIntegration({
  db,
  service,
  admission,
  cohort: config.cohort,
  workerVerifier: verifier,
  sourceGateway: gateway,
  afterResponse,
  recoverOutcome,
});
const express = require("express");
const rateLimit = require("express-rate-limit");
const app = express();
app.locals.sharedCreditPilot = integration;
// Apply before Auth, signed object reads, static files and SPA fallback. Credit
// admission keeps its additional tighter per-operation limits.
app.use(rateLimit({ windowMs: 60000, max: 1200, standardHeaders: true, legacyHeaders: false }));
const localRequestBytes=Number(process.env.CREDITS_LOCAL_MAX_REQUEST_BYTES || 1024*1024);
if(!Number.isSafeInteger(localRequestBytes)||localRequestBytes<512*1024||localRequestBytes>4*1024*1024)
  throw Error('Local request limit must be 512 KiB–4 MiB.');
app.use(express.json({ limit: localRequestBytes }));
// A separately served, immutable candidate build needs real signed-in QA
// before replacing the local App. Opt in only exact loopback origins; normal
// runs retain the single-origin boundary and all existing Auth/admission.
const candidateOrigins = config.previewOrigins || [];
if (!Array.isArray(candidateOrigins) || candidateOrigins.length > 2 || candidateOrigins.some(value => {
  try { const url = new URL(value); return url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.origin !== value; }
  catch { return true; }
})) throw Error('Candidate builds require at most two exact loopback origins.');
if (process.env.STUDIO_BACKGROUND_LONG_DEMO === 'true') {
  const bounds = require('./local-review-bounds.cjs').localReviewBounds(process.env);
  // The Storage emulator's GCS endpoint finalizes the first PUT instead of
  // acknowledging partial GCS chunks. Its bounded local review transfer must
  // therefore send the actual complete bytes in one PUT. Production resumable
  // uploads and the normal ownership/size/hash completion checks are unchanged.
  app.use('/api/media/multicam/uploads/start', (_req, res, next) => {
    const send = res.json.bind(res);
    res.json = body => {
      if (body?.uploadUrl && Number(body.expectedSizeBytes) > 0 &&
          Number(body.expectedSizeBytes) <= bounds.maxSourceBytes &&
          new URL(body.uploadUrl).origin === config.storageOrigin)
        return send({ ...body, chunkSizeBytes: Math.ceil(body.expectedSizeBytes / 262144) * 262144 });
      return send(body);
    };
    next();
  });
}
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin && origin !== config.origin && !candidateOrigins.includes(origin)) return res.sendStatus(403);
  if (origin && candidateOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.vary('Origin');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    const headers = req.get('Access-Control-Request-Headers');
    if (headers && !/^[a-z0-9, _-]{1,2048}$/i.test(headers)) return res.sendStatus(403);
    if (headers) res.set('Access-Control-Allow-Headers', headers);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  res.set("Cache-Control", "no-store");
  next();
});
app.get("/api/credit-pilot/object/:id", async (req, res, next) => {
  try {
    await gateway.stream(req, res);
  } catch (error) {
    next(error);
  }
});
app.use("/api/auth", require("../../src/authRoutes"));
{
  // Match the application's existing public, bounded documentation route.
  // It has no model/provider/project actions; its journal belongs to this demo.
  const { createAssistance } = require("../../src/productAssistance");
  const { privateJournal } = require("../../src/productAssistance/journal");
  app.use("/api/product-assistance", require("../../src/routes/productAssistanceRoutes")({
    service: createAssistance({ journal: privateJournal(path.join(path.dirname(process.argv[2]), "product-help.private.json")) }),
  }));
}
app.use("/api/paypal-subscriptions", (req, res, next) => {
  if (req.method === "GET" && req.path === "/plans")
    return require("../../src/routes/paypalSubscriptionRoutes")(req, res, next);
  return next();
});
const auth = require("../../src/authMiddleware");
app.use("/api", auth, (req, res, next) => {
  if (!config.cohort.includes(req.user.uid)) return res.sendStatus(403);
  // Block every unpriced/provider/admin mutation; allow ordinary own profile and workspace saving.
  if (
    req.method !== "GET" &&
    !(req.path==='/media/studio-3d/preview' && require('../../src/services/studio3DLocal').configuration()) &&
    !(process.env.STUDIO_BACKGROUND_DEMO==='true' && (
      req.path==='/studio/director/projects/revisions' ||
      /^\/media\/studio-subject-masks\/(?:requests$|jobs\/[a-f0-9]{64}\/(?:cancel|subject(?:\/reuse)?)$)/.test(req.path) ||
      /^\/media\/studio-subject-vfx(?:$|\/[A-Za-z0-9_-]{8,128}(?:\/refresh)?$)/.test(req.path))) &&
    !/^\/(?:credit-pilot\/|media\/(?:process|analyze|render-clip|studio-assets\/(?:resolve|source-frame)|multicam\/uploads\/(?:start|complete|abort))$|content\/(?:upload(?:\/(?:source-file|readiness))?$|[^/]+\/promotion-schedules$|promotion-schedules\/[^/]+\/(?:resume|reschedule|pause)$)|users\/me\/accept-terms$|workspaces(?:\/|$))/.test(
      req.path
    )
  )
    return res.status(403).json({ error: "OUTSIDE_PILOT_SCOPE" });
  if (
    req.path === "/media/multicam/uploads/start" &&
    !["studio_source", "studio_project"].includes(req.body?.purpose)
  )
    return res.sendStatus(403);
  next();
});
app.use("/api/credit-pilot", integration.router);
// Clearly labelled local destination; no provider OAuth token or real account.
app.get("/api/platform/status", (_req, res) =>
  res.json({
    raw: {
      facebook: {
        connected: true,
        pages: [{ id: "local-page", name: "Local simulated destination" }],
      },
    },
    summary: { facebook: { connected: true } },
  })
);
app.get("/api/facebook/status", (_req, res) =>
  res.json({ connected: true, pages: [{ id: "local-page", name: "Local simulated destination" }] })
);
app.get("/api/media/scan-preflight", async (req, res) => {
  const account = await service.getAccount(req.user.uid);
  res.json({
    allowed: account.balance > 0,
    balance: account.balance,
    requiredCredits: 1,
    planAllowed: true,
    canAfford: account.balance > 0,
    topUpsAllowed: false,
    planName: "Isolated pilot",
    message: "Exact cost requires the uploaded source quote.",
  });
});
app.use("/api/users", require("../../src/userRoutes"));
app.use("/api/workspaces", require("../../src/routes/workspaceRoutes"));
if(process.env.STUDIO_BACKGROUND_DEMO==='true')app.use("/api/studio/director/projects/revisions",require("../../src/routes/studioProjectRevisionRoutes"));
app.use(
  "/api/content",
  (req, res, next) => {
    if (req.path !== "/upload/source-file") return next();
    const json = res.json.bind(res);
    res.json = async value => {
      if (value.storagePath)
        value.url = value.fileUrl = await gateway.signedUrl(req.user.uid, value.storagePath);
      return json(value);
    };
    next();
  },
  require("../../src/contentRoutes")
);
app.use(
  "/api/media",
  (req, res, next) => {
    if (!/^\/multicam\/uploads\/(?:start|complete)$/.test(req.path)) return next();
    const json = res.json.bind(res);
    res.json = async value => {
      if (value.url && value.storagePath)
        value.url = await gateway.signedUrl(req.user.uid, value.storagePath);
      return json(value);
    };
    next();
  },
  require("../../src/mediaRoutes")
);
app.use("/api/clips", require("../../src/routes/clipRoutes"));
app.use("/api/ai-video", require("../../src/retiredFeatureResponse"));
app.use("/api/analytics", require("../../src/analyticsRoutes"));
// Actual plan/usage presentation against this emulator, with no payment writes.
app.use("/api/paypal-subscriptions", (req, res, next) => {
  if (req.method !== "GET") return res.status(405).json({ error: "DEMO_PAYMENTS_DISABLED" });
  return next();
}, require("../../src/routes/paypalSubscriptionRoutes"));
app.use("/api/promotion-tasks", require("../../src/routes/promotionTaskRoutes"));
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Not available in isolated demonstration" })
);
app.use(express.static(config.build));
app.get("/{*path}", (_req, res) => res.sendFile(path.join(config.build, "index.html")));
app.use((error, _req, res, _next) => {
  console.error(error.stack);
  if (!res.headersSent)
    res.status(error.status || 500).json({ error: error.code || error.message });
});
let busy = false;
const interval = setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    await integration.reconcilePending();
  } finally {
    busy = false;
  }
}, 1000);
(async () => {
  await service.initialiseControl();
  for (const uid of config.cohort) await service.enroll(uid);
  const server = app.listen(new URL(config.origin).port, "127.0.0.1", () =>
    process.send?.({ ready: true })
  );
  fs.writeFileSync(`${process.argv[2]}.api-pid`, String(process.pid), { mode: 0o600 });
  process.once("SIGTERM", () => {
    clearInterval(interval);
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
})().catch(error => {
  console.error(error.stack);
  process.exit(1);
});
