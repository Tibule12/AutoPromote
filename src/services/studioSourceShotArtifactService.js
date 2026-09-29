const crypto = require("crypto");
const { db } = require("../firebaseAdmin");

const TICKS_PER_SECOND = 90_000;
const MAX_ANALYSIS_SECONDS = 900;
const MAX_SCENE_CUTS = 2_000;
const ENGINE = "opencv-yunet-source-shot-follow";
const CORE_FIELDS = [
  "schemaVersion", "ownerUid", "projectId", "sourceAssetId", "sourceSha256",
  "workerResultSha256", "engine", "mode", "analysisRange", "sceneCutTicks",
  "sampleCoverage", "decodeFailures", "reviewRequired", "editPlanVersion",
  "preflightPassed",
];

const validId = value =>
  typeof value === "string" && value.length > 0 && value.length <= 160 &&
  value === value.trim() && value !== "." && value !== ".." &&
  !/[\x00-\x1f\x7f/]/.test(value);
const validHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const stableStringify = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item
);
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const invalid = () => Object.assign(new Error("Invalid source-shot analysis"), {
  code: "SOURCE_SHOT_ANALYSIS_INVALID", statusCode: 502,
});
const unavailable = () => Object.assign(new Error("Source-shot receipt unavailable"), {
  code: "SOURCE_SHOT_ARTIFACT_UNAVAILABLE", statusCode: 503,
});
const alreadyExists = error =>
  error?.code === 6 || error?.code === "already-exists" || error?.code === "ALREADY_EXISTS";
const ownKeys = (value, keys) =>
  value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every(key => Object.prototype.hasOwnProperty.call(value, key));

const toTick = seconds => {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0)
    throw invalid();
  const ticks = Math.round(seconds * TICKS_PER_SECOND);
  if (!Number.isSafeInteger(ticks)) throw invalid();
  return ticks;
};

const projectSourceShotAnalysis = ({ uid, projectId, sourceAssetId, sourceSha256, analysis }) => {
  if (!validId(uid) || !validId(projectId) || !validId(sourceAssetId) ||
      !validHash(sourceSha256) || !analysis || typeof analysis !== "object" ||
      Array.isArray(analysis) || analysis.mode !== "source_shots" ||
      analysis.engine !== ENGINE || !Array.isArray(analysis.sceneCuts) ||
      analysis.sceneCuts.length > MAX_SCENE_CUTS ||
      !Array.isArray(analysis.decodeFailures) ||
      !analysis.tracks || typeof analysis.tracks !== "object" ||
      !analysis.tracks.solo || typeof analysis.tracks.solo !== "object") {
    throw invalid();
  }
  const startTick = toTick(analysis.start);
  const endTick = toTick(analysis.end);
  if (endTick <= startTick || endTick - startTick > MAX_ANALYSIS_SECONDS * TICKS_PER_SECOND)
    throw invalid();
  const sceneCutTicks = [...new Set(analysis.sceneCuts.map(toTick))].sort((a, b) => a - b);
  if (sceneCutTicks.some(tick => tick <= startTick || tick >= endTick)) throw invalid();
  const coverage = analysis.tracks.solo.coverage;
  if (typeof coverage !== "number" || !Number.isFinite(coverage) ||
      coverage < 0 || coverage > 1 || analysis.decodeFailures.length > MAX_SCENE_CUTS)
    throw invalid();
  const sampleCoverage = Number(coverage.toFixed(6));
  const editPlanVersion = Number.isSafeInteger(analysis.editPlan?.version)
    ? analysis.editPlan.version : null;
  let workerResultSha256;
  try {
    workerResultSha256 = sha256(stableStringify(analysis));
  } catch (_) {
    throw invalid();
  }
  return {
    schemaVersion: 1,
    ownerUid: uid,
    projectId,
    sourceAssetId,
    sourceSha256,
    workerResultSha256,
    engine: ENGINE,
    mode: "source_shots",
    analysisRange: { space: "source", startTick, endTick },
    sceneCutTicks,
    sampleCoverage,
    decodeFailures: analysis.decodeFailures.length,
    reviewRequired: analysis.reviewRequired === true,
    editPlanVersion,
    preflightPassed: analysis.editPlan?.preflight?.passed === true,
  };
};

