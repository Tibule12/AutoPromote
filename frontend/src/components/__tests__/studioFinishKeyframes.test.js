import {
  analyzeAudioBufferBeats,
  buildBeatSyncedGradePulses,
  interpolateFinishKeyframes,
  snapTimeToBeat,
  upsertFinishKeyframe,
} from "../studioFinishKeyframes";
import {
  SKIN_TONE_LINE_ANGLE_DEG,
  computeLiveGradeScopes,
} from "../studioColorScopes";

test("interpolates an adjustment layer between creator grade keyframes", () => {
  const keyframes = [
    { id: "a", time: 0, values: { brightness: 0.9, contrast: 1, saturation: 0.8 } },
    { id: "b", time: 4, values: { brightness: 1.1, contrast: 1.4, saturation: 1.2 } },
  ];
  const result = interpolateFinishKeyframes(
    { brightness: 1, contrast: 1, saturation: 1, temperature: 0 },
    keyframes,
    2
  );
  expect(result.brightness).toBeCloseTo(1);
  expect(result.contrast).toBeCloseTo(1.2);
  expect(result.saturation).toBeCloseTo(1);
});

test("updates the existing playhead keyframe and magnetically snaps close edits", () => {
  const initial = upsertFinishKeyframe([], 1, { brightness: 1.05, contrast: 1.1 });
  const updated = upsertFinishKeyframe(initial, 1.04, { brightness: 1.2, contrast: 1.3 });
  expect(updated).toHaveLength(1);
  expect(updated[0].values.brightness).toBe(1.2);
  expect(snapTimeToBeat(2.14, [{ time: 2.25 }], 0.18)).toEqual({
    time: 2.25,
    snapped: true,
    beat: 2.25,
  });
});

test("builds a normalized browser audio envelope without uploading the track", () => {
  const samples = Float32Array.from({ length: 1000 }, (_, index) =>
    index % 200 < 20 ? 0.9 : 0.04
  );
  const analysis = analyzeAudioBufferBeats({
    sampleRate: 1000,
    duration: 1,
    getChannelData: () => samples,
  });
  expect(analysis.envelope).toHaveLength(20);
  expect(Math.max(...analysis.envelope)).toBeGreaterThan(0.5);
});

test("detects right-channel audio without cancelling opposing stereo samples", () => {
  const silent = new Float32Array(1000);
  const signal = Float32Array.from({ length: 1000 }, (_, index) => index < 20 ? 0.8 : 0);
  const analyse = channels => analyzeAudioBufferBeats({
    sampleRate: 1000, duration: 1, numberOfChannels: channels.length,
    getChannelData: channel => channels[channel],
  });
  expect(analyse([silent, signal]).envelope[0]).toBeGreaterThan(0.5);
  expect(analyse([signal, Float32Array.from(signal, sample => -sample)]).envelope[0]).toBeGreaterThan(0.5);
});

test("interpolates extended 3-way wheels and generates beat-synced grade pulses", () => {
  const pulses = buildBeatSyncedGradePulses(
    { brightness: 1, contrast: 1, saturation: 1, exposureStops: 0, lift: 0, gamma: 1, gain: 1 },
    [{ time: 1.0, strength: 1.0 }]
  );
  expect(pulses.length).toBeGreaterThanOrEqual(3);
  const atBeat = interpolateFinishKeyframes(
    { brightness: 1, contrast: 1, saturation: 1, exposureStops: 0, gain: 1 },
    pulses,
    1.0
  );
  expect(atBeat.exposureStops).toBeGreaterThan(0.15);
  expect(atBeat.contrast).toBeGreaterThan(1.08);
});

test("computes live broadcast waveform, RGB parade, and 123-deg vectorscope telemetry", () => {
  const baseline = computeLiveGradeScopes({
    finishFx: { precisionGrade: true, exposureStops: 0, saturation: 1 },
    advancedColor: null,
  });
  const boosted = computeLiveGradeScopes({
    finishFx: { precisionGrade: true, exposureStops: 0.65, gain: 1.25, saturation: 1.3 },
    advancedColor: { curve: { highlights: 0.2 }, hsl: { hue: 8, saturation: 1.15, luminance: 0.05 } },
  });
  expect(SKIN_TONE_LINE_ANGLE_DEG).toBe(123);
  expect(baseline.waveform).toHaveLength(32);
  expect(baseline.parade.r).toHaveLength(32);
  expect(boosted.lumaStats.avgLuma).toBeGreaterThan(baseline.lumaStats.avgLuma);
  expect(boosted.vectorscope.peakChroma).toBeGreaterThan(0);
});
