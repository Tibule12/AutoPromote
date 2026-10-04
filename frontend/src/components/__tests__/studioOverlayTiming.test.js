import { mapStudioOverlayTiming } from "../studioOverlayTiming";
const getWindow = clip => ({ start: clip.start, end: clip.end, duration: clip.end - clip.start });
const primary = { id: "main", start: 10, end: 20 };
const exported = {
  id: "main",
  source_clip_id: "detected",
  start_time: 10,
  end_time: 20,
  duration: 10,
};
test.each([0, 2, 5, 9.9])("programme layer at %ss keeps its position after source trim", time => {
  const [layer] = mapStudioOverlayTiming({
    timeline: [primary],
    exportTimeline: [exported],
    getWindow,
    overlays: [{ id: "layer", clipId: "main", startTime: time, duration: 1 }],
  });
  expect(layer.start_time).toBeCloseTo(time);
  expect(layer.duration).toBe(1);
});
test("second occurrence uses its own source range even when source identities repeat", () => {
  const timeline = [primary, { id: "second", start: 30, end: 40 }];
  const exportTimeline = [
    exported,
    { id: "second", source_clip_id: "detected", start_time: 30, end_time: 40, duration: 10 },
  ];
  const [layer] = mapStudioOverlayTiming({
    timeline,
    exportTimeline,
    getWindow,
    overlays: [{ startTime: 12, duration: 3, clipId: "second" }],
  });
  expect(layer.start_time).toBe(12);
});
test.each([
  [5.5, 0.5],
  [2, 4],
  [8, 8],
])("hook reordering maps programme %ss onto the retained source content", (start, expected) => {
  const exportTimeline = [
    { ...exported, id: "hook-intro-main", start_time: 15, end_time: 17, duration: 2 },
    { ...exported, id: "main-before-hook", start_time: 10, end_time: 15, duration: 5 },
    { ...exported, id: "main-after-hook", start_time: 17, end_time: 20, duration: 3 },
  ];
  const [layer] = mapStudioOverlayTiming({
    timeline: [primary],
    exportTimeline,
    getWindow,
    overlays: [{ startTime: start, duration: 1 }],
  });
  expect(layer.start_time).toBe(expected);
});
test("legacy source captions map once while untimed graphics stay untimed", () => {
  const layers = mapStudioOverlayTiming({
    timeline: [primary],
    exportTimeline: [exported],
    getWindow,
    overlays: [
      { isCaption: true, clipId: "main", startTime: 12, duration: 1 },
      { id: "untimed", type: "text", text: "Logo" },
    ],
  });
  expect(layers[0].start_time).toBe(2);
  expect(layers[1]).not.toHaveProperty("start_time");
});
