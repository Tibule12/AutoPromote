const crypto = require("crypto");
const axios = require("axios");
const admin = require("firebase-admin");
const { db } = require("../firebaseAdmin");
const { buildWorkerRequestConfig } = require("../utils/cloudRunAuth");
const {
  getOwnedStudioSourceBinding,
  assertOwnedStudioSourceBinding,
} = require("./studioDirectorProjectBinding");
const {
  projectSourceShotAnalysis,
  persistSourceShotArtifact,
} = require("./studioSourceShotArtifactService");
const { persistSourceShotAnalysisArtifact } = require("./studioAnalysisArtifactService");

const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_RESULT_BYTES = 20 * 1024 * 1024;
const MAX_ATTEMPTS = 2;
const LEASE_MS = 15 * 60 * 1000;
const STAGING_TIMEOUT_MS = 60 * 60 * 1000;
const WORKER_TIMEOUT_MS = 12 * 60 * 1000;
const SHA = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,159}$/;
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const studioId = value =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 160 &&
  value === value.trim() &&
  value !== "." &&
  value !== ".." &&
  !/[\x00-\x1f\x7f/]/.test(value);
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const stable = value =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map(key => [key, item[key]])
        )
      : item
  );
const problem = (code, statusCode) => Object.assign(new Error(code), { code, statusCode });
const invalid = () => problem("STUDIO_ANALYSIS_JOB_INVALID", 400);
const unavailable = () => problem("STUDIO_ANALYSIS_JOB_UNAVAILABLE", 503);
const nowIso = () => new Date().toISOString();
const jobRef = (firestore, jobId) => firestore.collection("studio_analysis_jobs").doc(jobId);
const objectPath = (uid, jobId) => `temp/studio-analysis/${uid}/${jobId}.mp4`;
const bucketFor = () => admin.storage().bucket();
const sourceFile = (storage, record) => storage.file(record.sourceObjectPath);
const resultPath = (uid, jobId, resultSha256) =>
  `studio/analysis-results/${uid}/${jobId}/${resultSha256}.json`;
const jobIdFor = (uid, requestId) => hash(`${uid}\0${requestId}`);
const requestFingerprint = request => hash(stable(request));
const publicJob = record => ({
  jobId: record.jobId,
  projectId: record.projectId,
  sourceAssetId: record.sourceAssetId,
  sourceSha256: record.sourceSha256,
  status: record.status,
  attempts: record.attempts,
  maxAttempts: MAX_ATTEMPTS,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  nextAttemptAt: record.nextAttemptAt || null,
  failureCode: record.failureCode || null,
  sourceShotArtifact: record.sourceShotArtifact || null,
  analysisArtifact: record.analysisArtifact || null,
  resultSha256: record.resultSha256 || null,
});

const normalizeRequest = ({
  uid,
  requestId,
  projectId,
  sourceAssetId,
  sourceSha256,
  buffer,
  start,
  end,
  anchors,
  mode = "source_shots",
}) => {
  const solo = anchors?.solo;
  const request = {
    projectId,
    sourceAssetId,
    sourceSha256,
    mode,
    start: Number(start),
    end: Number(end),
    anchors,
  };
  if (
    !ID.test(uid || "") ||
    !requestIdPattern.test(requestId || "") ||
    !studioId(projectId) ||
    !studioId(sourceAssetId) ||
    !SHA.test(sourceSha256 || "") ||
    !Buffer.isBuffer(buffer) ||
    buffer.length < 1 ||
    buffer.length > MAX_SOURCE_BYTES ||
    hash(buffer) !== sourceSha256 ||
    mode !== "source_shots" ||
    !Number.isFinite(request.start) ||
    !Number.isFinite(request.end) ||
    request.start < 0 ||
    request.end <= request.start ||
    request.end - request.start > 900 ||
    !anchors ||
    Object.keys(anchors).length !== 1 ||
    !solo ||
    Object.keys(solo).sort().join() !== "x,y" ||
    ![solo.x, solo.y].every(value => Number.isFinite(value) && value >= 0 && value <= 100)
  )
    throw invalid();
  const qualifiedHash = /:sha256:([a-f0-9]{64})$/.exec(sourceAssetId)?.[1];
  if (sourceAssetId.includes(":sha256:") && qualifiedHash !== sourceSha256)
    throw problem("SOURCE_SHOT_ASSET_HASH_MISMATCH", 409);
  return request;
};

