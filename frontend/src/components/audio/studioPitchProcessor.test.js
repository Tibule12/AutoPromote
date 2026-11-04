import { StudioPitchProcessor } from "../../../public/studio-audio-pitch-v1";

function renderPitch(pitch, hz = 220) {
  const processor = new StudioPitchProcessor(), output = [];
  for (let start = 0; start < 24000; start += 128) {
    const source = Float32Array.from({ length: 128 }, (_, i) => .3 * Math.sin(2 * Math.PI * hz * (start + i) / 48000));
    const stereo = [new Float32Array(128), new Float32Array(128)];
    processor.process([[source, source]], [stereo], { semitones: new Float32Array([pitch]) });
    expect(stereo[0]).toEqual(stereo[1]);
    output.push(...stereo[0]);
  }
  return output;
}
function strongestFrequency(samples, target) {
  let strongest = 0, frequency = 0;
  for (let hz = Math.floor(target - 25); hz <= target + 25; hz++) {
    let real = 0, imaginary = 0;
    for (let i = 12000; i < 24000; i++) {
      const angle = 2 * Math.PI * hz * i / 48000;
      real += samples[i] * Math.cos(angle); imaginary += samples[i] * Math.sin(angle);
    }
    const amplitude = Math.hypot(real, imaginary);
    if (amplitude > strongest) { strongest = amplitude; frequency = hz; }
  }
  return frequency;
}
test.each([12, -4, -2.25, 3])("live pitch %s changes the voice frequency without changing duration", pitch => {
  const output = renderPitch(pitch), expected = 220 * 2 ** (pitch / 12);
  expect(output).toHaveLength(Math.ceil(24000 / 128) * 128);
  expect(output.every(Number.isFinite)).toBe(true);
  expect(Math.abs(strongestFrequency(output, expected) - expected)).toBeLessThan(2);
  expect(Math.sqrt(output.slice(12000).reduce((sum, value) => sum + value * value, 0) / 12000)).toBeGreaterThan(.02);
});
test("neutral pitch is sample-exact and missing input stays finite and silent", () => {
  const processor = new StudioPitchProcessor();
  const input = Float32Array.from({ length: 128 }, (_, i) => Math.sin(i));
  const output = new Float32Array(128);
  processor.process([[input]], [[output]], { semitones: new Float32Array([0]) });
  expect(output).toEqual(input);
  processor.process([[]], [[output]], { semitones: new Float32Array([0]) });
  expect([...output]).toEqual(Array(128).fill(0));
});
test("seeking resets buffered speech rather than replaying the previous position", () => {
  const processor = new StudioPitchProcessor(), signal = new Float32Array(128).fill(.25);
  for (let i = 0; i < 32; i++) processor.process([[signal]], [[new Float32Array(128)]], { semitones: new Float32Array([12]) });
  processor.reset();
  const output = new Float32Array(128);
  processor.process([[new Float32Array(128)]], [[output]], { semitones: new Float32Array([12]) });
  expect([...output]).toEqual(Array(128).fill(0));
});
