import { soloTrackingCoordinates } from "../studioTrackingCoordinates";

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