const sameJob = (record, { uid, jobId, fingerprint }) => {
  if (
    record.ownerUid !== uid ||
    record.jobId !== jobId ||
    record.requestFingerprint !== fingerprint
  )
    throw problem("STUDIO_ANALYSIS_IDEMPOTENCY_CONFLICT", 409);
  return record;
};

// The Firestore staging record is created before the GCS object. Repeating the
// same request can finish staging after a process exits between these steps.
const createStudioAnalysisJob = async (input, { firestore = db, storage = bucketFor() } = {}) => {
  const request = normalizeRequest(input);
  const { uid, requestId, buffer } = input;
  const jobId = jobIdFor(uid, requestId);
  const fingerprint = requestFingerprint(request);
  const ref = jobRef(firestore, jobId);
  let snapshot = await ref.get();
  if (snapshot.exists) {
    const prior = sameJob(snapshot.data(), { uid, jobId, fingerprint });
    if (prior.status !== "staging") return publicJob(prior);
  } else {
    const binding = await getOwnedStudioSourceBinding({
      uid,
      projectId: request.projectId,
      sourceAssetId: request.sourceAssetId,
      firestore,
    });
    if (binding && binding.sourceSha256 !== request.sourceSha256)
      throw problem("PROJECT_SOURCE_CONFLICT", 409);
    const timestamp = nowIso();
    const record = {
      schemaVersion: 1,
      jobId,
      ownerUid: uid,
      requestFingerprint: fingerprint,
      ...request,
      sourceObjectPath: objectPath(uid, jobId),
      status: "staging",
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    try {
      await ref.create(record);
    } catch (error) {
      if (![6, "already-exists", "ALREADY_EXISTS"].includes(error?.code)) throw unavailable();
      snapshot = await ref.get();
      if (!snapshot.exists) throw unavailable();
      const prior = sameJob(snapshot.data(), { uid, jobId, fingerprint });
      if (prior.status !== "staging") return publicJob(prior);
    }
  }

  const file = storage.file(objectPath(uid, jobId));
  try {
    await file.save(buffer, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: "video/mp4",
        metadata: {
          ownerUid: uid,
          sourceSha256: request.sourceSha256,
          purpose: "studio-analysis-job",
          jobId,
        },
      },
    });
  } catch (error) {
    if (![412, "conditionNotMet"].includes(error?.code)) throw unavailable();
  }
  const [metadata] = await file.getMetadata();
  if (
    metadata?.metadata?.ownerUid !== uid ||
    metadata?.metadata?.sourceSha256 !== request.sourceSha256 ||
    metadata?.metadata?.jobId !== jobId ||
    Number(metadata.size) !== buffer.length
  )
    throw unavailable();
  const result = await firestore.runTransaction(async transaction => {
    const current = await transaction.get(ref);
    if (!current.exists) throw unavailable();
    const record = sameJob(current.data(), { uid, jobId, fingerprint });
    if (record.status !== "staging") return publicJob(record);
    const updatedAt = nowIso();
    transaction.update(ref, { status: "queued", updatedAt, nextAttemptAt: updatedAt });
    return publicJob({ ...record, status: "queued", updatedAt, nextAttemptAt: updatedAt });
  });
  if (result.status === "cancelled") await file.delete().catch(() => {});
  return result;
};

const getOwnedStudioAnalysisJob = async ({ uid, jobId, firestore = db }) => {
  if (!ID.test(uid || "") || !SHA.test(jobId || "")) throw invalid();
  const snapshot = await jobRef(firestore, jobId).get();
  if (!snapshot.exists || snapshot.data().ownerUid !== uid) return null;
  return publicJob(snapshot.data());
};

