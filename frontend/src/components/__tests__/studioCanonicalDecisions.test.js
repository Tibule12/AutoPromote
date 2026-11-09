import { adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot,
  reconcileStudioDocument, validateStudioProjectDocument } from "../studioProjectDocument";
import { runStudioCommandOnSnapshot, undoStudioCommandBatch } from "../studioCommands";
import { secondsToTicks } from "../studioTime";

const project = () => ({
  timeline: [{ id: "main", sourceClipId: "source", sourceStoragePath: "owned/source.mp4",
    startRequest: 0, endRequest: 12, url: "https://media.test/source?token=old",
    transitionIn: "fade", transitionOut: "dissolve", transitionDuration: .3, audioTrimOffsetStart: .1 }],
  projectMedia: [{ id: "camera", storagePath: "owned/camera.mp4", duration: 12,
    url: "https://media.test/camera?token=old" }],
  orderedClips: [], angleGroups: [],
  overlays: [{ id: "still", type: "image", startTime: 2, duration: 4,
    titlePreset: "lower_third", clipId: "main", mixAudio: false,
    mask: { enabled: true, shape: "ellipse", feather: 8, inverted: true },
    chromaKey: { enabled: true, color: "#00ff00", tolerance: 30, spill: 35 },
    tracking: { enabled: true, mode: "point", status: "analysis_required" } }],
  subjectVfxScenes: [{ scene: { id: "subject", sourceId: "source" }, enabled: true,
    preview: { jobId: "owned-subject-job", revision: "source-scene", reviewed: true,
      url: "https://media.test/subject?token=old", receipt: { pixel_sha256: "a".repeat(64) } } }],
  captionCoverageMode: "selected",
  addHook: true, hookText: "Reviewed introduction", hookTemplate: "blur_reveal",
  hookStartTime: 1, hookEndTime: 3, hookFocusPoint: { x: 70, y: 40 },
  joinTransition: "dissolve", joinTransitionDuration: .3,
  silenceRemoval: true, silencePreview: { clipId: "main", keepSegments: [{ start: 0, end: 4 }] },
  removeWatermark: true, watermarkMode: "manual",
  manualWatermarkRegions: [{ id: "region", x: 5, y: 5, width: 10, height: 10 }],
  creatorPreview: { enabled: true, activeDemo: "mask", intensity: 30 },
  musicTrack: { id: "music", storagePath: "owned/music.wav", ducking: true, duckingStrength: .3,
    duckingMode: "speech", url: "https://media.test/music?token=old" },
});
const doc = snapshot => adaptStudioSnapshotToDocument({ snapshot, projectId: "decisions" });

test("mixed edit recovers canonical decisions over stale legacy settings and keeps fresh owned transport", () => {
  const snapshot = project(), document = JSON.parse(JSON.stringify(doc(snapshot)));
  const recovered = projectStudioEditableStateToSnapshot(document, { ...snapshot,
    hookText: "stale", joinTransition: "cut", silencePreview: null, manualWatermarkRegions: [],
    overlays: [{ ...snapshot.overlays[0], mask: { enabled: false } }],
    subjectVfxScenes: [{ ...snapshot.subjectVfxScenes[0], preview: { ...snapshot.subjectVfxScenes[0].preview,
      reviewed: false, url: "https://media.test/subject?token=fresh" } }],
    musicTrack: { ...snapshot.musicTrack, duckingStrength: .8 },
    timeline: [{ ...snapshot.timeline[0], transitionIn: "cut" }],
  });
  for (const field of ["captionCoverageMode", "hookText", "joinTransition", "silencePreview", "manualWatermarkRegions", "creatorPreview"])
    expect(recovered[field]).toEqual(snapshot[field]);
  expect(recovered.overlays[0].mask).toEqual(snapshot.overlays[0].mask);
  expect(recovered.overlays[0]).toMatchObject({ titlePreset: "lower_third", clipId: "main", mixAudio: false });
  expect(recovered.timeline[0].transitionIn).toBe("fade");
  expect(recovered.musicTrack.duckingStrength).toBe(.3);
  expect(recovered.subjectVfxScenes[0].preview).toMatchObject({ reviewed: true, url: "https://media.test/subject?token=fresh" });
  expect(JSON.stringify(document)).not.toContain("token=");
  expect(reconcileStudioDocument({ snapshot: recovered, projectId: "decisions", storedDocument: document })).toEqual(document);
  recovered.overlays[0].mask.feather = 99;
  expect(document.layers[0].parameters.mask.feather).toBe(8);
});

