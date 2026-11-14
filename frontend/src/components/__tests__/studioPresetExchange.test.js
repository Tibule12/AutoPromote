import {
  STUDIO_PRESET_BUNDLE_VERSION,
  parseStudioPresetBundle,
  serializeStudioPresetBundle,
} from "../studioPresetExchange";

describe("studioPresetExchange", () => {
  test("round-trips Look + Audio mastering preset bundles safely", () => {
    const json = serializeStudioPresetBundle({
      name: "Cinema Warm 35mm",
      finishFx: {
        preset: "cinema",
        exposureStops: 0.35,
        contrast: 1.12,
        filmEmulation: "35mm_halation",
        halation: 28,
        chromaticAberration: 8,
        filmGrain: 18,
      },
      advancedColor: {
        cameraProfile: "apple_log",
        lutName: "apple_log to rec709.cube",
        lutPresetId: "cst:apple_log->rec709",
        lutIntensity: 100,
      },
      audioRestoration: {
        preset: "podcast",
        loudness: -16,
        limiter: -1,
      },
    });

    const parsed = parseStudioPresetBundle(json);
    expect(parsed.name).toBe("Cinema Warm 35mm");
    expect(parsed.finishFx.filmEmulation).toBe("35mm_halation");
    expect(parsed.advancedColor.cameraProfile).toBe("apple_log");
    expect(parsed.audioRestoration.loudness).toBe(-16);
    expect(JSON.parse(json).version).toBe(STUDIO_PRESET_BUNDLE_VERSION);
  });

  test("rejects empty or invalid preset payloads", () => {
    expect(() => parseStudioPresetBundle("")).toThrow();
    expect(() => parseStudioPresetBundle(JSON.stringify({ version: 999 }))).toThrow();
  });
});