const getOwnedStudioAnalysisResult = async ({
  uid,
  jobId,
  firestore = db,
  storage = bucketFor(),
}) => {
  if (!ID.test(uid || "") || !SHA.test(jobId || "")) throw invalid();
  const snapshot = await jobRef(firestore, jobId).get();
  if (!snapshot.exists || snapshot.data().ownerUid !== uid) return null;
  const record = snapshot.data();
  if (
    record.status !== "completed" ||
    !SHA.test(record.resultSha256 || "") ||
    record.analysisArtifact?.contentHash !== record.resultSha256
  )
    throw problem("STUDIO_ANALYSIS_RESULT_NOT_READY", 409);
  const file = storage.file(resultPath(uid, jobId, record.resultSha256));
  const [metadata] = await file.getMetadata();
  if (
    metadata?.metadata?.ownerUid !== uid ||
    metadata?.metadata?.jobId !== jobId ||
    metadata?.metadata?.resultSha256 !== record.resultSha256 ||
    Number(metadata.size) > MAX_RESULT_BYTES ||
    Number(metadata.size) < 1
  )
    throw unavailable();
  const [bytes] = await file.download();
  if (bytes.length > MAX_RESULT_BYTES || hash(bytes) !== record.resultSha256) throw unavailable();
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (_) {
    throw unavailable();
  }
};

const cancelStudioAnalysisJob = async ({ uid, jobId, firestore = db, storage = bucketFor() }) => {
  if (!ID.test(uid || "") || !SHA.test(jobId || "")) throw invalid();
  const ref = jobRef(firestore, jobId);
  const result = await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.data().ownerUid !== uid) return null;
    const record = snapshot.data();
    if (["completed", "failed", "cancelled"].includes(record.status)) return publicJob(record);
    const updated = {
      ...record,
      status: "cancelled",
      updatedAt: nowIso(),
      leaseToken: null,
      leaseUntil: null,
    };
    transaction.update(ref, {
      status: updated.status,
      updatedAt: updated.updatedAt,
      leaseToken: null,
      leaseUntil: null,
    });
    return publicJob(updated);
  });
  if (result?.status === "cancelled") {
    // Repeated cancellation also retries cleanup after an interrupted delete.
    // An in-flight worker may receive a source-read failure; it is fenced from
    // publishing because the job no longer owns a lease.
    await storage
      .file(objectPath(uid, jobId))
      .delete()
      .catch(() => {});
  }
  return result;
};

const claimJob = async ({ jobId, workerId, firestore = db, clock = Date.now }) => {
  if (!SHA.test(jobId || "") || !ID.test(workerId || "")) throw invalid();
  const ref = jobRef(firestore, jobId);
  return firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const record = snapshot.data();
    const now = clock();
    const queued =
      record.status === "queued" &&
      (!record.nextAttemptAt || Date.parse(record.nextAttemptAt) <= now);
    const expired = record.status === "running" && Date.parse(record.leaseUntil || "") <= now;
    if ((!queued && !expired) || record.attempts >= MAX_ATTEMPTS) return null;
    const leaseToken = crypto.randomUUID();
    const leaseUntil = new Date(now + LEASE_MS).toISOString();
    const updated = {
      status: "running",
      attempts: record.attempts + 1,
      leaseToken,
      leaseUntil,
      workerId,
      updatedAt: new Date(now).toISOString(),
      nextAttemptAt: null,
      failureCode: null,
    };
    transaction.update(ref, updated);
    return { ...record, ...updated };
  });
};

