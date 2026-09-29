import {
  dryRunStudioCommandBatch,
  executeStudioCommandBatch,
  MINIMUM_SPLIT_DISTANCE_TICKS,
  projectStudioCommandResultOnSnapshot,
  resolveStudioCommandBatch,
} from "./studioCommands";
import {
  reconcileStudioDocument,
  validateStudioProjectDocument,
} from "./studioProjectDocument";

export const STUDIO_DIRECTOR_PROPOSAL_VERSION = 1;
export const STUDIO_DIRECTOR_REVIEW_IDENTITY_STATUS = "client_claim_unverified";

const proposalError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const validId = value => typeof value === "string" && value.trim().length > 0 && value.length <= 160;
const validTick = value => Number.isSafeInteger(value) && value >= 0;
const exactKeys = (value, keys) => value && typeof value === "object" &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const stableStringify = value =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
      : item
  );

const digest = async value => {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
    proposalError("DIGEST_UNAVAILABLE", "Director review requires Web Crypto SHA-256.");
  }
  const bytes = new TextEncoder().encode(stableStringify(value));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
};

const assertBoundedOperation = (document, operation) => {
  if (!operation || !["split_clip", "trim_clip"].includes(operation.type)) {
    proposalError("UNSUPPORTED_DIRECTOR_OPERATION", "Director proposals support one split or edge trim.");
  }
  const occurrence = document.clipOccurrences.find(
    item => item.occurrenceId === operation.target?.occurrenceId
  );
  if (!occurrence) proposalError("OCCURRENCE_NOT_FOUND", "Director target occurrence is missing.");
  const source = occurrence.sourceRange;
  if (operation.type === "split_clip") {
    if (operation.at?.space !== "source" || !validTick(operation.at.ticks)) {
      proposalError("INVALID_DIRECTOR_TIME", "Director split requires a source tick.");
    }
    if (
      operation.at.ticks - source.startTick < MINIMUM_SPLIT_DISTANCE_TICKS ||
      source.endTick - operation.at.ticks < MINIMUM_SPLIT_DISTANCE_TICKS
    ) {
      proposalError("DIRECTOR_EDGE_LIMIT", "Director split must leave 0.2 seconds at each edge.");
    }
  } else {
    const keep = operation.keep;
    if (
      keep?.space !== "source" ||
      !validTick(keep.startTick) ||
      !validTick(keep.endTick) ||
      keep.endTick <= keep.startTick ||
      keep.startTick < source.startTick ||
      keep.endTick > source.endTick
    ) {
      proposalError("INVALID_DIRECTOR_TIME", "Director trim requires a contained source range.");
    }
    const removedStart = keep.startTick - source.startTick;
    const removedEnd = source.endTick - keep.endTick;
    if ((removedStart > 0) === (removedEnd > 0)) {
      proposalError("UNSUPPORTED_DIRECTOR_OPERATION", "Director trim must remove one edge only.");
    }
    if (Math.max(removedStart, removedEnd) < MINIMUM_SPLIT_DISTANCE_TICKS ||
        keep.endTick - keep.startTick < MINIMUM_SPLIT_DISTANCE_TICKS) {
      proposalError("DIRECTOR_EDGE_LIMIT", "Director trim must retain and remove at least 0.2 seconds.");
    }
  }
  return occurrence;
};

const assertSourceShotEvidence = (document, occurrence, operation, evidence) => {
  if (evidence === undefined) return;
  const asset = document.assets.find(item => item.assetId === occurrence.assetId);
  const range = evidence?.analysisRange;
  if (
    operation.type !== "split_clip" ||
    !exactKeys(evidence, ["schemaVersion", "type", "provider", "engine", "sourceAssetId",
      "sourceIdentityState", "sourceContentHash", "analysisRange", "boundaryTick",
      "sampleCoverage", "verification", "decodeFailures"]) ||
    !exactKeys(range, ["space", "startTick", "endTick"]) ||
    evidence.schemaVersion !== 1 ||
    evidence.type !== "source_shot_boundary" ||
    evidence.provider !== "studio_face_tracking" ||
    evidence.engine !== "opencv-yunet-source-shot-follow" ||
    evidence.verification !== "needs_review" ||
    evidence.decodeFailures !== 0 ||
    evidence.sourceAssetId !== occurrence.assetId ||
    evidence.sourceIdentityState !== asset?.identityState ||
    evidence.sourceContentHash !== (asset?.contentHash || null) ||
    range.space !== "source" ||
    !validTick(range.startTick) || !validTick(range.endTick) ||
    range.endTick <= range.startTick ||
    range.startTick < occurrence.sourceRange.startTick ||
    range.endTick > occurrence.sourceRange.endTick ||
    evidence.boundaryTick !== operation.at?.ticks ||
    evidence.boundaryTick <= range.startTick ||
    evidence.boundaryTick >= range.endTick ||
    !Number.isFinite(evidence.sampleCoverage) ||
    evidence.sampleCoverage < 0.65 || evidence.sampleCoverage > 1
  ) proposalError("INVALID_DIRECTOR_EVIDENCE", "Source-shot evidence does not match this split.");
};