test.each(["captionCoverageMode", "hookText", "joinTransition", "silencePreview", "manualWatermarkRegions", "creatorPreview"])(
  "%s change invalidates canonical revision", field => {
    const snapshot = project(), first = doc(snapshot), before = JSON.stringify(first);
    delete snapshot[field];
    const second = reconcileStudioDocument({ snapshot, projectId: "decisions", storedDocument: first });
    expect(second.revision).toBe(first.revision + 1);
    expect(JSON.stringify(first)).toBe(before);
    expect(projectStudioEditableStateToSnapshot(second, project())[field]).toBeUndefined();
  });

test("old visual saves retain unmigrated decisions and acquire the explicit boundary exactly once", () => {
  const snapshot = project(), old = doc(snapshot);
  delete old.editGraph; delete old.compatibility.editStateVersion;
  for (const layer of old.layers.filter(layer => layer.type !== "subject_vfx")) {
    layer.parameterSchemaVersion = 1;
    for (const field of ["mask", "chromaKey", "tracking", "titlePreset", "clipId", "mixAudio"]) delete layer.parameters[field];
  }
  const recovered = projectStudioEditableStateToSnapshot(old, snapshot);
  expect(recovered.hookText).toBe(snapshot.hookText);
  expect(recovered.overlays[0].mask).toEqual(snapshot.overlays[0].mask);
  const upgraded = reconcileStudioDocument({ snapshot: recovered, projectId: "decisions", storedDocument: old });
  expect(upgraded.revision).toBe(old.revision + 1);
  expect(reconcileStudioDocument({ snapshot: recovered, projectId: "decisions", storedDocument: upgraded })).toEqual(upgraded);
});

test("changed media and effect jobs cannot retain stale transport or approvals", () => {
  const snapshot = project(), document = doc(snapshot);
  document.editGraph.media[0].storagePath = "owned/other.mp4";
  document.layers.find(layer => layer.type === "subject_vfx").parameters.preview.jobId = "new-job";
  const recovered = projectStudioEditableStateToSnapshot(document, snapshot);
  expect(recovered.projectMedia[0].url).toBeUndefined();
  expect(recovered.subjectVfxScenes[0].preview.url).toBeUndefined();
  expect(() => validateStudioProjectDocument({ ...document, editGraph: { ...document.editGraph,
    media: [{ ...document.editGraph.media[0], url: "https://bad.test" }] } })).toThrow();
});

test("split, trim and undo agree between canonical command and manual snapshot with masks/hooks/transitions", () => {
  const snapshot = project(); snapshot.subjectVfxScenes = [];
  const first = doc(snapshot);
  const batch = { projectId: "decisions", baseRevision: first.revision, idempotencyKey: "split-decisions",
    actor: { type: "human", id: "editor" }, operations: [{ type: "split_clip", target: { occurrenceId: "main" },
      at: { space: "source", ticks: secondsToTicks(6) }, newOccurrenceIds: { left: "left", right: "right" } }] };
  const result = runStudioCommandOnSnapshot({ snapshot: { ...snapshot, studioDocument: first }, projectId: "decisions", batch });
  expect(result.document.editGraph.hookBinding.occurrenceId).toBe("left");
  expect(result.snapshot.timeline[1].transitionOut).toBe("dissolve");
  expect(result.document.layers[0].parameters.mask).toEqual(snapshot.overlays[0].mask);
  const undone = undoStudioCommandBatch(result.document, { baseRevision: result.document.revision,
    idempotencyKey: "undo-decisions", actor: { type: "human", id: "editor" } }).document;
  expect(undone.editGraph).toEqual(first.editGraph);
  expect(undone.clipOccurrences).toEqual(first.clipOccurrences);
});
