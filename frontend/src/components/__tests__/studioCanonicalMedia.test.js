import {
  adaptStudioSnapshotToDocument,
  projectStudioLinkedTimingToSnapshot,
  projectStudioEditableStateToSnapshot,
  reconcileStudioDocument,
} from "../studioProjectDocument";
import { normalizeStudio3DScene } from "../threeD/studio3DModel";
import {
  executeStudioCommandBatch, runStudioCommandOnSnapshot, undoStudioCommandBatch,
} from "../studioCommands";
import { secondsToTicks } from "../studioTime";

const mixedProject = () => ({
  timeline: [{ id: "main", sourceClipId: "source", sourceStoragePath: "owned/footage.mp4",
    startRequest: 0, endRequest: 12, url: "https://media.test/footage?token=old" }],
  overlays: [{ id: "still", type: "image", sourceStoragePath: "owned/still.png",
    src: "https://media.test/still?token=old", startTime: 3, duration: 4,
    x: 32, y: 64, scale: .7, frameShape: "round", blendMode: "screen" }],
  motionScenes: [],
  threeDScenes: [normalizeStudio3DScene({ id: "scene", text: "QA scene", secondary: "State check",
    startTime: 3, duration: 4, assetStoragePath: "owned/mesh.glb",
    assetUrl: "https://media.test/mesh?token=old", assetName: "mesh.glb",
    rotationX: 24, rotationY: -12, rotationZ: 6, primaryColor: "#123456",
    secondaryColor: "#654321", extrusionDepth: .54, bevel: .07,
    focalLength: 65, cameraMotion: .4, lightIntensity: 3, lightColor: "#abcdef",
    hold: "orbit", intensity: .4, audioReactiveIntensity: .6,
    hqPreviewJobId: "owned-job", hqPreviewRevision: "scene-v2:qa:1234567890123456",
    hqPreviewUrl: "https://media.test/hq?token=old",
    keyframes: [{ id: "pose", time: 5, easing: "linear", values: { x: 72, scale: 1.4 } }],
  })],
  soundEffects: [{ id: "cue", name: "Imported cue", sourceStoragePath: "owned/cue.wav",
    url: "https://media.test/cue?token=old", builtIn: false, tone: "custom",
    startTime: 3, duration: 4, trimStart: .5, volume: 0, fadeIn: .2, fadeOut: .4,
    enabled: true }],
  voiceovers: [], adjustmentLayers: [], speedKeyframes: [],
});
const documentFor = snapshot => adaptStudioSnapshotToDocument({ snapshot, projectId: "mixed" });
const trimBatch = document => ({ projectId: "mixed", baseRevision: document.revision,
  idempotencyKey: "trim-mixed", actor: { type: "human", id: "editor" },
  operations: [{ type: "trim_clip", target: { occurrenceId: "main" },
    keep: { space: "source", startTick: secondsToTicks(1), endTick: secondsToTicks(12) } }],
});
const withoutLinks = item => Object.fromEntries(Object.entries(item)
  .filter(([key]) => !["assetUrl", "hqPreviewUrl", "url", "src"].includes(key)));

test("canonical JSON roundtrip retains the complete normalized 3D scene, owned still and audio decisions", () => {
  const snapshot = mixedProject();
  const document = JSON.parse(JSON.stringify(documentFor(snapshot)));
  const recovered = projectStudioLinkedTimingToSnapshot(document);
  expect(withoutLinks(recovered.threeDScenes[0])).toEqual(withoutLinks(snapshot.threeDScenes[0]));
  expect(recovered.overlays[0]).toEqual(withoutLinks(snapshot.overlays[0]));
  expect(recovered.soundEffects[0]).toEqual(withoutLinks(snapshot.soundEffects[0]));
  expect(JSON.stringify(document)).not.toContain("token=old");
});

