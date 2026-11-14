const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export const AUDIO_MASTER_PRESETS = Object.freeze({
  social: { label: "Social (-14 LUFS)", targetLufs: -14, truePeakDbtp: -1.0 },
  podcast: { label: "Podcast (-16 LUFS)", targetLufs: -16, truePeakDbtp: -1.0 },
  broadcast: { label: "Broadcast EBU (-23 LUFS)", targetLufs: -23, truePeakDbtp: -1.0 },
});

/**
 * Estimates integrated loudness (LUFS, K-weighted approximation) and sample peak (dBFS)
 * from mono or interleaved float32 audio samples (-1.0..1.0).
 */
export function measureBufferLufs(samples, sampleRate = 48000, channels = 1) {
  if (!samples || !samples.length) {
    return { integratedLufs: -70, truePeakDbfs: -70, rmsDbfs: -70 };
  }
  const ch = Math.max(1, Math.floor(Number(channels) || 1));
  const sr = Math.max(8000, Number(sampleRate) || 48000);
  const blockSamples = Math.max(ch, Math.round(sr * 0.4) * ch); // 400ms gating blocks
  const hop = Math.max(ch, Math.round(sr * 0.1) * ch);

  // Simple 1-pole high-shelf + high-pass K-weighting approximation
  let prevIn = 0;
  let prevHp = 0;
  const hpAlpha = Math.exp((-2 * Math.PI * 60) / sr);
  let peak = 0;
  let totalSq = 0;
  const weighted = new Float32Array(samples.length);

  for (let i = 0; i < samples.length; i += 1) {
    const s = Number(samples[i]) || 0;
    const abs = Math.abs(s);
    if (abs > peak) peak = abs;
    totalSq += s * s;

    const diff = s - prevIn;
    const hp = hpAlpha * (prevHp + diff);
    prevIn = s;
    prevHp = hp;
    // Slight +2.5 dB high-frequency emphasis approximating ITU-R BS.1770 stage-1 shelf
    const shelf = hp + 0.32 * diff;
    weighted[i] = shelf;
  }

  const blockLoudnesses = [];
  for (let start = 0; start + blockSamples <= weighted.length; start += hop) {
    let sumSq = 0;
    for (let i = start; i < start + blockSamples; i += 1) {
      sumSq += weighted[i] * weighted[i];
    }
    const meanSq = sumSq / blockSamples;
    const lkfs = -0.691 + 10 * Math.log10(Math.max(1e-10, meanSq));
    if (lkfs > -70) blockLoudnesses.push({ lkfs, meanSq });
  }

  if (!blockLoudnesses.length) {
    const meanSq = totalSq / samples.length;
    const fallbackLkfs = -0.691 + 10 * Math.log10(Math.max(1e-10, meanSq));
    return {
      integratedLufs: Number(Math.max(-70, fallbackLkfs).toFixed(2)),
      truePeakDbfs: Number((20 * Math.log10(Math.max(1e-10, peak))).toFixed(2)),
      rmsDbfs: Number((20 * Math.log10(Math.max(1e-10, Math.sqrt(meanSq)))).toFixed(2)),
    };
  }

  const ungatedMean =
    blockLoudnesses.reduce((acc, b) => acc + b.meanSq, 0) / blockLoudnesses.length;
  const ungatedLkfs = -0.691 + 10 * Math.log10(Math.max(1e-10, ungatedMean));
  const relativeGate = ungatedLkfs - 10;
  const gated = blockLoudnesses.filter(b => b.lkfs >= relativeGate);
  const gatedMean =
    (gated.length ? gated : blockLoudnesses).reduce((acc, b) => acc + b.meanSq, 0) /
    (gated.length ? gated.length : blockLoudnesses.length);

  const integratedLufs = Math.max(-70, -0.691 + 10 * Math.log10(Math.max(1e-10, gatedMean)));
  const truePeakDbfs = 20 * Math.log10(Math.max(1e-10, peak));
  const rmsDbfs = 20 * Math.log10(Math.max(1e-10, Math.sqrt(totalSq / samples.length)));

  return {
    integratedLufs: Number(integratedLufs.toFixed(2)),
    truePeakDbfs: Number(truePeakDbfs.toFixed(2)),
    rmsDbfs: Number(rmsDbfs.toFixed(2)),
  };
}

export function computeNormalizationGainDb(
  measuredLufs,
  targetLufs = -14,
  { currentTruePeakDbfs = -12, maxTruePeakDbtp = -1 } = {}
) {
  if (!Number.isFinite(measuredLufs) || measuredLufs <= -65) return 0;
  const rawGain = Number(targetLufs) - Number(measuredLufs);
  const maxSafeGain = Number(maxTruePeakDbtp) - Number(currentTruePeakDbfs);
  return Number(clamp(Math.min(rawGain, maxSafeGain), -24, 24).toFixed(2));
}