const receiptFor = record => ({
  artifactHash: record.artifactHash,
  sourceSha256: record.sourceSha256,
  projectId: record.projectId,
  sourceAssetId: record.sourceAssetId,
  analysisRange: record.analysisRange,
  createdAt: record.createdAt,
});

const validArtifactRecord = (record, uid, artifactHash) => {
  if (!ownKeys(record, [...CORE_FIELDS, "artifactHash", "createdAt"]) ||
      record.schemaVersion !== 1 || record.ownerUid !== uid ||
      !validId(uid) || !validId(record.projectId) || !validId(record.sourceAssetId) ||
      !validHash(record.sourceSha256) || !validHash(record.workerResultSha256) ||
      record.engine !== ENGINE || record.mode !== "source_shots" ||
      !ownKeys(record.analysisRange, ["space", "startTick", "endTick"]) ||
      record.analysisRange.space !== "source" ||
      !Number.isSafeInteger(record.analysisRange.startTick) ||
      !Number.isSafeInteger(record.analysisRange.endTick) ||
      record.analysisRange.startTick < 0 ||
      record.analysisRange.endTick <= record.analysisRange.startTick ||
      record.analysisRange.endTick - record.analysisRange.startTick >
        MAX_ANALYSIS_SECONDS * TICKS_PER_SECOND ||
      !Array.isArray(record.sceneCutTicks) ||
      record.sceneCutTicks.length > MAX_SCENE_CUTS ||
      record.sceneCutTicks.some((tick, index) =>
        !Number.isSafeInteger(tick) ||
        tick <= record.analysisRange.startTick ||
        tick >= record.analysisRange.endTick ||
        (index > 0 && tick <= record.sceneCutTicks[index - 1])) ||
      typeof record.sampleCoverage !== "number" ||
      !Number.isFinite(record.sampleCoverage) ||
      record.sampleCoverage < 0 || record.sampleCoverage > 1 ||
      Number(record.sampleCoverage.toFixed(6)) !== record.sampleCoverage ||
      !Number.isSafeInteger(record.decodeFailures) ||
      record.decodeFailures < 0 || record.decodeFailures > MAX_SCENE_CUTS ||
      typeof record.reviewRequired !== "boolean" ||
      (record.editPlanVersion !== null && !Number.isSafeInteger(record.editPlanVersion)) ||
      typeof record.preflightPassed !== "boolean" ||
      typeof record.createdAt !== "string" ||
      Number.isNaN(Date.parse(record.createdAt)) ||
      record.artifactHash !== artifactHash || !validHash(artifactHash)) return false;
  const core = Object.fromEntries(CORE_FIELDS.map(key => [key, record[key]]));
  return sha256(stableStringify(core)) === artifactHash;
};

async function persistSourceShotArtifact(input) {
  const core = projectSourceShotAnalysis(input);
  const artifactHash = sha256(stableStringify(core));
  const firestore = input.firestore || db;
  const ref = firestore.collection("users").doc(core.ownerUid)
    .collection("studioSourceShotArtifacts").doc(artifactHash);
  const record = { ...core, artifactHash, createdAt: new Date().toISOString() };
  try {
    await ref.create(record);
    return receiptFor(record);
  } catch (error) {
    if (!alreadyExists(error)) throw unavailable();
    try {
      const snapshot = await ref.get();
      const existing = snapshot.exists ? snapshot.data() : null;
      if (!validArtifactRecord(existing, core.ownerUid, artifactHash)) throw unavailable();
      return receiptFor(existing);
    } catch (_) {
      throw unavailable();
    }
  }
}

async function getOwnedSourceShotArtifact({ uid, artifactHash, firestore = db }) {
  if (!validId(uid) || !validHash(artifactHash)) throw invalid();
  let snapshot;
  try {
    snapshot = await firestore.collection("users").doc(uid)
      .collection("studioSourceShotArtifacts").doc(artifactHash).get();
  } catch (_) {
    throw unavailable();
  }
  if (!snapshot.exists) return null;
  const record = snapshot.data();
  if (!validArtifactRecord(record, uid, artifactHash)) throw unavailable();
  return record;
}

module.exports = {
  getOwnedSourceShotArtifact,
  persistSourceShotArtifact,
  projectSourceShotAnalysis,
};
