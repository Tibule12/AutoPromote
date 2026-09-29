import {
  dryRunStudioCommandBatch,
  executeStudioCommandBatch,
  MINIMUM_SPLIT_DISTANCE_TICKS,
} from "./studioCommands";
import { validateStudioProjectDocument } from "./studioProjectDocument";

export const STUDIO_DIRECTOR_PROPOSAL_VERSION = 1;

const proposalError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const validId = value => typeof value === "string" && value.trim().length > 0 && value.length <= 160;
const validTick = value => Number.isSafeInteger(value) && value >= 0;
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

const proposalCore = proposal => ({
  schemaVersion: proposal.schemaVersion,
  proposalId: proposal.proposalId,
  projectId: proposal.projectId,
  baseRevision: proposal.baseRevision,
  documentFingerprint: proposal.documentFingerprint,
  previewFingerprint: proposal.previewFingerprint,
  batch: proposal.batch,
});

export const prepareStudioDirectorProposal = async (
  document,
  { proposalId, idempotencyKey, directorId, operation }
) => {
  validateStudioProjectDocument(document);
  if (![proposalId, idempotencyKey, directorId].every(validId)) {
    proposalError("INVALID_PROPOSAL", "Director proposal and actor IDs are required.");
  }
  const occurrence = assertBoundedOperation(document, operation);
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
  };
  proposal.proposalFingerprint = await digest(proposalCore(proposal));
  return { proposal, preview };
};

const receiptCore = receipt => ({
  schemaVersion: receipt.schemaVersion,
  proposalId: receipt.proposalId,
  proposalFingerprint: receipt.proposalFingerprint,
  reviewerId: receipt.reviewerId,
  decision: receipt.decision,
  reviewedAt: receipt.reviewedAt,
});

// A workflow receipt records a review action. It is not authentication or a
// signature; the caller must bind reviewerId to an authenticated human UI.
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
    decision,
    reviewedAt,
  };
  receipt.receiptFingerprint = await digest(receiptCore(receipt));
  return receipt;
};

export const applyStudioDirectorProposal = async ({ document, proposal, reviewReceipt }) => {
  validateStudioProjectDocument(document);
  if (proposal?.schemaVersion !== STUDIO_DIRECTOR_PROPOSAL_VERSION ||
      await digest(proposalCore(proposal)) !== proposal.proposalFingerprint) {
    proposalError("PROPOSAL_TAMPERED", "The Director proposal is invalid or changed.");
  }
  if (!reviewReceipt || reviewReceipt.schemaVersion !== STUDIO_DIRECTOR_PROPOSAL_VERSION ||
      await digest(receiptCore(reviewReceipt)) !== reviewReceipt.receiptFingerprint ||
      reviewReceipt.proposalId !== proposal.proposalId ||
      reviewReceipt.proposalFingerprint !== proposal.proposalFingerprint ||
      !validId(reviewReceipt.reviewerId)) {
    proposalError("INVALID_REVIEW", "The review receipt does not match this proposal.");
  }
  if (reviewReceipt.decision !== "approve") {
    proposalError("REVIEW_NOT_APPROVED", "The Director proposal was not approved.");
  }
  if (document.projectId !== proposal.projectId) {
    proposalError("PROJECT_MISMATCH", "Director proposal targets another project.");
  }
  if (proposal.batch?.projectId !== proposal.projectId ||
      proposal.batch?.baseRevision !== proposal.baseRevision ||
      proposal.batch?.actor?.type !== "ai" ||
      !Array.isArray(proposal.batch.operations) || proposal.batch.operations.length !== 1) {
    proposalError("INVALID_PROPOSAL", "Director proposal must contain one AI edit batch.");
  }
  // An exact duplicate is harmless and must not add a second edit. The command
  // executor still compares the idempotency fingerprint before returning it.
  if (document.idempotency?.[proposal.batch.idempotencyKey]) {
    return { ...executeStudioCommandBatch(document, proposal.batch), reviewReceipt };
  }
  assertBoundedOperation(document, proposal.batch.operations[0]);
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
  return { ...executeStudioCommandBatch(document, proposal.batch), reviewReceipt };
};
