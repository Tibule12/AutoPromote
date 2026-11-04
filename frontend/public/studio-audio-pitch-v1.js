/* global AudioWorkletProcessor, registerProcessor, sampleRate */
// Live pitch audition in the existing Remix Audio graph. Bounded FFT work
// runs on the audio thread, not Studio's UI/timeline thread. Final mastering
// continues to use the canonical worker's Rubber Band chain.
const SIZE = 2048, HOP = 512, LATENCY = SIZE - HOP;
function fft(real, imaginary, inverse = false) {
  for (let i = 1, j = 0; i < SIZE; i++) {
    let bit = SIZE >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]];
    }
  }
  for (let length = 2; length <= SIZE; length *= 2) {
    const angle = (inverse ? 2 : -2) * Math.PI / length;
    const wr = Math.cos(angle), wi = Math.sin(angle);
    for (let start = 0; start < SIZE; start += length) {
      let ur = 1, ui = 0;
      for (let offset = 0; offset < length / 2; offset++) {
        const a = start + offset, b = a + length / 2;
        const vr = real[b] * ur - imaginary[b] * ui;
        const vi = real[b] * ui + imaginary[b] * ur;
        real[b] = real[a] - vr; imaginary[b] = imaginary[a] - vi;
        real[a] += vr; imaginary[a] += vi;
        const next = ur * wr - ui * wi;
        ui = ur * wi + ui * wr; ur = next;
      }
    }
  }
  if (inverse) for (let i = 0; i < SIZE; i++) { real[i] /= SIZE; imaginary[i] /= SIZE; }
}
class PitchChannel {
  constructor() {
    for (const key of ["input", "output", "real", "imaginary", "lastPhase", "sumPhase", "magnitude", "frequency", "accumulator"])
      this[key] = new Float32Array(SIZE);
    this.position = LATENCY;
  }
  frame(ratio, window) {
    for (let i = 0; i < SIZE; i++) { this.real[i] = this.input[i] * window[i]; this.imaginary[i] = 0; }
    fft(this.real, this.imaginary);
    this.magnitude.fill(0); this.frequency.fill(0);
    const step = 2 * Math.PI * HOP / SIZE;
    for (let bin = 0; bin <= SIZE / 2; bin++) {
      const magnitude = Math.hypot(this.real[bin], this.imaginary[bin]);
      const phase = Math.atan2(this.imaginary[bin], this.real[bin]);
      const delta = phase - this.lastPhase[bin] - bin * step;
      this.lastPhase[bin] = phase;
      const deviation = Math.atan2(Math.sin(delta), Math.cos(delta)) / step;
      const destination = Math.round(bin * ratio);
      if (destination <= SIZE / 2) {
        this.magnitude[destination] += magnitude;
        this.frequency[destination] += magnitude * (bin + deviation) * ratio;
      }
    }
    this.real.fill(0); this.imaginary.fill(0);
    for (let bin = 0; bin <= SIZE / 2; bin++) {
      const magnitude = this.magnitude[bin];
      const frequency = magnitude ? this.frequency[bin] / magnitude : bin;
      this.sumPhase[bin] += frequency * step;
      this.sumPhase[bin] %= 2 * Math.PI;
      this.real[bin] = magnitude * Math.cos(this.sumPhase[bin]);
      this.imaginary[bin] = bin && bin < SIZE / 2 ? magnitude * Math.sin(this.sumPhase[bin]) : 0;
      if (bin && bin < SIZE / 2) {
        this.real[SIZE - bin] = this.real[bin];
        this.imaginary[SIZE - bin] = -this.imaginary[bin];
      }
    }
    fft(this.real, this.imaginary, true);
    for (let i = 0; i < SIZE; i++) this.accumulator[i] += this.real[i] * window[i] * (2 / 3);
    this.output.set(this.accumulator.subarray(0, HOP));
    this.accumulator.copyWithin(0, HOP); this.accumulator.fill(0, SIZE - HOP);
    this.input.copyWithin(0, HOP);
  }
}
export class StudioPitchProcessor extends (typeof AudioWorkletProcessor === "undefined" ? class {} : AudioWorkletProcessor) {
  static get parameterDescriptors() {
    return [{ name: "semitones", defaultValue: 0, minValue: -12, maxValue: 12, automationRate: "k-rate" }];
  }
  constructor() {
    super();
    this.sampleRate = typeof sampleRate === "number" ? sampleRate : 48000;
    this.channels = [new PitchChannel(), new PitchChannel()];
    this.window = Float32Array.from({ length: SIZE }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / SIZE));
    if (this.port) this.port.onmessage = event => { if (event.data?.type === "reset") this.reset(); };
  }
  reset() {
    for (const channel of this.channels) {
      for (const value of Object.values(channel)) if (value instanceof Float32Array) value.fill(0);
      channel.position = LATENCY;
    }
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0] || [], output = outputs[0] || [];
    const pitch = Math.max(-12, Math.min(12, Number(parameters.semitones?.[0]) || 0));
    const ratio = 2 ** (pitch / 12);
    for (let channel = 0; channel < output.length; channel++) {
      const state = this.channels[Math.min(channel, 1)];
      const source = input[Math.min(channel, input.length - 1)];
      for (let frame = 0; frame < output[channel].length; frame++) {
        const value = source?.[frame] || 0;
        state.input[state.position] = value;
        output[channel][frame] = Math.abs(pitch) < .001 ? value : state.output[state.position - LATENCY];
        state.position++;
        if (state.position === SIZE) {
          state.position = LATENCY;
          if (Math.abs(pitch) >= .001) state.frame(ratio, this.window);
          else state.input.copyWithin(0, HOP);
        }
      }
    }
    return true;
  }
}
if (typeof registerProcessor === "function") registerProcessor("studio-pitch-v1", StudioPitchProcessor);
