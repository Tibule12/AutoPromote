import fixture from "./fixtures/trim-end-linked-timing.json";
import { dryRunStudioCommandBatch } from "../studioCommands";
import { describeStudioDirectorReview } from "../studioDirectorReviewDiff";
import { adaptStudioSnapshotToDocument } from "../studioProjectDocument";
import { secondsToTicks } from "../studioTime";

const prepare = operation => {
  const document = adaptStudioSnapshotToDocument({
    projectId: fixture.projectId,
    snapshot: fixture.snapshot,
  });
  const batch = {
    projectId: document.projectId,
    baseRevision: document.revision,
    idempotencyKey: "director-review-diff",
    actor: { type: "ai", id: "bounded-director" },
    operations: [operation],
  };
  const previewDocument = dryRunStudioCommandBatch(document, batch).previewDocument;
  return { document, previewDocument, proposal: { projectId: document.projectId,
    baseRevision: document.revision, batch } };
};

test("shows exact clip, linked cue and speed timing for an end trim", () => {
  const review = describeStudioDirectorReview(prepare({
    type: "trim_clip",
    target: { occurrenceId: "first" },
    keep: { space: "source", startTick: 0, endTick: secondsToTicks(15) },
  }));
  expect(review.operationLabel).toBe("Trim clip");
  expect(review.clipRows).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: "first",
      beforeSourceRange: { startTick: 0, endTick: secondsToTicks(20) },
      afterSourceRange: { startTick: 0, endTick: secondsToTicks(15) },
    }),
    expect.objectContaining({
      id: "second",
      beforeProgrammeRange: { startTick: secondsToTicks(20), endTick: secondsToTicks(28) },
      afterProgrammeRange: { startTick: secondsToTicks(15), endTick: secondsToTicks(23) },
    }),
  ]));
  expect(review.timingRows).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: "boundary-cue",
      beforeProgrammeRange: { startTick: secondsToTicks(14.5), endTick: secondsToTicks(16.5) },
      afterProgrammeRange: { startTick: secondsToTicks(14.5), endTick: secondsToTicks(15) },
    }),
    expect.objectContaining({
      id: "removed-cue",
      beforeProgrammeRange: { startTick: secondsToTicks(17), endTick: secondsToTicks(17.5) },
      afterProgrammeRange: null,
    }),
    expect.objectContaining({
      id: "b-cue",
      beforeProgrammeRange: { startTick: secondsToTicks(22), endTick: secondsToTicks(22.5) },
      afterProgrammeRange: { startTick: secondsToTicks(17), endTick: secondsToTicks(17.5) },
    }),
  ]));
  expect(review.timingRows.some(row => row.label.startsWith("Speed key"))).toBe(true);
});

test("shows removed target and both new clip occurrences for a split", () => {
  const review = describeStudioDirectorReview(prepare({
    type: "split_clip",
    target: { occurrenceId: "first" },
    at: { space: "source", ticks: secondsToTicks(10) },
    newOccurrenceIds: { left: "first-left", right: "first-right" },
  }));
  expect(review.operationLabel).toBe("Split clip");
  expect(review.clipRows.map(row => row.id)).toEqual(["first", "first-left", "first-right"]);
  expect(review.clipRows[0].afterSourceRange).toBeNull();
  expect(review.clipRows[1].beforeSourceRange).toBeNull();
  expect(review.clipRows[2].afterSourceRange).toEqual({
    startTick: secondsToTicks(10), endTick: secondsToTicks(20),
  });
});

test("rejects a preview from another project", () => {
  const input = prepare({
    type: "trim_clip", target: { occurrenceId: "first" },
    keep: { space: "source", startTick: 0, endTick: secondsToTicks(15) },
  });
  expect(() => describeStudioDirectorReview({
    ...input, proposal: { ...input.proposal, projectId: "other" },
  })).toThrow(/do not match/);
});
