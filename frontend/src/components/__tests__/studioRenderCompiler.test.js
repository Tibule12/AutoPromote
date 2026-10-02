import { adaptStudioSnapshotToDocument } from "../studioProjectDocument";
import { runStudioCommandOnSnapshot } from "../studioCommands";
import {
  assertStudioExportTimelineMatchesDocument,
  assertStudioSpeedPlanMatchesDocument,
  compileStudioTimelineForRender,
} from "../studioRenderCompiler";
import { buildViralRenderData, mapCaptionSegmentsToTimeline } from "../viralRenderPayload";
import { buildSpeedSegmentsFromKeyframes } from "../studioCreatorRecipes";
import {
  mapProgrammeTickToOutputTick,
  mapSourceCaptionToOutputRanges,
  secondsToTicks,
  ticksToSeconds,
} from "../studioTime";
import trimFixture from "./fixtures/trim-linked-timing.json";
import endTrimFixture from "./fixtures/trim-end-linked-timing.json";

test("canonical programme timeline agrees with worker timing for duplicate source occurrences", () => {
  const document = adaptStudioSnapshotToDocument({
    projectId: "project",
    snapshot: {
      orderedClips: [{ id: "source", start: 0, end: 12 }],
      selectedClipId: "source",
      timeline: [
        { id: "first", sourceClipId: "source", startRequest: 0, endRequest: 3 },
        { id: "second", sourceClipId: "source", startRequest: 7, endRequest: 10 },
      ],
    },
  });
  const compiled = compileStudioTimelineForRender(document);
  expect(compiled).toEqual([
    { id: "first", source_clip_id: "source", start_time: 0, end_time: 3, duration: 3 },
    { id: "second", source_clip_id: "source", start_time: 7, end_time: 10, duration: 3 },
  ]);
  expect(assertStudioExportTimelineMatchesDocument(document, compiled)).toBe(true);
  const captions = mapCaptionSegmentsToTimeline({
    captionSegments: [
      { id: "words", sourceClipId: "source", start: 1, end: 9, text: "Known words" },
    ],
    timelineSegments: compiled,
  });
  expect(captions.map(item => [item.start_time, item.end_time])).toEqual([
    [1, 3],
    [3, 5],
  ]);
  expect(() =>
    assertStudioExportTimelineMatchesDocument(document, [
      compiled[0],
      { ...compiled[1], end_time: 9.5 },
    ])
  ).toThrow(/differs/);
});

test("browser sampled speed plan and canonical post-speed map agree through long ramps", () => {
  const keys = Array.from({ length: 20 }, (_, index) => ({
    property: "speed",
    time: index * 4,
    value: index % 2 ? 2 : 1,
    easing: "linear",
  }));
  const document = adaptStudioSnapshotToDocument({
    projectId: "project",
    snapshot: {
      orderedClips: [{ id: "source", start: 0, end: 76 }],
      selectedClipId: "source",
      timeline: [{ id: "main", sourceClipId: "source", startRequest: 0, endRequest: 76 }],
      speedKeyframes: keys,
    },
  });
  const renderPlan = buildSpeedSegmentsFromKeyframes({
    keyframes: keys,
    duration: 76,
    fallback: 1,
  });
  expect(assertStudioSpeedPlanMatchesDocument(document, renderPlan)).toBe(true);
  expect(() =>
    assertStudioSpeedPlanMatchesDocument(document, [{ ...renderPlan[0], endTime: 30 }])
  ).toThrow();
});

