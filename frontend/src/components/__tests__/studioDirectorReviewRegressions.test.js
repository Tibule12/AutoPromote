import { adaptStudioSnapshotToDocument, restoreStudioProjectCheckpoint } from "../studioProjectDocument";
import { executeStudioCommandBatch, undoStudioCommandBatch } from "../studioCommands";
import { assertStudioExportTimelineMatchesDocument, assertStudioSpeedPlanMatchesDocument,
  compileStudioTimelineForRender } from "../studioRenderCompiler";
import { buildSpeedSegmentsFromKeyframes } from "../studioCreatorRecipes";

const snapshot = () => ({
  timeline: [{ id: "main", sourceClipId: "source", startRequest: 0, endRequest: 20 }],
});
const original = () => adaptStudioSnapshotToDocument({ snapshot: snapshot(), projectId: "project" });
const split = (document, id, time, left, right) => executeStudioCommandBatch(document, {
  projectId: document.projectId, baseRevision: document.revision, idempotencyKey: left,
  actor: { type: "human", id: "editor" }, operations: [{
    type: "split_clip", target: { occurrenceId: id }, at: { space: "source", ticks: time * 90000 },
    newOccurrenceIds: { left, right },
  }],
}).document;
const undo = (document, key) => undoStudioCommandBatch(JSON.parse(JSON.stringify(document)), {
  baseRevision: document.revision, actor: { type: "human", id: "editor" }, idempotencyKey: key,
}).document;

test("successive undo restores original edits, including after editing an undone branch", () => {
  const source = original();
  const first = split(source, "main", 8, "left", "right");
  const second = split(first, "right", 12, "middle", "end");
  const once = undo(second, "undo-second");
  expect(once.clipOccurrences).toEqual(first.clipOccurrences);
  const twice = undo(once, "undo-first");
  expect(twice.clipOccurrences).toEqual(source.clipOccurrences);
  expect(twice.timeMaps).toEqual(source.timeMaps);
  expect(twice.revision).toBe(4);
  expect(() => undo(twice, "empty")).toThrow(/No latest command/);
  expect(second.clipOccurrences).toHaveLength(3);
  const branched = split(once, "right", 14, "new-middle", "new-end");
  expect(undo(undo(branched, "undo-branch"), "undo-original").clipOccurrences)
    .toEqual(source.clipOccurrences);
});

test("legacy full inverses still work and unjournalled revisions block unsafe undo", () => {
  const source = original();
  const applied = split(source, "main", 8, "left", "right");
  const fields = ["clipOccurrences", "timeMaps", "outputTimeMap", "constraints", "layers",
    "linkedTiming", "programmeSpeedKeys"];
  const legacy = { ...applied, journal: [{ ...applied.journal[0],
    inverse: Object.fromEntries(fields.map(field => [field, source[field]])) }] };
  expect(undo(legacy, "legacy-undo").clipOccurrences).toEqual(source.clipOccurrences);
  expect(() => undo({ ...legacy, revision: 2 }, "unsafe")).toThrow(/No latest command/);
});

test("compact trim inverse restores removed layers, cues, keys and source ranges", () => {
  const source = adaptStudioSnapshotToDocument({ projectId: "project", snapshot: {
    ...snapshot(),
    overlays: [
      { id: "removed", type: "text", text: "Opening", startTime: 0, duration: 1 },
      { id: "retained", type: "video", startTime: 1, duration: 10, sourceStartTime: 4 },
    ],
    soundEffects: [{ id: "cue", startTime: 0, duration: 2, trimStart: 0 }],
    reframeKeyframes: [{ id: "camera", time: 1, x: 25 }],
    captionSegments: [{ id: "words", text: "Keep these original words", start: 1, end: 8 }],
  } });
  const changed = executeStudioCommandBatch(source, {
    projectId: "project", baseRevision: 0, idempotencyKey: "trim", actor: { type: "human", id: "editor" },
    operations: [{ type: "trim_clip", target: { occurrenceId: "main" },
      keep: { space: "source", startTick: 450000, endTick: 1800000 } }],
  }).document;
  const restored = undo(changed, "restore");
  for (const field of ["clipOccurrences", "timeMaps", "outputTimeMap", "layers", "linkedTiming"]) {
    expect(restored[field]).toEqual(source[field]);
  }
  expect(JSON.stringify(changed.journal)).not.toContain("Keep these original words");
});

test.each([
  ["project", 8, 6, 9], ["project", 4, 6, 7], ["another-project", 90, 6, 7],
])("checkpoint uses newest matching revision (%s, %s, %s)",
  (currentId, currentRevision, savedRevision, expectedRevision) => {
    const source = original();
    const restored = restoreStudioProjectCheckpoint({ projectId: "project",
      restoredSnapshot: { ...snapshot(), studioDocument: source },
      currentDocument: { ...source, projectId: currentId, revision: currentRevision },
      savedDocument: { ...source, revision: savedRevision },
    });
    expect(restored.studioDocument.revision).toBe(expectedRevision);
    expect(restored.studioDocument.clipOccurrences).toEqual(source.clipOccurrences);
    expect(source.revision).toBe(0);
  });

test("fractional-frame export accepts equal endpoints but rejects actual timing changes", () => {
  const start = 2 * 1001 / 24000, end = 243 * 1001 / 24000;
  const document = adaptStudioSnapshotToDocument({ projectId: "fractional", snapshot: {
    timeline: [{ id: "clip", sourceClipId: "source", startRequest: start, endRequest: end }],
  } });
  const segment = { id: "clip", source_clip_id: "source", start_time: start,
    end_time: end, duration: end - start };
  expect(assertStudioExportTimelineMatchesDocument(document, [segment])).toBe(true);
  expect(assertStudioExportTimelineMatchesDocument(document, compileStudioTimelineForRender(document)))
    .toBe(true);
  for (const broken of [
    { ...segment, duration: segment.duration + 0.01 }, { ...segment, start_time: start + 0.01 },
    { ...segment, end_time: end + 0.01 }, { ...segment, duration: NaN },
  ]) expect(() => assertStudioExportTimelineMatchesDocument(document, [broken])).toThrow(/differs/);
});

test("canonical server key ordering preserves the validated speed map", () => {
  const keys = [{ property: "speed", time: 0, value: 1 }, { property: "speed", time: 20, value: 2 }];
  const document = adaptStudioSnapshotToDocument({ projectId: "project",
    snapshot: { ...snapshot(), speedKeyframes: keys } });
  const registered = JSON.parse(JSON.stringify(document, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value));
  expect(assertStudioSpeedPlanMatchesDocument(registered,
    buildSpeedSegmentsFromKeyframes({ keyframes: keys, duration: 20 }))).toBe(true);
});
