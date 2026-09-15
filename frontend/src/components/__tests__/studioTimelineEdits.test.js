import { rippleTimedItems, rippleTimelineKeys } from "../studioTimelineEdits";

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
