import {
  validateSubjectVfxScene,
  subjectVfxRevision,
  validateSubjectVfxExport,
  resolveSubjectVfxProgrammePreview,
} from "../studioSubjectVfxContract";
import {
  adaptStudioSnapshotToDocument,
  projectStudioLinkedTimingToSnapshot,
} from "../studioProjectDocument";

export const scene = () => ({
  version: 1,
  id: "subject-scene",
  sourceId: "source-a",
  sourceStoragePath: "studio/sources/owner/source.mp4",
  sourceRange: { start: 2, end: 8 },
  prompt: {
    points: [[0.6, 0.3]],
    labels: [1],
    shotPrompts: [{ time: 3, points: [[0.5, 0.4]], labels: [1] }],
  },
  effects: [
    {
      id: "title",
      type: "text_behind",
      start: 0,
      end: 6,
      text: "THE STORY",
      x: 50,
      y: 45,
      font_size: 100,
      color: "#f5f1ed",
    },
  ],
});
const reviewed = (value = scene()) => ({
  scene: value,
  enabled: true,
  preview: {
    jobId: "render-job-123",
    reviewed: true,
    revision: subjectVfxRevision(value),
    url: "https://preview.invalid",
  },
});
const timeline = [
  { source_clip_id: "source-a", start_time: 2, end_time: 5 },
  { source_clip_id: "source-a", start_time: 5, end_time: 8 },
];

test("programme subject frames stay source-bound and half-open across repeated and trimmed occurrences", () => {
  const item = reviewed();
  item.preview.receipt = { pixel_sha256: "verified-pixels" };
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", 2)).toBe(item);
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", 5)).toBe(item);
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", 2)).toBe(item);
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", 8)).toBeNull();
  expect(resolveSubjectVfxProgrammePreview([item], "source-b", 5)).toBeNull();
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", NaN)).toBeNull();
});
test("programme cannot show stale, disabled or unverified subject frames; review is possible before export approval", () => {
  const item = reviewed();
  item.preview.receipt = { pixel_sha256: "verified-pixels" };
  item.preview.reviewed = false;
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", 3)).toBe(item);
  expect(resolveSubjectVfxProgrammePreview([{ ...item, enabled: false }], "source-a", 3)).toBeNull();
  expect(resolveSubjectVfxProgrammePreview([{ ...item, preview: { ...item.preview, receipt: undefined } }], "source-a", 3)).toBeNull();
  item.scene.effects[0].text = "Changed";
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", 3)).toBeNull();
});

test("rejects unknown effect instructions, non-finite values, and prompts outside the source picture", () => {
  for (const alter of [
    value => {
      value.effects[0].script = "alert(1)";
    },
    value => {
      value.effects[0].font_size = NaN;
    },
    value => {
      value.prompt.points[0][0] = 1;
    },
    value => {
      value.prompt.labels = [0];
    },
    value => {
      value.prompt.shotPrompts[0].time = 6;
    },
  ]) {
    const value = scene();
    alter(value);
    expect(() => validateSubjectVfxScene(value)).toThrow();
  }
});
test("export preserves source range through timeline splits and strips browser preview URLs", () => {
  expect(validateSubjectVfxExport([reviewed()], timeline)).toEqual([
    { jobId: "render-job-123", scene: validateSubjectVfxScene(scene()) },
  ]);
  expect(
    validateSubjectVfxExport([{ ...reviewed(), enabled: false, preview: undefined }], [])
  ).toEqual([]);
});
test("blocks unreviewed, stale, missing, overlapping, and partially covered footage", () => {
  const stale = reviewed();
  stale.scene.effects[0].text = "Changed";
  expect(() => validateSubjectVfxExport([stale], timeline)).toThrow(/review/);
  expect(() =>
    validateSubjectVfxExport(
      [{ ...reviewed(), preview: { ...reviewed().preview, reviewed: false } }],
      timeline
    )
  ).toThrow(/review/);
  expect(() => validateSubjectVfxExport([reviewed()], [])).toThrow(/timeline/);
  expect(() =>
    validateSubjectVfxExport(
      [reviewed()],
      [{ source_clip_id: "source-a", start_time: 1, end_time: 8 }]
    )
  ).toThrow(/Split/);
  expect(() => validateSubjectVfxExport([reviewed(), reviewed()], timeline)).toThrow(/Overlapping/);
});
test("canonical project stores source effects and durable recovery identities without transient URLs", () => {
  const snapshot = {
    orderedClips: [{ id: "source-a", start: 0, end: 12 }],
    timeline: [{ id: "clip", sourceClipId: "source-a", startRequest: 2, endRequest: 8 }],
    subjectVfxScenes: [{ ...reviewed(), pending: { clientRequestId: "pending-id" } }],
  };
  const document = adaptStudioSnapshotToDocument({ snapshot, projectId: "project-vfx" });
  const layer = document.layers.find(value => value.type === "subject_vfx");
  expect(layer.compositionStage).toBe("source_subject_vfx");
  expect(layer.programmeRange).toBeUndefined();
  expect(JSON.stringify(layer)).not.toMatch(/https:/);
  expect(layer.parameters.preview).toMatchObject({ jobId: "render-job-123", reviewed: true });
  expect(layer.parameters.preview.url).toBeUndefined();
  expect(layer.parameters.pending).toEqual({ clientRequestId: "pending-id" });
  expect(projectStudioLinkedTimingToSnapshot(document).subjectVfxScenes[0]).toMatchObject({
    scene: scene(),
    enabled: true,
  });
});
