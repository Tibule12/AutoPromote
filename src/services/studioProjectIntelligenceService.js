const crypto = require("crypto");
const { db } = require("../firebaseAdmin");
const { getOwnedStudioSourceBinding } = require("./studioDirectorProjectBinding");
const { getOwnedSourceShotArtifact } = require("./studioSourceShotArtifactService");
const { getOwnedAnalysisArtifact } = require("./studioAnalysisArtifactService");
const { parseStudioProjectHeadRecord } = require("./studioProjectRevisionService");
const {
  validateProjectIntelligenceRevision, assertRevisionTransition,
  summarizeProjectIntelligence, stableStringify, digest,
} = require("./studioProjectIntelligenceContract");

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const validId = value => typeof value === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,159}$/.test(value);
const validHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const errorFor = (code, statusCode) => Object.assign(new Error(code), { code, statusCode });
const invalid = () => errorFor("PROJECT_INTELLIGENCE_INVALID", 400);
const conflict = () => errorFor("PROJECT_INTELLIGENCE_CONFLICT", 409);
const unavailable = () => errorFor("PROJECT_INTELLIGENCE_UNAVAILABLE", 503);
const unauthorizedAsset = () => errorFor("PROJECT_INTELLIGENCE_SOURCE_UNVERIFIED", 409);

const projectHeadRef = (firestore, uid, projectId) => firestore.collection("users").doc(uid)
  .collection("studioDirectorProjects").doc(sha256(projectId));
const intelligenceHeadRef = (firestore, uid, projectId) => firestore.collection("users").doc(uid)
  .collection("studioProjectIntelligenceHeads").doc(sha256(projectId));
const intelligenceRevisionRef = (firestore, uid, projectId, revisionId) =>
  firestore.collection("users").doc(uid)
    .collection("studioProjectIntelligenceRevisions")
    .doc(sha256(`${projectId}\0${revisionId}`));

const parseProjectIntelligenceRecord = (record, { uid, projectId, revisionId = null }) => {
  if (!record || record.schemaVersion !== 1 || record.ownerUid !== uid ||
      record.projectId !== projectId || !validHash(record.revisionId) ||
      (revisionId !== null && record.revisionId !== revisionId) ||
      !validHash(record.manifestHash) || !validHash(record.dependencyDigest) ||
      typeof record.revisionJson !== "string" || !validId(record.createdBy) ||
      record.createdBy !== uid || typeof record.createdAt !== "string" ||
      Number.isNaN(Date.parse(record.createdAt)) ||
      sha256(record.revisionJson) !== record.manifestHash) throw unavailable();
  try {
    const revision = JSON.parse(record.revisionJson);
    validateProjectIntelligenceRevision(revision);
    if (revision.revisionId !== record.revisionId || revision.projectId !== projectId ||
        revision.ownerUid !== uid ||
        stableStringify(revision) !== record.revisionJson ||
        digest(revision.analysisDependencyDigests) !== record.dependencyDigest)
      throw unavailable();
    return { ...record, revision };
  } catch (_) {
    throw unavailable();
  }
};

const verifyOwnedSources = async ({ uid, revision, firestore }) => {
  // This endpoint accepts owner declarations only. A future model writer needs
  // a separate authenticated artifact-backed path; a browser origin label is
  // never proof that analysis ran.
  for (const collection of [revision.captureGroups, revision.assertions,
    revision.syncMappings, revision.dialogueUnits, revision.coverage,
    revision.continuityObservations]) {
    if (collection.some(item => item.provenance.origin !== "human_declared" ||
        item.provenance.producerId !== uid)) throw invalid();
  }
  for (const asset of revision.assets) {
    let binding;
    try {
      binding = await getOwnedStudioSourceBinding({ uid,
        projectId: revision.projectId,
        sourceAssetId: asset.sourceRef.sourceAssetId, firestore });
    } catch (_) { throw unavailable(); }
    if (!binding || binding.sourceSha256 !== asset.contentHash)
      throw unauthorizedAsset();
  }
  for (const evidence of revision.evidenceRefs) {
    if (evidence.kind === "analysis_artifact") {
      let artifact, dependency;
      try {
        artifact = await getOwnedAnalysisArtifact({ uid,
          artifactHash: evidence.artifactHash, firestore });
        if (artifact) dependency = await getOwnedSourceShotArtifact({ uid,
          artifactHash: artifact.dependencyHashes[0], firestore });
      } catch (_) { throw unavailable(); }
      if (!artifact || !dependency || artifact.projectId !== revision.projectId ||
          artifact.sourceAssetId !== evidence.sourceAssetId ||
          artifact.sourceSha256 !== evidence.sourceContentHash ||
          artifact.analysisType !== evidence.analysisType ||
          artifact.modelRevision !== evidence.modelRevision ||
          artifact.configHash !== evidence.configHash ||
          stableStringify(artifact.dependencyHashes) !==
            stableStringify(evidence.dependencyHashes) ||
          dependency.projectId !== artifact.projectId ||
          dependency.sourceAssetId !== artifact.sourceAssetId ||
          dependency.sourceSha256 !== artifact.sourceSha256 ||
          dependency.workerResultSha256 !== artifact.contentHash ||
          dependency.engine !== artifact.engine) throw unauthorizedAsset();
      continue;
    }
    if (evidence.kind !== "source_shot_artifact") continue;
    let artifact;
    try {
      artifact = await getOwnedSourceShotArtifact({ uid,
        artifactHash: evidence.artifactHash, firestore });
    } catch (_) { throw unavailable(); }
    if (!artifact || artifact.projectId !== revision.projectId ||
        artifact.sourceAssetId !== evidence.sourceAssetId ||
        artifact.sourceSha256 !== evidence.sourceContentHash ||
        artifact.engine !== evidence.modelRevision ||
        stableStringify(evidence.dependencyHashes) !==
          stableStringify([artifact.workerResultSha256]))
      throw unauthorizedAsset();
  }
};

