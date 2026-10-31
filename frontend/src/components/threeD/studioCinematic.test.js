import { createCinematicParameters } from "./cinematicContract";
import { normalizeStudio3DScene, studio3DSceneRevision } from "./studio3DModel";
import { adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot, validateStudioProjectDocument } from "../studioProjectDocument";

const makeScene = () => normalizeStudio3DScene({ id: "cinematic-test", sceneType: "cinematic_evidence", startTime: 0,
  duration: 8, cinematic: createCinematicParameters("a".repeat(64)) });
test("cinematic content survives the existing normalizer and revision includes every render parameter", () => {
  const scene = makeScene();
  expect(normalizeStudio3DScene(JSON.parse(JSON.stringify(scene)))).toEqual(scene);
  const revised = normalizeStudio3DScene({ ...scene, cinematic: { ...scene.cinematic, camera: { ...scene.cinematic.camera, pushIn: .5 } } });
  expect(studio3DSceneRevision(revised)).not.toBe(studio3DSceneRevision(scene));
  expect(studio3DSceneRevision({ ...scene, hqPreviewUrl: "/preview.mp4", hqPreviewJobId: "job",
    hqPreviewRevision: "revision", localExport: { url: "/export.mp4", jobId: "done", revision: "same" } })).toBe(studio3DSceneRevision(scene));
  const reordered = JSON.parse(JSON.stringify(scene, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, value[key]])) : value));
  expect(studio3DSceneRevision(reordered)).toBe(studio3DSceneRevision(scene));
});
test("canonical project save/reopen preserves the complete editable cinematic scene beside legacy 3D", () => {
  const scene = makeScene();
  const old = normalizeStudio3DScene({ id: "legacy-title", duration: 4, template: "cinematic_title" });
  const snapshot = { timeline: [{ id: "main", sourceClipId: "source", startRequest: 0, endRequest: 8, duration: 8 }],
    selectedClip: { id: "main", start: 0, end: 8 }, orderedClips: [], overlays: [], motionScenes: [],
    threeDScenes: [scene, old], captionSegments: [], soundEffects: [], voiceovers: [], motionKeyframes: [],
    finishKeyframes: [], speedKeyframes: [], audioKeyframes: [], reframeKeyframes: [], exportSettings: {},
    projectMedia: [], trackStates: {} };
  const document = adaptStudioSnapshotToDocument({ snapshot, projectId: "cinematic-project" });
  expect(() => validateStudioProjectDocument(document)).not.toThrow();
  const reopened = projectStudioEditableStateToSnapshot(JSON.parse(JSON.stringify(document)), snapshot);
  expect(reopened.threeDScenes[0].cinematic).toEqual(scene.cinematic);
  expect(reopened.threeDScenes[0].sceneType).toBe("cinematic_evidence");
  expect(reopened.threeDScenes[1].template).toBe("cinematic_title");
});
