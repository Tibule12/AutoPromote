const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export const AUDIO_MASTER_PRESETS = Object.freeze({
  social: { label: "Social (-14 LUFS)", targetLufs: -14, truePeakDbtp: -1.0 },
  podcast: { label: "Podcast (-16 LUFS)", targetLufs: -16, truePeakDbtp: -1.0 },
  broadcast: { label: "Broadcast EBU (-23 LUFS)", targetLufs: -23, truePeakDbtp: -1.0 },
});

function createBs1770Biquads(sampleRate) {
  const sr = Math.max(8000, Number(sampleRate) || 48000);
  // Stage 1: ITU-R BS.1770-4 acoustic head-modeling high-shelf filter
  const db = 3.999843853973347;
  const f0 = 1681.974450955533;
  const q1 = 0.7071752369554196;
  const k1 = Math.tan((Math.PI * f0) / sr);
  const vh = Math.pow(10, db / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  const a01 = 1 + k1 / q1 + k1 * k1;
  const s1 = {
    b0: (vh + (vb * k1) / q1 + k1 * k1) / a01,
    b1: (2 * (k1 * k1 - vh)) / a01,
    b2: (vh - (vb * k1) / q1 + k1 * k1) / a01,
    a1: (2 * (k1 * k1 - 1)) / a01,
    a2: (1 - k1 / q1 + k1 * k1) / a01,
  };

  // Stage 2: ITU-R BS.1770-4 revised low-frequency B-weighting (RLB) high-pass filter
  const f0h = 38.13547087602444;
  const q2 = 0.5003270373238773;
  const k2 = Math.tan((Math.PI * f0h) / sr);
  const a02 = 1 + k2 / q2 + k2 * k2;
  const s2 = {
    b0: 1 / a02,
    b1: -2 / a02,
    b2: 1 / a02,
    a1: (2 * (k2 * k2 - 1)) / a02,
    a2: (1 - k2 / q2 + k2 * k2) / a02,
  };

  return { s1, s2 };
}

function buildSincKernel(offset, tapsPerSide = 3) {
  const weights = [];
  let sum = 0;
  for (let k = -tapsPerSide + 1; k <= tapsPerSide; k += 1) {
    const x = k - offset;
    const sinc = Math.abs(x) < 1e-8 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    // Hann window over [-tapsPerSide, tapsPerSide]
    const win = 0.5 * (1 + Math.cos((Math.PI * x) / tapsPerSide));
    const w = sinc * win;
    weights.push({ rel: k, w });
    sum += w;
  }
  return weights.map(item => ({ rel: item.rel, w: item.w / (sum || 1) }));
}

const INTER_SAMPLE_KERNELS = [0.25, 0.5, 0.75].map(offset => buildSincKernel(offset, 6));

/**
 * Estimates integrated loudness (ITU-R BS.1770-4 per-channel K-weighted, gated LUFS)
 * and 4x oversampled inter-sample true peak (dBTP / dBFS) from mono or interleaved float32 PCM.
 */
export function measureBufferLufs(samples, sampleRate = 48000, channels = 1) {
  if (!samples || !samples.length) {
    return { integratedLufs: -70, truePeakDbfs: -70, truePeakDbtp: -70, rmsDbfs: -70 };
  }
  const ch = Math.max(1, Math.floor(Number(channels) || 1));
  const sr = Math.max(8000, Number(sampleRate) || 48000);
  const frameCount = Math.floor(samples.length / ch);
  if (!frameCount) {
    return { integratedLufs: -70, truePeakDbfs: -70, truePeakDbtp: -70, rmsDbfs: -70 };
  }

  const blockFrames = Math.max(1, Math.round(sr * 0.4)); // 400ms BS.1770 gating block
  const hopFrames = Math.max(1, Math.round(sr * 0.1)); // 100ms hop (75% overlap)
  const { s1, s2 } = createBs1770Biquads(sr);

  const weighted = Array.from({ length: ch }, () => new Float32Array(frameCount));
  let samplePeak = 0;
  let truePeak = 0;
  let totalSq = 0;

  for (let c = 0; c < ch; c += 1) {
    let x1_1 = 0;
    let x2_1 = 0;
    let y1_1 = 0;
    let y2_1 = 0;
    let x1_2 = 0;
    let x2_2 = 0;
    let y1_2 = 0;
    let y2_2 = 0;
    const chOut = weighted[c];

    for (let f = 0; f < frameCount; f += 1) {
      const idx = f * ch + c;
      const x = Number(samples[idx]) || 0;
      const abs = Math.abs(x);
      if (abs > samplePeak) samplePeak = abs;
      if (abs > truePeak) truePeak = abs;
      totalSq += x * x;

      // 4x oversampled inter-sample peak via windowed sinc interpolation
      for (let phase = 0; phase < INTER_SAMPLE_KERNELS.length; phase += 1) {
        const kernel = INTER_SAMPLE_KERNELS[phase];
        let interp = 0;
        for (let k = 0; k < kernel.length; k += 1) {
          const nf = f + kernel[k].rel;
          const tapSample = nf >= 0 && nf < frameCount ? Number(samples[nf * ch + c]) || 0 : 0;
          interp += tapSample * kernel[k].w;
        }
        const absInterp = Math.abs(interp);
        if (absInterp > truePeak) truePeak = absInterp;
      }

      // Stage 1 biquad
      const y1 = s1.b0 * x + s1.b1 * x1_1 + s1.b2 * x2_1 - s1.a1 * y1_1 - s1.a2 * y2_1;
      x2_1 = x1_1;
      x1_1 = x;
      y2_1 = y1_1;
      y1_1 = y1;

      // Stage 2 biquad
      const y2 = s2.b0 * y1 + s2.b1 * x1_2 + s2.b2 * x2_2 - s2.a1 * y1_2 - s2.a2 * y2_2;
      x2_2 = x1_2;
      x1_2 = y1;
      y2_2 = y1_2;
      y1_2 = y2;

      chOut[f] = y2;
    }
  }

  const channelWeight = c => (ch >= 5 && (c === 3 || c === 4) ? 1.41 : 1.0);
  const blockLoudnesses = [];
  for (let start = 0; start + blockFrames <= frameCount; start += hopFrames) {
    let weightedPower = 0;
    for (let c = 0; c < ch; c += 1) {
      const chData = weighted[c];
      let chSumSq = 0;
      for (let f = start; f < start + blockFrames; f += 1) {
        chSumSq += chData[f] * chData[f];
      }
      weightedPower += channelWeight(c) * (chSumSq / blockFrames);
    }
    const lkfs = -0.691 + 10 * Math.log10(Math.max(1e-10, weightedPower));
    if (lkfs > -70) blockLoudnesses.push({ lkfs, weightedPower });
  }

  if (!blockLoudnesses.length) {
    let fallbackPower = 0;
    for (let c = 0; c < ch; c += 1) {
      let chSumSq = 0;
      const chData = weighted[c];
      for (let f = 0; f < frameCount; f += 1) chSumSq += chData[f] * chData[f];
      fallbackPower += channelWeight(c) * (chSumSq / frameCount);
    }
    const fallbackLkfs = -0.691 + 10 * Math.log10(Math.max(1e-10, fallbackPower));
    const peakDb = Number((20 * Math.log10(Math.max(1e-10, truePeak))).toFixed(2));
    const meanSq = totalSq / (frameCount * ch);
    return {
      integratedLufs: Number(Math.max(-70, fallbackLkfs).toFixed(2)),
      truePeakDbfs: peakDb,
      truePeakDbtp: peakDb,
      samplePeakDbfs: Number((20 * Math.log10(Math.max(1e-10, samplePeak))).toFixed(2)),
      rmsDbfs: Number((20 * Math.log10(Math.max(1e-10, Math.sqrt(meanSq)))).toFixed(2)),
    };
  }

  const ungatedPower =
    blockLoudnesses.reduce((acc, b) => acc + b.weightedPower, 0) / blockLoudnesses.length;
  const ungatedLkfs = -0.691 + 10 * Math.log10(Math.max(1e-10, ungatedPower));
  const relativeGate = ungatedLkfs - 10;
  const gated = blockLoudnesses.filter(b => b.lkfs >= relativeGate);
  const gatedPower =
    (gated.length ? gated : blockLoudnesses).reduce((acc, b) => acc + b.weightedPower, 0) /
    (gated.length ? gated.length : blockLoudnesses.length);

  const integratedLufs = Math.max(-70, -0.691 + 10 * Math.log10(Math.max(1e-10, gatedPower)));
  const truePeakDb = 20 * Math.log10(Math.max(1e-10, truePeak));
  const samplePeakDb = 20 * Math.log10(Math.max(1e-10, samplePeak));
  const rmsDbfs = 20 * Math.log10(Math.max(1e-10, Math.sqrt(totalSq / (frameCount * ch))));

  return {
    integratedLufs: Number(integratedLufs.toFixed(2)),
    truePeakDbfs: Number(truePeakDb.toFixed(2)),
    truePeakDbtp: Number(truePeakDb.toFixed(2)),
    samplePeakDbfs: Number(samplePeakDb.toFixed(2)),
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

/**
 * Equal-power stereo balance/pan gains for pan in [-100..100].
 * Matches Python studio_audio.build_pan_filter exactly.
 */
export function equalPowerPanGains(pan = 0) {
  const norm = clamp(Number(pan) || 0, -100, 100) / 100;
  if (Math.abs(norm) < 0.005) {
    return { leftFromLeft: 1, leftFromRight: 0, rightFromLeft: 0, rightFromRight: 1 };
  }
  const p = (norm + 1) * 0.5;
  const lg = Math.SQRT2 * Math.cos(p * Math.PI * 0.5);
  const rg = Math.SQRT2 * Math.sin(p * Math.PI * 0.5);
  const cross = Math.abs(norm);
  const wSame = 1 - cross + cross * 0.5;
  const wOther = cross * 0.5;
  return {
    leftFromLeft: Number((lg * wSame).toFixed(6)),
    leftFromRight: Number((lg * wOther).toFixed(6)),
    rightFromLeft: Number((rg * wOther).toFixed(6)),
    rightFromRight: Number((rg * wSame).toFixed(6)),
  };
}

/**
 * Evaluates measured BS.1770 LUFS and inter-sample true peak against
 * a named delivery preset ("social" | "podcast" | "broadcast").
 */
export function analyzeAudioCompliance(meter = {}, presetKey = "social", toleranceLu = 1.0) {
  const spec = AUDIO_MASTER_PRESETS[presetKey] || AUDIO_MASTER_PRESETS.social;
  const lufs = Number(meter?.integratedLufs ?? -70);
  const truePeak = Number(meter?.truePeakDbtp ?? meter?.truePeakDbfs ?? -70);
  const deltaLu = Number((lufs - spec.targetLufs).toFixed(2));
  const peakMarginDb = Number((spec.truePeakDbtp - truePeak).toFixed(2));
  const lufsInRange = lufs > -65 && Math.abs(deltaLu) <= toleranceLu;
  const truePeakCompliant = truePeak <= spec.truePeakDbtp + 0.05;
  return {
    presetKey: AUDIO_MASTER_PRESETS[presetKey] ? presetKey : "social",
    targetLufs: spec.targetLufs,
    maxTruePeakDbtp: spec.truePeakDbtp,
    measuredLufs: lufs,
    measuredTruePeakDbtp: truePeak,
    deltaLu,
    peakMarginDb,
    recommendedGainDb: computeNormalizationGainDb(lufs, spec.targetLufs, {
      currentTruePeakDbfs: truePeak,
      maxTruePeakDbtp: spec.truePeakDbtp,
    }),
    lufsCompliant: lufsInRange,
    truePeakCompliant,
    compliant: lufsInRange && truePeakCompliant,
  };
}
