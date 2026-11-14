import {
  executeStudioCommandBatch,
  runStudioCommandOnSnapshot,
  undoStudioCommandBatch,
} from "../studioCommands";
import { adaptStudioSnapshotToDocument } from "../studioProjectDocument";
import { getStudioCapability } from "../studioCapabilities";
import { secondsToTicks } from "../studioTime";

const baseSnapshot = () => ({
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
  overlays: [
    { id: "title-1", type: "text", text: "Intro", startTime: 8, duration: 4 },
  ],
  motionScenes: [],
  threeDScenes: [],
  speedKeyframes: [],
  captionSegments: [],
  musicDucking: false,
  musicDuckingStrength: 0.3,
  finishFx: {},
});

const batch = (document, operations, idempotencyKey) => ({
  projectId: document.projectId,
  baseRevision: document.revision,
  idempotencyKey,
  actor: { type: "human", id: "pro-editor" },
  operations,
});

describe("Phase 1 command kernel migration", () => {
  test("advertises commandKernelMigrated: true for all migrated operations", () => {
    for (const id of [
      "remove_range",
      "captions",
      "title_callout",
      "b_roll",
      "audio_ducking",
      "motion_graphic",
      "speed",
      "creator_fx",
    ]) {
      const cap = getStudioCapability(id);
      expect(cap.releaseState).toBe("foundation");
      expect(cap.limits.commandKernelMigrated).toBe(true);
    }
    expect(getStudioCapability("speed").limits).toMatchObject({
      reverse: true,
      freeze: true,
    });
  });

  test("remove_range ripples occurrences and overlays and cleanly undoes", () => {
    const snap = baseSnapshot();
    const doc = adaptStudioSnapshotToDocument({ snapshot: snap, projectId: "proj-1" });
    const result = runStudioCommandOnSnapshot({
      snapshot: { ...snap, studioDocument: doc },
      projectId: "proj-1",
      batch: batch(
        doc,
        [
          {
            type: "remove_range",
            range: {
              space: "programme",
              startTick: secondsToTicks(4),
              endTick: secondsToTicks(6),
            },
          },
        ],
        "remove-1"
      ),
    });

    expect(result.document.clipOccurrences).toHaveLength(2);
    expect(result.document.clipOccurrences[0].sourceRange.endTick).toBe(secondsToTicks(4));
    expect(result.document.clipOccurrences[1].sourceRange.startTick).toBe(secondsToTicks(6));
    expect(result.snapshot.overlays[0].startTime).toBeCloseTo(6, 5);

    const undone = undoStudioCommandBatch(result.document, {
      baseRevision: result.document.revision,
      actor: { type: "human", id: "pro-editor" },
      idempotencyKey: "undo-remove-1",
    }).document;
    expect(undone.clipOccurrences).toHaveLength(1);
    expect(undone.clipOccurrences[0].sourceRange.endTick).toBe(secondsToTicks(20));
  });

  test("remove_range respects preserved source locks", () => {
    const snap = baseSnapshot();
    let doc = adaptStudioSnapshotToDocument({ snapshot: snap, projectId: "proj-1" });
    doc = executeStudioCommandBatch(
      doc,
      batch(
        doc,
        [
          {
            type: "preserve_range",
            target: { occurrenceId: "main" },
            range: { space: "source", startTick: secondsToTicks(3), endTick: secondsToTicks(7) },
            lockId: "keep-hook",
          },
        ],
        "lock-1"
      )
    ).document;

    expect(() =>
      executeStudioCommandBatch(
        doc,
        batch(
          doc,
          [
            {
              type: "remove_range",
              range: { space: "programme", startTick: secondsToTicks(4), endTick: secondsToTicks(6) },
            },
          ],
          "remove-locked"
        )
      )
    ).toThrow(/preserved range/i);
  });

  test("executes caption_segments, text_overlay, video_overlay, motion_scene, audio_ducking, speed_segments (reverse/freeze), and creative_plan with undo", () => {
    const snap = baseSnapshot();
    const doc = adaptStudioSnapshotToDocument({ snapshot: snap, projectId: "proj-1" });

    const multi = runStudioCommandOnSnapshot({
      snapshot: { ...snap, studioDocument: doc },
      projectId: "proj-1",
      batch: batch(
        doc,
        [
          {
            type: "caption_segments",
            segments: [{ id: "cap-1", start: 0.5, end: 2.5, text: "Hello Studio" }],
            style: "bold_neon",
          },
          {
            type: "text_overlay",
            layerId: "cta-1",
            text: "Subscribe",
            startTick: secondsToTicks(1),
            endTick: secondsToTicks(5),
            placement: { x: 50, y: 80 },
          },
          {
            type: "video_overlay",
            layerId: "broll-1",
            assetId: "broll-media-1",
            programmeRange: {
              space: "programme",
              startTick: secondsToTicks(2),
              endTick: secondsToTicks(6),
            },
            mode: "pip",
          },
          {
            type: "motion_scene",
            layerId: "motion-1",
            scene: { id: "motion-1", type: "kinetic_callout", startTime: 3, duration: 2 },
          },
          {
            type: "audio_ducking",
            strength: 0.72,
            enabled: true,
          },
          {
            type: "speed_segments",
            target: { occurrenceId: "main" },
            direction: "reverse",
            freeze: false,
            segments: [
              { time: 0, rate: 1.5 },
              { time: 10, rate: 0.75 },
            ],
          },
          {
            type: "creative_plan",
            plan: {
              creativePreset: "cinematic_teal",
              finishFx: { exposureStops: 0.35, saturation: 1.15 },
            },
          },
        ],
        "multi-1"
      ),
    });

    expect(multi.snapshot.captionSegments[0].text).toBe("Hello Studio");
    expect(multi.snapshot.captionStyle).toBe("bold_neon");
    expect(multi.snapshot.overlays.some(item => item.id === "cta-1" && item.text === "Subscribe")).toBe(true);
    expect(multi.snapshot.overlays.some(item => item.id === "broll-1" && item.bRollMode === "pip")).toBe(true);
    expect(multi.snapshot.motionScenes).toHaveLength(1);
    expect(multi.snapshot.musicDucking).toBe(true);
    expect(multi.snapshot.musicDuckingStrength).toBeCloseTo(0.72, 6);
    expect(multi.snapshot.timeline[0].playback.direction).toBe("reverse");
    expect(multi.snapshot.speedKeyframes).toHaveLength(2);
    expect(multi.snapshot.creativePreset).toBe("cinematic_teal");
    expect(multi.snapshot.finishFx.exposureStops).toBeCloseTo(0.35, 6);

    const undone = undoStudioCommandBatch(multi.document, {
      baseRevision: multi.document.revision,
      actor: { type: "human", id: "pro-editor" },
      idempotencyKey: "undo-multi-1",
    }).document;

    expect(undone.audioGraph.settings.musicDucking).toBe(false);
    expect(undone.clipOccurrences[0].playback.direction).toBe("forward");
    expect(undone.programmeSpeedKeys).toEqual([]);
  });
});