const proposalCore = proposal => ({
  schemaVersion: proposal.schemaVersion,
  proposalId: proposal.proposalId,
  projectId: proposal.projectId,
  baseRevision: proposal.baseRevision,
  documentFingerprint: proposal.documentFingerprint,
  previewFingerprint: proposal.previewFingerprint,
  batch: proposal.batch,
  evidence: proposal.evidence,
});

export const prepareStudioDirectorProposal = async (
  document,
  { proposalId, idempotencyKey, directorId, operation, evidence }
) => {
  validateStudioProjectDocument(document);
  if (![proposalId, idempotencyKey, directorId].every(validId)) {
    proposalError("INVALID_PROPOSAL", "Director proposal and actor IDs are required.");
  }
  const occurrence = assertBoundedOperation(document, operation);
  assertSourceShotEvidence(document, occurrence, operation, evidence);
  const batch = {
    projectId: document.projectId,
    baseRevision: document.revision,
    idempotencyKey,
    actor: { type: "ai", id: directorId },
    operations: [{
      ...operation,
      preconditions: { sourceRange: { ...occurrence.sourceRange } },
    }],
  };
  const preview = dryRunStudioCommandBatch(document, batch);
  const proposal = {
    schemaVersion: STUDIO_DIRECTOR_PROPOSAL_VERSION,
    proposalId,
    projectId: document.projectId,
    baseRevision: document.revision,
    documentFingerprint: await digest(document),
    previewFingerprint: await digest(preview.previewDocument),
    batch,
    ...(evidence === undefined ? {} : { evidence }),
  };
  proposal.proposalFingerprint = await digest(proposalCore(proposal));
  return { proposal, preview };
};

const receiptCore = receipt => ({
  schemaVersion: receipt.schemaVersion,
  proposalId: receipt.proposalId,
  proposalFingerprint: receipt.proposalFingerprint,
  reviewerId: receipt.reviewerId,
  identityStatus: receipt.identityStatus,
  decision: receipt.decision,
  reviewedAt: receipt.reviewedAt,
});

// A workflow receipt records a review action. Its digest is not a signature or
// authentication proof. A trusted server must verify reviewer identity before
// treating the caller-supplied reviewerId as an authorization boundary.
export const createStudioDirectorReviewReceipt = async (
  { proposal, reviewerId, decision, reviewedAt }
) => {
  if (proposal?.schemaVersion !== STUDIO_DIRECTOR_PROPOSAL_VERSION ||
      !validId(reviewerId) || !["approve", "reject"].includes(decision) ||
      typeof reviewedAt !== "string" || Number.isNaN(Date.parse(reviewedAt))) {
    proposalError("INVALID_REVIEW", "A reviewer, decision and review time are required.");
  }
  if (await digest(proposalCore(proposal)) !== proposal.proposalFingerprint) {
    proposalError("PROPOSAL_TAMPERED", "The proposal changed after preparation.");
  }
  const receipt = {
    schemaVersion: STUDIO_DIRECTOR_PROPOSAL_VERSION,
    proposalId: proposal.proposalId,
    proposalFingerprint: proposal.proposalFingerprint,
    reviewerId,
    identityStatus: STUDIO_DIRECTOR_REVIEW_IDENTITY_STATUS,
    decision,
    reviewedAt,
  };
  receipt.receiptFingerprint = await digest(receiptCore(receipt));
  return receipt;
};