/**
 * Detects rhythmic transients / beats in PCM samples for sample-accurate timeline snapping.
 */
export function detectAudioTransients(
  samples,
  sampleRate = 48000,
  { threshold = 1.65, minIntervalSeconds = 0.24 } = {}
) {
  if (!samples || !samples.length) return [];
  const sr = Math.max(8000, Number(sampleRate) || 48000);
  const frameSize = Math.max(128, Math.round(sr * 0.02)); // 20ms energy window
  const energies = [];
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(samples.length, start + frameSize);
    let sum = 0;
    for (let i = start; i < end; i += 1) {
      const s = Number(samples[i]) || 0;
      sum += s * s;
    }
    energies.push(Math.sqrt(sum / Math.max(1, end - start)));
  }

  const beats = [];
  let lastBeatTime = -Infinity;
  const localWindow = 8;
  for (let i = 1; i < energies.length; i += 1) {
    const winStart = Math.max(0, i - localWindow);
    const slice = energies.slice(winStart, i);
    const localAvg = slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length);
    const time = (i * frameSize) / sr;
    if (
      energies[i] > Math.max(0.03, localAvg * threshold) &&
      energies[i] >= (energies[i + 1] ?? 0) &&
      time - lastBeatTime >= minIntervalSeconds
    ) {
      beats.push(Number(time.toFixed(3)));
      lastBeatTime = time;
    }
  }
  return beats;
}

/**
 * Real-time Web Audio per-track & master mastering chain matching studio_audio.py
 * (HPF 55Hz -> 3-band Parametric EQ -> Compressor -> True-Peak Limiter -> AnalyserNode).
 */
export function createStudioAudioDspChain(audioContext) {
  if (!audioContext || typeof audioContext.createBiquadFilter !== "function") return null;

  const input = audioContext.createGain();
  const hpf = audioContext.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = 55;

  const eqLow = audioContext.createBiquadFilter();
  eqLow.type = "lowshelf";
  eqLow.frequency.value = 120;

  const eqMid = audioContext.createBiquadFilter();
  eqMid.type = "peaking";
  eqMid.frequency.value = 1100;
  eqMid.Q.value = 1.3;

  const eqHigh = audioContext.createBiquadFilter();
  eqHigh.type = "highshelf";
  eqHigh.frequency.value = 7200;

  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 6;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.18;

  const limiter = audioContext.createDynamicsCompressor();
  limiter.threshold.value = -1.0;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.06;

  const outputGain = audioContext.createGain();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  const meterBuffer = new Float32Array(analyser.fftSize);

  input
    .connect(hpf)
    .connect(eqLow)
    .connect(eqMid)
    .connect(eqHigh)
    .connect(compressor)
    .connect(limiter)
    .connect(outputGain)
    .connect(analyser);

  const updateSettings = (settings = {}) => {
    const eq = settings.eq || {};
    eqLow.gain.value = clamp(eq.low ?? 0, -12, 12);
    eqMid.gain.value = clamp(eq.mid ?? 0, -12, 12);
    eqHigh.gain.value = clamp(eq.high ?? 0, -12, 12);
    const compAmount = clamp(settings.compressor ?? 0, 0, 100) / 100;
    compressor.ratio.value = 1 + 7 * compAmount;
    compressor.threshold.value = -12 - 14 * compAmount;
    const limiterDb = clamp(settings.limiter ?? -1, -6, -0.1);
    limiter.threshold.value = limiterDb;
    const gainDb = clamp(settings.masterGainDb ?? 0, -24, 24);
    outputGain.gain.value = 10 ** (gainDb / 20);
  };

  const sampleMeter = () => {
    if (typeof analyser.getFloatTimeDomainData !== "function") {
      return { rmsDbfs: -70, peakDbfs: -70 };
    }
    analyser.getFloatTimeDomainData(meterBuffer);
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < meterBuffer.length; i += 1) {
      const s = meterBuffer[i];
      const abs = Math.abs(s);
      if (abs > peak) peak = abs;
      sumSq += s * s;
    }
    return {
      rmsDbfs: Number((20 * Math.log10(Math.max(1e-6, Math.sqrt(sumSq / meterBuffer.length)))).toFixed(1)),
      peakDbfs: Number((20 * Math.log10(Math.max(1e-6, peak))).toFixed(1)),
    };
  };

  const disconnect = () => {
    [input, hpf, eqLow, eqMid, eqHigh, compressor, limiter, outputGain, analyser].forEach(node => {
      try {
        node.disconnect();
      } catch (_err) {
        // Ignore
      }
    });
  };

  return {
    input,
    output: analyser,
    updateSettings,
    sampleMeter,
    disconnect,
  };
}
