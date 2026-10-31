export const STUDIO_EASINGS = [
  { id: "linear", label: "Linear" },
  { id: "ease_in", label: "Ease in" },
  { id: "ease_out", label: "Ease out" },
  { id: "ease_in_out", label: "Ease in/out" },
  { id: "hold", label: "Hold" },
  { id: "bezier", label: "Custom curve" },
];

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0));

const applyEasing = (progress, easing, curve = [0.33, 0, 0.67, 1]) => {
  const value = clamp(progress, 0, 1);
  if (easing === "hold") return 0;
  if (easing === "ease_in") return value * value * value;
  if (easing === "ease_out") return 1 - Math.pow(1 - value, 3);
  if (easing === "ease_in_out") {
    return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
  }
  if (easing === "bezier") {
    const x1 = clamp(curve?.[0] ?? 0.33, 0, 1);
    const x2 = clamp(curve?.[2] ?? 0.67, 0, 1);
    const y1 = clamp(curve?.[1] ?? 0, -2, 2);
    const y2 = clamp(curve?.[3] ?? 1, -2, 2);
    // Time is the curve's x coordinate, not its parametric progress.
    const cubic = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const t = (low + high) / 2;
      if (cubic(t, x1, x2) < value) low = t;
      else high = t;
    }
    return cubic((low + high) / 2, y1, y2);
  }
  return value;
};

export const sortAutomationKeyframes = keyframes =>
  [...(keyframes || [])]
    .filter(keyframe => Number.isFinite(Number(keyframe?.time)))
    .sort((left, right) => Number(left.time) - Number(right.time));

// Offset handles belong to the arriving position key, on the canonical graph.
// Use the same travel samples as FFmpeg's expression-based group/main paths.
export const SPATIAL_CURVE_STEPS = 128;
export const validateSpatialCurve = key => {
  if (key.spatialCurve === undefined) return;
  if (!['x', 'y'].includes(key.property) || !Array.isArray(key.spatialCurve) || key.spatialCurve.length !== 2 ||
      key.spatialCurve.some(value => typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 200))
    throw Error('Spatial handles need X/Y offsets between -200 and 200.');
};
export const automationSegmentValue = (first, last, progress, key) => {
  if (key.spatialCurve === undefined)
    return first + (last - first) * applyEasing(progress, key.easing, key.curve);
  validateSpatialCurve(key);
  if (key.easing === 'hold') return progress < 1 ? first : last;
  const sample = p => {
    const u = clamp(applyEasing(p, key.easing, key.curve), 0, 1), v = 1 - u;
    return v ** 3 * first + 3 * v ** 2 * u * (first + key.spatialCurve[0]) +
      3 * v * u ** 2 * (last + key.spatialCurve[1]) + u ** 3 * last;
  };
  const at = clamp(progress, 0, 1) * SPATIAL_CURVE_STEPS, index = Math.min(SPATIAL_CURVE_STEPS - 1, Math.floor(at));
  const a = sample(index / SPATIAL_CURVE_STEPS), b = sample((index + 1) / SPATIAL_CURVE_STEPS);
  return a + (b - a) * (at - index);
};

export const upsertAutomationKeyframe = (keyframes, nextKeyframe, tolerance = 0.04) => {
  const next = { easing: "ease_in_out", ...nextKeyframe };
  const existingIndex = (keyframes || []).findIndex(
    keyframe =>
      String(keyframe.targetId ?? "") === String(next.targetId ?? "") &&
      keyframe.property === next.property &&
      Math.abs(Number(keyframe.time) - Number(next.time)) <= tolerance
  );
  return sortAutomationKeyframes(
    existingIndex >= 0
      ? keyframes.map((keyframe, index) =>
          index === existingIndex ? { ...keyframe, ...next, id: keyframe.id ?? next.id } : keyframe
        )
      : [...(keyframes || []), next]
  );
};

