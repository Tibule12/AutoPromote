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
});
