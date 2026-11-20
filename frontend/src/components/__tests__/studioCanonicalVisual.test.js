import {
  adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot,
  reconcileStudioDocument, validateStudioProjectDocument,
} from "../studioProjectDocument";
import { runStudioCommandOnSnapshot, executeStudioCommandBatch, undoStudioCommandBatch } from "../studioCommands";
import { buildViralRenderData, mapCaptionSegmentsToTimeline } from "../viralRenderPayload";
import { compileStudioTimelineForRender, compileStudioFinishForRender, compileStudioCompositionForRender } from "../studioRenderCompiler";
import { secondsToTicks } from "../studioTime";

const visualProject = () => ({
  timeline: [{ id: "main", sourceClipId: "footage", sourceStoragePath: "owned/footage.mp4",
    startRequest: 0, endRequest: 12, url: "https://media.test/footage?access=old" }],
  overlays: [], threeDScenes: [], motionScenes: [],
  mainTransform: { id: "main-video", type: "video", x: 38, y: 62, scale: 1.3,
    rotation: 4, opacity: .85, cropX: 12, cropY: 8, anchorX: 35,
    glow: { enabled: true, color: "#123456", radius: 5 } },
  finishFx: { preset: "clean", exposureStops: .4, contrast: 1.1,
    brightness: 1, saturation: 1.2, precisionGrade: true, gamma: 1.1,
    zoom: 1.1, zoomAnchor: "center", vignette: .2, filmGrain: .05 },
  mainFrame: { insetPercent: 2, radiusPercent: 9, background: "studio_black" },
  advancedColor: { curves: { master: [[0, 0], [.5, .6], [1, 1]] } },
  autoCaptions: true, captionStyle: "minimal", captionScale: 1.15,
  captionPosition: "bottom", captionTextOverride: "", translateCaptionsToEnglish: false,
  captionSegments: [{ id: "caption", text: "Reviewed words", start: 3, end: 5,
    sourceClipId: "footage", speaker: "speaker_1", speakerLabel: "Speaker 1",
    language: "en", languageLabel: "English", languages: ["en"],
    languageConfidence: .9, transcriptConfidence: .95, textReviewRequired: false,
    textReviewed: true, reviewRequired: false, captionPlacement: "custom",
    captionX: 35, captionY: 72, captionAccent: "#abcdef", captionIcon: "none" }],
  smartCrop: true, smartCropMode: "center", reframeAspect: "4:5", speakerTrackZoom: 1.4,
  speakerStackCameraCount: 4, speakerStackLayout: "grid_4", speakerStackSyncConfirmed: true,
  speakerStackSourceIds: { top: "footage", bottom: "camera-2", third: "camera-3", fourth: "camera-4" },
  speakerStackOffsets: { top: 0, bottom: .2, third: .4, fourth: .6 },
  speakerStackSources: [{ id: "camera-2", sourceStoragePath: "owned/camera-2.mp4",
    url: "https://media.test/camera-2?access=old", duration: 12, name: "Camera 2" }],
  speakerStackFraming: { trackSpeakers: true, dividerPercent: 48,
    top: { x: 30, zoom: 1.2 }, third: { x: 70, keyframes: [{ id: "third-key", time: 5, x: 65 }] } },
  reframeKeyframes: [{ id: "crop", time: 5, x: 38, y: 60 }],
  finishKeyframes: [{ id: "grade", time: 5, values: { brightness: 1.1 } }],
  exportSettings: { resolution: "1080p", fps: "30", codec: "h264", quality: "high",
    audioCodec: "aac", videoBitrate: "8000", colorSpace: "rec709" },
});
const makeDocument = snapshot => adaptStudioSnapshotToDocument({ snapshot, projectId: "visual" });