const receiptFor = (record, duplicate) => ({ ok: true, projectId: record.projectId,
  revisionId: record.revisionId, baseRevisionId: record.baseRevisionId,
  manifestHash: record.manifestHash, dependencyDigest: record.dependencyDigest,
  createdAt: record.createdAt, duplicate });

const registerOwnedProjectIntelligence = async ({ uid, revision, firestore = db }) => {
  if (!validId(uid) || !revision || revision.ownerUid !== uid ||
      revision.createdBy?.id !== uid) throw invalid();
  let findings;
  try { ({ findings } = validateProjectIntelligenceRevision(revision)); }
  catch (error) {
    if (error.code === "PROJECT_INTELLIGENCE_TOO_LARGE")
      throw errorFor("PROJECT_INTELLIGENCE_TOO_LARGE", 413);
    throw invalid();
  }
  await verifyOwnedSources({ uid, revision, firestore });
  const projectId = revision.projectId;
  const headRef = intelligenceHeadRef(firestore, uid, projectId);
  const revisionRef = intelligenceRevisionRef(firestore, uid, projectId, revision.revisionId);
  const revisionJson = stableStringify(revision);
  const record = { schemaVersion: 1, ownerUid: uid, projectId,
    revisionId: revision.revisionId, baseRevisionId: revision.baseRevisionId,
    manifestHash: sha256(revisionJson),
    dependencyDigest: digest(revision.analysisDependencyDigests), revisionJson,
    createdAt: new Date().toISOString(), createdBy: uid };
  try {
    const receipt = await firestore.runTransaction(async transaction => {
      const [projectSnapshot, headSnapshot, priorSnapshot] = await Promise.all([
        transaction.get(projectHeadRef(firestore, uid, projectId)),
        transaction.get(headRef), transaction.get(revisionRef),
      ]);
      if (!projectSnapshot.exists) throw unauthorizedAsset();
      parseStudioProjectHeadRecord(projectSnapshot.data(), uid, projectId);
      const head = headSnapshot.exists
        ? parseProjectIntelligenceRecord(headSnapshot.data(), { uid, projectId }) : null;
      const prior = priorSnapshot.exists
        ? parseProjectIntelligenceRecord(priorSnapshot.data(), {
          uid, projectId, revisionId: revision.revisionId }) : null;
      if (prior) {
        if (prior.manifestHash !== record.manifestHash ||
            !head || head.revisionId !== prior.revisionId) throw conflict();
        return receiptFor(prior, true);
      }
      try { assertRevisionTransition(head?.revision || null, revision); }
      catch (_) { throw conflict(); }
      transaction.create(revisionRef, record);
      transaction.set(headRef, record);
      return receiptFor(record, false);
    });
    return { ...receipt, findings,
      planningBlocked: findings.some(finding => finding.code === "PROJECT_INTELLIGENCE_CONFLICT") };
  } catch (error) {
    if (error.statusCode) throw error;
    throw unavailable();
  }
};

const getOwnedProjectIntelligence = async ({ uid, projectId, revisionId = null,
  firestore = db }) => {
  if (!validId(uid) || !validId(projectId) || (revisionId !== null && !validHash(revisionId)))
    throw invalid();
  const ref = revisionId === null ? intelligenceHeadRef(firestore, uid, projectId) :
    intelligenceRevisionRef(firestore, uid, projectId, revisionId);
  let snapshot;
  try { snapshot = await ref.get(); } catch (_) { throw unavailable(); }
  if (!snapshot.exists) return null;
  const record = parseProjectIntelligenceRecord(snapshot.data(), { uid, projectId, revisionId });
  return { record, summary: summarizeProjectIntelligence(record.revision) };
};

module.exports = { registerOwnedProjectIntelligence, getOwnedProjectIntelligence,
  parseProjectIntelligenceRecord, intelligenceRevisionRef };
