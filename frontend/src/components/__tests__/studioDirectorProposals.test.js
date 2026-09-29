import { webcrypto } from "crypto";
import { TextEncoder } from "util";
import { adaptStudioSnapshotToDocument } from "../studioProjectDocument";
import {
  applyStudioDirectorProposal,
  createStudioDirectorReviewReceipt,
  prepareStudioDirectorProposal,
} from "../studioDirectorProposals";
import { secondsToTicks } from "../studioTime";

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  globalThis.TextEncoder = TextEncoder;
});

const makeDocument = () => adaptStudioSnapshotToDocument({
  projectId: "director-review-project",
  snapshot: {
    orderedClips: [{ id: "source", start: 0, end: 20 }],
    selectedClipId: "source",
    timeline: [{ id: "main", sourceClipId: "source", startRequest: 0, endRequest: 20 }],
    soundEffects: [{ id: "cue", startTime: 15, duration: 1 }],
    speedKeyframes: [{ property: "speed", time: 12, value: 2 }],
  },
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
  const replay = await applyStudioDirectorProposal({ document: applied.document, proposal, reviewReceipt: receipt });
  expect(replay.duplicate).toBe(true);
  expect(replay.document).toBe(applied.document);
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
