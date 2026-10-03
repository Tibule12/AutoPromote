const crypto = require("crypto");
const { db } = require("../firebaseAdmin");
const { getOwnedStudioSourceBinding } = require("./studioDirectorProjectBinding");
const {
  getOwnedSourceShotArtifact,
  projectSourceShotAnalysis,
} = require("./studioSourceShotArtifactService");

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,159}$/;
const validHash = value => typeof value === "string" && HASH.test(value);
const ENGINE = "opencv-yunet-source-shot-follow";
const scopedId = value =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 160 &&
  value === value.trim() &&
  value !== "." &&
  value !== ".." &&
  !/[\x00-\x1f\x7f/]/.test(value);
const CORE_KEYS = [
  "schemaVersion",
  "ownerUid",
  "projectId",
  "sourceAssetId",
  "sourceSha256",
  "streamId",
  "analysisType",
  "producer",
  "engine",
  "modelRevision",
  "configHash",
  "dependencyHashes",
  "contentHash",
  "analysisRange",
  "coveredIntervals",
  "failedIntervals",
  "coverageBasis",
  "sampleCoverage",
  "projection",
];
const stableStringify = value =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map(key => [key, item[key]])
        )
      : item
  );
const digest = value => crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
const exact = (value, keys) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const errorFor = (code, statusCode) => Object.assign(new Error(code), { code, statusCode });
const invalid = () => errorFor("STUDIO_ANALYSIS_ARTIFACT_INVALID", 400);
const unavailable = () => errorFor("STUDIO_ANALYSIS_ARTIFACT_UNAVAILABLE", 503);
const unverified = () => errorFor("STUDIO_ANALYSIS_SOURCE_UNVERIFIED", 409);
const alreadyExists = error => [6, "already-exists", "ALREADY_EXISTS"].includes(error?.code);
const tick = seconds => {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) throw invalid();
  const value = Math.round(seconds * 90_000);
  if (!Number.isSafeInteger(value)) throw invalid();
  return value;
};
const validRange = range =>
  exact(range, ["space", "startTick", "endTick"]) &&
  range.space === "source" &&
  Number.isSafeInteger(range.startTick) &&
  Number.isSafeInteger(range.endTick) &&
  range.startTick >= 0 &&
  range.endTick > range.startTick &&
  range.endTick - range.startTick <= 900 * 90_000;
const validCore = core =>
  exact(core, CORE_KEYS) &&
  core.schemaVersion === 1 &&
  [core.ownerUid, core.producer, core.engine, core.modelRevision].every(
    value => typeof value === "string" && ID.test(value)
  ) &&
  scopedId(core.projectId) &&
  scopedId(core.sourceAssetId) &&
  [core.sourceSha256, core.configHash, core.contentHash].every(validHash) &&
  core.streamId === null &&
  core.analysisType === "source_shots" &&
  core.producer === "studio-face-tracking-python" &&
  core.engine === ENGINE &&
  core.modelRevision === ENGINE &&
  Array.isArray(core.dependencyHashes) &&
  core.dependencyHashes.length === 1 &&
  validHash(core.dependencyHashes[0]) &&
  validRange(core.analysisRange) &&
  Array.isArray(core.coveredIntervals) &&
  core.coveredIntervals.length === 0 &&
  Array.isArray(core.failedIntervals) &&
  core.failedIntervals.length <= 1 &&
  core.failedIntervals.every(
    range =>
      validRange(range) &&
      range.startTick >= core.analysisRange.startTick &&
      range.endTick === core.analysisRange.endTick
  ) &&
  core.coverageBasis === "sampled_observations_only" &&
  typeof core.sampleCoverage === "number" &&
  Number.isFinite(core.sampleCoverage) &&
  core.sampleCoverage >= 0 &&
  core.sampleCoverage <= 1 &&
  exact(core.projection, [
    "sceneCutTicks",
    "decodeFailureCount",
    "reviewRequired",
    "preflightPassed",
  ]) &&
  Array.isArray(core.projection.sceneCutTicks) &&
  core.projection.sceneCutTicks.length <= 2000 &&
  core.projection.sceneCutTicks.every(
    (value, index) =>
      Number.isSafeInteger(value) &&
      value > core.analysisRange.startTick &&
      value < core.analysisRange.endTick &&
      (index === 0 || value > core.projection.sceneCutTicks[index - 1])
  ) &&
  typeof core.projection.reviewRequired === "boolean" &&
  typeof core.projection.preflightPassed === "boolean" &&
  Number.isSafeInteger(core.projection.decodeFailureCount) &&
  core.projection.decodeFailureCount >= 0 &&
  core.projection.decodeFailureCount <= 2000;

const parseAnalysisArtifactRecord = (record, { uid, artifactHash }) => {
  if (
    !record ||
    !validHash(artifactHash) ||
    !exact(record, [...CORE_KEYS, "artifactHash", "createdAt"]) ||
    record.ownerUid !== uid ||
    record.artifactHash !== artifactHash ||
    !validCore(Object.fromEntries(CORE_KEYS.map(key => [key, record[key]]))) ||
    digest(Object.fromEntries(CORE_KEYS.map(key => [key, record[key]]))) !== artifactHash ||
    typeof record.createdAt !== "string" ||
    Number.isNaN(Date.parse(record.createdAt))
  )
    throw unavailable();
  return record;
};

const artifactRef = (firestore, uid, artifactHash) =>
  firestore.collection("users").doc(uid).collection("studioAnalysisArtifacts").doc(artifactHash);