test.each([
  ["transform", snapshot => { snapshot.mainTransform.x = 60; }],
  ["finish", snapshot => { snapshot.finishFx.exposureStops = .8; }],
  ["caption style", snapshot => { snapshot.captionStyle = "marker"; }],
  ["caption position", snapshot => { snapshot.captionSegments[0].captionY = 50; }],
  ["caption accent", snapshot => { snapshot.captionSegments[0].captionAccent = "#123456"; }],
  ["review gate", snapshot => { snapshot.captionSegments[0].textReviewRequired = true; }],
  ["crop mode", snapshot => { snapshot.smartCropMode = "speaker_track"; }],
  ["camera offset", snapshot => { snapshot.speakerStackOffsets.third = 2; }],
  ["encoding quality", snapshot => { snapshot.exportSettings.quality = "draft"; }],
])("%s change advances the authoritative revision", (_name, change) => {
  const snapshot = visualProject();
  const first = makeDocument(snapshot);
  const before = JSON.stringify(first);
  change(snapshot);
  const second = adaptStudioSnapshotToDocument({ snapshot, projectId: "visual", previousDocument: first });
  expect(second.revision).toBe(first.revision + 1);
  expect(JSON.stringify(first)).toBe(before);
});

test("canonical reopen overrides stale transform, captions, crop and camera choices and keeps refreshed camera transport", () => {
  const snapshot = visualProject();
  const document = JSON.parse(JSON.stringify(makeDocument(snapshot)));
  const stale = { ...snapshot, mainTransform: { ...snapshot.mainTransform, x: 99 },
    finishFx: { contrast: 3 }, captionStyle: "marker", smartCropMode: "off",
    captionSegments: [{ ...snapshot.captionSegments[0], captionY: 10, textReviewRequired: true }],
    speakerStackSources: [{ ...snapshot.speakerStackSources[0], url: "https://media.test/camera-2?access=fresh" }],
  };
  const restored = projectStudioEditableStateToSnapshot(document, stale);
  for (const field of ["mainTransform", "finishFx", "captionStyle", "smartCropMode",
    "speakerStackOffsets", "speakerStackFraming", "exportSettings"]) expect(restored[field]).toEqual(snapshot[field]);
  expect(restored.captionSegments[0]).toMatchObject(snapshot.captionSegments[0]);
  expect(restored.speakerStackSources[0].url).toContain("access=fresh");
  expect(JSON.stringify(document)).not.toContain("access=");
  restored.mainTransform.glow.radius = 50;
  restored.captionSegments[0].languages.push("fr");
  expect(document.visualGraph.settings.mainTransform.glow.radius).toBe(5);
});

test("manual and Director edge trim preserve visual decisions and ripple all four camera key tracks", () => {
  const snapshot = visualProject();
  const first = makeDocument(snapshot);
  const batch = { projectId: "visual", baseRevision: first.revision, idempotencyKey: "visual-trim",
    actor: { type: "human", id: "editor" }, operations: [{ type: "trim_clip", target: { occurrenceId: "main" },
      keep: { space: "source", startTick: secondsToTicks(2), endTick: secondsToTicks(12) } }] };
  const manual = runStudioCommandOnSnapshot({ snapshot: { ...snapshot, studioDocument: first }, projectId: "visual", batch });
  const headless = executeStudioCommandBatch(first, batch).document;
  expect(manual.document).toEqual(headless);
  const restored = projectStudioEditableStateToSnapshot(headless, manual.snapshot);
  expect(restored.mainTransform).toEqual(snapshot.mainTransform);
  expect(restored.captionSegments[0]).toMatchObject({ start: 3, end: 5, captionY: 72 });
  expect(restored.reframeKeyframes[0].time).toBe(3);
  expect(restored.speakerStackFraming.third.keyframes[0].time).toBe(3);
  expect(reconcileStudioDocument({ snapshot: restored, projectId: "visual", storedDocument: headless }).revision).toBe(headless.revision);
  const undone = undoStudioCommandBatch(headless, { baseRevision: headless.revision,
    actor: { type: "human", id: "editor" }, idempotencyKey: "visual-undo" }).document;
  expect(undone.visualGraph).toEqual(first.visualGraph);
  expect(undone.layers).toEqual(first.layers);
  expect(undone.linkedTiming).toEqual(first.linkedTiming);
});