const failExhaustedLease = async ({ jobId, firestore, clock }) =>
  firestore.runTransaction(async transaction => {
    const ref = jobRef(firestore, jobId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const record = snapshot.data();
    if (
      record.status !== "running" ||
      record.attempts < MAX_ATTEMPTS ||
      Date.parse(record.leaseUntil || "") > clock()
    )
      return null;
    transaction.update(ref, {
      status: "failed",
      failureCode: "STUDIO_ANALYSIS_LEASE_EXPIRED",
      leaseToken: null,
      leaseUntil: null,
      updatedAt: nowIso(),
    });
    return record;
  });

const ownsLease = (record, token) => record?.status === "running" && record.leaseToken === token;
const renewLease = async ({ jobId, token, firestore = db, clock = Date.now }) =>
  firestore.runTransaction(async transaction => {
    const ref = jobRef(firestore, jobId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || !ownsLease(snapshot.data(), token)) return false;
    transaction.update(ref, { leaseUntil: new Date(clock() + LEASE_MS).toISOString() });
    return true;
  });

const finishJob = async ({ job, patch, firestore = db }) =>
  firestore.runTransaction(async transaction => {
    const ref = jobRef(firestore, job.jobId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || !ownsLease(snapshot.data(), job.leaseToken)) return false;
    transaction.update(ref, { ...patch, leaseToken: null, leaseUntil: null, updatedAt: nowIso() });
    return true;
  });

const callFaceWorker = async (job, signedUrl) => {
  const base =
    process.env.MEDIA_WORKER_URL || "https://media-worker-v1-341498038874.us-central1.run.app";
  const url = `${base}/track-studio-faces`;
  const config = await buildWorkerRequestConfig(url, { timeout: WORKER_TIMEOUT_MS });
  const response = await axios.post(
    url,
    {
      video_url: signedUrl,
      anchors: job.anchors,
      start: job.start,
      end: job.end,
      mode: job.mode,
    },
    config
  );
  return response.data;
};

const permanentFailure = error =>
  [400, 403, 404, 413, 422].includes(error?.response?.status) ||
  [
    "SOURCE_SHOT_ANALYSIS_INVALID",
    "STUDIO_ANALYSIS_ARTIFACT_INVALID",
    "PROJECT_SOURCE_CONFLICT",
    "SOURCE_SHOT_ASSET_HASH_MISMATCH",
    "STUDIO_ANALYSIS_SOURCE_UNVERIFIED",
    "STUDIO_ANALYSIS_RESULT_INVALID",
  ].includes(error?.code);

const processStudioAnalysisJob = async ({
  jobId,
  workerId,
  firestore = db,
  storage = bucketFor(),
  runWorker = callFaceWorker,
  clock = Date.now,
}) => {
  const job = await claimJob({ jobId, workerId, firestore, clock });
  if (!job) {
    const exhausted = await failExhaustedLease({ jobId, firestore, clock });
    if (exhausted)
      await sourceFile(storage, exhausted)
        .delete()
        .catch(() => {});
    return null;
  }
  const file = sourceFile(storage, job);
  const interval = setInterval(() => {
    renewLease({ jobId, token: job.leaseToken, firestore, clock }).catch(() => {});
  }, 30000);
  interval.unref?.();
  let terminal = false;
  try {
    const [metadata] = await file.getMetadata();
    if (
      metadata?.metadata?.ownerUid !== job.ownerUid ||
      metadata?.metadata?.sourceSha256 !== job.sourceSha256 ||
      metadata?.metadata?.jobId !== jobId ||
      !Number.isSafeInteger(Number(metadata.size)) ||
      Number(metadata.size) < 1 ||
      Number(metadata.size) > MAX_SOURCE_BYTES
    )
      throw problem("STUDIO_ANALYSIS_SOURCE_UNVERIFIED", 409);
    const [signedUrl] = await file.getSignedUrl({ action: "read", expires: clock() + LEASE_MS });
    const analysis = await runWorker(job, signedUrl);
    const input = {
      uid: job.ownerUid,
      projectId: job.projectId,
      sourceAssetId: job.sourceAssetId,
      sourceSha256: job.sourceSha256,
      analysis,
      firestore,
    };
    const projected = projectSourceShotAnalysis(input);
    const resultBytes = Buffer.from(stable(analysis));
    const resultSha256 = hash(resultBytes);
    if (
      !resultBytes.length ||
      resultBytes.length > MAX_RESULT_BYTES ||
      projected.workerResultSha256 !== resultSha256
    )
      throw problem("STUDIO_ANALYSIS_RESULT_INVALID", 422);
    const current = await jobRef(firestore, jobId).get();
    if (!ownsLease(current.data(), job.leaseToken)) return null;
    await assertOwnedStudioSourceBinding(input);
    const sourceShotArtifact = await persistSourceShotArtifact(input);
    const analysisArtifact = await persistSourceShotAnalysisArtifact({
      ...input,
      request: { mode: job.mode, start: job.start, end: job.end, anchors: job.anchors },
    });
    if (analysisArtifact.contentHash !== resultSha256)
      throw problem("STUDIO_ANALYSIS_RESULT_INVALID", 422);
    const resultFile = storage.file(resultPath(job.ownerUid, jobId, resultSha256));
    try {
      await resultFile.save(resultBytes, {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: "application/json",
          metadata: {
            ownerUid: job.ownerUid,
            jobId,
            resultSha256,
            purpose: "studio-analysis-result",
          },
        },
      });
    } catch (error) {
      if (![412, "conditionNotMet"].includes(error?.code)) throw error;
    }
    const [resultMetadata] = await resultFile.getMetadata();
    if (
      resultMetadata?.metadata?.ownerUid !== job.ownerUid ||
      resultMetadata?.metadata?.jobId !== jobId ||
      resultMetadata?.metadata?.resultSha256 !== resultSha256 ||
      Number(resultMetadata.size) !== resultBytes.length
    )
      throw unavailable();
    terminal = await finishJob({
      job,
      firestore,
      patch: {
        status: "completed",
        sourceShotArtifact,
        analysisArtifact,
        resultSha256,
        failureCode: null,
      },
    });
    return terminal ? { sourceShotArtifact, analysisArtifact } : null;
  } catch (error) {
    const retry = !permanentFailure(error) && job.attempts < MAX_ATTEMPTS;
    const failureCode = /^[A-Z_]+$/.test(error?.code || "")
      ? error.code
      : "STUDIO_ANALYSIS_WORKER_FAILED";
    terminal =
      !retry && (await finishJob({ job, firestore, patch: { status: "failed", failureCode } }));
    if (retry)
      await finishJob({
        job,
        firestore,
        patch: {
          status: "queued",
          failureCode,
          nextAttemptAt: new Date(clock() + 60000).toISOString(),
        },
      });
    return null;
  } finally {
    clearInterval(interval);
    if (terminal) await file.delete().catch(() => {});
    else {
      const snapshot = await jobRef(firestore, jobId)
        .get()
        .catch(() => null);
      if (snapshot?.data()?.status === "cancelled") await file.delete().catch(() => {});
    }
  }
};