test.each([
  ["camera", snapshot => { snapshot.threeDScenes[0].focalLength = 35; }],
  ["asset", snapshot => { snapshot.threeDScenes[0].assetStoragePath = "owned/other.glb"; }],
  ["audio gain", snapshot => { snapshot.soundEffects[0].volume = .6; }],
  ["audio fade", snapshot => { snapshot.soundEffects[0].fadeOut = .8; }],
])("%s edit advances revision without mutating the prior canonical document", (_name, change) => {
  const snapshot = mixedProject();
  const first = documentFor(snapshot);
  const bytes = JSON.stringify(first);
  change(snapshot);
  const changed = adaptStudioSnapshotToDocument({ snapshot, projectId: "mixed", previousDocument: first });
  expect(changed.revision).toBe(first.revision + 1);
  expect(JSON.stringify(first)).toBe(bytes);
});

test("refreshed signed media/HQ links do not count as edits", () => {
  const snapshot = mixedProject();
  const first = documentFor(snapshot);
  snapshot.threeDScenes[0].assetUrl += "-refreshed";
  snapshot.threeDScenes[0].hqPreviewUrl += "-refreshed";
  snapshot.soundEffects[0].url += "-refreshed";
  const second = adaptStudioSnapshotToDocument({ snapshot, projectId: "mixed", previousDocument: first });
  expect(second.revision).toBe(first.revision);
});

test("manual and headless trim preserve camera/material/HQ and gain/fades; undo and reconciliation agree", () => {
  const snapshot = mixedProject();
  const first = documentFor(snapshot);
  const batch = trimBatch(first);
  const manual = runStudioCommandOnSnapshot({ snapshot: { ...snapshot, studioDocument: first },
    projectId: "mixed", batch });
  const headless = executeStudioCommandBatch(first, batch).document;
  expect(manual.document).toEqual(headless);
  const recovered = projectStudioLinkedTimingToSnapshot(JSON.parse(JSON.stringify(headless)));
  expect(recovered.threeDScenes[0]).toMatchObject({ startTime: 2, rotationX: 24,
    focalLength: 65, extrusionDepth: .54, assetStoragePath: "owned/mesh.glb", hqPreviewJobId: "owned-job" });
  expect(recovered.soundEffects[0]).toMatchObject({ startTime: 2, volume: 0, fadeIn: .2,
    fadeOut: .4, sourceStoragePath: "owned/cue.wav" });
  expect(reconcileStudioDocument({ snapshot: manual.snapshot, projectId: "mixed",
    storedDocument: manual.document }).revision).toBe(headless.revision);
  const undone = undoStudioCommandBatch(headless, { baseRevision: headless.revision,
    idempotencyKey: "undo-mixed", actor: { type: "human", id: "editor" } }).document;
  expect(undone.layers).toEqual(first.layers);
  expect(undone.linkedTiming).toEqual(first.linkedTiming);
});

test("reopen/export projection uses canonical decisions and fresh access links for the same media", () => {
  const snapshot = mixedProject();
  const document = JSON.parse(JSON.stringify(documentFor(snapshot)));
  snapshot.threeDScenes[0].focalLength = 24;
  snapshot.soundEffects[0].volume = 1;
  snapshot.soundEffects[0].url = "https://media.test/cue?token=fresh";
  const projected = projectStudioEditableStateToSnapshot(document, snapshot);
  expect(projected.threeDScenes[0].focalLength).toBe(65);
  expect(projected.soundEffects[0].volume).toBe(0);
  expect(projected.soundEffects[0].url).toBe("https://media.test/cue?token=fresh");
  expect(snapshot.threeDScenes[0].focalLength).toBe(24);
});

