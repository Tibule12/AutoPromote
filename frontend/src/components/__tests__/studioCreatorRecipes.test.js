import {
  buildCreatorMotionRecipe,
  buildCreatorSpeedRecipe,
  buildSpeedSegmentsFromKeyframes,
  mergeCreatorRecipe,
  findCreatorBeat,
} from "../studioCreatorRecipes";
import { normalizeSpeedSegmentsForRender } from "../viralRenderPayload";
import { createOutputTimeMap, createTimeRange, secondsToTicks } from "../studioTime";

describe("durable creator recipes", () => {
  const apply = (keys, points, property = "scale") => mergeCreatorRecipe({
    keyframes: keys, points, targetId: "main-video", property, fallback: 1.2,
    createId: (() => { let id = 0; return () => `key-${++id}`; })(),
  });

  test.each(["punch_zoom", "snap_zoom", "crash_zoom"])("%s respects selected amount and restores framing", preset => {
    const points = buildCreatorMotionRecipe({ preset, zoom: 1.8, time: 2, duration: 12 });
    const result = apply([], points);
    expect(result.map(key => key.value)).toEqual([1.2, 1.8, 1.2]);
    expect(result[0].time).toBe(2);
    expect(result[2].time).toBeLessThan(3);
  });

  test("preserves other layers, properties and keys outside the recipe range", () => {
    const keys = [
      { id: "before", targetId: "main-video", property: "scale", time: 0, value: 1.2 },
      { id: "after", targetId: "main-video", property: "scale", time: 10, value: 1.2 },
      { id: "title", targetId: "title", property: "scale", time: 2, value: 0.7 },
      { id: "position", targetId: "main-video", property: "x", time: 2, value: 62 },
    ];
    const result = apply(keys, buildCreatorMotionRecipe({ time: 2, duration: 12 }));
    keys.forEach(key => expect(result).toContain(key));
    expect(result).toHaveLength(7);
  });

  test("rejects end-of-clip effects instead of generating duplicate-time keys", () => {
    expect(buildCreatorMotionRecipe({ time: 12, duration: 12 })).toEqual([]);
    expect(buildCreatorSpeedRecipe({ time: 11.9, duration: 12 })).toEqual([]);
    const points = buildCreatorSpeedRecipe({ time: 11.5, duration: 12 });
    expect(new Set(points.map(key => key.time)).size).toBe(4);
    expect(points[3].time).toBe(12);
  });

  test("speed recipes restore the existing speed without erasing later ramps", () => {
    const existing = [{ id: "later", targetId: "main-video", property: "speed", time: 10, value: 1.5 }];
    const result = apply(existing, buildCreatorSpeedRecipe({ time: 2, duration: 12 }), "speed");
    expect(result).toContain(existing[0]);
    expect(result[0].value).toBe(1.5);
    expect(result[3].value).toBe(1.5);
  });

  test("turns the browser speed curve into bounded render segments", () => {
    const keys = apply([], buildCreatorSpeedRecipe({ time: 2, duration: 12 }), "speed");
    const segments = buildSpeedSegmentsFromKeyframes({
      keyframes: keys,
      duration: 12,
      fallback: 1.2,
    });
    expect(segments[0]).toEqual(
      expect.objectContaining({ startTime: 0, rate: 1.2, pitchPreserved: true })
    );
    expect(segments.at(-1).endTime).toBe(12);
    expect(Math.max(...segments.map(segment => segment.rate))).toBeLessThanOrEqual(2);
    expect(Math.min(...segments.map(segment => segment.rate))).toBeGreaterThanOrEqual(0.5);
    expect(segments.some(segment => segment.rate > 1.8)).toBe(true);
    expect(segments.some(segment => segment.rate < 0.7)).toBe(true);
  });

  test("covers a long alternating ramp after the sampling budget is exhausted", () => {
    const duration = 76;
    const keyframes = Array.from({ length: 20 }, (_, index) => ({
      id: `alternating-${index}`,
      targetId: "main-video",
      property: "speed",
      time: index * 4,
      value: index % 2 ? 2 : 1,
      easing: "linear",
    }));
    const segments = buildSpeedSegmentsFromKeyframes({ keyframes, duration });
    expect(segments.length).toBeLessThanOrEqual(240);
    expect(segments[0].startTime).toBe(0);
    expect(segments.at(-1).endTime).toBe(duration);
    segments.slice(1).forEach((segment, index) => {
      expect(segment.startTime).toBe(segments[index].endTime);
    });
    expect(segments.some(segment => segment.startTime >= 68 && segment.rate > 1.5)).toBe(true);
    const renderSegments = normalizeSpeedSegmentsForRender(segments);
    expect(renderSegments.at(-1).end_time).toBe(duration);
    expect(renderSegments.slice(1).every((segment, index) =>
      segment.start_time === renderSegments[index].end_time)).toBe(true);
    const outputMap = createOutputTimeMap(secondsToTicks(duration), renderSegments.map(segment => ({
      programmeRange: createTimeRange("programme",
        secondsToTicks(segment.start_time), secondsToTicks(segment.end_time)),
      rate: segment.rate,
    })));
    expect(outputMap.at(-1).programmeRange.endTick).toBe(secondsToTicks(duration));
  });

  test("keeps short ramps and clip-edge keys continuous", () => {
    const keyframes = [
      { property: "speed", time: -2, value: 1, easing: "linear" },
      { property: "speed", time: 0, value: 1, easing: "linear" },
      { property: "speed", time: 0.125, value: 2, easing: "linear" },
      { property: "speed", time: 0.25, value: 1, easing: "linear" },
      { property: "speed", time: 20, value: 2, easing: "linear" },
    ];
    const segments = buildSpeedSegmentsFromKeyframes({
      keyframes, duration: 0.25, samplesPerSecond: 32, maxSegments: 12,
    });
    expect(segments[0].startTime).toBe(0);
    expect(segments.at(-1).endTime).toBe(0.25);
    expect(segments.length).toBeLessThanOrEqual(12);
    expect(segments.some(segment => segment.rate > 1.5)).toBe(true);
    segments.slice(1).forEach((segment, index) =>
      expect(segment.startTime).toBe(segments[index].endTime));
  });

  test("merges constant speed runs even with many redundant keys", () => {
    const keyframes = Array.from({ length: 300 }, (_, index) => ({
      property: "speed", time: index * 10, value: 1.5, easing: "linear",
    }));
    expect(buildSpeedSegmentsFromKeyframes({ keyframes, duration: 7200, maxSegments: 240 }))
      .toEqual([{ id: "speed-1", startTime: 0, endTime: 7200, rate: 1.5, pitchPreserved: true }]);
    expect(buildSpeedSegmentsFromKeyframes({ duration: 12, fallback: 1.25 }))
      .toEqual([{ id: "speed-1", startTime: 0, endTime: 12, rate: 1.25, pitchPreserved: true }]);
  });

  test("covers the maximum two-hour media boundary without raising the segment cap", () => {
    const segments = buildSpeedSegmentsFromKeyframes({
      keyframes: [
        { property: "speed", time: 0, value: 1, easing: "linear" },
        { property: "speed", time: 3600, value: 2, easing: "linear" },
        { property: "speed", time: 7200, value: 1, easing: "linear" },
      ],
      duration: 7200,
    });
    expect(segments.length).toBeLessThanOrEqual(240);
    expect(segments.at(-1).endTime).toBe(7200);
    expect(segments.some(segment => segment.startTime >= 6000 && segment.rate > 1)).toBe(true);
    expect(() => buildSpeedSegmentsFromKeyframes({
      keyframes: Array.from({ length: 242 }, (_, index) => ({
        property: "speed", time: index, value: index % 2 ? 1 : 2,
      })), duration: 241,
    })).toThrow(/exceed maxSegments/);
  });

  test("partitions adversarial plans with many keys and uneven time intervals", () => {
    [
      { duration: 0.9, count: 9 },
      { duration: 76, count: 67 },
      { duration: 7200, count: 200 },
    ].forEach(({ duration, count }) => {
      const keyframes = Array.from({ length: count }, (_, index) => ({
        property: "speed",
        time: duration * Math.pow(index / (count - 1), 1.7),
        value: [0.5, 1.25, 2, 0.75][index % 4],
        easing: "linear",
      }));
      const first = buildSpeedSegmentsFromKeyframes({ keyframes, duration });
      const second = buildSpeedSegmentsFromKeyframes({ keyframes, duration });
      expect(second).toEqual(first);
      expect(first.length).toBeLessThanOrEqual(240);
      expect(first[0].startTime).toBe(0);
      expect(first.at(-1).endTime).toBe(duration);
      first.slice(1).forEach((segment, index) => {
        expect(segment.startTime).toBe(first[index].endTime);
        expect(segment.endTime).toBeGreaterThan(segment.startTime);
      });
    });
  });

  test("snaps only to detected, finite beats inside the timeline", () => {
    expect(findCreatorBeat([], 2, 12)).toBeNull();
    expect(findCreatorBeat([{ time: "invalid" }, -1, 12, 20], 2, 12)).toBeNull();
    expect(findCreatorBeat([{ time: 0 }, { time: 1.7 }, { time: 3.1 }], 2, 12)).toBe(1.7);
    expect(findCreatorBeat([0, 2], 0.1, 12)).toBe(0);
  });
});