test("linked start trim gives preview and worker payload the same caption and sound clocks", () => {
  const { projectId, snapshot, trim, expected } = trimFixture;
  const original = adaptStudioSnapshotToDocument({ projectId, snapshot });
  const result = runStudioCommandOnSnapshot({
    projectId,
    snapshot: { ...snapshot, studioDocument: original },
    batch: {
      projectId,
      baseRevision: original.revision,
      idempotencyKey: "paired-preview-export-start-trim",
      actor: { type: "human", id: "fixture-editor" },
      operations: [
        {
          type: "trim_clip",
          target: { occurrenceId: trim.occurrenceId },
          keep: {
            space: "source",
            startTick: secondsToTicks(trim.keepSourceStart),
            endTick: secondsToTicks(trim.keepSourceEnd),
          },
        },
      ],
    },
  });
  const { document, snapshot: trimmed } = result;
  const timelineSegments = compileStudioTimelineForRender(document);
  expect(timelineSegments).toEqual(expected.timeline);
  expect(assertStudioExportTimelineMatchesDocument(document, timelineSegments)).toBe(true);
  expect(trimmed.speedKeyframes.map(({ id, time, value }) => ({ id, time, value }))).toEqual(
    expected.speedKeys
  );
  expect(document.programmeSpeedKeys.map(key => ticksToSeconds(key.atProgrammeTick))).toEqual(
    expected.speedKeys.map(key => key.time)
  );

  const speedSegments = buildSpeedSegmentsFromKeyframes({
    keyframes: trimmed.speedKeyframes,
    duration: expected.programmeDuration,
    fallback: trimmed.previewSpeed,
  });
  expect(
    speedSegments.map(({ startTime, endTime, rate }) => ({
      start_time: startTime,
      end_time: endTime,
      rate,
    }))
  ).toEqual(expected.renderSpeedSegments);
  expect(assertStudioSpeedPlanMatchesDocument(document, speedSegments)).toBe(true);
  expect(ticksToSeconds(document.outputTimeMap.at(-1).outputRange.endTick)).toBe(
    expected.outputDuration
  );

  const exportCaptions = mapCaptionSegmentsToTimeline({
    captionSegments: trimmed.captionSegments,
    timelineSegments,
  });
  const payload = buildViralRenderData({
    finalVideoUrl: trimmed.timeline[0].url,
    selectedClip: trimmed.orderedClips[0],
    extraOptions: {
      autoCaptions: true,
      timelineSegments,
      captionSegments: exportCaptions,
      speedSegments,
      soundEffects: trimmed.soundEffects,
    },
  });
  expect(payload.auto_captions).toBe(true);
  expect(payload.end_time).toBe(expected.programmeDuration);
  expect(payload.timeline_segments).toEqual(expected.timeline);
  expect(
    payload.speed_segments.map(({ start_time, end_time, rate }) => ({
      start_time,
      end_time,
      rate,
    }))
  ).toEqual(expected.renderSpeedSegments);
  expect(payload.caption_segments).toHaveLength(expected.captions.length);
  expect(payload.sound_effects).toHaveLength(expected.soundCues.length);

  const timeOccurrences = document.clipOccurrences.map(occurrence => ({
    ...occurrence,
    sourceAssetId: occurrence.assetId,
    direction: "forward",
  }));
  expected.captions.forEach((caption, index) => {
    const exported = payload.caption_segments[index];
    expect({
      id: exported.id,
      start_time: exported.start_time,
      end_time: exported.end_time,
      text: exported.text,
    }).toEqual({
      id: caption.id,
      start_time: caption.start_time,
      end_time: caption.end_time,
      text: caption.text,
    });
    const sourceCaption = trimmed.captionSegments[index];
    expect(document.layers.find(layer => layer.layerId === sourceCaption.id).sourceRange).toEqual({
      space: "source",
      startTick: secondsToTicks(sourceCaption.start),
      endTick: secondsToTicks(sourceCaption.end),
    });
    const sourceAsset = document.assets.find(
      asset => asset.sourceId === sourceCaption.sourceClipId
    );
    const previewRanges = mapSourceCaptionToOutputRanges(
      timeOccurrences,
      document.outputTimeMap,
      sourceAsset.assetId,
      {
        space: "source",
        startTick: secondsToTicks(sourceCaption.start),
        endTick: secondsToTicks(sourceCaption.end),
      }
    );
    expect(previewRanges).toHaveLength(1);
    expect(previewRanges[0].outputRange).toEqual({
      space: "output",
      startTick: secondsToTicks(caption.output_start),
      endTick: secondsToTicks(caption.output_end),
    });
    expect(
      ticksToSeconds(
        mapProgrammeTickToOutputTick(document.outputTimeMap, secondsToTicks(exported.start_time))
      )
    ).toBe(caption.output_start);
  });

  expected.soundCues.forEach((cue, index) => {
    const exported = payload.sound_effects[index];
    expect(exported.id).toBe(cue.id);
    expect(exported.startTime).toBe(cue.start_time);
    expect(
      ticksToSeconds(document.linkedTiming.cues.soundEffects[index].programmeRange.startTick)
    ).toBe(cue.start_time);
    expect(
      ticksToSeconds(
        mapProgrammeTickToOutputTick(document.outputTimeMap, secondsToTicks(exported.startTime))
      )
    ).toBe(cue.output_start);
  });
});