const assertMatchingReview = async ({ document, proposal, reviewReceipt }) => {
  validateStudioProjectDocument(document);
  if (proposal?.schemaVersion !== STUDIO_DIRECTOR_PROPOSAL_VERSION ||
      await digest(proposalCore(proposal)) !== proposal.proposalFingerprint) {
    proposalError("PROPOSAL_TAMPERED", "The Director proposal is invalid or changed.");
  }
  if (!reviewReceipt || reviewReceipt.schemaVersion !== STUDIO_DIRECTOR_PROPOSAL_VERSION ||
      await digest(receiptCore(reviewReceipt)) !== reviewReceipt.receiptFingerprint ||
      reviewReceipt.proposalId !== proposal.proposalId ||
      reviewReceipt.proposalFingerprint !== proposal.proposalFingerprint ||
      reviewReceipt.identityStatus !== STUDIO_DIRECTOR_REVIEW_IDENTITY_STATUS ||
      !["approve", "reject"].includes(reviewReceipt.decision) ||
      !validId(reviewReceipt.reviewerId)) {
    proposalError("INVALID_REVIEW", "The review receipt does not match this proposal.");
  }
  if (document.projectId !== proposal.projectId) {
    proposalError("PROJECT_MISMATCH", "Director proposal targets another project.");
  }
};

const recordedReview = (document, proposal, reviewReceipt) => {
  const record = (document.directorReviewJournal || []).find(
    item => item.receipt.proposalId === proposal.proposalId
  );
  if (record && record.receipt.receiptFingerprint !== reviewReceipt.receiptFingerprint) {
    proposalError("REVIEW_CONFLICT", "This proposal already has a different review decision.");
  }
  return record;
};

const validatedServerReview = (proposal, reviewReceipt, serverReview) => {
  if (serverReview === undefined) return null;
  const required = ["serverReviewId", "projectId", "proposalId", "baseRevision",
    "proposalFingerprint", "decision", "reviewerUid", "reviewedAt"];
  if (!serverReview || typeof serverReview !== "object" ||
      !required.every(key => Object.prototype.hasOwnProperty.call(serverReview, key)) ||
      !/^[a-f0-9]{64}$/i.test(serverReview.serverReviewId || "") ||
      serverReview.projectId !== proposal.projectId ||
      serverReview.proposalId !== proposal.proposalId ||
      serverReview.baseRevision !== proposal.baseRevision ||
      serverReview.proposalFingerprint !== proposal.proposalFingerprint ||
      serverReview.decision !== reviewReceipt.decision ||
      serverReview.reviewerUid !== reviewReceipt.reviewerId ||
      serverReview.reviewedAt !== reviewReceipt.reviewedAt) {
    proposalError("INVALID_SERVER_REVIEW", "Server review does not match the proposal and receipt.");
  }
  return Object.fromEntries(required.map(key => [key, serverReview[key]]));
};

const reviewRecord = (reviewReceipt, commandJournalId, serverReview) => ({
  receipt: reviewReceipt,
  commandJournalId,
  identityStatus: STUDIO_DIRECTOR_REVIEW_IDENTITY_STATUS,
  ...(serverReview ? { serverReview } : {}),
});

export const recordStudioDirectorReviewRejection = async ({
  document, proposal, reviewReceipt, serverReview,
}) => {
  await assertMatchingReview({ document, proposal, reviewReceipt });
  const serverRecord = validatedServerReview(proposal, reviewReceipt, serverReview);
  if (reviewReceipt.decision !== "reject") {
    proposalError("INVALID_REVIEW", "Only rejected proposals can be recorded without a command.");
  }
  const prior = recordedReview(document, proposal, reviewReceipt);
  if (prior) {
    if (serverRecord && JSON.stringify(prior.serverReview || null) !== JSON.stringify(serverRecord)) {
      proposalError("REVIEW_CONFLICT", "Server review differs from the recorded decision.");
    }
    return { document, duplicate: true, reviewRecord: prior };
  }
  const record = reviewRecord(reviewReceipt, null, serverRecord);
  const next = {
    ...document,
    directorReviewJournal: [...(document.directorReviewJournal || []), record],
  };
  validateStudioProjectDocument(next);
  return { document: next, duplicate: false, reviewRecord: record };
};