test("replacing an owned asset or HQ result never reuses an unrelated transport URL", () => {
  const snapshot = mixedProject();
  snapshot.overlays[0].previewUrl = snapshot.overlays[0].src;
  const document = documentFor(snapshot);
  const layer = document.layers.find(layer => layer.layerId === "still");
  layer.parameters.sourceStoragePath = "owned/replacement.png";
  const scene = document.layers.find(layer => layer.layerId === "scene");
  scene.parameters.assetStoragePath = "owned/replacement.glb";
  scene.parameters.hqPreviewJobId = "replacement-job";
  const projected = projectStudioEditableStateToSnapshot(document, snapshot);
  expect(projected.overlays[0].src).toBeUndefined();
  expect(projected.overlays[0].previewUrl).toBeUndefined();
  expect(projected.threeDScenes[0].assetUrl).toBeUndefined();
  expect(projected.threeDScenes[0].hqPreviewUrl).toBeUndefined();
});

test("editing recovered nested keys and audio routes cannot mutate the saved document", () => {
  const snapshot = mixedProject();
  snapshot.audioKeyframes = { sfx: [{ time: 2, values: { volume: .4 } }] };
  snapshot.trackStates = { sfx: { muted: false, metadata: { label: "SFX" } } };
  const document = documentFor(snapshot);
  const bytes = JSON.stringify(document);
  const projected = projectStudioEditableStateToSnapshot(document, snapshot);
  projected.threeDScenes[0].keyframes[0].values.x = 12;
  // Linked keys use the same projection as headless command timing.
  const keys = projectStudioLinkedTimingToSnapshot(document);
  keys.audioKeyframes.sfx[0].values.volume = .9;
  projected.trackStates.sfx.metadata.label = "Changed";
  expect(JSON.stringify(document)).toBe(bytes);
});

test("older v1 documents preserve their saved snapshot and upgrade through reconciliation", () => {
  const snapshot = mixedProject();
  const old = documentFor(snapshot);
  delete old.compatibility.editableStateVersion;
  delete old.audioGraph.parameterSchemaVersion;
  delete old.audioGraph.settings;
  delete old.audioGraph.music;
  old.layers.forEach(layer => { delete layer.parameterSchemaVersion; });
  Object.values(old.linkedTiming.cues).flat().forEach(cue => {
    delete cue.parameterSchemaVersion;
    delete cue.parameters;
  });
  expect(projectStudioEditableStateToSnapshot(old, snapshot)).toEqual(snapshot);
  const upgraded = reconcileStudioDocument({ snapshot, projectId: "mixed", storedDocument: old });
  expect(upgraded.compatibility.editableStateVersion).toBe(1);
  expect(upgraded.revision).toBe(old.revision + 1);
  expect(projectStudioLinkedTimingToSnapshot(upgraded).soundEffects[0].volume).toBe(0);
});

test("speed point identity survives reopen so changing one easing cannot change every point", () => {
  const snapshot = mixedProject();
  snapshot.speedKeyframes = [
    { id: "slow", property: "speed", time: 0, value: 1, easing: "linear" },
    { id: "fast", property: "speed", time: 6, value: 2, easing: "ease_out" },
  ];
  const document = JSON.parse(JSON.stringify(documentFor(snapshot)));
  const restored = projectStudioEditableStateToSnapshot(document, snapshot);
  expect(restored.speedKeyframes.map(key => key.id)).toEqual(["slow", "fast"]);
  restored.speedKeyframes = restored.speedKeyframes.map(key => key.id === "fast"
    ? { ...key, easing: "linear" } : key);
  expect(restored.speedKeyframes[0].easing).toBe("linear");
  expect(document.programmeSpeedKeys[1].easing).toBe("ease_out");
  expect(reconcileStudioDocument({ snapshot: restored, projectId: "mixed",
    storedDocument: document }).revision).toBe(document.revision + 1);
});

test("canonical source replacement cannot display the previous footage under the new owned identity", () => {
  const snapshot = mixedProject();
  const document = documentFor(snapshot);
  document.assets[0].storagePath = "owned/replacement-footage.mp4";
  const restored = projectStudioEditableStateToSnapshot(document, snapshot);
  expect(restored.timeline[0].sourceStoragePath).toBe("owned/replacement-footage.mp4");
  expect(restored.timeline[0].url).toBeUndefined();
  expect(snapshot.timeline[0].url).toBe("https://media.test/footage?token=old");
});
