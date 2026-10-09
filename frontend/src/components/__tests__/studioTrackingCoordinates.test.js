import { soloTrackingCoordinates, reprojectDetectedReframeKeys } from "../studioTrackingCoordinates";

test("solo detector source positions round-trip across aspect ratios and zoom", () => {
  for (const aspect of [9/16, 4/5, 1, 16/9]) for (const zoom of [1, 1.3, 3]) {
    const c = soloTrackingCoordinates({ x: 29, y: 40 }, 16/9, aspect, zoom);
    expect(c.toPosition(c.anchor).x).toBeCloseTo(29);
    expect(c.toPosition(c.anchor).y).toBeCloseTo(40);
    expect(Number.isFinite(c.toPosition({ x: 100, y: 100 }).y)).toBe(true);
  }
});

test("portrait source movement translates into a larger object-position change", () => {
  const c = soloTrackingCoordinates({ x: 30, y: 50 }, 16/9, 9/16, 1);
  expect(c.toPosition({ x: c.anchor.x+5, y: 50 }).x).toBeGreaterThan(35);
});


test("a landscape face path retains its source centre when changed to portrait", () => {
  const wide = { time: 0, x: 50, y: 50, sourceFocus: { x: 78, y: 35, aspect: 16/9 } };
  const portrait = reprojectDetectedReframeKeys([wide], 9/16)[0];
  expect(portrait.x).toBeGreaterThan(85);
  const restored = soloTrackingCoordinates(portrait, 16/9, 9/16).anchor;
  expect(restored.x).toBeCloseTo(78);
  expect(reprojectDetectedReframeKeys([{ time: 0, x: 27, y: 42 }], 9/16)[0]).toEqual({ time: 0, x: 27, y: 42 });
});
