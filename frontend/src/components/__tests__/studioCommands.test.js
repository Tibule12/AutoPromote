import {
  dryRunStudioCommandBatch,
  executeStudioCommandBatch,
  runStudioCommandOnSnapshot,
  undoStudioCommandBatch,
} from "../studioCommands";
import {
  adaptStudioSnapshotToDocument,
  rebaseStudioHistoryRestore,
} from "../studioProjectDocument";
import { secondsToTicks } from "../studioTime";
import { mapOutputTickToProgrammeTick } from "../studioTime";

const sourceSnapshot = () => ({
  orderedClips: [{ id: "source", start: 0, end: 20 }],
  selectedClipId: "source",
  timeline: [
    {
      id: "main",
      sourceClipId: "source",
      url: "https://example.com/source.mp4",
      startRequest: 0,
      endRequest: 20,
    },
  ],
  overlays: [],
  motionScenes: [],
  threeDScenes: [],
  speedKeyframes: [],
});

const batch = (document, operations, idempotencyKey = "request-1") => ({
  projectId: document.projectId,
  baseRevision: document.revision,
  idempotencyKey,
  actor: { type: "human", id: "test-editor" },
  operations,
});

const split = (id = "main", at = 8, left = "left", right = "right") => ({
  type: "split_clip",
  target: { occurrenceId: id },
  at: { space: "source", ticks: secondsToTicks(at) },
  newOccurrenceIds: { left, right },
});

test("dry run reports read/write sets without mutating the project", () => {
  const document = adaptStudioSnapshotToDocument({
    snapshot: sourceSnapshot(),
    projectId: "project",
  });
  const preview = dryRunStudioCommandBatch(document, batch(document, [split()]));
  expect(preview.newRevision).toBe(1);
  expect(preview.readSet).toContain("occurrence:main");
  expect(preview.writeSet).toContain("programme:timeline");
  expect(preview.previewDocument.clipOccurrences).toHaveLength(2);
  expect(document.clipOccurrences).toHaveLength(1);
});

test("manual snapshot adapter and headless command produce equivalent split state", () => {
  const snapshot = sourceSnapshot();
  const document = adaptStudioSnapshotToDocument({ snapshot, projectId: "project" });
  const command = batch(document, [split()]);
  const headless = executeStudioCommandBatch(document, command).document;
  const manual = runStudioCommandOnSnapshot({
    snapshot: { ...snapshot, studioDocument: document },
    projectId: "project",
    batch: command,
  });
  expect(manual.document).toEqual(headless);
  expect(
    manual.snapshot.timeline.map(clip => [clip.id, clip.startRequest, clip.endRequest])
  ).toEqual([
    ["left", 0, 8],
    ["right", 8, 20],
  ]);
});

test("split after a speed change preserves the programme speed reference", () => {
  const snapshot = {
    ...sourceSnapshot(),
    speedKeyframes: [
      { property: "speed", time: 0, value: 1 },
      { property: "speed", time: 10, value: 2 },
    ],
  };
  const document = adaptStudioSnapshotToDocument({ snapshot, projectId: "project" });
  const result = executeStudioCommandBatch(document, batch(document, [split()])).document;
  expect(result.programmeSpeedKeys).toEqual(document.programmeSpeedKeys);
  expect(result.clipOccurrences[1].programmeRange.startTick).toBe(secondsToTicks(8));
  const outputTick = secondsToTicks(8);
  const mappedProgrammeTick = mapOutputTickToProgrammeTick(document.outputTimeMap, outputTick);
  const outputSplit = executeStudioCommandBatch(
    document,
    batch(document, [
      {
        ...split(),
        at: { space: "output", ticks: secondsToTicks(8) },
      },
    ])
  ).document;
  expect(outputSplit.clipOccurrences[0].sourceRange.endTick).toBe(mappedProgrammeTick);
});

test("trim after split rebases later programme time and keeps source identity", () => {
  const snapshot = sourceSnapshot();
  const first = adaptStudioSnapshotToDocument({ snapshot, projectId: "project" });
  const splitResult = runStudioCommandOnSnapshot({
    snapshot: { ...snapshot, studioDocument: first },
    projectId: "project",
    batch: batch(first, [split()]),
  });
  const trim = {
    type: "trim_clip",
    target: { occurrenceId: "right" },
    keep: { space: "source", startTick: secondsToTicks(10), endTick: secondsToTicks(18) },
  };
  const result = runStudioCommandOnSnapshot({
    snapshot: splitResult.snapshot,
    projectId: "project",
    batch: batch(splitResult.document, [trim], "request-2"),
  });
  expect(result.snapshot.timeline.map(clip => [clip.startRequest, clip.endRequest])).toEqual([
    [0, 8],
    [10, 18],
  ]);
  expect(result.document.clipOccurrences[1].programmeRange).toEqual({
    space: "programme",
    startTick: secondsToTicks(8),
    endTick: secondsToTicks(16),
  });
});

