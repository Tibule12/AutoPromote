import {
  buildCreatorMotionRecipe,
  buildCreatorSpeedRecipe,
  buildSpeedSegmentsFromKeyframes,
  mergeCreatorRecipe,
  findCreatorBeat,
} from "../studioCreatorRecipes";

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

  test("snaps only to detected, finite beats inside the timeline", () => {
    expect(findCreatorBeat([], 2, 12)).toBeNull();
    expect(findCreatorBeat([{ time: "invalid" }, -1, 12, 20], 2, 12)).toBeNull();
    expect(findCreatorBeat([{ time: 0 }, { time: 1.7 }, { time: 3.1 }], 2, 12)).toBe(1.7);
    expect(findCreatorBeat([0, 2], 0.1, 12)).toBe(0);
  });
});
