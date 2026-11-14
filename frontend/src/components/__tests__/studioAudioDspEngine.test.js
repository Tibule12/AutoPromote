import {
  AUDIO_MASTER_PRESETS,
  computeNormalizationGainDb,
  createStudioAudioDspChain,
  detectAudioTransients,
  measureBufferLufs,
} from "../studioAudioDspEngine";

function makeSineBuffer(amplitude, freqHz = 440, durationSec = 1.2, sampleRate = 48000) {
  const len = Math.round(durationSec * sampleRate);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    out[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  }
  return out;
}

describe("studioAudioDspEngine", () => {
  test("exports social, podcast, and broadcast loudness targets", () => {
    expect(AUDIO_MASTER_PRESETS.social.targetLufs).toBe(-14);
    expect(AUDIO_MASTER_PRESETS.podcast.targetLufs).toBe(-16);
    expect(AUDIO_MASTER_PRESETS.broadcast.targetLufs).toBe(-23);
  });

  test("measureBufferLufs distinguishes quiet, loud, and empty buffers accurately", () => {
    expect(measureBufferLufs([], 48000, 1).integratedLufs).toBe(-70);
    const quiet = measureBufferLufs(makeSineBuffer(0.05, 1000), 48000, 1);
    const loud = measureBufferLufs(makeSineBuffer(0.5, 1000), 48000, 1);
    expect(loud.integratedLufs).toBeGreaterThan(quiet.integratedLufs + 15);
    expect(loud.truePeakDbfs).toBeCloseTo(-6.02, 0);
  });

  test("computeNormalizationGainDb hits target LUFS while protecting true-peak ceiling", () => {
    const safeGain = computeNormalizationGainDb(-24, -14, {
      currentTruePeakDbfs: -15,
      maxTruePeakDbtp: -1,
    });
    expect(safeGain).toBe(10);

    const cappedGain = computeNormalizationGainDb(-20, -14, {
      currentTruePeakDbfs: -3,
      maxTruePeakDbtp: -1,
    });
    expect(cappedGain).toBe(2);

    expect(computeNormalizationGainDb(-70, -14)).toBe(0);
  });

  test("detectAudioTransients finds rhythmic impulse peaks with minimum spacing", () => {
    const sr = 48000;
    const samples = new Float32Array(sr * 2);
    const hitTimes = [0.25, 0.75, 1.35];
    for (const t of hitTimes) {
      const idx = Math.round(t * sr);
      for (let j = 0; j < 400 && idx + j < samples.length; j += 1) {
        samples[idx + j] = 0.9 * Math.exp(-j / 90);
      }
    }

    const beats = detectAudioTransients(samples, sr, {
      threshold: 1.5,
      minIntervalSeconds: 0.24,
    });
    expect(beats.length).toBeGreaterThanOrEqual(3);
    for (const targetTime of hitTimes) {
      expect(beats.some(b => Math.abs(b - targetTime) <= 0.04)).toBe(true);
    }
  });

  test("createStudioAudioDspChain connects EQ, compressor, limiter, and meters output", () => {
    const makeParam = (value = 0) => ({ value });
    const makeNode = (extra = {}) => ({
      ...extra,
      connect: jest.fn(next => next),
      disconnect: jest.fn(),
    });
    const fakeContext = {
      createGain: jest.fn(() => makeNode({ gain: makeParam(1) })),
      createBiquadFilter: jest.fn(() =>
        makeNode({ type: "peaking", frequency: makeParam(1000), Q: makeParam(1), gain: makeParam(0) })
      ),
      createDynamicsCompressor: jest.fn(() =>
        makeNode({
          threshold: makeParam(-12),
          knee: makeParam(6),
          ratio: makeParam(3),
          attack: makeParam(0.01),
          release: makeParam(0.1),
        })
      ),
      createAnalyser: jest.fn(() =>
        makeNode({
          fftSize: 1024,
          getFloatTimeDomainData: jest.fn(buf => {
            buf.fill(0.25);
          }),
        })
      ),
    };

    const chain = createStudioAudioDspChain(fakeContext);
    expect(chain).not.toBeNull();
    chain.updateSettings({
      eq: { low: 3, mid: -2, high: 4 },
      compressor: 60,
      limiter: -1.5,
      masterGainDb: 2,
    });
    const meter = chain.sampleMeter();
    expect(meter.peakDbfs).toBeCloseTo(-12.0, 0);
    expect(meter.rmsDbfs).toBeCloseTo(-12.0, 0);
    chain.disconnect();
    expect(chain.input.disconnect).toHaveBeenCalled();
  });
});
