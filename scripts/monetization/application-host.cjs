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
  limits: config.localMediaLimits,
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
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  if (req.get("Origin") && req.get("Origin") !== config.origin) return res.sendStatus(403);
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
const auth = require("../../src/authMiddleware");
// The exact eight-second preview is local CPU work, with owned emulator
// bytes and the same canonical mastering function used by the real worker.
let audioPreviewActive = false;
app.post('/api/media/preview-audio-remix', auth, async (req,res,next) => {
  let scratch, acquired=false;
  try {
    assertSandbox(process.env,db);
    if (!config.cohort.includes(req.user.uid)) return res.sendStatus(403);
    if (audioPreviewActive) return res.status(429).json({message:'An exact preview is already rendering.'});
    if (req.body.backgroundAudio || req.body.includeVoice === false)
      return res.status(400).json({message:'This isolated preview supports the owned original soundtrack.'});
    const source = await gateway.describeOwnedUrl(req.user.uid,req.body.fileUrl);
    audioPreviewActive = true;
    acquired=true;
    scratch = await fs.promises.mkdtemp(path.join(path.dirname(process.argv[2]),'audio-preview-'));
    const bytes = (await rawBucket.file(source.storagePath).download())[0];
    if (bytes.length !== source.size || crypto.createHash('sha256').update(bytes).digest('hex') !== source.contentHash)
      throw Error('Preview source changed');
    const start = Math.max(0,Number(req.body.startTime)||0), duration = Math.min(8,Math.max(2,Number(req.body.duration)||8));
    const request = {source:path.join(scratch,'source.mp4'),output:path.join(scratch,'preview.m4a'),
      receipt:path.join(scratch,'receipt.json'),settings:req.body.audioRemix,start,duration};
    await fs.promises.writeFile(request.source,bytes,{mode:0o600});
    const requestFile=path.join(scratch,'request.json');await fs.promises.writeFile(requestFile,JSON.stringify(request),{mode:0o600});
    await require('node:util').promisify(require('node:child_process').execFile)(
      process.env.CREDITS_PYTHON_BIN,[path.join(__dirname,'local-audio-preview.py'),requestFile],
      {timeout:60000,maxBuffer:65536,env:{...process.env,CUDA_VISIBLE_DEVICES:'-1'}});
    const storagePath=`studio/previews/${req.user.uid}/${crypto.randomUUID()}.m4a`;
    await rawBucket.upload(request.output,{destination:storagePath,metadata:{contentType:'audio/mp4',metadata:{ownerUid:req.user.uid}}});
    return res.json({preview_url:await gateway.signedUrl(req.user.uid,storagePath),receipt:JSON.parse(await fs.promises.readFile(request.receipt,'utf8'))});
  } catch(error) { next(error); }
  finally { if(acquired)audioPreviewActive=false;if(scratch)await fs.promises.rm(scratch,{recursive:true,force:true}); }
});
app.use("/api", auth, (req, res, next) => {
  if (!config.cohort.includes(req.user.uid)) return res.sendStatus(403);
  // Block every unpriced/provider/admin mutation; allow ordinary own profile and workspace saving.
  if (
    req.method !== "GET" &&
    !/^\/(?:credit-pilot\/|media\/(?:process|analyze|render-clip|studio-assets\/resolve|multicam\/uploads\/(?:start|complete|abort))$|content\/(?:upload(?:\/(?:source-file|readiness))?$|[^/]+\/promotion-schedules$|promotion-schedules\/[^/]+\/(?:resume|reschedule|pause)$)|users\/me\/accept-terms$|workspaces(?:\/|$))/.test(
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
