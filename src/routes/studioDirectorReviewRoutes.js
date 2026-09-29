const crypto = require("crypto");
const express = require("express");
const authMiddleware = require("../authMiddleware");
const { db } = require("../firebaseAdmin");

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
      "sourceIdentityState", "sourceContentHash", "analysisRange", "boundaryTick",
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

// The server verifies Firebase identity and the bounded proposal envelope.
// The Studio document remains local, so this endpoint cannot attest that the
// proposed edit still matches a current browser document or rendered preview.
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
    decision,
    reviewerUid,
    reviewedAt: new Date().toISOString(),
    proposal,
  };
  try {
    const recordRef = db.collection("users").doc(reviewerUid)
      .collection("studioDirectorReviews").doc(serverReviewId);
    // Firestore create is atomic and fails if the immutable record exists.
    await recordRef.create(record);
    return res.status(201).json(responseFor(record, false));
  } catch (error) {
    if (!alreadyExists(error)) {
      return res.status(503).json({ ok: false, error: "review_store_unavailable" });
    }
    try {
      const recordRef = db.collection("users").doc(reviewerUid)
        .collection("studioDirectorReviews").doc(serverReviewId);
      const existing = await recordRef.get();
      if (!existing.exists) {
        return res.status(503).json({ ok: false, error: "review_store_unavailable" });
      }
      const prior = existing.data();
      if (!prior || prior.schemaVersion !== REVIEW_VERSION ||
          prior.serverReviewId !== serverReviewId ||
          typeof prior.reviewedAt !== "string" ||
          Number.isNaN(Date.parse(prior.reviewedAt))) {
        return res.status(503).json({ ok: false, error: "review_store_unavailable" });
      }
      if (prior.projectId !== proposal.projectId ||
          prior.proposalId !== proposal.proposalId ||
          prior.baseRevision !== proposal.baseRevision ||
          prior.proposalFingerprint !== proposal.proposalFingerprint ||
          prior.documentFingerprint !== proposal.documentFingerprint ||
          prior.previewFingerprint !== proposal.previewFingerprint ||
          prior.decision !== decision ||
          prior.reviewerUid !== reviewerUid) {
        return res.status(409).json({ ok: false, error: "review_conflict" });
      }
      return res.json(responseFor(prior, true));
    } catch (_) {
      return res.status(503).json({ ok: false, error: "review_store_unavailable" });
    }
  }
});

module.exports = router;