test("reviewed caption geometry and global style survive the actual render payload builder", () => {
  const snapshot = visualProject();
  const document = makeDocument(snapshot);
  const recovered = projectStudioEditableStateToSnapshot(document, { ...snapshot, captionStyle: "marker" });
  const timeline = compileStudioTimelineForRender(document);
  const payload = buildViralRenderData({ finalVideoUrl: recovered.timeline[0].url,
    selectedClip: { start: 0, end: 12 }, extraOptions: { ...recovered,
      captionSegments: mapCaptionSegmentsToTimeline({ captionSegments: recovered.captionSegments, timelineSegments: timeline }),
      timelineSegments: timeline } });
  expect(payload.caption_style).toBe("minimal");
  expect(payload.caption_segments[0]).toMatchObject({ text: "Reviewed words",
    caption_x: 35, caption_y: 72, caption_accent: "#abcdef", text_reviewed: true });
});

test("previous media-only graph reopens intact then upgrades visual state once", () => {
  const snapshot = visualProject();
  const older = makeDocument(snapshot);
  delete older.visualGraph;
  delete older.compatibility.visualStateVersion;
  expect(projectStudioEditableStateToSnapshot(older, snapshot).mainTransform).toEqual(snapshot.mainTransform);
  const upgraded = reconcileStudioDocument({ snapshot, projectId: "visual", storedDocument: older });
  expect(upgraded.revision).toBe(older.revision + 1);
  expect(reconcileStudioDocument({ snapshot, projectId: "visual", storedDocument: upgraded }).revision).toBe(upgraded.revision);
  expect(() => validateStudioProjectDocument({ ...upgraded, visualGraph: { ...upgraded.visualGraph, parameterSchemaVersion: 99 } })).toThrow();
});

test("normal finish and composition render plans compile the saved transform/grade/key decisions", () => {
  const snapshot = visualProject();
  snapshot.overlays = [{ id: "still", type: "image", startTime: 1, duration: 2,
    cropX: 15, cropY: 8, blur: 3, x: 40, scale: .8, anchorX: 35,
    layerShadow: { enabled: true, opacity: .4, blur: 2 } }];
  const document = JSON.parse(JSON.stringify(makeDocument(snapshot)));
  document.visualGraph.settings.mainFrame.enabled = false;
  const finish = compileStudioFinishForRender(document);
  const composition = compileStudioCompositionForRender(document);
  expect(finish.color).toMatchObject({ exposureStops: .4, contrast: 1.1, gamma: 1.1 });
  expect(finish.main_frame.enabled).toBe(false);
  expect(projectStudioEditableStateToSnapshot(document, snapshot).mainFrame.enabled).toBe(false);
  expect(finish.motion.base_transform).toEqual({ x: 38, y: 62, scale: 1.3,
    rotation: 4, opacity: .85, crop_x: 12, crop_y: 8 });
  expect(finish.keyframes[0]).toMatchObject({ time: 5, values: { brightness: 1.1 } });
  expect(composition.layers[1]).toMatchObject({ id: "still", anchor_x: 35,
    base_transform: { crop_x: 15, crop_y: 8 }, effects: { blur: 3, shadow: { enabled: true, opacity: .4 } } });
  composition.layers[0].base_transform.x = 99;
  expect(document.visualGraph.settings.mainTransform.x).toBe(38);
});

test("a deleted canonical visual choice is not resurrected from a stale saved copy", () => {
  const snapshot = visualProject();
  const document = makeDocument(snapshot);
  delete document.visualGraph.settings.mainTransform;
  document.layers = document.layers.filter(layer => layer.type !== "caption");
  const restored = projectStudioEditableStateToSnapshot(document, snapshot);
  expect(restored.mainTransform).toBeUndefined();
  expect(restored.captionSegments).toEqual([]);
});

test("refreshing camera access links leaves the canonical visual revision unchanged", () => {
  const snapshot = visualProject();
  const document = makeDocument(snapshot);
  snapshot.speakerStackSources[0].url += "-fresh";
  expect(reconcileStudioDocument({ snapshot, projectId: "visual", storedDocument: document }).revision).toBe(document.revision);
});