test("locked ranges, stale revisions and duplicate idempotency fail safely", () => {
  const document = adaptStudioSnapshotToDocument({
    snapshot: sourceSnapshot(),
    projectId: "project",
  });
  const lock = {
    type: "preserve_range",
    target: { occurrenceId: "main" },
    lockId: "keep-middle",
    range: { space: "source", startTick: secondsToTicks(7), endTick: secondsToTicks(9) },
  };
  const locked = executeStudioCommandBatch(
    document,
    batch(document, [lock], "lock-request")
  ).document;
  expect(() =>
    executeStudioCommandBatch(locked, batch(locked, [split()], "split-request"))
  ).toThrow(/preserved range/);
  expect(() =>
    executeStudioCommandBatch(locked, batch(document, [split()], "stale-request"))
  ).toThrow(/Project changed/);
  const replay = executeStudioCommandBatch(locked, batch(document, [lock], "lock-request"));
  expect(replay.duplicate).toBe(true);
  expect(replay.document).toBe(locked);
  const reorderedReplay = executeStudioCommandBatch(locked, {
    operations: [{ range: lock.range, lockId: lock.lockId, target: lock.target, type: lock.type }],
    actor: { id: "test-editor", type: "human" },
    idempotencyKey: "lock-request",
    baseRevision: 0,
    projectId: "project",
  });
  expect(reorderedReplay.duplicate).toBe(true);
  expect(() =>
    executeStudioCommandBatch(locked, batch(document, [split()], "lock-request"))
  ).toThrow(/Idempotency key/);
});

test("failed operation keeps a multi-operation batch atomic", () => {
  const document = adaptStudioSnapshotToDocument({
    snapshot: sourceSnapshot(),
    projectId: "project",
  });
  const operations = [split(), split("missing", 10, "a", "b")];
  expect(() => executeStudioCommandBatch(document, batch(document, operations))).toThrow(
    /does not exist/
  );
  expect(document.revision).toBe(0);
  expect(document.clipOccurrences).toHaveLength(1);
});

test("one Director batch has one undo entry and undo restores the prior occurrence state", () => {
  const document = adaptStudioSnapshotToDocument({
    snapshot: sourceSnapshot(),
    projectId: "project",
  });
  const result = executeStudioCommandBatch(document, batch(document, [split()]));
  expect(result.document.journal).toHaveLength(1);
  const undoRequest = {
    baseRevision: 1,
    actor: { type: "ai", id: "director" },
    idempotencyKey: "undo-1",
  };
  const undone = undoStudioCommandBatch(result.document, undoRequest).document;
  expect(undone.revision).toBe(2);
  expect(undone.clipOccurrences).toEqual(document.clipOccurrences);
  expect(undoStudioCommandBatch(undone, undoRequest)).toMatchObject({
    document: undone,
    duplicate: true,
    undoneJournalId: "revision:1",
  });
});

test("undo after a trim restores both source ranges and output timing", () => {
  const document = adaptStudioSnapshotToDocument({
    snapshot: sourceSnapshot(),
    projectId: "project",
  });
  const trimmed = executeStudioCommandBatch(
    document,
    batch(document, [
      {
        type: "trim_clip",
        target: { occurrenceId: "main" },
        keep: { space: "source", startTick: secondsToTicks(2), endTick: secondsToTicks(15) },
      },
    ])
  ).document;
  expect(trimmed.outputTimeMap.at(-1).programmeRange.endTick).toBe(secondsToTicks(13));
  const undone = undoStudioCommandBatch(trimmed, {
    baseRevision: trimmed.revision,
    actor: { type: "human", id: "test-editor" },
    idempotencyKey: "undo-trim",
  }).document;
  expect(undone.outputTimeMap).toEqual(document.outputTimeMap);
  expect(undone.clipOccurrences).toEqual(document.clipOccurrences);
});

test("legacy UI history restore advances revision and rejects commands prepared before undo", () => {
  const snapshot = sourceSnapshot();
  const original = adaptStudioSnapshotToDocument({ snapshot, projectId: "project" });
  const splitBatch = batch(original, [split()]);
  const splitDocument = executeStudioCommandBatch(original, splitBatch).document;
  const restored = rebaseStudioHistoryRestore({
    currentDocument: splitDocument,
    restoredSnapshot: { ...snapshot, studioDocument: original },
    projectId: "project",
  });
  expect(restored.revision).toBe(2);
  expect(restored.clipOccurrences).toEqual(original.clipOccurrences);
  expect(restored.idempotency).toEqual(splitDocument.idempotency);
  expect(() =>
    executeStudioCommandBatch(
      restored,
      batch(splitDocument, [split("left", 4, "a", "b")], "stale-after-undo")
    )
  ).toThrow(/Project changed/);
});

test("unknown parameters fail instead of being silently ignored", () => {
  const document = adaptStudioSnapshotToDocument({
    snapshot: sourceSnapshot(),
    projectId: "project",
  });
  expect(() =>
    executeStudioCommandBatch(document, batch(document, [{ ...split(), hiddenPrompt: "do more" }]))
  ).toThrow(/unsupported field/);
});
