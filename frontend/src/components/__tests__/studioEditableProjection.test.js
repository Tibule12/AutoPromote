import {
  adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot,
  validateStudioProjectDocument,
} from "../studioProjectDocument";
import { normalizeStudio3DScene } from "../threeD/studio3DModel";
import { executeStudioCommandBatch, runStudioCommandOnSnapshot, undoStudioCommandBatch } from "../studioCommands";
import { secondsToTicks } from "../studioTime";

const copy = value => JSON.parse(JSON.stringify(value));
const mixed = () => ({
  timeline: [{ id: "main", sourceClipId: "camera", startRequest: 0, endRequest: 12,
    storagePath: "owned/camera.mp4", contentHash: "a".repeat(64), url: "https://signed.test/source" }],
  overlays: [{ id: "title", type: "text", text: "One story", startTime: 2, duration: 2,
    x: 50, y: 20, fontFamily: "Inter", fontSize: 42, color: "#ffffff", bg: "#000000",
    anchorX: 25, blendMode: "screen", glow: { radius: 3, color: "#8b5cf6" } },
  { id: "still", type: "image", startTime: 5, duration: 2, sourceStoragePath: "owned/still.png",
    contentHash: "b".repeat(64), src: "https://signed.test/still", width: 35, opacity: .8 }],
  threeDScenes: [normalizeStudio3DScene({ id: "scene", startTime: 3, duration: 3,
    text: "FINISH", secondary: "The payoff", material: "glass", primaryColor: "#abcdef",
    cameraMotion: .7, focalLength: 65, extrusionDepth: .6, bevel: .08,
    lightIntensity: 3.5, bloom: .2, reflections: false,
    assetStoragePath: "owned/brand.png", assetUrl: "https://signed.test/brand", assetName: "brand.png",
    hqPreviewJobId: "owned-job", hqPreviewRevision: "scene-v2:bound", hqPreviewUrl: "https://signed.test/hq",
    keyframes: [{ id: "pose", time: 4, easing: "spring", values: { rotationY: 45, scale: 1.4 } }] })],
  soundEffects: [{ id: "impact", kind: "sfx", builtIn: false, startTime: 6, duration: 1,
    trimStart: .2, volume: .35, fadeIn: .03, fadeOut: .2, enabled: true,
    storagePath: "owned/impact.wav", contentHash: "c".repeat(64), url: "https://signed.test/impact" }],
  voiceovers: [{ id: "voice", kind: "voiceover", startTime: 2, duration: 5,
    volume: .6, fadeIn: .1, fadeOut: .3, trimStart: 0, url: "https://signed.test/voice",
    storagePath: "owned/voice.wav", contentHash: "d".repeat(64) }],
  musicTrack: { id: "score", name: "Score", duration: 12, storagePath: "owned/score.wav",
    contentHash: "e".repeat(64), url: "https://signed.test/score" },
  addMusic: true, musicVolume: .25, musicDucking: true, musicDuckingStrength: .4,
  musicLoop: false, musicFadeIn: .5, musicFadeOut: 1,
  audioRemix: { version: 1, enabled: true, target: "music", speed: .9, pitch: -1 },
  trackStates: { sfx: { muted: false, solo: false }, music: { muted: false } },
  audioKeyframes: { dialogue: [{ time: 5, value: .4, property: "volume" }] },
});
const adapt = (snapshot, previousDocument = null) => adaptStudioSnapshotToDocument({
  snapshot, projectId: "mixed-project", previousDocument,
});

test("mixed canonical JSON retains all normalized 3D fields, owned refs, audio gain/fades and editorial timing", () => {
  const source = mixed();
  const doc = copy(adapt(source));
  const result = projectStudioEditableStateToSnapshot(doc, source);
  expect(result.timeline).toEqual(source.timeline);
  expect(result.overlays).toEqual(source.overlays);
  expect(result.threeDScenes).toEqual(source.threeDScenes);
  expect(result.soundEffects).toEqual(source.soundEffects);
  expect(result.voiceovers).toEqual(source.voiceovers);
  expect(result.musicTrack).toEqual(source.musicTrack);
  expect(result.audioRemix).toEqual(source.audioRemix);
  expect(result.audioKeyframes).toEqual(source.audioKeyframes);
  expect(result.trackStates).toEqual(source.trackStates);
  expect(adapt(result, doc).revision).toBe(doc.revision);
  expect(JSON.stringify(doc)).not.toContain("https://signed.test/");
});

test("canonical decisions override stale transport values and field removal does not resurrect old settings", () => {
  const source = mixed();
  const doc = copy(adapt(source));
  doc.layers[0].parameters.text = "The actual ending";
  delete doc.layers[0].parameters.glow;
  doc.layers.find(layer => layer.type === "three_d").parameters.focalLength = 80;
  doc.linkedTiming.cues.soundEffects[0].parameters.volume = .8;
  doc.linkedTiming.cues.soundEffects[0].programmeRange = {
    space: "programme", startTick: secondsToTicks(8), endTick: secondsToTicks(9),
  };
  doc.audioGraph.settings.musicVolume = .1;
  doc.audioGraph.routes.find(route => route.trackId === "sfx").state.muted = true;
  const result = projectStudioEditableStateToSnapshot(doc, source);
  expect(result.overlays[0].text).toBe("The actual ending");
  expect(result.overlays[0]).not.toHaveProperty("glow");
  expect(result.threeDScenes[0].focalLength).toBe(80);
  expect(result.soundEffects[0]).toMatchObject({ startTime: 8, duration: 1, volume: .8 });
  expect(result.musicVolume).toBe(.1);
  expect(result.trackStates.sfx.muted).toBe(true);
  expect(result.soundEffects[0].url).toBe(source.soundEffects[0].url);
});

