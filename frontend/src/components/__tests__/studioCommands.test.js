import {
  dryRunStudioCommandBatch,
  executeStudioCommandBatch,
  runStudioCommandOnSnapshot,
  undoStudioCommandBatch,
} from "../studioCommands";
import {
  adaptStudioSnapshotToDocument,
  buildStudioLinkedTimingFromSnapshot,
  reconcileStudioDocument,
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

test("AI actor requires the explicit Director capability gate", () => {
  const document = adaptStudioSnapshotToDocument({
    snapshot: sourceSnapshot(), projectId: "project",
  });
  const allowed = { ...batch(document, [split()]),
    actor: { type: "ai", id: "reviewed-director" } };
  expect(() => dryRunStudioCommandBatch(document, allowed)).not.toThrow();
  const blocked = { ...allowed, operations: [{ type: "preserve_range",
    target: { occurrenceId: "main" },
    range: { space: "source", startTick: 0, endTick: 90_000 }, lockId: "lock-1" }] };
  expect(() => dryRunStudioCommandBatch(document, blocked))
    .toThrow(/not released/);
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

test("direct trim rejects older documents without linked timing references", () => {
  const current = adaptStudioSnapshotToDocument({
    snapshot: sourceSnapshot(),
    projectId: "project",
  });
  const olderDocument = { ...current };
  delete olderDocument.linkedTiming;
  const command = batch(olderDocument, [{
    type: "trim_clip",
    target: { occurrenceId: "main" },
    keep: { space: "source", startTick: secondsToTicks(5), endTick: secondsToTicks(20) },
  }]);
  let failure;
  try {
    executeStudioCommandBatch(olderDocument, command);
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ code: "UNSUPPORTED_LINKED_TIMING" });
  expect(olderDocument.clipOccurrences[0].sourceRange.startTick).toBe(0);
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

test("trim ripples linked programme cues and keys with one canonical revision", () => {
  const snapshot = {
    ...sourceSnapshot(),
    timeline: [
      sourceSnapshot().timeline[0],
      { id: "later", sourceClipId: "source", startRequest: 0, endRequest: 10 },
    ],
    overlays: [{ id: "title", type: "text", text: "Impact", startTime: 8, duration: 2 }],
    soundEffects: [
      { id: "hit", tone: "impact", startTime: 8, duration: 1, trimStart: 0 },
      { id: "later-hit", tone: "click", startTime: 22, duration: 1 },
    ],
    voiceovers: [{ id: "voice", startTime: 0, duration: 8, trimStart: 0 }],
    adjustmentLayers: [{ id: "grade", startTime: 8, duration: 3 }],
    motionScenes: [{ id: "motion", startTime: 8, duration: 2, soundOffset: 0.3 }],
    threeDScenes: [{ id: "scene", startTime: 8, duration: 2, text: "3D title" }],
    speedKeyframes: [
      { property: "speed", time: 0, value: 1 },
      { property: "speed", time: 5, value: 2 },
      { property: "speed", time: 10, value: 2 },
      { property: "speed", time: 20, value: 1 },
    ],
    motionKeyframes: [{ time: 8, value: 0.6 }],
    finishKeyframes: [{ time: 22, value: 0.8 }],
    reframeKeyframes: [
      { time: 2, x: 10 },
      { time: 8, x: 80 },
    ],
    speakerFocusCuts: [{ time: 22, sourceId: "source" }],
    audioKeyframes: { dialogue: [{ time: 22, volume: 0.4 }] },
    speakerStackFraming: { top: { keyframes: [{ time: 22, x: 50 }] } },
    captionSegments: [{ id: "caption", text: "Retained source words", start: 6, end: 8 }],
  };
  const document = adaptStudioSnapshotToDocument({ snapshot, projectId: "project" });
  const command = batch(
    document,
    [
      {
        type: "trim_clip",
        target: { occurrenceId: "main" },
        keep: { space: "source", startTick: secondsToTicks(5), endTick: secondsToTicks(20) },
      },
    ],
    "trim-linked"
  );
  const result = runStudioCommandOnSnapshot({
    snapshot: { ...snapshot, studioDocument: document },
    projectId: "project",
    batch: command,
  });
  expect(result.document.revision).toBe(document.revision + 1);
  expect(result.document.clipOccurrences[1].programmeRange.startTick).toBe(secondsToTicks(15));
  expect(result.document.programmeSpeedKeys.map(key => key.atProgrammeTick)).toEqual(
    [0, 5, 15].map(secondsToTicks)
  );
  expect(result.snapshot.overlays[0].startTime).toBe(3);
  expect(result.snapshot.soundEffects.map(cue => cue.startTime)).toEqual([3, 17]);
  expect(result.snapshot.voiceovers[0]).toMatchObject({ startTime: 0, duration: 3, trimStart: 5 });
  expect(result.snapshot.motionScenes[0].startTime).toBe(3);
  expect(result.snapshot.threeDScenes[0].startTime).toBe(3);
  expect(result.snapshot.motionKeyframes[0].time).toBe(3);
  expect(result.snapshot.finishKeyframes[0].time).toBe(17);
  expect(result.snapshot.reframeKeyframes.map(key => key.time)).toEqual([0, 3]);
  expect(result.snapshot.audioKeyframes.dialogue[0].time).toBe(17);
  expect(result.snapshot.speakerStackFraming.top.keyframes[0].time).toBe(17);
  expect(result.snapshot.captionSegments).toEqual(snapshot.captionSegments);
  expect(result.document.linkedTiming).toEqual(
    buildStudioLinkedTimingFromSnapshot(result.snapshot)
  );
  expect(
    reconcileStudioDocument({
      snapshot: result.snapshot,
      projectId: "project",
      storedDocument: result.document,
    }).revision
  ).toBe(result.document.revision);
  const headless = executeStudioCommandBatch(document, command).document;
  expect(result.document).toEqual(headless);
  const undone = undoStudioCommandBatch(headless, {
    baseRevision: headless.revision,
    actor: { type: "human", id: "test-editor" },
    idempotencyKey: "undo-linked",
  }).document;
  expect(undone.layers).toEqual(document.layers);
  expect(undone.linkedTiming).toEqual(document.linkedTiming);
  expect(undone.programmeSpeedKeys).toEqual(document.programmeSpeedKeys);
});

test("trim continuation IDs are deterministic and locks or stale writes reject the whole edit", () => {
  const snapshot = {
    ...sourceSnapshot(),
    timeline: [
      { id: "first", sourceClipId: "source", startRequest: 0, endRequest: 4 },
      sourceSnapshot().timeline[0],
    ],
    overlays: [{ id: "long", type: "video", startTime: 1, duration: 10, sourceStartTime: 4 }],
    soundEffects: [{ id: "long-sound", startTime: 1, duration: 10, trimStart: 0 }],
  };
  const original = adaptStudioSnapshotToDocument({ snapshot, projectId: "project" });
  const operation = {
    type: "trim_clip",
    target: { occurrenceId: "main" },
    keep: { space: "source", startTick: secondsToTicks(4), endTick: secondsToTicks(20) },
  };
  const request = batch(original, [operation], "trim-middle");
  const first = runStudioCommandOnSnapshot({
    snapshot: { ...snapshot, studioDocument: original },
    projectId: "project",
    batch: request,
  });
  const second = runStudioCommandOnSnapshot({
    snapshot: { ...snapshot, studioDocument: original },
    projectId: "project",
    batch: request,
  });
  expect(first.snapshot.overlays).toEqual(second.snapshot.overlays);
  expect(first.snapshot.soundEffects).toEqual(second.snapshot.soundEffects);
  expect(first.snapshot.overlays[1].id).toMatch(/^retained-layer:trim-middle:/);
  expect(first.snapshot.soundEffects[1].id).toMatch(/^retained-layer:trim-middle:/);
  expect(
    new Set([...first.snapshot.overlays, ...first.snapshot.soundEffects].map(item => item.id)).size
  ).toBe(4);
  const locked = executeStudioCommandBatch(
    original,
    batch(
      original,
      [
        {
          type: "preserve_range",
          target: { occurrenceId: "main" },
          lockId: "keep-opening",
          range: { space: "source", startTick: secondsToTicks(2), endTick: secondsToTicks(3) },
        },
      ],
      "lock-opening"
    )
  ).document;
  expect(() =>
    executeStudioCommandBatch(locked, batch(locked, [operation], "trim-locked"))
  ).toThrow(/preserved range/);
  expect(() => executeStudioCommandBatch(locked, request)).toThrow(/Project changed/);
  expect(locked.clipOccurrences).toEqual(original.clipOccurrences);
});

test("end trim removes its tail and ripples later cues without changing source captions", () => {
  const snapshot = {
    ...sourceSnapshot(),
    timeline: [
      { ...sourceSnapshot().timeline[0], endRequest: 10 },
      { id: "later", sourceClipId: "source", startRequest: 0, endRequest: 10 },
    ],
    soundEffects: [{ id: "next", startTime: 12, duration: 1 }],
    speedKeyframes: [
      { property: "speed", time: 0, value: 1 },
      { property: "speed", time: 8, value: 2 },
      { property: "speed", time: 12, value: 1.5 },
    ],
    captionSegments: [{ id: "words", start: 1, end: 3, text: "Source words" }],
  };
  const original = adaptStudioSnapshotToDocument({ snapshot, projectId: "project" });
  const trimmed = runStudioCommandOnSnapshot({
    snapshot: { ...snapshot, studioDocument: original },
    projectId: "project",
    batch: batch(
      original,
      [
        {
          type: "trim_clip",
          target: { occurrenceId: "main" },
          keep: { space: "source", startTick: 0, endTick: secondsToTicks(6) },
        },
      ],
      "trim-end"
    ),
  });
  expect(trimmed.snapshot.timeline.map(clip => clip.endRequest)).toEqual([6, 10]);
  expect(trimmed.snapshot.soundEffects[0].startTime).toBe(8);
  expect(trimmed.snapshot.speedKeyframes.map(key => key.time)).toEqual([0, 8]);
  expect(trimmed.snapshot.captionSegments).toEqual(snapshot.captionSegments);
  expect(trimmed.document.clipOccurrences[1].programmeRange.startTick).toBe(secondsToTicks(6));
  expect(trimmed.document.outputTimeMap.at(-1).programmeRange.endTick).toBe(secondsToTicks(16));
});

test("fractional cue and 3D pose times reconcile on the integer media clock", () => {
  const snapshot = {
    ...sourceSnapshot(),
    overlays: [
      {
        id: "b-roll",
        type: "video",
        startTime: 1.23456,
        duration: 9.87654,
        sourceStartTime: 0.34567,
      },
    ],
    motionScenes: [{ id: "motion", startTime: 1.23456, duration: 9.87654, soundOffset: 2.34567 }],
    threeDScenes: [
      {
        id: "scene",
        startTime: 1.23456,
        duration: 8.76543,
        text: "Pose",
        template: "neon_logo",
        keyframes: [{ id: "pose", time: 7.65432, easing: "linear", values: { x: 60 } }],
      },
    ],
    soundEffects: [{ id: "sound", startTime: 1.23456, duration: 9.87654, trimStart: 0.34567 }],
  };
  const original = adaptStudioSnapshotToDocument({ snapshot, projectId: "project" });
  const result = runStudioCommandOnSnapshot({
    snapshot: { ...snapshot, studioDocument: original },
    projectId: "project",
    batch: batch(
      original,
      [
        {
          type: "trim_clip",
          target: { occurrenceId: "main" },
          keep: {
            space: "source",
            startTick: secondsToTicks(2.12345),
            endTick: secondsToTicks(20),
          },
        },
      ],
      "fractional-trim"
    ),
  });
  expect(
    reconcileStudioDocument({
      snapshot: result.snapshot,
      projectId: "project",
      storedDocument: result.document,
    }).revision
  ).toBe(result.document.revision);
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