test("linked end trim removes cut media and gives later preview and worker cues the same clocks", () => {
  const { projectId, snapshot, trim, expected } = endTrimFixture;
  const original = adaptStudioSnapshotToDocument({ projectId, snapshot });
  const { document, snapshot: trimmed } = runStudioCommandOnSnapshot({
    projectId,
    snapshot: { ...snapshot, studioDocument: original },
    batch: {
      projectId,
      baseRevision: original.revision,
      idempotencyKey: "paired-preview-export-end-trim",
      actor: { type: "human", id: "fixture-editor" },
      operations: [
        {
          type: "trim_clip",
          target: { occurrenceId: trim.occurrenceId },
          keep: {
            space: "source",
            startTick: secondsToTicks(trim.keepSourceStart),
            endTick: secondsToTicks(trim.keepSourceEnd),
          },
        },
      ],
    },
  });
  const timelineSegments = compileStudioTimelineForRender(document);
  expect(timelineSegments).toEqual(expected.timeline);
  expect(assertStudioExportTimelineMatchesDocument(document, timelineSegments)).toBe(true);
  expect(trimmed.speedKeyframes.map(({ id, time, value }) => ({ id, time, value }))).toEqual(
    expected.speedKeys
  );
  expect(document.programmeSpeedKeys.map(key => ticksToSeconds(key.atProgrammeTick))).toEqual(
    expected.speedKeys.map(key => key.time)
  );
  const speedSegments = buildSpeedSegmentsFromKeyframes({
    keyframes: trimmed.speedKeyframes,
    duration: expected.programmeDuration,
    fallback: trimmed.previewSpeed,
  });
  expect(
    speedSegments.map(({ startTime, endTime, rate }) => ({
      start_time: startTime,
      end_time: endTime,
      rate,
    }))
  ).toEqual(expected.renderSpeedSegments);
  expect(assertStudioSpeedPlanMatchesDocument(document, speedSegments)).toBe(true);
  expect(ticksToSeconds(document.outputTimeMap.at(-1).outputRange.endTick)).toBe(
    expected.outputDuration
  );

  // Source-timed captions remain in the editor, but the cut caption has no
  // programme occurrence and must be absent from the render payload.
  expect(trimmed.captionSegments).toEqual(snapshot.captionSegments);
  const exportCaptions = mapCaptionSegmentsToTimeline({
    captionSegments: trimmed.captionSegments,
    timelineSegments,
  });
  const payload = buildViralRenderData({
    finalVideoUrl: trimmed.timeline[0].url,
    selectedClip: trimmed.orderedClips[0],
    extraOptions: {
      autoCaptions: true,
      timelineSegments,
      captionSegments: exportCaptions,
      speedSegments,
      soundEffects: trimmed.soundEffects,
    },
  });
  expect(payload.end_time).toBe(expected.programmeDuration);
  expect(payload.timeline_segments).toEqual(expected.timeline);
  expect(
    payload.speed_segments.map(({ start_time, end_time, rate }) => ({
      start_time,
      end_time,
      rate,
    }))
  ).toEqual(expected.renderSpeedSegments);
  expect(payload.caption_segments.map(({ id }) => id)).not.toContain("removed-caption-timeline-1");
  expect(payload.sound_effects.map(({ id }) => id)).not.toContain("removed-cue");

  const timeOccurrences = document.clipOccurrences.map(occurrence => ({
    ...occurrence,
    sourceAssetId: occurrence.assetId,
    direction: "forward",
  }));
  const previewCaptionRanges = sourceCaption => {
    const sourceAsset = document.assets.find(
      asset => asset.sourceId === sourceCaption.sourceClipId
    );
    return mapSourceCaptionToOutputRanges(
      timeOccurrences,
      document.outputTimeMap,
      sourceAsset.assetId,
      {
        space: "source",
        startTick: secondsToTicks(sourceCaption.start),
        endTick: secondsToTicks(sourceCaption.end),
      }
    );
  };
  expect(previewCaptionRanges(snapshot.captionSegments[2])).toEqual([]);
  expect(payload.caption_segments).toHaveLength(expected.captions.length);
  expected.captions.forEach((caption, index) => {
    const exported = payload.caption_segments[index];
    expect({
      id: exported.id,
      start_time: exported.start_time,
      end_time: exported.end_time,
      text: exported.text,
    }).toEqual({
      id: caption.id,
      start_time: caption.start_time,
      end_time: caption.end_time,
      text: caption.text,
    });
    const sourceCaption = snapshot.captionSegments.find(item =>
      caption.id.startsWith(`${item.id}-timeline-`)
    );
    expect(previewCaptionRanges(sourceCaption)).toHaveLength(1);
    expect(previewCaptionRanges(sourceCaption)[0].outputRange).toEqual({
      space: "output",
      startTick: secondsToTicks(caption.output_start),
      endTick: secondsToTicks(caption.output_end),
    });
    expect(
      ticksToSeconds(
        mapProgrammeTickToOutputTick(document.outputTimeMap, secondsToTicks(exported.start_time))
      )
    ).toBe(caption.output_start);
  });

  expect(payload.sound_effects).toHaveLength(expected.soundCues.length);
  expected.soundCues.forEach((cue, index) => {
    const exported = payload.sound_effects[index];
    expect({ id: exported.id, startTime: exported.startTime, duration: exported.duration }).toEqual(
      {
        id: cue.id,
        startTime: cue.start_time,
        duration: cue.duration,
      }
    );
    expect(
      ticksToSeconds(document.linkedTiming.cues.soundEffects[index].programmeRange.startTick)
    ).toBe(cue.start_time);
    expect(
      ticksToSeconds(document.linkedTiming.cues.soundEffects[index].programmeRange.endTick)
    ).toBe(cue.start_time + cue.duration);
    expect(
      ticksToSeconds(
        mapProgrammeTickToOutputTick(document.outputTimeMap, secondsToTicks(exported.startTime))
      )
    ).toBe(cue.output_start);
    expect(
      ticksToSeconds(
        mapProgrammeTickToOutputTick(
          document.outputTimeMap,
          secondsToTicks(exported.startTime + exported.duration)
        )
      )
    ).toBe(cue.output_end);
  });
});