const projectSourceShotAnalysisArtifact = ({
  uid,
  projectId,
  sourceAssetId,
  sourceSha256,
  analysis,
  request,
  sourceShotArtifact,
}) => {
  const shot = projectSourceShotAnalysis({ uid, projectId, sourceAssetId, sourceSha256, analysis });
  if (
    !sourceShotArtifact ||
    sourceShotArtifact.artifactHash !== digest(shot) ||
    sourceShotArtifact.workerResultSha256 !== shot.workerResultSha256 ||
    sourceShotArtifact.projectId !== projectId ||
    sourceShotArtifact.sourceAssetId !== sourceAssetId ||
    sourceShotArtifact.sourceSha256 !== sourceSha256 ||
    !request ||
    request.mode !== "source_shots" ||
    !exact(request.anchors, ["solo"]) ||
    !exact(request.anchors.solo, ["x", "y"]) ||
    [request.anchors.solo.x, request.anchors.solo.y].some(
      value => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100
    ) ||
    tick(request.start) !== shot.analysisRange.startTick ||
    tick(request.end) !== shot.analysisRange.endTick
  )
    throw invalid();

  const failureTicks = analysis.decodeFailures.map(tick);
  if (
    failureTicks.some(
      value => value < shot.analysisRange.startTick || value > shot.analysisRange.endTick
    )
  )
    throw invalid();
  const earliestFailure = failureTicks.length ? Math.min(...failureTicks) : null;
  const failedIntervals =
    earliestFailure === null || earliestFailure === shot.analysisRange.endTick
      ? []
      : [
          {
            space: "source",
            startTick: earliestFailure,
            endTick: shot.analysisRange.endTick,
          },
        ];
  const core = {
    schemaVersion: 1,
    ownerUid: uid,
    projectId,
    sourceAssetId,
    sourceSha256,
    streamId: null,
    analysisType: "source_shots",
    producer: "studio-face-tracking-python",
    engine: shot.engine,
    modelRevision: shot.engine,
    configHash: digest({
      version: 1,
      mode: request.mode,
      startTick: shot.analysisRange.startTick,
      endTick: shot.analysisRange.endTick,
      anchors: request.anchors,
    }),
    dependencyHashes: [sourceShotArtifact.artifactHash],
    contentHash: shot.workerResultSha256,
    analysisRange: shot.analysisRange,
    // The worker reports sampled face coverage, not a continuously decoded
    // interval. Do not present its whole requested range as observed coverage.
    coveredIntervals: [],
    failedIntervals,
    coverageBasis: "sampled_observations_only",
    sampleCoverage: shot.sampleCoverage,
    projection: {
      sceneCutTicks: shot.sceneCutTicks,
      decodeFailureCount: shot.decodeFailures,
      reviewRequired: shot.reviewRequired,
      preflightPassed: shot.preflightPassed,
    },
  };
  if (!validCore(core) || Buffer.byteLength(stableStringify(core)) > 64 * 1024) throw invalid();
  return core;
};

const receiptFor = record => ({
  artifactHash: record.artifactHash,
  projectId: record.projectId,
  sourceAssetId: record.sourceAssetId,
  sourceSha256: record.sourceSha256,
  analysisType: record.analysisType,
  modelRevision: record.modelRevision,
  configHash: record.configHash,
  contentHash: record.contentHash,
  dependencyHashes: record.dependencyHashes,
  analysisRange: record.analysisRange,
  createdAt: record.createdAt,
});

const persistSourceShotAnalysisArtifact = async ({
  uid,
  projectId,
  sourceAssetId,
  sourceSha256,
  analysis,
  request,
  firestore = db,
}) => {
  if (
    typeof uid !== "string" ||
    !ID.test(uid) ||
    !scopedId(projectId) ||
    !scopedId(sourceAssetId) ||
    !validHash(sourceSha256)
  )
    throw invalid();
  let binding, sourceShotArtifact;
  const projected = projectSourceShotAnalysis({
    uid,
    projectId,
    sourceAssetId,
    sourceSha256,
    analysis,
  });
  const shotHash = digest(projected);
  try {
    [binding, sourceShotArtifact] = await Promise.all([
      getOwnedStudioSourceBinding({ uid, projectId, sourceAssetId, firestore }),
      getOwnedSourceShotArtifact({ uid, artifactHash: shotHash, firestore }),
    ]);
  } catch (_) {
    throw unavailable();
  }
  if (!binding || binding.sourceSha256 !== sourceSha256 || !sourceShotArtifact) throw unverified();
  const core = projectSourceShotAnalysisArtifact({
    uid,
    projectId,
    sourceAssetId,
    sourceSha256,
    analysis,
    request,
    sourceShotArtifact,
  });
  const artifactHash = digest(core);
  const ref = artifactRef(firestore, uid, artifactHash);
  const record = { ...core, artifactHash, createdAt: new Date().toISOString() };
  try {
    await ref.create(record);
    return receiptFor(record);
  } catch (error) {
    if (!alreadyExists(error)) throw unavailable();
    let snapshot;
    try {
      snapshot = await ref.get();
    } catch (_) {
      throw unavailable();
    }
    if (!snapshot.exists) throw unavailable();
    return receiptFor(parseAnalysisArtifactRecord(snapshot.data(), { uid, artifactHash }));
  }
};

const getOwnedAnalysisArtifact = async ({ uid, artifactHash, firestore = db }) => {
  if (typeof uid !== "string" || !ID.test(uid) || !validHash(artifactHash)) throw invalid();
  let snapshot;
  try {
    snapshot = await artifactRef(firestore, uid, artifactHash).get();
  } catch (_) {
    throw unavailable();
  }
  return snapshot.exists
    ? parseAnalysisArtifactRecord(snapshot.data(), { uid, artifactHash })
    : null;
};

module.exports = {
  getOwnedAnalysisArtifact,
  persistSourceShotAnalysisArtifact,
  projectSourceShotAnalysisArtifact,
  parseAnalysisArtifactRecord,
};
