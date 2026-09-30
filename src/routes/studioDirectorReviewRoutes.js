const crypto = require("crypto");
const express = require("express");
const authMiddleware = require("../authMiddleware");
const { db } = require("../firebaseAdmin");
const { getOwnedStudioSourceBinding } = require("../services/studioDirectorProjectBinding");
const { getOwnedSourceShotArtifact } = require("../services/studioSourceShotArtifactService");
const { parseStudioProjectHeadRecord } = require("../services/studioProjectRevisionService");
const { computeStudioDirectorPreviewFingerprint } = require("../services/studioDirectorReplayService");

const router = express.Router();
const REVIEW_VERSION = 1;
const MINIMUM_EDGE_TICKS = 18_000;
const MAX_REQUEST_BYTES = 24 * 1024;

const plainObject = value =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, allowed, required = allowed) =>
  plainObject(value) &&
  Object.keys(value).every(key => allowed.includes(key)) &&
  required.every(key => Object.prototype.hasOwnProperty.call(value, key));
const validId = value =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 160 &&
  value === value.trim() &&
  !/[\x00-\x1f\x7f]/.test(value);
const validReviewerUid = value =>
  validId(value) && value !== "." && value !== ".." && !value.includes("/");
const validHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validTick = value => Number.isSafeInteger(value) && value >= 0;
const validSourceRange = value =>
  exactKeys(value, ["space", "startTick", "endTick"]) &&
  value.space === "source" &&
  validTick(value.startTick) &&
  validTick(value.endTick) &&
  value.endTick > value.startTick;

const stableStringify = value =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
      : item
  );
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

const validEvidence = (evidence, operation) => {
  if (evidence === undefined) return true;
  if (
    operation.type !== "split_clip" ||
    !exactKeys(evidence, [
      "schemaVersion", "type", "provider", "engine", "sourceAssetId",
      "sourceIdentityState", "sourceContentHash", "artifactHash", "sourceSha256",
      "analysisRange", "boundaryTick",
      "sampleCoverage", "verification", "decodeFailures",
    ]) ||
    evidence.schemaVersion !== 1 ||
    evidence.type !== "source_shot_boundary" ||
    evidence.provider !== "studio_face_tracking" ||
    evidence.engine !== "opencv-yunet-source-shot-follow" ||
    !validId(evidence.sourceAssetId) ||
    !["hash_verified", "legacy_reference_unverified"].includes(evidence.sourceIdentityState) ||
    (evidence.sourceIdentityState === "hash_verified"
      ? !validHash(evidence.sourceContentHash)
      : evidence.sourceContentHash !== null) ||
    !validHash(evidence.artifactHash) ||
    !validHash(evidence.sourceSha256) ||
    (evidence.sourceIdentityState === "hash_verified" &&
      evidence.sourceContentHash !== evidence.sourceSha256) ||
    !validSourceRange(evidence.analysisRange) ||
    evidence.analysisRange.startTick < operation.preconditions.sourceRange.startTick ||
    evidence.analysisRange.endTick > operation.preconditions.sourceRange.endTick ||
    !validTick(evidence.boundaryTick) ||
    evidence.boundaryTick !== operation.at.ticks ||
    evidence.boundaryTick <= evidence.analysisRange.startTick ||
    evidence.boundaryTick >= evidence.analysisRange.endTick ||
    typeof evidence.sampleCoverage !== "number" ||
    !Number.isFinite(evidence.sampleCoverage) ||
    evidence.sampleCoverage < 0.65 ||
    evidence.sampleCoverage > 1 ||
    evidence.verification !== "needs_review" ||
    evidence.decodeFailures !== 0
  ) return false;
  return true;
};

