export const FINISH_KEYFRAME_FIELDS = [
  "brightness",
  "contrast",
  "saturation",
  "exposureStops",
  "lift",
  "gamma",
  "gain",
  "temperature",
  "tint",
  "vignette",
];

const UNITY_FINISH_FIELDS = new Set([
  "brightness",
  "contrast",
  "saturation",
  "gamma",
  "gain",
  "zoom",
]);

const defaultFinishFieldValue = field => (UNITY_FINISH_FIELDS.has(field) ? 1 : 0);

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const normalizeFinishKeyframes = keyframes =>
  (Array.isArray(keyframes) ? keyframes : [])
    .map((keyframe, index) => ({
      id: keyframe?.id || `finish-keyframe-${index + 1}`,
      time: Math.max(0, finite(keyframe?.time, 0)),
      values: FINISH_KEYFRAME_FIELDS.reduce((values, field) => {
        if (Number.isFinite(Number(keyframe?.values?.[field]))) {
          values[field] = Number(keyframe.values[field]);
        }
        return values;
      }, {}),
    }))
    .sort((left, right) => left.time - right.time);

export const captureFinishValues = fx =>
  FINISH_KEYFRAME_FIELDS.reduce((values, field) => {
    values[field] = finite(fx?.[field], defaultFinishFieldValue(field));
    return values;
  }, {});

export const upsertFinishKeyframe = (keyframes, time, fx, tolerance = 0.08) => {
  const normalized = normalizeFinishKeyframes(keyframes);
  const safeTime = Math.max(0, finite(time, 0));
  const existing = normalized.find(keyframe => Math.abs(keyframe.time - safeTime) <= tolerance);
  const next = existing
    ? normalized.map(keyframe =>
        keyframe.id === existing.id
          ? { ...keyframe, time: safeTime, values: captureFinishValues(fx) }
          : keyframe
      )
    : [
        ...normalized,
        {
          id: `finish-keyframe-${Date.now()}-${normalized.length + 1}`,
          time: safeTime,
          values: captureFinishValues(fx),
        },
      ];
  return normalizeFinishKeyframes(next);
};

export const interpolateFinishKeyframes = (baseFx, keyframes, time) => {
  const normalized = normalizeFinishKeyframes(keyframes);
  if (!normalized.length) return { ...(baseFx || {}) };
  const safeTime = Math.max(0, finite(time, 0));
  const left = [...normalized].reverse().find(keyframe => keyframe.time <= safeTime) || normalized[0];
  const right = normalized.find(keyframe => keyframe.time >= safeTime) || normalized[normalized.length - 1];
  if (left.id === right.id || right.time <= left.time) return { ...(baseFx || {}), ...left.values };

  const progress = Math.min(1, Math.max(0, (safeTime - left.time) / (right.time - left.time)));
  const values = {};
  FINISH_KEYFRAME_FIELDS.forEach(field => {
    const hasField =
      left.values?.[field] !== undefined ||
      right.values?.[field] !== undefined ||
      baseFx?.[field] !== undefined ||
      field === "brightness" ||
      field === "contrast" ||
      field === "saturation";
    if (!hasField) return;
    const fallback = finite(baseFx?.[field], defaultFinishFieldValue(field));
    const from = finite(left.values?.[field], fallback);
    const to = finite(right.values?.[field], from);
    values[field] = from + (to - from) * progress;
  });
  return { ...(baseFx || {}), ...values };
};

