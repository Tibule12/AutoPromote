import { StudioPitchProcessor } from "../../../public/studio-audio-pitch-v1";

async function renderPitch(pitch, hz = 220) {
  const processor = new StudioPitchProcessor(), output = [];
  await processor.ready;
  expect(processor.wasm).toBeTruthy();
  for (let start = 0; start < 24000; start += 128) {
    const source = Float32Array.from({ length: 128 }, (_, i) => .3 * Math.sin(2 * Math.PI * hz * (start + i) / 48000));
    const stereo = [new Float32Array(128), new Float32Array(128)];
    processor.process([[source, source]], [stereo], { semitones: new Float32Array([pitch]) });
    // The stereo engine's floating-point paths may differ below -80 dB.
    expect(Math.max(...stereo[0].map((value, i) => Math.abs(value - stereo[1][i])))).toBeLessThan(.0001);
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
test.each([12, -4, -2.25, 3])("live pitch %s changes the voice frequency without changing duration", async pitch => {
  const output = await renderPitch(pitch), expected = 220 * 2 ** (pitch / 12);
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
test("seeking resets buffered speech rather than replaying the previous position", async () => {
  const processor = new StudioPitchProcessor(), signal = new Float32Array(128).fill(.25);
  await processor.ready;
  for (let i = 0; i < 32; i++) processor.process([[signal]], [[new Float32Array(128)]], { semitones: new Float32Array([12]) });
  processor.reset();
  const output = new Float32Array(128);
  processor.process([[new Float32Array(128)]], [[output]], { semitones: new Float32Array([12]) });
  expect([...output]).toEqual(Array(128).fill(0));
});

test("Chipmunk rejects the old metallic hop-rate sidebands and retains voice level", async () => {
  const output = await renderPitch(12, 173);
  const powerAt = frequency => {
    let real = 0, imaginary = 0;
    for (let i = 12000; i < 24000; i++) {
      const window = .5 - .5 * Math.cos(2 * Math.PI * (i - 12000) / 12000);
      const angle = 2 * Math.PI * frequency * i / 48000;
      real += output[i] * window * Math.cos(angle);
      imaginary += output[i] * window * Math.sin(angle);
    }
    return real * real + imaginary * imaginary;
  };
  const carrier = powerAt(346);
  expect(10 * Math.log10((powerAt(346 - 93.75) + powerAt(346 + 93.75)) / carrier)).toBeLessThan(-50);
  const rms = Math.sqrt(output.slice(12000, 24000).reduce((sum, value) => sum + value * value, 0) / 12000);
  expect(rms).toBeGreaterThan(.18);
  expect(rms).toBeLessThan(.24);
});

test("switching and Keep Pitch return to exact dry audio without a muted block", async () => {
  const processor = new StudioPitchProcessor(); await processor.ready;
  let offset = 0;
  for (const pitch of [12, -2.8, -2.25, 0]) {
    let last;
    for (let block = 0; block < 80; block++) {
      const blockOffset = offset;
      const source = Float32Array.from({ length: 128 }, (_, i) => .2 * Math.sin(2 * Math.PI * 173 * (blockOffset + i) / 48000));
      const output = new Float32Array(128);
      processor.process([[source]], [[output]], { semitones: new Float32Array([pitch]) });
      expect(output.every(Number.isFinite)).toBe(true);
      expect(Math.max(...output.map(Math.abs))).toBeGreaterThan(.001);
      last = { source, output }; offset += 128;
    }
    if (pitch === 0) expect(last.output).toEqual(last.source);
  }
});

test("independent stereo channels retain their own shifted tone", async () => {
  const processor = new StudioPitchProcessor(); await processor.ready;
  const channels = [[], []];
  for (let start = 0; start < 24000; start += 128) {
    const input = [220, 330].map(hz => Float32Array.from({ length: 128 }, (_, i) => .2 * Math.sin(2 * Math.PI * hz * (start + i) / 48000)));
    const output = [new Float32Array(128), new Float32Array(128)];
    processor.process([input], [output], { semitones: new Float32Array([12]) });
    output.forEach((buffer, i) => channels[i].push(...buffer));
  }
  expect(Math.abs(strongestFrequency(channels[0], 440) - 440)).toBeLessThan(2);
  expect(Math.abs(strongestFrequency(channels[1], 660) - 660)).toBeLessThan(2);
});
