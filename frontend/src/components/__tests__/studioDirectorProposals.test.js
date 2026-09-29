import { webcrypto } from "crypto";
import { TextEncoder } from "util";
import {
  adaptStudioSnapshotToDocument,
  rebaseStudioHistoryRestore,
  reconcileStudioDocument,
  validateStudioProjectDocument,
} from "../studioProjectDocument";
import { undoStudioCommandBatch } from "../studioCommands";
import {
  applyStudioDirectorProposal,
  createStudioDirectorReviewReceipt,
  prepareStudioDirectorProposal,
  recordStudioDirectorReviewRejection,
  recordStudioDirectorReviewRejectionOnSnapshot,
  runStudioDirectorProposalOnSnapshot,
} from "../studioDirectorProposals";
import { secondsToTicks } from "../studioTime";

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  globalThis.TextEncoder = TextEncoder;
});

const makeSnapshot = () => ({
  orderedClips: [{ id: "source", start: 0, end: 20 }],
  selectedClipId: "source",
  timeline: [{ id: "main", sourceClipId: "source", startRequest: 0, endRequest: 20 }],
  soundEffects: [{ id: "cue", startTime: 15, duration: 1 }],
  speedKeyframes: [{ property: "speed", time: 12, value: 2 }],
});
const makeDocument = () => adaptStudioSnapshotToDocument({
  projectId: "director-review-project",
  snapshot: makeSnapshot(),
});
const split = () => ({
  type: "split_clip",
  target: { occurrenceId: "main" },
  at: { space: "source", ticks: secondsToTicks(8) },
  newOccurrenceIds: { left: "left", right: "right" },
});
const endTrim = () => ({
  type: "trim_clip",
  target: { occurrenceId: "main" },
  keep: { space: "source", startTick: 0, endTick: secondsToTicks(15) },
});
const prepare = (document, operation = split()) => prepareStudioDirectorProposal(document, {
  proposalId: "proposal-1",
  idempotencyKey: "director-edit-1",
  directorId: "bounded-director",
  operation,
});
const review = (proposal, decision = "approve") => createStudioDirectorReviewReceipt({
  proposal, reviewerId: "human-reviewer", decision, reviewedAt: "2026-09-29T12:00:00.000Z",
});
const rejectCode = async (promise, code) => {
  let failure;
  try { await promise; } catch (error) { failure = error; }
  expect(failure).toMatchObject({ code });
};

test("reviewed split applies one AI command and duplicate replay is idempotent", async () => {
  const document = makeDocument();
  const { proposal, preview } = await prepare(document);
  expect(preview.previewDocument.clipOccurrences).toHaveLength(2);
  expect(document.clipOccurrences).toHaveLength(1);
  expect(proposal.batch).toMatchObject({
    baseRevision: 0,
    actor: { type: "ai", id: "bounded-director" },
    operations: [{ preconditions: { sourceRange: document.clipOccurrences[0].sourceRange } }],
  });
  const receipt = await review(proposal);
  const applied = await applyStudioDirectorProposal({ document, proposal, reviewReceipt: receipt });
  expect(applied.document.revision).toBe(1);
  expect(applied.document.clipOccurrences.map(item => item.occurrenceId)).toEqual(["left", "right"]);
  expect(applied.journalEntry.actor.type).toBe("ai");
  expect(applied.reviewReceipt).toEqual(receipt);
  expect(applied.journalEntry.directorReview).toEqual({
    proposalId: proposal.proposalId,
    proposalFingerprint: proposal.proposalFingerprint,
    receiptFingerprint: receipt.receiptFingerprint,
  });
  expect(applied.document.directorReviewJournal).toEqual([{
    receipt,
    commandJournalId: applied.journalEntry.journalId,
    identityStatus: "client_claim_unverified",
  }]);
  const replay = await applyStudioDirectorProposal({ document: applied.document, proposal, reviewReceipt: receipt });
  expect(replay.duplicate).toBe(true);
  expect(replay.document).toBe(applied.document);
});