export const interpolateAutomationValue = ({ keyframes, property, time, fallback = 0 }) => {
  const ordered = sortAutomationKeyframes(keyframes).filter(
    keyframe => keyframe.property === property
  );
  if (!ordered.length) return Number(fallback);
  const currentTime = Number(time) || 0;
  if (currentTime <= Number(ordered[0].time)) return Number(ordered[0].value);
  if (currentTime >= Number(ordered[ordered.length - 1].time)) {
    return Number(ordered[ordered.length - 1].value);
  }
  const rightIndex = ordered.findIndex(keyframe => Number(keyframe.time) >= currentTime);
  const left = ordered[Math.max(0, rightIndex - 1)];
  const right = ordered[rightIndex];
  if (currentTime === Number(right.time)) return Number(right.value);
  const span = Math.max(0.0001, Number(right.time) - Number(left.time));
  return automationSegmentValue(Number(left.value), Number(right.value),
    (currentTime - Number(left.time)) / span, right);
};

export const buildMotionAutomationStyle = (keyframes, time, fallback = {}) => {
  const x = interpolateAutomationValue({
    keyframes,
    property: "x",
    time,
    fallback: fallback.x ?? 50,
  });
  const y = interpolateAutomationValue({
    keyframes,
    property: "y",
    time,
    fallback: fallback.y ?? 50,
  });
  const scale = interpolateAutomationValue({
    keyframes,
    property: "scale",
    time,
    fallback: fallback.scale ?? 1,
  });
  const rotation = interpolateAutomationValue({
    keyframes,
    property: "rotation",
    time,
    fallback: fallback.rotation ?? 0,
  });
  const opacity = interpolateAutomationValue({
    keyframes,
    property: "opacity",
    time,
    fallback: fallback.opacity ?? 1,
  });
  const cropX = interpolateAutomationValue({
    keyframes,
    property: "cropX",
    time,
    fallback: fallback.cropX ?? 0,
  });
  const cropY = interpolateAutomationValue({
    keyframes,
    property: "cropY",
    time,
    fallback: fallback.cropY ?? 0,
  });
  return { x, y, scale, rotation, opacity, cropX, cropY,
    ...(fallback.perspective ? { perspectiveProgress: clamp(interpolateAutomationValue({keyframes,property:'perspectiveProgress',time,fallback:fallback.perspectiveProgress ?? 100}),0,100) } : {}),
    ...(fallback.textAnimator ? { textProgress: clamp(interpolateAutomationValue({ keyframes, property: "textProgress", time, fallback: fallback.textProgress ?? 100 }), 0, 100) } : {}),
    ...(fallback.vectorShape ? Object.fromEntries(['strokeStart', 'strokeEnd', 'strokeOffset'].map(property => [property,
      clamp(interpolateAutomationValue({ keyframes, property, time,
        fallback: fallback[property] ?? (property === 'strokeEnd' ? 100 : 0) }),
        property === 'strokeOffset' ? -1000 : 0, property === 'strokeOffset' ? 1000 : 100)])) : {}) };
};

export const groupMotionKeyframesByTime = keyframes => {
  const groups = new Map();
  sortAutomationKeyframes(keyframes).forEach(keyframe => {
    const time = Number(keyframe.time || 0);
    const key = time.toFixed(3);
    const existing = groups.get(key) || { time, keyframes: [] };
    existing.keyframes.push(keyframe);
    groups.set(key, existing);
  });
  return [...groups.values()];
};

export const buildMotionPathPoints = (keyframes, fallback = {}) =>
  groupMotionKeyframesByTime(keyframes).map(group => ({
    time: group.time,
    x: interpolateAutomationValue({
      keyframes,
      property: "x",
      time: group.time,
      fallback: fallback.x ?? 50,
    }),
    y: interpolateAutomationValue({
      keyframes,
      property: "y",
      time: group.time,
      fallback: fallback.y ?? 50,
    }),
    keyframes: group.keyframes,
  }));