export const applyStudioDirectorProposal = async ({
  document, proposal, reviewReceipt, serverReview,
}) => {
  await assertMatchingReview({ document, proposal, reviewReceipt });
  const serverRecord = validatedServerReview(proposal, reviewReceipt, serverReview);
  if (reviewReceipt.decision !== "approve") {
    proposalError("REVIEW_NOT_APPROVED", "The Director proposal was not approved.");
  }
  if (proposal.batch?.projectId !== proposal.projectId ||
      proposal.batch?.baseRevision !== proposal.baseRevision ||
      proposal.batch?.actor?.type !== "ai" ||
      !Array.isArray(proposal.batch.operations) || proposal.batch.operations.length !== 1) {
    proposalError("INVALID_PROPOSAL", "Director proposal must contain one AI edit batch.");
  }
  const prior = recordedReview(document, proposal, reviewReceipt);
  // An exact duplicate is harmless and must not add a second edit. The command
  // executor still compares the idempotency fingerprint before returning it.
  if (document.idempotency?.[proposal.batch.idempotencyKey]) {
    const priorCommand = document.journal.find(
      entry => entry.journalId === prior?.commandJournalId &&
        entry.idempotencyKey === proposal.batch.idempotencyKey
    );
    if (!priorCommand) {
      proposalError("REVIEW_JOURNAL_MISMATCH", "The prior command has no matching review record.");
    }
    if (serverRecord && JSON.stringify(prior.serverReview || null) !== JSON.stringify(serverRecord)) {
      proposalError("REVIEW_CONFLICT", "Server review differs from the recorded decision.");
    }
    return { ...executeStudioCommandBatch(document, proposal.batch), reviewReceipt };
  }
  if (prior) {
    proposalError("REVIEW_JOURNAL_MISMATCH", "The review record has no matching command.");
  }
  const occurrence = assertBoundedOperation(document, proposal.batch.operations[0]);
  assertSourceShotEvidence(document, occurrence, proposal.batch.operations[0], proposal.evidence);
  if (document.revision !== proposal.baseRevision) {
    proposalError("STALE_REVISION", "Project changed after the Director review.");
  }
  if (await digest(document) !== proposal.documentFingerprint) {
    proposalError("DOCUMENT_CHANGED", "Project content changed after proposal preparation.");
  }
  const preview = dryRunStudioCommandBatch(document, proposal.batch);
  if (await digest(preview.previewDocument) !== proposal.previewFingerprint) {
    proposalError("PREVIEW_CHANGED", "Director preview changed since review.");
  }
  const result = executeStudioCommandBatch(document, proposal.batch);
  const journalEntry = {
    ...result.journalEntry,
    directorReview: {
      proposalId: proposal.proposalId,
      proposalFingerprint: proposal.proposalFingerprint,
      receiptFingerprint: reviewReceipt.receiptFingerprint,
    },
  };
  const record = reviewRecord(reviewReceipt, journalEntry.journalId, serverRecord);
  const next = {
    ...result.document,
    journal: [...result.document.journal.slice(0, -1), journalEntry],
    directorReviewJournal: [...(document.directorReviewJournal || []), record],
  };
  validateStudioProjectDocument(next);
  return { ...result, document: next, journalEntry, reviewReceipt, reviewRecord: record };
};

export const runStudioDirectorProposalOnSnapshot = async ({
  snapshot, projectId, proposal, reviewReceipt, serverReview,
}) => {
  const document = reconcileStudioDocument({
    snapshot,
    projectId,
    storedDocument: snapshot.studioDocument || null,
  });
  const result = await applyStudioDirectorProposal({
    document, proposal, reviewReceipt, serverReview,
  });
  if (result.duplicate) return { ...result, snapshot };
  const plan = resolveStudioCommandBatch(document, proposal.batch);
  return projectStudioCommandResultOnSnapshot({ snapshot, projectId, plan, result });
};

export const recordStudioDirectorReviewRejectionOnSnapshot = async ({
  snapshot, projectId, proposal, reviewReceipt, serverReview,
}) => {
  const document = reconcileStudioDocument({
    snapshot,
    projectId,
    storedDocument: snapshot.studioDocument || null,
  });
  const result = await recordStudioDirectorReviewRejection({
    document, proposal, reviewReceipt, serverReview,
  });
  return {
    ...result,
    snapshot: result.duplicate ? snapshot : { ...snapshot, studioDocument: result.document },
  };
};
