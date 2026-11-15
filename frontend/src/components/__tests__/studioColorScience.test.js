import {
  CAMERA_COLOR_PROFILES,
  DEAD_CONTENT_REVITALIZER_PRESETS,
  FILM_EMULATION_PRESETS,
  HSL_QUALIFIER_PRESETS,
  LOUDNESS_STANDARDS,
  POWER_WINDOW_PRESETS,
  applySelectiveAndRevitalizerGrade,
  buildColorSpaceTransformCube,
  diagnoseDeadFootageAndSolveRevival,
  evaluateHslQualifierMatte,
  evaluatePixelRevitalizer,
  evaluatePowerWindowMask,
  evaluateSelectiveColorTransform,
  solveShotMatchGrade,
} from "../studioColorScience";

describe("studioColorScience", () => {
  test("exports camera profiles, secondary presets, dead-content revitalizers, and loudness standards", () => {
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
    expect(HSL_QUALIFIER_PRESETS.garment_crimson.enabled).toBe(true);
    expect(HSL_QUALIFIER_PRESETS.sin_city_red_splash.desaturateOutside).toBe(1);
    expect(POWER_WINDOW_PRESETS.subject_spotlight.enabled).toBe(true);
    expect(POWER_WINDOW_PRESETS.face_upper_body.enabled).toBe(true);
    expect(POWER_WINDOW_PRESETS.full_body_column.shape).toBe("rectangle");
    expect(DEAD_CONTENT_REVITALIZER_PRESETS.flat_log_revival.dehaze).toBeGreaterThan(0);
    expect(DEAD_CONTENT_REVITALIZER_PRESETS.low_light_rescue.shadowRecovery).toBeGreaterThan(0.5);
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

  test("selective HSL qualifier isolates and recolors a red object while leaving cyan background untouched or B&W in splash mode", () => {
    const redQualifier = {
      ...HSL_QUALIFIER_PRESETS.garment_crimson,
      colorizeColor: "#2563eb", // Recolor red garment to cobalt blue
      colorizeStrength: 0.9,
      desaturateOutside: 1.0, // Turn non-red background B&W
    };
    expect(evaluateHslQualifierMatte(0.9, 0.12, 0.15, redQualifier)).toBeGreaterThan(0.85);
    expect(evaluateHslQualifierMatte(0.1, 0.8, 0.85, redQualifier)).toBeLessThan(0.05);

    // Red garment pixel becomes blue-dominant after selective recolor
    const recoloredObject = evaluateSelectiveColorTransform(0.9, 0.12, 0.15, 0.5, 0.5, {
      qualifier: redQualifier,
    });
    expect(recoloredObject[2]).toBeGreaterThan(recoloredObject[0]);

    // Cyan background pixel becomes grayscale because desaturateOutside = 1.0
    const background = evaluateSelectiveColorTransform(0.1, 0.8, 0.85, 0.5, 0.5, {
      qualifier: redQualifier,
    });
    expect(background[0]).toBeCloseTo(background[1], 3);
    expect(background[1]).toBeCloseTo(background[2], 3);
  });

  test("spatial power window isolates face/upper-body zone and feathers to zero at frame corners", () => {
    const faceWindow = POWER_WINDOW_PRESETS.face_upper_body;
    expect(evaluatePowerWindowMask(0.5, 0.32, faceWindow)).toBe(1);
    expect(evaluatePowerWindowMask(0.02, 0.96, faceWindow)).toBe(0);
    expect(evaluatePowerWindowMask(0.5, 0.32, { ...faceWindow, invert: true })).toBe(0);
  });

  test("dead-content revitalizer lifts dark shadows, clears haze, boosts muted colors, and diagnoses dead frames", () => {
    // Dark, hazy, dull pixel
    const [rOut, gOut, bOut] = evaluatePixelRevitalizer(0.16, 0.14, 0.12, {
      dehaze: 0.4,
      shadowRecovery: 0.75,
      highlightRollOff: 0.3,
      clarity: 0.4,
      vibrance: 0.6,
      skinToneProtect: 0.9,
    });
    expect(rOut).toBeGreaterThan(0.18);
    expect(gOut).toBeGreaterThan(0.15);

    // Dead dark muddy frame buffer
    const deadFrame = new Uint8ClampedArray([
      42, 40, 38, 255,
      48, 45, 43, 255,
      36, 35, 34, 255,
      44, 42, 40, 255,
    ]);
    const diagnosis = diagnoseDeadFootageAndSolveRevival(deadFrame);
    expect(diagnosis.issues).toEqual(
      expect.arrayContaining(["underexposed_shadows", "washed_out_flat_contrast", "lifeless_muted_chroma"])
    );
    expect(diagnosis.presetId).toBe("low_light_rescue");
    expect(diagnosis.grade.exposureStops).toBeGreaterThan(0.4);
    expect(diagnosis.revitalizer.shadowRecovery).toBeGreaterThan(0.5);

    const revived = deadFrame.slice();
    applySelectiveAndRevitalizerGrade(revived, 2, 2, {
      revitalizer: diagnosis.revitalizer,
    });
    expect(revived[0]).toBeGreaterThan(deadFrame[0]);
  });
});
