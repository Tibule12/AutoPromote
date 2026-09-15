import {
  AUDIO_REMIX_PRESETS,
  applyAudioRemixPreset,
  audioRemixForRender,
  normalizeAudioRemix,
  patchAudioRemix,
} from "./audioRemixModel";

describe("audioRemixModel", () => {
  test("offers the six Studio remix presets", () => {
    expect(AUDIO_REMIX_PRESETS.map(item => item.name)).toEqual([
      "Slowed + Reverb",
      "Sped Up",
      "Deep Voice",
      "Nightcore",
      "Amapiano Space",
      "Warm Vocal",
    ]);
  });

  test("selecting and editing a preset produces a bounded render contract", () => {
    const selected = applyAudioRemixPreset("slowed_reverb");
    const edited = patchAudioRemix(selected, { pitch: -40, reverb: 140, intensity: 75 });

    expect(edited.enabled).toBe(true);
    expect(edited.pitch).toBe(-12);
    expect(edited.reverb).toBe(100);
    expect(audioRemixForRender(edited)).toEqual(
      expect.objectContaining({
        version: 1,
        enabled: true,
        preset: "slowed_reverb",
        pitch_semitones: -12,
        reverb_mix: 1,
        intensity: 0.75,
        content_type: "auto",
        target: "master",
        output_gain_db: 0,
        level_match: true,
        quality: "studio",
      })
    );
  });

  test("Keep Pitch removes independent pitch shift from export", () => {
    const value = normalizeAudioRemix({
      ...applyAudioRemixPreset("nightcore"),
      keepPitch: true,
    });
    expect(audioRemixForRender(value).pitch_semitones).toBe(0);
  });

  test("normalizes professional protection, targeting, gain and quality settings", () => {
    const value = normalizeAudioRemix({
      ...applyAudioRemixPreset("warm_vocal"),
      contentType: "choir",
      target: "voice",
      outputGain: 40,
      levelMatch: false,
      quality: "preview",
    });
    expect(value).toEqual(
      expect.objectContaining({
        contentType: "choir",
        target: "voice",
        outputGain: 6,
        levelMatch: false,
        quality: "preview",
      })
    );
  });
});
