import { adaptStudioSnapshotToDocument } from "../studioProjectDocument";
import {
  assertStudioExportTimelineMatchesDocument,
  assertStudioSpeedPlanMatchesDocument,
  compileStudioTimelineForRender,
} from "../studioRenderCompiler";
import { mapCaptionSegmentsToTimeline } from "../viralRenderPayload";
import { buildSpeedSegmentsFromKeyframes } from "../studioCreatorRecipes";

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