test("compileStudioFinishForRender forwards enabled secondary powerWindow and hsl_qualifier", () => {
  const snapshot = visualProject();
  snapshot.advancedColor = {
    powerWindow: {
      enabled: true,
      x: 0.42,
      y: 0.36,
      rx: 0.25,
      ry: 0.3,
      rotation: 0.35,
      feather: 0.28,
      invert: true,
      exposureStops: 0.4,
      gain: 1.15,
      saturation: 1.2,
    },
    qualifier: {
      enabled: true,
      hueCenter: 0.08,
      hueWidth: 0.09,
      satMin: 0.16,
      satMax: 0.88,
      lumMin: 0.12,
      lumMax: 0.9,
      softness: 0.22,
      invert: false,
      showMatte: false,
      hueShift: 0.05,
      saturation: 1.25,
      gain: 1.08,
    },
  };
  const document = makeDocument(snapshot);
  const finish = compileStudioFinishForRender(document);
  expect(finish.power_window).toMatchObject({ enabled: true, x: 0.42, invert: true, rotation: 0.35 });
  expect(finish.hsl_qualifier).toMatchObject({ enabled: true, hueCenter: 0.08, saturation: 1.25 });
  // Ensure hsl_qualifier is not double-baked into color_cube when only qualifier is active
  expect(finish.color_cube).toBeNull();
});

test("compileStudioFinishForRender bakes Finish Rack revitalizer sliders into export color_cube", () => {
  const snapshot = visualProject();
  snapshot.finishFx = {
    ...snapshot.finishFx,
    dehaze: 0.35,
    shadowRecovery: 0.45,
    vibrance: 0.25,
    revitalizerPresetId: "low_light_rescue",
  };
  const finish = compileStudioFinishForRender(makeDocument(snapshot));
  expect(finish.color_cube).not.toBeNull();
  expect(finish.color_cube.size).toBe(33);
  expect(finish.color.revitalizerPresetId).toBe("low_light_rescue");
});

test("compileStudioFinishForRender forwards optical VFX texture controls", () => {
  const snapshot = visualProject();
  snapshot.finishFx = {
    ...snapshot.finishFx,
    dreamGlow: 0.45,
    anamorphicFlare: 0.6,
    lensBlur: 0.3,
  };
  const finish = compileStudioFinishForRender(makeDocument(snapshot));
  expect(finish.texture).toMatchObject({
    dream_glow: 0.45,
    anamorphic_flare: 0.6,
    lens_blur: 0.3,
  });
});

test("Camera Input CST stacks cleanly before a creative .cube LUT in buildAdvancedColorCube", () => {
  const { buildAdvancedColorCube, sampleColorCube } = require("../studioColorCube");
  const creativeIdentityScaled = {
    size: 2,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data: [
      0, 0, 0, 0.8, 0, 0,
      0, 1, 0, 0.8, 1, 0,
      0, 0, 1, 0.8, 0, 1,
      0, 1, 1, 0.8, 1, 1,
    ],
  };
  const withoutCst = buildAdvancedColorCube({
    cameraProfile: "rec709",
    lutPresetId: "creative_dim_red",
    lutData: creativeIdentityScaled,
    lutIntensity: 100,
  }, 9);
  const withSlog3Cst = buildAdvancedColorCube({
    cameraProfile: "sony_slog3",
    lutPresetId: "creative_dim_red",
    lutData: creativeIdentityScaled,
    lutIntensity: 100,
  }, 9);
  expect(withoutCst).not.toBeNull();
  expect(withSlog3Cst).not.toBeNull();
  // Sony S-Log3 expands flat log mid-tones (~0.41) differently from linear Rec.709 BEFORE creative LUT
  const pRec = sampleColorCube(withoutCst, 0.25, 0.5, 0.5);
  const pSlog = sampleColorCube(withSlog3Cst, 0.25, 0.5, 0.5);
  expect(Math.abs(pRec[0] - pSlog[0]) + Math.abs(pRec[1] - pSlog[1])).toBeGreaterThan(0.05);
  // And creative LUT's red scaling (<= 0.8) is preserved on top of CST
  expect(sampleColorCube(withSlog3Cst, 1, 0.5, 0.5)[0]).toBeLessThanOrEqual(0.85);
});
