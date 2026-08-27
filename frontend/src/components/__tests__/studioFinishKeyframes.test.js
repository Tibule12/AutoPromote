import {
  analyzeAudioBufferBeats,
  interpolateFinishKeyframes,
  snapTimeToBeat,
  upsertFinishKeyframe,
} from "../studioFinishKeyframes";

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
