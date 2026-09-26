import { rippleTimedItems, rippleTimelineKeys } from "../studioTimelineEdits";
import { interpolateReframeKeyframes } from "../studioReframeInterpolation";

test("ripple cuts move later media without mutating the originals", () => {
  const item = { id: "later", startTime: 8, duration: 2, trimStart: 1 };
  expect(rippleTimedItems([item], 1, 4, () => "copy")).toEqual([{ ...item, startTime: 5 }]);
  expect(item.startTime).toBe(8);
});

test("cutting through B-roll retains the correct source range on either side", () => {
  const item = { id: "broll", type: "video", startTime: 1, duration: 8, sourceStartTime: 10 };
  expect(rippleTimedItems([item], 3, 5, () => "right")).toEqual([
    { ...item, duration: 2 },
    { ...item, id: "right", startTime: 3, duration: 4, sourceStartTime: 14 },
  ]);
});

test("cutting a leading sound range advances the audio trim and removes fully cut cues", () => {
  expect(
    rippleTimedItems([{ id: "sfx", startTime: 2, duration: 5, trimStart: 0.5 }], 1, 4, () => "copy")
  ).toEqual([{ id: "sfx", startTime: 1, duration: 3, trimStart: 2.5 }]);
  expect(rippleTimedItems([{ id: "sfx", startTime: 2, duration: 1 }], 1, 4, () => "copy")).toEqual(
    []
  );
});

test("keys inside a removed range disappear and subsequent keys share the new clock", () => {
  const keys = [
    { time: 0, value: 1 },
    { time: 2, value: 2 },
    { time: 5, value: 3 },
  ];
  expect(rippleTimelineKeys(keys, 1, 4)).toEqual([
    { time: 0, value: 1 },
    { time: 2, value: 3 },
  ]);
});

test("a deleted section preserves the next camera at the join until its next hard cut", () => {
  const cameraCuts = [
    { time: 165.769, x: 22, y: 30, cut: true },
    { time: 171.536, x: 68, y: 28, cut: true },
    { time: 173.519, x: 75, y: 25, cut: true },
    { time: 174.269, x: 21, y: 27, cut: true },
  ];
  const joined = rippleTimelineKeys(cameraCuts, 168, 174, { preserveRightState: true });
  expect(interpolateReframeKeyframes(joined, 168.1).x).toBe(75);
  expect(interpolateReframeKeyframes(joined, 168.27).x).toBe(21);
  expect(cameraCuts[2].time).toBe(173.519);
});

test("the reviewed alternate full-frame angle moves with Director splits after a delete", () => {
  const alternates = [
    { time: 176, offset_seconds: 6.75 },
    { time: 210, offset_seconds: 1.75 },
  ];
  expect(rippleTimelineKeys(alternates, 168, 174, { preserveRightState: true })).toEqual([
    { time: 170, offset_seconds: 6.75 },
    { time: 204, offset_seconds: 1.75 },
  ]);
});

test("multi-gap reverse rippling accurately shifts items past multiple dead-air pauses", () => {
  const item = { id: "downstream", startTime: 10, duration: 4 };
  const gaps = [
    { from: 6, to: 8 }, // Gap 2 (duration 2)
    { from: 1, to: 3 }, // Gap 1 (duration 2)
  ];
  let current = [item];
  for (const gap of gaps) {
    current = rippleTimedItems(current, gap.from, gap.to, () => "copy");
  }
  expect(current).toEqual([{ ...item, startTime: 6 }]);
});