const validOperation = operation => {
  if (!plainObject(operation) || !["split_clip", "trim_clip"].includes(operation.type))
    return false;
  if (
    !exactKeys(operation.target, ["occurrenceId"]) ||
    !validId(operation.target.occurrenceId) ||
    !exactKeys(operation.preconditions, ["sourceRange"]) ||
    !validSourceRange(operation.preconditions.sourceRange)
  ) return false;
  const source = operation.preconditions.sourceRange;
  if (operation.type === "split_clip") {
    return (
      exactKeys(operation, ["type", "target", "at", "newOccurrenceIds", "preconditions"]) &&
      exactKeys(operation.at, ["space", "ticks"]) &&
      operation.at.space === "source" &&
      validTick(operation.at.ticks) &&
      operation.at.ticks - source.startTick >= MINIMUM_EDGE_TICKS &&
      source.endTick - operation.at.ticks >= MINIMUM_EDGE_TICKS &&
      exactKeys(operation.newOccurrenceIds, ["left", "right"]) &&
      validId(operation.newOccurrenceIds.left) &&
      validId(operation.newOccurrenceIds.right) &&
      operation.newOccurrenceIds.left !== operation.newOccurrenceIds.right &&
      operation.newOccurrenceIds.left !== operation.target.occurrenceId &&
      operation.newOccurrenceIds.right !== operation.target.occurrenceId
    );
  }
  if (!exactKeys(operation, ["type", "target", "keep", "preconditions"]) ||
      !validSourceRange(operation.keep)) return false;
  const keep = operation.keep;
  const removedStart = keep.startTick - source.startTick;
  const removedEnd = source.endTick - keep.endTick;
  return (
    removedStart >= 0 && removedEnd >= 0 &&
    (removedStart > 0) !== (removedEnd > 0) &&
    Math.max(removedStart, removedEnd) >= MINIMUM_EDGE_TICKS &&
    keep.endTick - keep.startTick >= MINIMUM_EDGE_TICKS
  );
};

const validProposal = proposal => {
  if (!exactKeys(
    proposal,
    ["schemaVersion", "proposalId", "projectId", "baseRevision", "documentFingerprint",
      "previewFingerprint", "batch", "proposalFingerprint", "evidence"],
    ["schemaVersion", "proposalId", "projectId", "baseRevision", "documentFingerprint",
      "previewFingerprint", "batch", "proposalFingerprint"]
  ) ||
    proposal.schemaVersion !== REVIEW_VERSION ||
    !validId(proposal.proposalId) || !validId(proposal.projectId) ||
    !Number.isSafeInteger(proposal.baseRevision) || proposal.baseRevision < 0 ||
    !validHash(proposal.documentFingerprint) || !validHash(proposal.previewFingerprint) ||
    !validHash(proposal.proposalFingerprint) ||
    !exactKeys(proposal.batch, ["projectId", "baseRevision", "idempotencyKey", "actor", "operations"]) ||
    proposal.batch.projectId !== proposal.projectId ||
    proposal.batch.baseRevision !== proposal.baseRevision ||
    !validId(proposal.batch.idempotencyKey) ||
    !exactKeys(proposal.batch.actor, ["type", "id"]) ||
    proposal.batch.actor.type !== "ai" || !validId(proposal.batch.actor.id) ||
    !Array.isArray(proposal.batch.operations) || proposal.batch.operations.length !== 1 ||
    !validOperation(proposal.batch.operations[0]) ||
    !validEvidence(proposal.evidence, proposal.batch.operations[0])) return false;

  const core = {
    schemaVersion: proposal.schemaVersion,
    proposalId: proposal.proposalId,
    projectId: proposal.projectId,
    baseRevision: proposal.baseRevision,
    documentFingerprint: proposal.documentFingerprint,
    previewFingerprint: proposal.previewFingerprint,
    batch: proposal.batch,
    ...(proposal.evidence !== undefined ? { evidence: proposal.evidence } : {}),
  };
  return sha256(stableStringify(core)) === proposal.proposalFingerprint;
};

const alreadyExists = error =>
  error?.code === 6 ||
  error?.code === "already-exists" ||
  error?.code === "ALREADY_EXISTS";

const responseFor = (record, duplicate) => ({
  ok: true,
  serverReviewId: record.serverReviewId,
  projectId: record.projectId,
  proposalId: record.proposalId,
  baseRevision: record.baseRevision,
  proposalFingerprint: record.proposalFingerprint,
  decision: record.decision,
  reviewerUid: record.reviewerUid,
  reviewedAt: record.reviewedAt,
  duplicate,
});

const reviewFailure = (status, code) => Object.assign(new Error(code), { status, code });

const ownedProjectHeadRef = (uid, projectId) => db.collection("users").doc(uid)
  .collection("studioDirectorProjects").doc(sha256(projectId));

