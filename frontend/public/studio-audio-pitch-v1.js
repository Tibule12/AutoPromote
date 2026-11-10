/* global AudioWorkletProcessor, registerProcessor, sampleRate */
import createStretch from "./vendor/signalsmith/stretch-wasm-1.3.2.js";

// Keep Studio's pitch-node contract and programme clock. Only live DSP changes;
// worker mastering and authored project values are untouched.
export class StudioPitchProcessor extends (typeof AudioWorkletProcessor === "undefined" ? class {} : AudioWorkletProcessor) {
  static get parameterDescriptors() {
    return [{ name: "semitones", defaultValue: 0, minValue: -12, maxValue: 12, automationRate: "k-rate" }];
  }
  constructor(options = {}) {
    super();
    this.rate = typeof sampleRate === "number" ? sampleRate : 48000;
    this.mix = 0;
    this.lastPitch = 0;
    this.channels = 2;
    this.blockSize = 128;
    this.ready = createStretch({ wasmModule: options.processorOptions?.wasmModule }).then(wasm => {
      this.wasm = wasm;
      // Preserve low-voice harmonics with an ~85 ms analysis window at 48 kHz.
      // Spread computation across quanta; measured input/output latency is
      // reported to the graph and never changes the programme clock.
      wasm._configure(this.channels, 4096, 512, true);
      this.latency = wasm._inputLatency() + wasm._outputLatency();
      this.allocateBuffers();
      this.reset();
      this.port?.postMessage({ type: "ready", latencySeconds: this.latency / this.rate });
    }).catch(() => { this.port?.postMessage({ type: "error" }); });
    if (this.port) this.port.onmessage = event => { if (event.data?.type === "reset") this.reset(); };
  }
  allocateBuffers() {
    const pointer = this.wasm._setBuffers(this.channels, this.blockSize);
    this.inputPointers = [pointer, pointer + this.blockSize * 4];
    this.outputPointers = this.inputPointers.map(offset => offset + this.channels * this.blockSize * 4);
  }
  reset() {
    this.wasm?._reset();
    this.warmup = this.latency || 0;
    this.mix = 0;
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0] || [], output = outputs[0] || [];
    if (!output.length) return true;
    const size = output[0].length;
    const pitch = Math.max(-12, Math.min(12, Number(parameters.semitones?.[0]) || 0));
    if (this.wasm) {
      if (size > this.blockSize) { this.blockSize = size; this.allocateBuffers(); }
      if (pitch !== this.lastPitch) {
        this.wasm._setTransposeSemitones(pitch, 8000 / this.rate);
        this.lastPitch = pitch;
      }
      for (let channel = 0; channel < this.channels; channel++) {
        const source = input[Math.min(channel, input.length - 1)];
        const buffer = new Float32Array(this.wasm.HEAP8.buffer, this.inputPointers[channel], size);
        if (source) buffer.set(source); else buffer.fill(0);
      }
      this.wasm._process(size, size);
    }
    // Warm without cutting off speech, then crossfade preset/bypass changes.
    // Seeking clears all buffered old-position speech.
    const target = this.wasm && this.warmup <= 0 && Math.abs(pitch) >= .001 ? 1 : 0;
    const startMix = this.mix, step = 1 / (this.rate * .012);
    for (let channel = 0; channel < output.length; channel++) {
      const source = input[Math.min(channel, input.length - 1)];
      const shifted = this.wasm && new Float32Array(this.wasm.HEAP8.buffer,
        this.outputPointers[Math.min(channel, 1)], size);
      let mix = startMix;
      for (let frame = 0; frame < size; frame++) {
        mix = target > mix ? Math.min(target, mix + step) : Math.max(target, mix - step);
        const dry = source?.[frame] || 0;
        output[channel][frame] = dry * (1 - mix) + (shifted?.[frame] || 0) * mix;
      }
      this.mix = mix;
    }
    this.warmup = Math.max(0, this.warmup - size);
    return true;
  }
}
if (typeof registerProcessor === "function") registerProcessor("studio-pitch-v1", StudioPitchProcessor);
