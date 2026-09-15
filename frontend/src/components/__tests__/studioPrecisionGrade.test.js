import { buildPrecisionGrade, applyPrecisionGrade } from "../studioPrecisionGrade";

test("neutral RGB transfer preserves pixels and alpha", () => {
  const original = new Uint8ClampedArray([0, 42, 255, 200, 128, 64, 32, 255]);
  expect(applyPrecisionGrade(original.slice(), buildPrecisionGrade({}))).toEqual(original);
});

test("exposure, white balance, tint and saturation affect the pixels", () => {
  const pixel = fx => [...applyPrecisionGrade(new Uint8ClampedArray([80, 80, 80, 255]), buildPrecisionGrade(fx))];
  expect(pixel({ exposureStops: 1 })[0]).toBe(160);
  const warm = pixel({ temperature: 1 });
  expect(warm[0]).toBeGreaterThan(warm[2]);
  const tinted = pixel({ tint: 1 });
  expect(tinted[0]).toBeGreaterThan(tinted[1]);
  const gray = applyPrecisionGrade(new Uint8ClampedArray([120, 70, 30, 255]), buildPrecisionGrade({ saturation: 0 }));
  expect(gray[0]).toBe(gray[1]);
  expect(gray[1]).toBe(gray[2]);
});
