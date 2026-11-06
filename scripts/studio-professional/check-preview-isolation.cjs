// Real owned-media HTTP lifecycle in fresh loopback Auth/Firestore/Storage.
// No production credentials, fixture receipts, wallets or cloud workloads.
"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  net = require("node:net"),
  assert = require("node:assert/strict"),
  { spawn } = require("node:child_process");
const os = require("node:os");
const root = path.resolve(__dirname, "../.."),
  project = "demo-autopromote-studio-preview";
const sourceFile = process.env.STUDIO_QA_SOURCE_FILE,
  requestFile = process.env.STUDIO_QA_DIALOGUE_REQUEST;
assert(
  sourceFile &&
    requestFile &&
    [sourceFile, requestFile].every(p => path.isAbsolute(p) && fs.statSync(p).isFile()),
  "Set absolute STUDIO_QA_SOURCE_FILE and STUDIO_QA_DIALOGUE_REQUEST paths"
);
const q = fs.mkdtempSync(path.join(os.tmpdir(), "studio-preview-http-check-"));
fs.chmodSync(q, 0o700);
const java = process.env.CREDITS_JAVA_BIN || "java";
require("node:child_process").execFileSync(java, ["-version"], { stdio: "ignore" });
const hash = v => crypto.createHash("sha256").update(v).digest("hex");
async function port() {
  const s = net.createServer();
  await new Promise(r => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise(r => s.close(r));
  return p;
}
async function main() {
  const directory = fs.mkdtempSync(path.join(q, "isolated-preview-emulators-"));
  fs.chmodSync(directory, 0o700);
  const [authPort, storagePort, firestorePort] = await Promise.all([port(), port(), port()]);
  for (const k of [
    "GOOGLE_APPLICATION_CREDENTIALS",
    "FIREBASE_TOKEN",
    "FIREBASE_CONFIG",
    "K_SERVICE",
    "RENDER",
    "CI_ROUTE_IMPORTS",
    "FIREBASE_ADMIN_BYPASS",
    "JEST_WORKER_ID",
  ])
    delete process.env[k];
  Object.assign(process.env, {
    NODE_ENV: "development",
    CHOKIDAR_USEPOLLING: "true",
    GCLOUD_PROJECT: project,
    GOOGLE_CLOUD_PROJECT: project,
    FIREBASE_PROJECT_ID: project,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
    FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${storagePort}`,
    STORAGE_EMULATOR_HOST: `http://127.0.0.1:${storagePort}`,
    FIREBASE_STORAGE_BUCKET: project,
    MULTICAM_INGEST_BUCKET: project,
    ENABLE_BACKGROUND_JOBS: "false",
    STUDIO_SOURCE_DIALOGUE_PREVIEW_ENABLED: "false",
    STUDIO_SOURCE_DIALOGUE_PREVIEW_UIDS: "",
    PATH: path.dirname(java) + ":" + process.env.PATH,
    CUDA_VISIBLE_DEVICES: "",
    OMP_NUM_THREADS: "1",
    OPENBLAS_NUM_THREADS: "1",
    AUTH_TOKEN_CACHE_TTL_MS: "0",
  });
  const output = fs.openSync(path.join(directory, "firestore.private.log"), "a", 0o600);
  const firestore = spawn(
    java,
    [
      "-XX:ActiveProcessorCount=2",
      "-Xmx256m",
      "-jar",
      path.join(os.homedir(), ".cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar"),
      "--host",
      "127.0.0.1",
      "--port",
      String(firestorePort),
      "--project_id",
      project,
      "--rules",
      path.join(root, "firestore.rules"),
    ],
    { cwd: directory, env: process.env, stdio: ["ignore", output, output] }
  );
  const { AuthEmulator } = require("firebase-tools/lib/emulator/auth"),
    { StorageEmulator } = require("firebase-tools/lib/emulator/storage");
  class OwnedStorage extends StorageEmulator {
    getPersistenceTmpDir() {
      return path.join(directory, "storage");
    }
  }
  const auth = new AuthEmulator({
    projectId: project,
    host: "127.0.0.1",
    port: authPort,
    singleProjectMode: 2,
  });
  const storage = new OwnedStorage({
    projectId: project,
    host: "127.0.0.1",
    port: storagePort,
    auto_download: false,
    rules: {
      name: path.join(root, "storage.rules"),
      content: fs.readFileSync(path.join(root, "storage.rules"), "utf8"),
    },
  });
  let appServer, admin, db;
  try {
    await auth.start();
    await storage.start();
    const { EmulatorRegistry } = require("firebase-tools/lib/emulator/registry");
    EmulatorRegistry.getPort = n =>
      n === "auth"
        ? authPort
        : n === "firestore"
          ? firestorePort
          : n === "storage"
            ? storagePort
            : undefined;
    EmulatorRegistry.getInfo = n => ({ host: "127.0.0.1", port: EmulatorRegistry.getPort(n) });
    for (let i = 0; ; i++) {
      try {
        await new Promise((resolve, reject) => {
          const s = net.connect(firestorePort, "127.0.0.1", () => {
            s.end();
            resolve();
          });
          s.once("error", reject);
        });
        break;
      } catch (e) {
        if (i > 200) throw e;
        await new Promise(r => setTimeout(r, 100));
      }
    }
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
        throw Error("ISOLATED_PREVIEW_NONLOOPBACK_DENIED");
      return connect.apply(this, args);
    };
    admin = require("firebase-admin");
    admin.initializeApp({
      projectId: project,
      storageBucket: project,
      credential: { getAccessToken: async () => ({ access_token: "owner", expires_in: 3600 }) },
    });
    db = new (require("@google-cloud/firestore").Firestore)({
      projectId: project,
      host: "127.0.0.1",
      port: firestorePort,
      ssl: false,
      ignoreUndefinedProperties: true,
    });
    const { OAuth2Client } = require("google-auth-library"),
      { Storage } = require("@google-cloud/storage");
    const credential = new OAuth2Client();
    credential.setCredentials({ access_token: "owner", expiry_date: Date.now() + 3600000 });
    const raw = new Storage({ projectId: project, authClient: credential }),
      bucket = raw.bucket(project);
    const cache = (file, exports) => {
      const id = require.resolve(file);
      require.cache[id] = { id, filename: id, loaded: true, exports };
    };
    const facade = {
      auth: () => admin.auth(),
      apps: admin.apps,
      firestore: Object.assign(() => db, {
        FieldValue: admin.firestore.FieldValue,
        Timestamp: admin.firestore.Timestamp,
      }),
      storage: () => ({
        bucket: name => {
          assert(!name || name === project);
          return bucket;
        },
      }),
    };
    cache("firebase-admin", facade);
    cache(path.join(root, "src/firebaseAdmin"), { admin: facade, db, storage: facade.storage() });
    cache(path.join(root, "firebaseAdmin"), { admin: facade, db, storage: facade.storage() });
    const users = ["preview-owner", "preview-other", "preview-unverified"];
    const password = crypto.randomBytes(24).toString("hex"),
      tokens = {};
    for (const uid of users) {
      const email = uid + "@example.test";
      await admin
        .auth()
        .createUser({ uid, email, password, emailVerified: uid !== "preview-unverified" });
      await db
        .collection("users")
        .doc(uid)
        .set({
          email,
          name: uid,
          role: "user",
          subscriptionTier: "free",
          credits: 20,
          emailVerified: uid !== "preview-unverified",
          termsAccepted: true,
          termsAcceptedAt: new Date().toISOString(),
        });
      const r = await fetch(
        `http://127.0.0.1:${authPort}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        }
      );
      const j = await r.json();
      assert(j.idToken);
      tokens[uid] = j.idToken;
    }
    const bytes = fs.readFileSync(sourceFile),
      storagePath = "studio/sources/preview-owner/source.mp4";
    await bucket.file(storagePath).save(bytes, {
      resumable: false,
      metadata: {
        contentType: "video/mp4",
        metadata: { ownerUid: "preview-owner", purpose: "studio_source" },
      },
    });
    const [metadata] = await bucket.file(storagePath).getMetadata();
    const before = await db.collection("users").get(),
      beforeHash = hash(JSON.stringify(before.docs.map(d => [d.id, d.data()])));
    const express = require("express"),
      app = express();
    app.use(
      require("express-rate-limit")({
        windowMs: 60000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
      })
    );
    app.use(express.json({ limit: "2mb" }));
    app.use("/api/media", require(path.join(root, "src/mediaRoutes")));
    appServer = await new Promise(r => {
      const s = app.listen(0, "127.0.0.1", () => r(s));
    });
    const origin = "http://127.0.0.1:" + appServer.address().port,
      request = JSON.parse(fs.readFileSync(requestFile));
    request.projectId = "isolated-preview-owned";
    for (const v of request.voices) {
      v.storagePath = storagePath;
      v.sourceContentHash = hash(bytes);
    }
    const rows = [];
    const post = async (uid, endpoint, input) => {
      const r = await fetch(origin + endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(uid ? { Authorization: "Bearer " + tokens[uid] } : {}),
        },
        body: JSON.stringify(input),
      });
      let body = await r.json();
      return { status: r.status, body, cache: r.headers.get("cache-control") };
    };
    const test = async (name, uid, endpoint, input, status) => {
      const r = await post(uid, endpoint, input);
      assert.equal(
        r.status,
        status,
        JSON.stringify({
          name,
          status: r.status,
          body: r.status === 200 ? { version: r.body.version } : r.body,
        })
      );
      rows.push({ name, status: r.status });
      return r;
    };
    const endpoint = "/api/media/studio-assets/voice-bus-preview";
    await test("missing authentication", null, endpoint, request, 401);
    await test("unverified email", "preview-unverified", endpoint, request, 403);
    await test(
      "source dialogue remains disabled by default",
      "preview-owner",
      endpoint,
      request,
      404
    );
    process.env.STUDIO_SOURCE_DIALOGUE_PREVIEW_ENABLED = "true";
    await test(
      "enabled flag alone cannot activate new CPU work",
      "preview-owner",
      endpoint,
      request,
      404
    );
    process.env.STUDIO_SOURCE_DIALOGUE_PREVIEW_UIDS = users.join(",");
    await test("different owner is rejected", "preview-other", endpoint, request, 403);
    const result = await test(
      "owner uses actual API Auth Storage and CPU helpers",
      "preview-owner",
      endpoint,
      request,
      200
    );
    assert.equal(result.body.sampleCount, 576000);
    assert.equal(result.body.version, 2);
    assert.equal(result.cache, "private, no-store");
    assert.equal(hash(Buffer.from(result.body.voiceBase64, "base64")), result.body.voiceHash);
    assert.deepEqual(
      result.body.sourceGenerations,
      request.voices.map(() => metadata.generation)
    );
    fs.writeFileSync(
      path.join(directory, "owner-voice.wav"),
      Buffer.from(result.body.voiceBase64, "base64"),
      { mode: 0o600 }
    );
    await test(
      "browser URL injection is rejected",
      "preview-owner",
      endpoint,
      { ...request, url: "https://example.invalid/video" },
      422
    );
    await test(
      "changed source digest is rejected",
      "preview-owner",
      endpoint,
      {
        ...request,
        voices: request.voices.map((v, i) => (i ? v : { ...v, sourceContentHash: "0".repeat(64) })),
      },
      409
    );
    const frame = {
      storagePath,
      sourceContentHash: hash(bytes),
      sourceGeneration: metadata.generation,
      start: 4.7,
      end: 12,
      fps: 24,
      frameIndex: 11,
      sampling: "studio-sequence-source-frame-v2",
      programmeStart: 4.7,
      programmeDuration: 12,
    };
    const picture = await test(
      "owned fractional source frame uses actual API and Storage",
      "preview-owner",
      "/api/media/studio-assets/source-frame",
      frame,
      200
    );
    assert.equal(hash(Buffer.from(picture.body.image, "base64")), picture.body.imageContentHash);
    await test(
      "source generation substitution is rejected",
      "preview-owner",
      "/api/media/studio-assets/source-frame",
      { ...frame, sourceGeneration: String(BigInt(metadata.generation) + 1n) },
      409
    );
    await bucket
      .file(storagePath)
      .setMetadata({ metadata: { ownerUid: "preview-other", purpose: "studio_source" } });
    await test(
      "cached preview rechecks changed object ownership",
      "preview-owner",
      endpoint,
      request,
      403
    );
    const after = await db.collection("users").get();
    assert.equal(hash(JSON.stringify(after.docs.map(d => [d.id, d.data()]))), beforeHash);
    for (const collection of [
      "credit_usage",
      "credit_refunds",
      "credits_v2_wallets",
      "payments",
      "user_billing",
    ])
      assert((await db.collection(collection).limit(1).get()).empty);
    const resultSummary = {
      project,
      allHostsLoopback: true,
      auth: "Real Firebase Auth emulator tokens, actual middleware, no bypass headers/test tokens",
      storage: "Real fresh Storage emulator object metadata and bytes",
      firestore:
        "Fresh Firestore emulator and repaired Rules sources; original source collections unchanged after requests",
      tests: rows,
      originalBalancesSubscriptionsUnchanged: true,
      productionWrites: false,
      cloudExecution: false,
      scope:
        "Actual media router and services, local HTTP with real emulator SDKs and canonical CPU helpers; not deployed Auth cryptography/IAM qualification",
    };
    fs.writeFileSync(
      path.join(q, "isolated-preview-http-result.json"),
      JSON.stringify(resultSummary, null, 2)
    );
    console.log(
      JSON.stringify({
        status: "PASS",
        tests: rows.length,
        evidence: path.join(q, "isolated-preview-http-result.json"),
      })
    );
  } finally {
    if (appServer) await new Promise(r => appServer.close(r));
    await db?.terminate().catch(() => {});
    await admin
      ?.app()
      .delete()
      .catch(() => {});
    await Promise.allSettled([auth.stop(), storage.stop()]);
    firestore.kill("SIGTERM");
    fs.closeSync(output);
  }
}
main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e.stack);
    process.exit(1);
  });
