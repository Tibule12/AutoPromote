import {
  CAMERA_COLOR_PROFILES,
  FILM_EMULATION_PRESETS,
  HSL_QUALIFIER_PRESETS,
  LOUDNESS_STANDARDS,
  POWER_WINDOW_PRESETS,
  buildColorSpaceTransformCube,
  solveShotMatchGrade,
} from "../studioColorScience";

describe("studioColorScience", () => {
  test("exports camera profiles, secondary presets, and loudness standards", () => {
    const ids = CAMERA_COLOR_PROFILES.map(p => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "rec709",
        "apple_log",
        "sony_slog3",
        "dji_dlog",
        "canon_clog",
        "hlg_hdr",
      ])
    );
    expect(HSL_QUALIFIER_PRESETS.skin_isolate.enabled).toBe(true);
    expect(POWER_WINDOW_PRESETS.subject_spotlight.enabled).toBe(true);
    expect(FILM_EMULATION_PRESETS["35mm_halation"].halation).toBeGreaterThan(0);
    expect(LOUDNESS_STANDARDS.social.targetLufs).toBe(-14);
  });

  test("buildColorSpaceTransformCube produces valid identity LUT for rec709 -> rec709", () => {
    const cube = buildColorSpaceTransformCube("rec709", "rec709", 5);
    expect(cube.size).toBe(5);
    expect(cube.data).toHaveLength(5 * 5 * 5 * 3);
    expect(cube.presetId).toBe("cst:rec709->rec709");
    expect(cube.data[0]).toBe(0);
    expect(cube.data[1]).toBe(0);
    expect(cube.data[2]).toBe(0);
    expect(cube.data[cube.data.length - 1]).toBe(1);
  });

  test("buildColorSpaceTransformCube expands flat Log midtones into normalized Rec.709 roll-off", () => {
    const size = 9;
    const appleCube = buildColorSpaceTransformCube("apple_log", "rec709", size);
    const slog3Cube = buildColorSpaceTransformCube("sony_slog3", "rec709", size);
    const dlogCube = buildColorSpaceTransformCube("dji_dlog", "rec709", size);
    const clogCube = buildColorSpaceTransformCube("canon_clog", "rec709", size);
    const hlgCube = buildColorSpaceTransformCube("hlg_hdr", "rec709", size);

    for (const cube of [appleCube, slog3Cube, dlogCube, clogCube, hlgCube]) {
      expect(cube.data).toHaveLength(size * size * size * 3);
      for (const value of cube.data) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }

    const midIndex = Math.floor((size * size * size) / 2) * 3;
    expect(appleCube.data[midIndex]).toBeGreaterThan(0);
    expect(slog3Cube.data[midIndex]).toBeGreaterThan(0);
  });

  test("solveShotMatchGrade raises exposure for dark shot and shifts warmth toward reference", () => {
    // Warm bright reference: R=210, G=165, B=120
    const reference = new Uint8ClampedArray([
      210, 165, 120, 255,
      190, 150, 110, 255,
      230, 180, 130, 255,
      200, 160, 115, 255,
    ]);
    // Cool dark target: R=60, G=75, B=110
    const target = new Uint8ClampedArray([
      60, 75, 110, 255,
      58, 72, 108, 255,
      62, 78, 112, 255,
      59, 74, 109, 255,
    ]);

    const grade = solveShotMatchGrade(reference, target);
    expect(grade.precisionGrade).toBe(true);
    expect(grade.exposureStops).toBeGreaterThan(0.5);
    expect(grade.temperature).toBeGreaterThan(0.2);
    expect(grade.contrast).toBeGreaterThanOrEqual(0.75);
    expect(grade.contrast).toBeLessThanOrEqual(1.45);
  });
});
