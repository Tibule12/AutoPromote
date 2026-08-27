export const FINISH_KEYFRAME_FIELDS = [
  "brightness",
  "contrast",
  "saturation",
];

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
    values[field] = finite(fx?.[field], field === "brightness" || field === "contrast" || field === "saturation" || field === "zoom" ? 1 : 0);
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
    const fallback = finite(baseFx?.[field], 0);
    const from = finite(left.values?.[field], fallback);
    const to = finite(right.values?.[field], from);
    values[field] = from + (to - from) * progress;
  });
  return { ...(baseFx || {}), ...values };
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
  const channel = audioBuffer.getChannelData(0);
  const samplesPerBin = Math.max(1, Math.round(audioBuffer.sampleRate * secondsPerBin));
  const envelope = [];
  for (let start = 0; start < channel.length; start += samplesPerBin) {
    let peak = 0;
    let sumSquares = 0;
    const end = Math.min(channel.length, start + samplesPerBin);
    for (let index = start; index < end; index += 1) {
      const sample = Math.abs(channel[index]);
      peak = Math.max(peak, sample);
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, end - start));
    envelope.push(Math.min(1, peak * 0.38 + rms * 1.45));
  }
  return { envelope, secondsPerBin, duration: Number(audioBuffer.duration || 0) };
};
