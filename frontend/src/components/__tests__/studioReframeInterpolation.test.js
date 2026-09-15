import { interpolateReframeKeyframes as at } from "../studioReframeInterpolation";
import { soloTrackingCoordinates } from "../studioTrackingCoordinates";

test("a camera cut holds the old crop until the exact boundary", () => {
  const keys = [{ time: 0, x: 29, y: 40 }, { time: .5, x: 73, y: 45, cut: true },
    { time: 1, x: 75, y: 45 }];
  expect(at(keys, .25).x).toBe(29);
  expect(at(keys, .5 - 1/30).x).toBe(29);
  expect(at(keys, .5).x).toBe(73);
  expect(at(keys, .75).x).toBe(74);
});

test("source coordinate conversion and saved JSON retain cut markers", () => {
  const coordinates = soloTrackingCoordinates({ x: 29, y: 40 }, 16/9, 9/16, 1.05);
  const converted = coordinates.toPosition({ time: 49.5, x: 68, y: 47, cut: true });
  expect(JSON.parse(JSON.stringify(converted)).cut).toBe(true);
});

test("manual framing remains smoothly interpolated and input is not mutated", () => {
  const keys = [{ time: 1, x: 80, y: 60 }, { time: 0, x: 20, y: 40 }];
  expect(at(keys, .5)).toEqual({ x: 50, y: 50 });
  expect(keys[0].time).toBe(1);
  expect(at([], 0)).toEqual({ x: 50, y: 50 });
});
