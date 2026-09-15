import {
  buildMotionAutomationStyle,
  buildMotionPathPoints,
  groupMotionKeyframesByTime,
  interpolateAutomationValue,
  sortAutomationKeyframes,
  upsertAutomationKeyframe,
} from "../studioAutomation";

describe("studioAutomation", () => {
  test("never replaces a different layer's key at the same time", () => {
    const source = [{ id: "title", targetId: "title", property: "scale", time: 2, value: 0.5 }];
    const result = upsertAutomationKeyframe(source, { id: "main", targetId: "main-video", property: "scale", time: 2, value: 1.5 });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(source[0]);
  });

  test("holds until the exact key time, including keys in the middle of a sequence", () => {
    const keyframes = [
      { property: "scale", time: 0, value: 1 },
      { property: "scale", time: 1, value: 2, easing: "hold" },
      { property: "scale", time: 2, value: 1, easing: "linear" },
    ];
    expect(interpolateAutomationValue({ keyframes, property: "scale", time: 0.999 })).toBe(1);
    expect(interpolateAutomationValue({ keyframes, property: "scale", time: 1 })).toBe(2);
  });

  test("custom curves use both horizontal and vertical handles", () => {
    const at = curve => interpolateAutomationValue({ property: "scale", time: 0.5, keyframes: [
      { property: "scale", time: 0, value: 0 },
      { property: "scale", time: 1, value: 1, easing: "bezier", curve },
    ] });
    expect(at([0.5, 0.5, 0.5, 0.5])).toBeCloseTo(0.5);
    expect(at([0.1, 0, 0.2, 1])).toBeGreaterThan(at([0.8, 0, 0.9, 1]));
  });
  test("sorts valid keyframes without mutating the source array", () => {
    const source = [
      { id: "late", time: 8 },
      { id: "invalid", time: "not-a-time" },
      { id: "early", time: 1.5 },
    ];

    expect(sortAutomationKeyframes(source).map(keyframe => keyframe.id)).toEqual(["early", "late"]);
    expect(source[0].id).toBe("late");
  });

  test("updates the same property near the playhead instead of stacking duplicate keys", () => {
    const result = upsertAutomationKeyframe(
      [{ id: "scale-key", property: "scale", time: 2, value: 1 }],
      { id: "new-id", property: "scale", time: 2.03, value: 1.25 }
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({ id: "scale-key", time: 2.03, value: 1.25 })
    );
  });

  test("interpolates linear, eased and held automation predictably", () => {
    const linear = [
      { id: "a", property: "volume", time: 0, value: 0 },
      { id: "b", property: "volume", time: 10, value: 100, easing: "linear" },
    ];
    expect(interpolateAutomationValue({ keyframes: linear, property: "volume", time: 5 })).toBe(50);

    const eased = linear.map(keyframe =>
      keyframe.id === "b" ? { ...keyframe, easing: "ease_in" } : keyframe
    );
    expect(
      interpolateAutomationValue({ keyframes: eased, property: "volume", time: 5 })
    ).toBeCloseTo(12.5);

    const held = linear.map(keyframe =>
      keyframe.id === "b" ? { ...keyframe, easing: "hold" } : keyframe
    );
    expect(interpolateAutomationValue({ keyframes: held, property: "volume", time: 9 })).toBe(0);
  });

  test("builds a complete transform using keyframes and safe fallback values", () => {
    const style = buildMotionAutomationStyle(
      [
        { id: "x-1", property: "x", time: 0, value: 20 },
        { id: "x-2", property: "x", time: 4, value: 80, easing: "linear" },
      ],
      2,
      { y: 44, scale: 1.2, rotation: 8, opacity: 0.7, cropX: 3, cropY: 4 }
    );

    expect(style).toEqual({
      x: 50,
      y: 44,
      scale: 1.2,
      rotation: 8,
      opacity: 0.7,
      cropX: 3,
      cropY: 4,
    });
  });

  test("groups transform properties into one editor pose per timestamp", () => {
    const groups = groupMotionKeyframesByTime([
      { id: "y-late", property: "y", time: 4, value: 70 },
      { id: "x-first", property: "x", time: 0, value: 20 },
      { id: "y-first", property: "y", time: 0, value: 30 },
      { id: "x-late", property: "x", time: 4, value: 80 },
    ]);

    expect(groups.map(group => group.time)).toEqual([0, 4]);
    expect(groups[0].keyframes.map(keyframe => keyframe.id)).toEqual(["x-first", "y-first"]);
  });

  test("builds a spatial motion path from the same interpolation used by preview", () => {
    const path = buildMotionPathPoints(
      [
        { id: "x-1", property: "x", time: 0, value: 15 },
        { id: "y-1", property: "y", time: 0, value: 25 },
        { id: "x-2", property: "x", time: 3, value: 75, easing: "linear" },
        { id: "y-2", property: "y", time: 3, value: 65, easing: "linear" },
      ],
      { x: 50, y: 50 }
    );

    expect(path.map(({ time, x, y }) => ({ time, x, y }))).toEqual([
      { time: 0, x: 15, y: 25 },
      { time: 3, x: 75, y: 65 },
    ]);
  });
});
