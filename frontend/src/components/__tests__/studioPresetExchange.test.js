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
        sharpness: 0.25,
        dehaze: 0.18,
        clarity: 0.22,
        shadowRecovery: 0.35,
        highlightRollOff: 0.4,
        vibrance: 0.15,
        skinToneProtect: 0.9,
        revitalizerPresetId: "punchy_rescue",
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
        lutData: { size: 2, table: [0, 0, 0, 1, 1, 1] },
      },
      audioRestoration: {
        preset: "podcast",
        loudness: -16,
        limiter: -1,
      },
      mainFrame: { enabled: true, borderRadius: 24, padding: 16 },
      captionStyle: "word_pill",
      audioRemix: { pitchShift: -2, reverb: 0.15 },
    });

    const parsed = parseStudioPresetBundle(json);
    expect(parsed.name).toBe("Cinema Warm 35mm");
    expect(parsed.finishFx.filmEmulation).toBe("35mm_halation");
    expect(parsed.finishFx.sharpness).toBe(0.25);
    expect(parsed.finishFx.dehaze).toBe(0.18);
    expect(parsed.finishFx.shadowRecovery).toBe(0.35);
    expect(parsed.finishFx.revitalizerPresetId).toBe("punchy_rescue");
    expect(parsed.advancedColor.cameraProfile).toBe("apple_log");
    expect(parsed.advancedColor.lutData).toEqual({ size: 2, table: [0, 0, 0, 1, 1, 1] });
    expect(parsed.audioRestoration.loudness).toBe(-16);
    expect(parsed.mainFrame).toEqual({ enabled: true, borderRadius: 24, padding: 16 });
    expect(parsed.captionStyle).toBe("word_pill");
    expect(parsed.audioRemix).toEqual({ pitchShift: -2, reverb: 0.15 });
    expect(JSON.parse(json).version).toBe(STUDIO_PRESET_BUNDLE_VERSION);
  });

  test("rejects empty or invalid preset payloads", () => {
    expect(() => parseStudioPresetBundle("")).toThrow();
    expect(() => parseStudioPresetBundle(JSON.stringify({ version: 999 }))).toThrow();
  });
});