const storedDocumentForReview = (head, uid, proposal) => {
  let parsed;
  try {
    parsed = parseStudioProjectHeadRecord(head, uid, proposal.projectId);
  } catch (_) {
    throw reviewFailure(503, "project_revision_unavailable");
  }
  if (parsed.revision !== proposal.baseRevision ||
      parsed.documentFingerprint !== proposal.documentFingerprint) {
    throw reviewFailure(409, "project_revision_mismatch");
  }
  return parsed.document;
};

const assertStoredProposalTarget = (document, proposal) => {
  const operation = proposal.batch.operations[0];
  const occurrence = Array.isArray(document.clipOccurrences) &&
    document.clipOccurrences.find(item => item?.occurrenceId === operation.target.occurrenceId);
  const source = occurrence?.sourceRange;
  const expected = operation.preconditions.sourceRange;
  if (!source || source.space !== "source" ||
      source.startTick !== expected.startTick || source.endTick !== expected.endTick) {
    throw reviewFailure(409, "project_revision_target_mismatch");
  }
  if (proposal.evidence) {
    const asset = Array.isArray(document.assets) &&
      document.assets.find(item => item?.assetId === occurrence.assetId);
    if (!asset || asset.assetId !== proposal.evidence.sourceAssetId ||
        asset.identityState !== proposal.evidence.sourceIdentityState ||
        (asset.identityState === "hash_verified" &&
          asset.contentHash !== proposal.evidence.sourceSha256) ||
        (asset.identityState === "legacy_reference_unverified" &&
          proposal.evidence.sourceContentHash !== null)) {
      throw reviewFailure(409, "project_revision_target_mismatch");
    }
  }
};

const assertServerPreviewMatches = (document, proposal) => {
  let computed;
  try {
    computed = computeStudioDirectorPreviewFingerprint({ document, batch: proposal.batch });
  } catch (error) {
    if (error?.code === "DIRECTOR_REPLAY_REJECTED") {
      throw reviewFailure(409, "proposal_replay_rejected");
    }
    throw reviewFailure(503, "proposal_replay_unavailable");
  }
  if (!validHash(computed)) throw reviewFailure(503, "proposal_replay_unavailable");
  if (computed !== proposal.previewFingerprint) {
    throw reviewFailure(409, "preview_fingerprint_mismatch");
  }
};

const assertSameReview = (prior, serverReviewId, proposal, decision, reviewerUid) => {
  if (!prior || prior.schemaVersion !== REVIEW_VERSION ||
      prior.serverReviewId !== serverReviewId ||
      typeof prior.reviewedAt !== "string" || Number.isNaN(Date.parse(prior.reviewedAt))) {
    throw reviewFailure(503, "review_store_unavailable");
  }
  if (prior.projectId !== proposal.projectId ||
      prior.proposalId !== proposal.proposalId ||
      prior.baseRevision !== proposal.baseRevision ||
      prior.proposalFingerprint !== proposal.proposalFingerprint ||
      prior.documentFingerprint !== proposal.documentFingerprint ||
      prior.previewFingerprint !== proposal.previewFingerprint ||
      prior.decision !== decision || prior.reviewerUid !== reviewerUid) {
    throw reviewFailure(409, "review_conflict");
  }
  // Decisions written before server-side command replay cannot be upgraded by
  // a retry. A new proposal receives a new verified decision.
  if (prior.previewVerificationVersion !== 1) {
    throw reviewFailure(409, "review_requires_reproposal");
  }
  return prior;
};

const verifiedSourceShotEvidence = async (reviewerUid, proposal) => {
  const evidence = proposal.evidence;
  if (!evidence) return true;
  const [binding, artifact] = await Promise.all([
    getOwnedStudioSourceBinding({
      uid: reviewerUid,
      projectId: proposal.projectId,
      sourceAssetId: evidence.sourceAssetId,
    }),
    getOwnedSourceShotArtifact({ uid: reviewerUid, artifactHash: evidence.artifactHash }),
  ]);
  if (!binding || !artifact) return false;
  return binding.sourceSha256 === evidence.sourceSha256 &&
    artifact.ownerUid === reviewerUid &&
    artifact.projectId === proposal.projectId &&
    artifact.sourceAssetId === evidence.sourceAssetId &&
    artifact.sourceSha256 === evidence.sourceSha256 &&
    artifact.artifactHash === evidence.artifactHash &&
    artifact.engine === evidence.engine &&
    artifact.mode === "source_shots" &&
    artifact.reviewRequired === true &&
    artifact.editPlanVersion === 1 &&
    artifact.preflightPassed === true &&
    artifact.decodeFailures === 0 &&
    artifact.sampleCoverage === evidence.sampleCoverage &&
    artifact.analysisRange?.space === evidence.analysisRange.space &&
    artifact.analysisRange?.startTick === evidence.analysisRange.startTick &&
    artifact.analysisRange?.endTick === evidence.analysisRange.endTick &&
    Array.isArray(artifact.sceneCutTicks) &&
    artifact.sceneCutTicks.includes(evidence.boundaryTick);
};

