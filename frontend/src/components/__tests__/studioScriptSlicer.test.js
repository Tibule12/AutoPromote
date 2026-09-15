import {
  COMMON_FILLER_WORDS,
  detectFillerWords,
  sliceTimelineTimeRange,
  retimeCaptionsAfterCut,
  sliceMultipleTimeRanges,
} from "../studioScriptSlicer";

describe("studioScriptSlicer - Descript-Style Text-Based Video Editing", () => {
  const sampleTimeline = [
    {
      id: "clip-1",
      startRequest: 0,
      endRequest: 10,
      duration: 10,
    },
    {
      id: "clip-2",
      startRequest: 15,
      endRequest: 25,
      duration: 10,
    },
  ];

  const sampleCaptions = [
    { id: "cap-1", start: 1.0, end: 3.5, text: "So basically this is our opening hook" },
    { id: "cap-2", start: 4.0, end: 6.0, text: "Um like you know what I mean" },
    { id: "cap-3", start: 7.0, end: 9.5, text: "Here is the core lesson" },
    { id: "cap-4", start: 11.0, end: 14.0, text: "And this is the final takeaway" },
  ];

  test("detects filler words across captions", () => {
    const detected = detectFillerWords(sampleCaptions);
    expect(detected.length).toBeGreaterThanOrEqual(3);

    const matchWords = detected.map(d => d.matchWord);
    expect(matchWords).toContain("basically");
    expect(matchWords).toContain("um");
    expect(matchWords).toContain("like");
    expect(matchWords).toContain("you know");
  });

  test("slices a time range out of the middle of a clip", () => {
    // Slicing 4.0s to 6.0s out of clip-1 (which runs 0s to 10s)
    const result = sliceTimelineTimeRange(sampleTimeline, 4.0, 6.0);
    expect(result.removedDuration).toBe(2.0);
    expect(result.updatedTimeline).toHaveLength(3); // [0-4], [6-10], [15-25]

    const first = result.updatedTimeline[0];
    const second = result.updatedTimeline[1];
    const third = result.updatedTimeline[2];

    expect(first.duration).toBe(4.0);
    expect(first.startRequest).toBe(0);
    expect(first.endRequest).toBe(4.0);

    expect(second.duration).toBe(4.0);
    expect(second.startRequest).toBe(6.0);
    expect(second.endRequest).toBe(10.0);

    expect(third.duration).toBe(10.0);
  });

  test("slices a time range spanning across clip boundaries", () => {
    // Slicing 8.0s to 12.0s (swallows end of clip-1 and start of clip-2)
    const result = sliceTimelineTimeRange(sampleTimeline, 8.0, 12.0);
    expect(result.removedDuration).toBe(4.0);
    expect(result.updatedTimeline).toHaveLength(2);

    expect(result.updatedTimeline[0].duration).toBe(8.0);
    expect(result.updatedTimeline[0].endRequest).toBe(8.0);

    expect(result.updatedTimeline[1].duration).toBe(8.0); // 10 - 2 = 8
    expect(result.updatedTimeline[1].startRequest).toBe(17.0); // 15 + 2 = 17
  });

  test("retimes caption segments after a cut", () => {
    // Slicing out 4.0s to 6.0s (which removes cap-2)
    const retimed = retimeCaptionsAfterCut(sampleCaptions, 4.0, 6.0);
    expect(retimed).toHaveLength(3); // cap-2 dropped
    expect(retimed.map(c => c.id)).not.toContain("cap-2");

    // cap-1 (1.0 to 3.5s) was before the cut: unchanged
    expect(retimed[0].id).toBe("cap-1");
    expect(retimed[0].start).toBe(1.0);
    expect(retimed[0].end).toBe(3.5);

    // cap-3 (7.0 to 9.5s) was after the cut: shifted earlier by 2.0s (5.0 to 7.5s)
    expect(retimed[1].id).toBe("cap-3");
    expect(retimed[1].start).toBe(5.0);
    expect(retimed[1].end).toBe(7.5);

    // cap-4 (11.0 to 14.0s) was after the cut: shifted earlier by 2.0s (9.0 to 12.0s)
    expect(retimed[2].id).toBe("cap-4");
    expect(retimed[2].start).toBe(9.0);
    expect(retimed[2].end).toBe(12.0);
  });

  test("batch slices multiple time ranges in reverse chronological order", () => {
    const ranges = [
      { start: 2.0, end: 3.0 }, // 1s cut
      { start: 7.0, end: 8.5 }, // 1.5s cut
    ];

    const result = sliceMultipleTimeRanges(sampleTimeline, ranges, sampleCaptions);
    expect(result.slicesApplied).toBe(2);
    expect(result.totalRemovedDuration).toBeCloseTo(2.5, 2);
  });

  test("exports common filler words list", () => {
    expect(COMMON_FILLER_WORDS).toContain("um");
    expect(COMMON_FILLER_WORDS).toContain("uh");
    expect(COMMON_FILLER_WORDS).toContain("like");
    expect(COMMON_FILLER_WORDS).toContain("you know");
  });
});