export const buildBeatSyncedGradePulses = (baseFx = {}, beats = [], options = {}) => {
  const baseline = captureFinishValues(baseFx);
  const rawBeats = (Array.isArray(beats) && beats.length ? beats : [0.6, 1.4, 2.2, 3.0])
    .map(beat => {
      if (typeof beat === "number") return { time: beat, strength: 1 };
      return {
        time: Number(beat?.time ?? beat?.timestamp ?? NaN),
        strength: finite(beat?.strength ?? beat?.energy ?? 1, 1),
      };
    })
    .filter(item => Number.isFinite(item.time) && item.time >= 0)
    .sort((a, b) => a.time - b.time)
    .slice(0, Math.max(1, Number(options.maxBeats) || 8));

  const preRoll = Math.max(0.04, finite(options.preRoll, 0.1));
  const release = Math.max(0.08, finite(options.release, 0.2));
  const intensity = Math.max(0.1, Math.min(2, finite(options.intensity, 1)));

  let keyframes = normalizeFinishKeyframes(options.existingKeyframes || []);
  rawBeats.forEach((beat, index) => {
    const boost = Math.max(0.35, Math.min(1.5, beat.strength)) * intensity;
    const preTime = Math.max(0, Number((beat.time - preRoll).toFixed(3)));
    const peakTime = Number(beat.time.toFixed(3));
    const postTime = Number((beat.time + release).toFixed(3));
    const peakValues = {
      ...baseline,
      brightness: Number((baseline.brightness + 0.08 * boost).toFixed(4)),
      contrast: Number((baseline.contrast + 0.14 * boost).toFixed(4)),
      saturation: Number((baseline.saturation + 0.16 * boost).toFixed(4)),
      exposureStops: Number((baseline.exposureStops + 0.22 * boost).toFixed(4)),
      gain: Number((baseline.gain + 0.08 * boost).toFixed(4)),
    };
    keyframes = upsertFinishKeyframe(keyframes, preTime, baseline, 0.03);
    keyframes = upsertFinishKeyframe(keyframes, peakTime, peakValues, 0.03);
    keyframes = upsertFinishKeyframe(keyframes, postTime, baseline, 0.03);
    if (index === 0 && preTime > 0.05) {
      keyframes = upsertFinishKeyframe(keyframes, 0, baseline, 0.03);
    }
  });
  return normalizeFinishKeyframes(keyframes);
};

export const snapTimeToBeat = (time, beats, threshold = 0.18) => {
  const safeTime = Math.max(0, finite(time, 0));
  const candidates = (Array.isArray(beats) ? beats : [])
    .map(beat => (typeof beat === "number" ? beat : beat?.time))
    .map(value => Number(value))
    .filter(Number.isFinite);
  if (!candidates.length) return { time: safeTime, snapped: false, beat: null };
  const nearest = candidates.reduce((best, candidate) =>
    Math.abs(candidate - safeTime) < Math.abs(best - safeTime) ? candidate : best
  );
  const snapped = Math.abs(nearest - safeTime) <= Math.max(0, finite(threshold, 0.18));
  return { time: snapped ? nearest : safeTime, snapped, beat: snapped ? nearest : null };
};

export const analyzeAudioBufferBeats = (audioBuffer, secondsPerBin = 0.05) => {
  if (!audioBuffer?.getChannelData || !audioBuffer.sampleRate || !audioBuffer.duration) {
    return { envelope: [], secondsPerBin, duration: 0 };
  }
  const channels = Array.from({ length: Math.max(1, audioBuffer.numberOfChannels || 1) }, (_, index) => audioBuffer.getChannelData(index));
  const sampleLength = Math.min(...channels.map(channel => channel.length));
  const samplesPerBin = Math.max(1, Math.round(audioBuffer.sampleRate * secondsPerBin));
  const envelope = [];
  for (let start = 0; start < sampleLength; start += samplesPerBin) {
    let peak = 0;
    let sumSquares = 0;
    const end = Math.min(sampleLength, start + samplesPerBin);
    for (let index = start; index < end; index += 1) {
      for (const channel of channels) {
        const sample = Math.abs(channel[index]);
        peak = Math.max(peak, sample);
        sumSquares += sample * sample;
      }
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, (end - start) * channels.length));
    envelope.push(Math.min(1, peak * 0.38 + rms * 1.45));
  }
  return { envelope, secondsPerBin, duration: Number(audioBuffer.duration || 0) };
};