const processNextStudioAnalysisJob = async ({
  workerId,
  firestore = db,
  storage = bucketFor(),
  runWorker = callFaceWorker,
  clock = Date.now,
}) => {
  for (const [status, dueField] of [
    ["queued", "nextAttemptAt"],
    ["running", "leaseUntil"],
  ]) {
    const snapshot = await firestore
      .collection("studio_analysis_jobs")
      .where("status", "==", status)
      .where(dueField, "<=", new Date(clock()).toISOString())
      .limit(50)
      .get();
    for (const doc of snapshot.docs) {
      const record = doc.data();
      if (status === "queued" && Date.parse(record.nextAttemptAt || "") > clock()) continue;
      if (status === "running" && Date.parse(record.leaseUntil || "") > clock()) continue;
      const result = await processStudioAnalysisJob({
        jobId: doc.id,
        workerId,
        firestore,
        storage,
        runWorker,
        clock,
      });
      // A claimed job can finish with null when it fails or is cancelled.
      const after = await doc.ref.get();
      if (
        result ||
        after.data()?.attempts > record.attempts ||
        after.data()?.status !== record.status
      )
        return true;
    }
  }
  const stale = await firestore
    .collection("studio_analysis_jobs")
    .where("status", "==", "staging")
    .where("updatedAt", "<=", new Date(clock() - STAGING_TIMEOUT_MS).toISOString())
    .limit(50)
    .get();
  for (const doc of stale.docs) {
    const record = await firestore.runTransaction(async transaction => {
      const snapshot = await transaction.get(doc.ref);
      if (
        !snapshot.exists ||
        snapshot.data().status !== "staging" ||
        Date.parse(snapshot.data().updatedAt) > clock() - STAGING_TIMEOUT_MS
      )
        return null;
      transaction.update(doc.ref, {
        status: "failed",
        failureCode: "STUDIO_ANALYSIS_STAGING_EXPIRED",
        updatedAt: nowIso(),
      });
      return snapshot.data();
    });
    if (record) {
      await sourceFile(storage, record)
        .delete()
        .catch(() => {});
      return true;
    }
  }
  return false;
};

module.exports = {
  MAX_SOURCE_BYTES,
  createStudioAnalysisJob,
  getOwnedStudioAnalysisJob,
  getOwnedStudioAnalysisResult,
  cancelStudioAnalysisJob,
  claimJob,
  renewLease,
  processStudioAnalysisJob,
  processNextStudioAnalysisJob,
  jobIdFor,
};
