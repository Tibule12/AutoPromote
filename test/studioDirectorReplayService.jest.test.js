const crypto = require("crypto");
const {
  adaptStudioSnapshotToDocument,
} = require("../frontend/src/components/studioProjectDocument");
const {
  dryRunStudioCommandBatch,
  executeStudioCommandBatch,
} = require("../frontend/src/components/studioCommands");
const {
  computeStudioDirectorPreviewFingerprint,
} = require("../src/services/studioDirectorReplayService");

const canonicalHash = value => crypto.createHash("sha256")
  .update(JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
      : item
  )).digest("hex");

const sourceSnapshot = () => ({
  orderedClips: [{ id: "source", start: 0, end: 20 }],
  selectedClipId: "source",
  timeline: [{
    id: "main", sourceClipId: "source", startRequest: 0, endRequest: 20,
  }],
  overlays: [], motionScenes: [], threeDScenes: [], speedKeyframes: [],
});
const commandBatch = (document, operation, idempotencyKey = "replay-request") => ({
  projectId: document.projectId,
  baseRevision: document.revision,
  idempotencyKey,
  actor: { type: "ai", id: "director" },
  operations: [operation],
});
const splitOperation = () => ({
  type: "split_clip",
  target: { occurrenceId: "main" },
  at: { space: "source", ticks: 7 * 90_000 },
  newOccurrenceIds: { left: "main-left", right: "main-right" },
});
const trimOperation = (startTick, endTick) => ({
  type: "trim_clip",
  target: { occurrenceId: "main" },
  keep: { space: "source", startTick, endTick },
});

const expectBrowserParity = (document, batch) => {
  const original = JSON.stringify(document);
  const expected = canonicalHash(dryRunStudioCommandBatch(document, batch).previewDocument);
  expect(computeStudioDirectorPreviewFingerprint({ document, batch })).toBe(expected);
  expect(JSON.stringify(document)).toBe(original);
};

test("server replay matches browser split and both edge trims", () => {
  const document = adaptStudioSnapshotToDocument({
    snapshot: sourceSnapshot(), projectId: "project-1",
  });
  expectBrowserParity(document, commandBatch(document, splitOperation(), "split"));
  expectBrowserParity(document, commandBatch(document,
    trimOperation(2 * 90_000, 20 * 90_000), "trim-start"));
  expectBrowserParity(document, commandBatch(document,
    trimOperation(0, 16 * 90_000), "trim-end"));
});

test("server replay matches browser linked timing ripple and fractional ticks", () => {
  const snapshot = {
    ...sourceSnapshot(),
    timeline: [
      sourceSnapshot().timeline[0],
      { id: "later", sourceClipId: "source", startRequest: 0, endRequest: 10 },
    ],
    overlays: [{ id: "title", type: "text", text: "Impact", startTime: 8, duration: 2 }],
    soundEffects: [{ id: "hit", startTime: 8, duration: 1, trimStart: 0 }],
    voiceovers: [{ id: "voice", startTime: 2, duration: 8, trimStart: 0 }],
    motionScenes: [{ id: "motion", startTime: 8, duration: 2, soundOffset: 0.3 }],
    threeDScenes: [{ id: "scene", startTime: 8, duration: 2, text: "3D title" }],
    speedKeyframes: [
      { property: "speed", time: 0, value: 1 },
      { property: "speed", time: 10, value: 2 },
    ],
    motionKeyframes: [{ time: 8, value: 0.6 }],
    captionSegments: [{ id: "caption", text: "Source words", start: 6, end: 8 }],
  };
  const document = adaptStudioSnapshotToDocument({ snapshot, projectId: "project-1" });
  expectBrowserParity(document, commandBatch(document,
    trimOperation(2 * 90_000 + 11_111, 20 * 90_000), "linked-trim"));
});

test("locked, stale, and duplicate commands are rejected without a fingerprint", () => {
  const document = adaptStudioSnapshotToDocument({
    snapshot: sourceSnapshot(), projectId: "project-1",
  });
  const locked = executeStudioCommandBatch(document, commandBatch(document, {
    type: "preserve_range",
    target: { occurrenceId: "main" },
    lockId: "preserve-seven",
    range: { space: "source", startTick: 6 * 90_000, endTick: 8 * 90_000 },
  }, "lock" )).document;
  expect(() => computeStudioDirectorPreviewFingerprint({
    document: locked, batch: commandBatch(locked, splitOperation(), "locked-split"),
  })).toThrow(expect.objectContaining({
    code: "DIRECTOR_REPLAY_REJECTED", statusCode: 409,
  }));
  expect(() => computeStudioDirectorPreviewFingerprint({
    document: locked, batch: commandBatch(document, splitOperation(), "stale-split"),
  })).toThrow(expect.objectContaining({
    code: "DIRECTOR_REPLAY_REJECTED", statusCode: 409,
  }));
  const splitBatch = commandBatch(document, splitOperation(), "already-applied");
  const applied = executeStudioCommandBatch(document, splitBatch).document;
  expect(() => computeStudioDirectorPreviewFingerprint({
    document: applied, batch: splitBatch,
  })).toThrow(expect.objectContaining({
    code: "DIRECTOR_REPLAY_REJECTED", statusCode: 409,
  }));
});
