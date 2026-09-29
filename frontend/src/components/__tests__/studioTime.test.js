import {
  TICKS_PER_SECOND,
  STUDIO_TIME_SPACES,
  secondsToTicks,
  ticksToSeconds,
  createTimeRange,
  intersectTimeRanges,
  containsTick,
  ticksToFrameIndex,
  frameIndexToTicks,
  ticksToSampleIndex,
  sampleIndexToTicks,
  createClipOccurrence,
  mapProgrammeTickToSource,
  mapSourceRangeToProgrammeRanges,
  splitClipOccurrence,
  trimClipOccurrence,
  reorderClipOccurrences,
  createOutputTimeMap,
  mapProgrammeTickToOutputTick,
  mapOutputTickToProgrammeTick,
  mapSourceCaptionToOutputRanges,
} from "../studioTime";

const source = (start, end) =>
  createTimeRange("source", secondsToTicks(start), secondsToTicks(end));
const programme = (start, end) =>
  createTimeRange("programme", secondsToTicks(start), secondsToTicks(end));
const ticks = secondsToTicks;

describe("Studio canonical time kernel", () => {
  test("uses integer 90 kHz ticks and explicit half-open time spaces", () => {
    expect(TICKS_PER_SECOND).toBe(90000);
    expect(STUDIO_TIME_SPACES.CLIP_LOCAL).toBe("clip_local");
    expect(ticks(1.5)).toBe(135000);
    expect(ticksToSeconds(135000)).toBe(1.5);
    expect(ticks(7200)).toBe(648000000);
    const range = programme(0, 2);
    expect(range).toEqual({ space: "programme", startTick: 0, endTick: 180000 });
    expect(containsTick(range, 0)).toBe(true);
    expect(containsTick(range, ticks(2) - 1)).toBe(true);
    expect(containsTick(range, ticks(2))).toBe(false);
    expect(intersectTimeRanges(range, programme(2, 3))).toBeNull();
    expect(intersectTimeRanges(range, programme(1, 3))).toEqual(programme(1, 2));
    expect(createTimeRange("source", 1, 1)).toEqual({ space: "source", startTick: 1, endTick: 1 });
    expect(() => intersectTimeRanges(source(0, 1), range)).toThrow(/time spaces/);
    expect(() => createTimeRange("unknown", 0, 1)).toThrow(/unknown time space/);
    expect(() => createTimeRange("source", 2, 1)).toThrow(/endTick/);
    expect(() => ticks(Number.POSITIVE_INFINITY)).toThrow(/finite/);
    expect(() => ticks(-1)).toThrow(/non-negative/);
  });

  test("rounds rational video frames and audio samples once at media boundaries", () => {
    // 30000/1001 frames/s has exactly 3003 ticks per frame on this clock.
    expect(frameIndexToTicks(107892, 30000, 1001)).toBe(107892 * 3003);
    expect(ticksToFrameIndex(ticks(3600), 30000, 1001)).toBe(107892);
    expect(frameIndexToTicks(107892, 30000, 1001)).toBeLessThan(ticks(3600));
    expect(ticksToSampleIndex(ticks(3600), 48000)).toBe(172800000);
    expect(sampleIndexToTicks(172800000, 48000)).toBe(ticks(3600));
    expect(ticksToSampleIndex(1, 48000, "floor")).toBe(0);
    expect(ticksToSampleIndex(1, 48000, "ceil")).toBe(1);
    expect(sampleIndexToTicks(1, 48000, "nearest")).toBe(2);
    expect(() => ticksToFrameIndex(0, 0)).toThrow(/frame rate/);
    expect(() => ticksToSampleIndex(0, 44100, "random")).toThrow(/rounding/);
  });

  test("retains occurrence identity when one source is used twice", () => {
    const first = createClipOccurrence({
      occurrenceId: "take-a",
      sourceAssetId: "immutable-source",
      sourceRange: source(5, 7),
      programmeRange: programme(0, 2),
    });
    const second = createClipOccurrence({
      occurrenceId: "take-b",
      sourceAssetId: "immutable-source",
      sourceRange: source(5, 7),
      programmeRange: programme(2, 4),
    });
    expect(mapProgrammeTickToSource([first, second], ticks(2))).toEqual({
      occurrenceId: "take-b",
      sourceAssetId: "immutable-source",
      sourceTick: ticks(5),
      clipLocalTick: 0,
    });
    expect(mapProgrammeTickToSource([first, second], ticks(4))).toBeNull();
    expect(
      mapSourceRangeToProgrammeRanges([first, second], "immutable-source", source(5.5, 6.5))
    ).toEqual([
      { occurrenceId: "take-a", programmeRange: programme(0.5, 1.5) },
      { occurrenceId: "take-b", programmeRange: programme(2.5, 3.5) },
    ]);
    const reordered = reorderClipOccurrences([first, second], ["take-b", "take-a"]);
    expect(reordered.map(item => item.occurrenceId)).toEqual(["take-b", "take-a"]);
    expect(reordered.map(item => item.programmeRange)).toEqual([programme(0, 2), programme(2, 4)]);
    expect(reordered[0].sourceRange).toEqual(source(5, 7));
    expect(() => reorderClipOccurrences([first, second], ["take-a", "take-a"])).toThrow(
      /exactly once/
    );
  });

  test("split, trim, reverse, and freeze preserve source-to-programme semantics", () => {
    const original = createClipOccurrence({
      occurrenceId: "one",
      sourceAssetId: "asset",
      sourceRange: source(10, 14),
      programmeRange: programme(0, 4),
    });
    const [left, right] = splitClipOccurrence(original, ticks(2), "two");
    expect(left.sourceRange).toEqual(source(10, 12));
    expect(right.sourceRange).toEqual(source(12, 14));
    expect(trimClipOccurrence(right, programme(2.5, 4)).sourceRange).toEqual(source(12.5, 14));
    expect(() => splitClipOccurrence(original, ticks(4), "two")).toThrow(/inside/);

    const reversed = createClipOccurrence({
      occurrenceId: "reverse",
      sourceAssetId: "asset",
      sourceRange: source(0, 3),
      programmeRange: programme(0, 3),
      direction: "reverse",
    });
    expect(mapProgrammeTickToSource([reversed], 0).sourceTick).toBe(ticks(3) - 1);
    expect(
      mapSourceRangeToProgrammeRanges([reversed], "asset", source(0, 1))[0].programmeRange
    ).toEqual(programme(2, 3));
    const [reverseLeft, reverseRight] = splitClipOccurrence(reversed, ticks(1), "reverse-right");
    expect(reverseLeft.sourceRange).toEqual(source(2, 3));
    expect(reverseRight.sourceRange).toEqual(source(0, 2));
    expect(trimClipOccurrence(reversed, programme(1, 2)).sourceRange).toEqual(source(1, 2));

    const frozen = createClipOccurrence({
      occurrenceId: "frozen",
      sourceAssetId: "asset",
      sourceRange: source(4, 5),
      programmeRange: programme(0, 2),
      direction: "freeze",
      anchorSourceTick: ticks(4.5),
    });
    expect(mapProgrammeTickToSource([frozen], ticks(1.7)).sourceTick).toBe(ticks(4.5));
    expect(
      mapSourceRangeToProgrammeRanges([frozen], "asset", source(4.4, 4.6))[0].programmeRange
    ).toEqual(programme(0, 2));
    expect(mapSourceRangeToProgrammeRanges([frozen], "asset", source(4.6, 4.8))).toEqual([]);
    expect(() => createClipOccurrence({ ...original, sourceRange: programme(0, 4) })).toThrow(
      /source time range/
    );
  });

  test("piecewise speed maps keep programme and output clocks distinct and remap captions", () => {
    const first = createClipOccurrence({
      occurrenceId: "take-a",
      sourceAssetId: "asset",
      sourceRange: source(5, 7),
      programmeRange: programme(0, 2),
    });
    const second = createClipOccurrence({
      occurrenceId: "take-b",
      sourceAssetId: "asset",
      sourceRange: source(5, 7),
      programmeRange: programme(2, 4),
    });
    const map = createOutputTimeMap(ticks(4), [
      { programmeRange: programme(0, 2), rateNumerator: 2, rateDenominator: 1 },
      { programmeRange: programme(2, 4), rateNumerator: 1, rateDenominator: 2 },
    ]);
    expect(map.map(segment => segment.outputRange)).toEqual([
      createTimeRange("output", 0, ticks(1)),
      createTimeRange("output", ticks(1), ticks(5)),
    ]);
    expect(mapProgrammeTickToOutputTick(map, ticks(2))).toBe(ticks(1));
    expect(mapProgrammeTickToOutputTick(map, ticks(4))).toBe(ticks(5));
    expect(mapOutputTickToProgrammeTick(map, ticks(3))).toBe(ticks(3));
    expect(mapSourceCaptionToOutputRanges([first, second], map, "asset", source(5.5, 6.5))).toEqual(
      [
        {
          occurrenceId: "take-a",
          outputRange: createTimeRange("output", ticks(0.25), ticks(0.75)),
        },
        { occurrenceId: "take-b", outputRange: createTimeRange("output", ticks(2), ticks(4)) },
      ]
    );
    expect(() =>
      createOutputTimeMap(ticks(4), [{ programmeRange: programme(0, 2), rate: 1 }])
    ).toThrow(/full programme/);
    expect(() =>
      createOutputTimeMap(ticks(4), [
        { programmeRange: programme(0, 2), rate: 1 },
        { programmeRange: programme(3, 4), rate: 1 },
      ])
    ).toThrow(/gaps or overlaps/);
  });
});