test("approved review and linked trim survive snapshot persistence and Undo", async () => {
  const snapshot = makeSnapshot();
  const document = adaptStudioSnapshotToDocument({
    snapshot,
    projectId: "director-review-project",
  });
  const { proposal } = await prepare(document, endTrim());
  const receipt = await review(proposal);
  const applied = await runStudioDirectorProposalOnSnapshot({
    snapshot: { ...snapshot, studioDocument: document },
    projectId: document.projectId,
    proposal,
    reviewReceipt: receipt,
  });
  expect(applied.snapshot.timeline[0].endRequest).toBe(15);
  expect(applied.snapshot.soundEffects).toHaveLength(0);
  const persisted = JSON.parse(JSON.stringify(applied.snapshot));
  const reopened = reconcileStudioDocument({
    snapshot: persisted,
    projectId: document.projectId,
    storedDocument: persisted.studioDocument,
  });
  expect(reopened.directorReviewJournal).toEqual(applied.document.directorReviewJournal);
  expect(reopened.journal[0].directorReview.receiptFingerprint).toBe(receipt.receiptFingerprint);
  const replay = await runStudioDirectorProposalOnSnapshot({
    snapshot: persisted,
    projectId: document.projectId,
    proposal,
    reviewReceipt: receipt,
  });
  expect(replay.duplicate).toBe(true);
  const undone = undoStudioCommandBatch(reopened, {
    baseRevision: reopened.revision,
    actor: { type: "human", id: "reviewer" },
    idempotencyKey: "undo-reviewed-trim",
  });
  expect(undone.document.directorReviewJournal).toEqual(reopened.directorReviewJournal);
  const historyRestored = rebaseStudioHistoryRestore({
    currentDocument: reopened,
    restoredSnapshot: { ...snapshot, studioDocument: document },
    projectId: document.projectId,
  });
  expect(historyRestored.directorReviewJournal).toEqual(reopened.directorReviewJournal);
});

test("rejected review survives save and blocks a conflicting approval", async () => {
  const snapshot = makeSnapshot();
  const document = adaptStudioSnapshotToDocument({
    snapshot,
    projectId: "director-review-project",
  });
  const { proposal } = await prepare(document);
  const receipt = await review(proposal, "reject");
  const rejected = await recordStudioDirectorReviewRejectionOnSnapshot({
    snapshot: { ...snapshot, studioDocument: document },
    projectId: document.projectId,
    proposal,
    reviewReceipt: receipt,
  });
  expect(rejected.document.revision).toBe(document.revision);
  expect(rejected.document.clipOccurrences).toEqual(document.clipOccurrences);
  expect(rejected.document.journal).toEqual([]);
  expect(rejected.reviewRecord).toMatchObject({
    commandJournalId: null,
    identityStatus: "client_claim_unverified",
    receipt: { decision: "reject", reviewerId: "human-reviewer" },
  });
  const persisted = JSON.parse(JSON.stringify(rejected.snapshot));
  const reopened = reconcileStudioDocument({
    snapshot: persisted,
    projectId: document.projectId,
    storedDocument: persisted.studioDocument,
  });
  expect(reopened.directorReviewJournal).toEqual([rejected.reviewRecord]);
  const duplicate = await recordStudioDirectorReviewRejection({
    document: reopened, proposal, reviewReceipt: receipt,
  });
  expect(duplicate.duplicate).toBe(true);
  await rejectCode(applyStudioDirectorProposal({
    document: reopened, proposal, reviewReceipt: await review(proposal),
  }), "REVIEW_CONFLICT");
});