test("URL refresh keeps the revision stable; real media/scene/mix changes advance it", () => {
  const source = mixed();
  const first = adapt(source);
  const refreshed = copy(source);
  refreshed.threeDScenes[0].assetUrl = "https://signed.test/refreshed-brand";
  refreshed.threeDScenes[0].hqPreviewUrl = "https://signed.test/refreshed-hq";
  refreshed.soundEffects[0].url = "https://signed.test/refreshed-impact";
  refreshed.musicTrack.url = "https://signed.test/refreshed-score";
  expect(adapt(refreshed, first).revision).toBe(first.revision);
  for (const change of [
    s => { s.threeDScenes[0].focalLength = 70; },
    s => { s.soundEffects[0].volume = .9; },
    s => { s.soundEffects[0].fadeOut = .8; },
    s => { s.musicTrack.contentHash = "f".repeat(64); },
    s => { s.audioRemix.pitch = 3; },
  ]) {
    const changed = copy(source); change(changed);
    expect(adapt(changed, first).revision).toBe(first.revision + 1);
  }
});

test("a changed media binding cannot inherit another artifact's URL/file or HQ cache", () => {
  const source = mixed();
  const doc = copy(adapt(source));
  doc.layers[1].parameters.sourceStoragePath = "owned/other-still.png";
  doc.layers[2].parameters.hqPreviewRevision = "scene-v2:new";
  doc.linkedTiming.cues.soundEffects[0].parameters.contentHash = "f".repeat(64);
  doc.audioGraph.music.id = "other-score";
  const result = projectStudioEditableStateToSnapshot(doc, source);
  expect(result.overlays[1]).not.toHaveProperty("src");
  expect(result.threeDScenes[0]).not.toHaveProperty("hqPreviewUrl");
  expect(result.soundEffects[0]).not.toHaveProperty("url");
  expect(result.musicTrack).not.toHaveProperty("url");
});

test("manual and headless Director trim retain identical complete scene/cue decisions and undo restores them", () => {
  const source = mixed();
  const doc = adapt(source);
  const command = { projectId: doc.projectId, baseRevision: doc.revision, idempotencyKey: "trim-mixed",
    actor: { type: "human", id: "editor" }, operations: [{ type: "trim_clip",
      target: { occurrenceId: "main" }, keep: { space: "source", startTick: secondsToTicks(1), endTick: secondsToTicks(12) } }] };
  const manual = runStudioCommandOnSnapshot({ snapshot: { ...source, studioDocument: doc },
    projectId: doc.projectId, batch: command });
  const headless = executeStudioCommandBatch(doc, command).document;
  expect(manual.document).toEqual(headless);
  const scene = headless.layers.find(layer => layer.type === "three_d");
  expect(scene.parameters).toMatchObject({ focalLength: 65, material: "glass", assetStoragePath: "owned/brand.png" });
  expect(headless.linkedTiming.cues.soundEffects[0].parameters).toMatchObject({ volume: .35, fadeOut: .2 });
  expect(manual.snapshot.soundEffects[0]).toMatchObject({ startTime: 5, volume: .35 });
  const undone = undoStudioCommandBatch(headless, { baseRevision: headless.revision,
    actor: { type: "human", id: "editor" }, idempotencyKey: "undo-mixed" }).document;
  expect(undone.layers).toEqual(doc.layers);
  expect(undone.linkedTiming).toEqual(doc.linkedTiming);
  expect(undone.audioGraph).toEqual(doc.audioGraph);
});

test("canonical decisions are detached from mutable snapshots and projected values", () => {
  const source = mixed();
  const doc = adapt(source);
  source.threeDScenes[0].keyframes[0].values.scale = 2;
  source.audioRemix.pitch = 7;
  expect(doc.layers[2].parameters.keyframes[0].values.scale).toBe(1.4);
  expect(doc.audioGraph.settings.audioRemix.pitch).toBe(-1);
  const result = projectStudioEditableStateToSnapshot(doc, source);
  result.threeDScenes[0].keyframes[0].values.scale = 3;
  result.audioRemix.pitch = 10;
  expect(doc.layers[2].parameters.keyframes[0].values.scale).toBe(1.4);
  expect(doc.audioGraph.settings.audioRemix.pitch).toBe(-1);
});

test("old v1 snapshots remain readable and unsupported parameter versions or transport fields fail", () => {
  const source = mixed();
  const old = copy(adapt(source));
  delete old.compatibility.editableStateVersion;
  expect(projectStudioEditableStateToSnapshot(old, source)).toEqual(source);
  expect(adapt(source, old).compatibility.editableStateVersion).toBe(1);
  for (const change of [
    d => { d.compatibility.editableStateVersion = 99; },
    d => { d.layers[0].parameterSchemaVersion = 99; },
    d => { d.linkedTiming.cues.soundEffects[0].parameters.url = "https://signed.test/secret"; },
    d => { d.audioGraph.settings.unknownEffect = true; },
  ]) {
    const doc = copy(adapt(source)); change(doc);
    expect(() => validateStudioProjectDocument(doc)).toThrow(/parameter|cue/);
  }
});
