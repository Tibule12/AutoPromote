import { findUncoveredCaptionSpeechRanges, mapCaptionSilencesToProgramme } from "../studioCaptionCoverage";

test("sparse manually reviewed cues expose the same missing ranges as the export worker", () => {
  expect(findUncoveredCaptionSpeechRanges([{ start: 3, end: 5 }, { start: 7, end: 9 }], [], 12))
    .toEqual([{ start: 0, end: 2.82, duration: 2.82 }, { start: 5.18, end: 6.82, duration: 1.64 },
      { start: 9.18, end: 12, duration: 2.82 }]);
});

test("actual pauses, silent sources and boundary rounding do not demand invented words", () => {
  expect(findUncoveredCaptionSpeechRanges([{ start: 3, end: 5 }], [[0, 3], [5, 12]], 12)).toEqual([]);
  expect(findUncoveredCaptionSpeechRanges([], [[0, 12]], 12)).toEqual([]);
  expect(findUncoveredCaptionSpeechRanges([{ start: 0, end: 2 }], [], 3.279)).toEqual([]);
});

test("trimmed and repeated sources project real silence into the reordered programme clock", () => {
  const mapped = mapCaptionSilencesToProgramme([
    { id: "hook", source_clip_id: "source", start_time: 6, end_time: 8 },
    { id: "main", source_clip_id: "source", start_time: 0, end_time: 6 },
    { id: "second", source_clip_id: "other", start_time: 1, end_time: 4 },
  ], new Map([["source", [{ start: 0, end: 1 }, { start: 5, end: 7 }]],
    ["other", [{ start: 0, end: 2 }]]]));
  expect(mapped).toEqual({ duration: 11, silences: [[0, 1], [2, 3], [7, 8], [8, 9]] });
});