test("review journal rejects broken command links and never claims verified identity", async () => {
  const document = makeDocument();
  const { proposal } = await prepare(document);
  const receipt = await review(proposal);
  expect(receipt.identityStatus).toBe("client_claim_unverified");
  const applied = await applyStudioDirectorProposal({ document, proposal, reviewReceipt: receipt });
  expect(() => validateStudioProjectDocument({
    ...applied.document,
    directorReviewJournal: [{
      ...applied.reviewRecord,
      commandJournalId: "revision:missing",
    }],
  })).toThrow();
  await rejectCode(applyStudioDirectorProposal({
    document: applied.document,
    proposal,
    reviewReceipt: { ...receipt, identityStatus: "server_verified" },
  }), "INVALID_REVIEW");
});

test("rejected, missing and mismatched reviews never apply an edit", async () => {
  const document = makeDocument();
  const { proposal } = await prepare(document);
  await rejectCode(applyStudioDirectorProposal({ document, proposal }), "INVALID_REVIEW");
  await rejectCode(applyStudioDirectorProposal({
    document, proposal, reviewReceipt: await review(proposal, "reject"),
  }), "REVIEW_NOT_APPROVED");
  const receipt = await review(proposal);
  await rejectCode(applyStudioDirectorProposal({
    document, proposal, reviewReceipt: { ...receipt, reviewerId: "other-reviewer" },
  }), "INVALID_REVIEW");
  expect(document.revision).toBe(0);
});

test("tampered proposal, stale revision and silent document changes fail closed", async () => {
  const document = makeDocument();
  const { proposal } = await prepare(document);
  const receipt = await review(proposal);
  await rejectCode(applyStudioDirectorProposal({
    document,
    proposal: { ...proposal, batch: { ...proposal.batch, operations: [endTrim()] } },
    reviewReceipt: receipt,
  }), "PROPOSAL_TAMPERED");
  await rejectCode(applyStudioDirectorProposal({
    document: { ...document, revision: 1 }, proposal, reviewReceipt: receipt,
  }), "STALE_REVISION");
  await rejectCode(applyStudioDirectorProposal({
    document: { ...document, styleRef: { id: "changed" } }, proposal, reviewReceipt: receipt,
  }), "DOCUMENT_CHANGED");
  expect(document.revision).toBe(0);
});

test("reviewed edge trim retimes speed and cues and keeps source captions independent", async () => {
  const document = makeDocument();
  const { proposal, preview } = await prepare(document, endTrim());
  expect(preview.previewDocument.clipOccurrences[0].sourceRange.endTick).toBe(secondsToTicks(15));
  const applied = await applyStudioDirectorProposal({
    document, proposal, reviewReceipt: await review(proposal),
  });
  expect(applied.document.programmeSpeedKeys[0].atProgrammeTick).toBe(secondsToTicks(12));
  expect(applied.document.linkedTiming.cues.soundEffects).toHaveLength(0);
  expect(applied.document.revision).toBe(1);
});

test("proposal preparation rejects unsupported, no-op, interior and tiny edits", async () => {
  const document = makeDocument();
  await rejectCode(prepare(document, { type: "remove_range", target: { occurrenceId: "main" } }),
    "UNSUPPORTED_DIRECTOR_OPERATION");
  await rejectCode(prepare(document, {
    type: "trim_clip", target: { occurrenceId: "main" },
    keep: { space: "source", startTick: 0, endTick: secondsToTicks(20) },
  }), "UNSUPPORTED_DIRECTOR_OPERATION");
  await rejectCode(prepare(document, {
    type: "trim_clip", target: { occurrenceId: "main" },
    keep: { space: "source", startTick: secondsToTicks(2), endTick: secondsToTicks(18) },
  }), "UNSUPPORTED_DIRECTOR_OPERATION");
  await rejectCode(prepare(document, {
    type: "split_clip", target: { occurrenceId: "main" },
    at: { space: "source", ticks: secondsToTicks(0.1) },
    newOccurrenceIds: { left: "left", right: "right" },
  }), "DIRECTOR_EDGE_LIMIT");
});