// The registered project document is a browser-supplied owner-scoped snapshot.
// The transaction replays the command against its current stored head before
// recording one decision. Rendered pixels remain a browser-side preview.
router.post("/", authMiddleware, async (req, res) => {
  const reviewerUid = req.user?.uid;
  if (!validReviewerUid(reviewerUid) || !req.userId || req.userId !== reviewerUid)
    return res.status(401).json({ ok: false, error: "auth_required" });

  const body = req.body;
  if (!plainObject(body))
    return res.status(400).json({ ok: false, error: "invalid_review_request" });
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_REQUEST_BYTES)
    return res.status(413).json({ ok: false, error: "payload_too_large" });
  if (!exactKeys(body, ["proposal", "decision"]) ||
      !["approve", "reject"].includes(body.decision) ||
      !validProposal(body.proposal)) {
    return res.status(400).json({ ok: false, error: "invalid_review_request" });
  }

  const { proposal, decision } = body;
  try {
    if (!await verifiedSourceShotEvidence(reviewerUid, proposal)) {
      return res.status(409).json({ ok: false, error: "source_shot_evidence_mismatch" });
    }
  } catch (_) {
    return res.status(503).json({ ok: false, error: "source_shot_evidence_unavailable" });
  }
  const serverReviewId = sha256(`${proposal.projectId}\0${proposal.proposalId}`);
  const record = {
    schemaVersion: REVIEW_VERSION,
    serverReviewId,
    projectId: proposal.projectId,
    proposalId: proposal.proposalId,
    baseRevision: proposal.baseRevision,
    proposalFingerprint: proposal.proposalFingerprint,
    documentFingerprint: proposal.documentFingerprint,
    previewFingerprint: proposal.previewFingerprint,
    previewVerificationVersion: 1,
    decision,
    reviewerUid,
    reviewedAt: new Date().toISOString(),
    proposal,
  };
  const recordRef = db.collection("users").doc(reviewerUid)
    .collection("studioDirectorReviews").doc(serverReviewId);
  try {
    const outcome = await db.runTransaction(async transaction => {
      const existing = await transaction.get(recordRef);
      if (existing.exists) {
        return { record: assertSameReview(existing.data(), serverReviewId,
          proposal, decision, reviewerUid), duplicate: true };
      }
      const head = await transaction.get(ownedProjectHeadRef(reviewerUid, proposal.projectId));
      if (!head.exists) throw reviewFailure(409, "project_revision_missing");
      const document = storedDocumentForReview(head.data(), reviewerUid, proposal);
      assertStoredProposalTarget(document, proposal);
      assertServerPreviewMatches(document, proposal);
      transaction.create(recordRef, record);
      return { record, duplicate: false };
    });
    return res.status(outcome.duplicate ? 200 : 201)
      .json(responseFor(outcome.record, outcome.duplicate));
  } catch (error) {
    if (error.status && error.code) {
      return res.status(error.status).json({ ok: false, error: error.code });
    }
    if (alreadyExists(error)) {
      try {
        const existing = await recordRef.get();
        if (existing.exists) {
          const prior = assertSameReview(existing.data(), serverReviewId,
            proposal, decision, reviewerUid);
          return res.json(responseFor(prior, true));
        }
      } catch (retryError) {
        if (retryError.status && retryError.code) {
          return res.status(retryError.status).json({ ok: false, error: retryError.code });
        }
      }
    }
    return res.status(503).json({ ok: false, error: "review_store_unavailable" });
  }
});

module.exports = router;
