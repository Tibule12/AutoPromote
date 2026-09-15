import { interpolateAutomationValue, sortAutomationKeyframes } from "./studioAutomation";

// Recipes are ordinary, editable timeline keys. No parallel CSS effect runs.
export const buildCreatorMotionRecipe = ({ preset, time, duration, zoom = 1.34 }) => {
  const start = Math.max(0, Math.min(Number(duration) || 0, Number(time) || 0));
  const span = Math.min(preset === "crash_zoom" ? 0.46 : 0.62, duration - start);
  if (span < 0.1) return [];
  const attack = span * (preset === "crash_zoom" ? 0.12 / 0.46 : 0.28 / 0.62);
  return [
    { time: start, value: null, easing: "linear" },
    { time: start + attack, value: Math.min(2, Math.max(1.05, Number(zoom) || 1.34)), easing: preset === "snap_zoom" ? "hold" : preset === "crash_zoom" ? "ease_in" : "ease_out" },
    { time: start + span, value: null, easing: "ease_out" },
  ];
};

export const buildCreatorSpeedRecipe = ({ time, duration }) => {
  const start = Math.max(0, Math.min(Number(duration) || 0, Number(time) || 0));
  const span = Math.min(3.3, duration - start);
  if (span < 0.3) return [];
  return [
    { time: start, value: null, easing: "linear" },
    { time: start + span / 3, value: 2, easing: "ease_in" },
    { time: start + span * 2 / 3, value: 0.5, easing: "ease_in_out" },
    { time: start + span, value: null, easing: "ease_out" },
  ];
};

// FFmpeg renders speed as ordered constant-rate ranges. Sample the exact
// browser automation curve into short bounded ranges so Creator ramps reach
// export instead of silently falling back to the global preview speed.
export const buildSpeedSegmentsFromKeyframes = ({
  keyframes,
  duration,
  fallback = 1,
  samplesPerSecond = 8,
  maxSegments = 240,
} = {}) => {
  const end = Math.max(0, Number(duration) || 0);
  if (!end) return [];
  const keys = sortAutomationKeyframes(keyframes).filter(
    key => key.property === "speed" && Number.isFinite(Number(key.value))
  );
  if (!keys.length) {
    return [{ id: "speed-1", startTime: 0, endTime: end, rate: Math.max(0.5, Math.min(2, Number(fallback) || 1)), pitchPreserved: true }];
  }

  const boundaries = new Set([0, end]);
  keys.forEach(key => boundaries.add(Math.max(0, Math.min(end, Number(key.time)))));
  for (let index = 0; index < keys.length - 1; index += 1) {
    const left = Math.max(0, Math.min(end, Number(keys[index].time)));
    const right = Math.max(0, Math.min(end, Number(keys[index + 1].time)));
    const slices = Math.min(32, Math.max(1, Math.ceil((right - left) * samplesPerSecond)));
    for (let slice = 1; slice < slices; slice += 1) {
      boundaries.add(left + ((right - left) * slice) / slices);
    }
  }
  const ordered = [...boundaries].filter(Number.isFinite).sort((a, b) => a - b);
  const raw = [];
  for (let index = 0; index < ordered.length - 1 && raw.length < maxSegments; index += 1) {
    const startTime = ordered[index];
    const endTime = ordered[index + 1];
    if (endTime - startTime < 0.0001) continue;
    const rate = Math.max(0.5, Math.min(2, interpolateAutomationValue({
      keyframes: keys,
      property: "speed",
      time: (startTime + endTime) / 2,
      fallback,
    })));
    raw.push({ startTime, endTime, rate: Number(rate.toFixed(4)), pitchPreserved: true });
  }
  return raw.reduce((segments, segment) => {
    const previous = segments[segments.length - 1];
    if (previous && Math.abs(previous.rate - segment.rate) < 0.0001) {
      previous.endTime = segment.endTime;
    } else {
      segments.push({ ...segment, id: `speed-${segments.length + 1}` });
    }
    return segments;
  }, []);
};

export const mergeCreatorRecipe = ({ keyframes, points, targetId, property, fallback = 1, createId }) => {
  if (!points.length) return keyframes;
  const start = points[0].time;
  const end = points[points.length - 1].time;
  const belongs = key => String(key.targetId) === String(targetId) && key.property === property;
  const original = keyframes.filter(belongs);
  const generated = points.map(point => ({
    ...point,
    id: createId(), targetId, property,
    value: point.value ?? interpolateAutomationValue({ keyframes: original, property, time: point.time, fallback }),
  }));
  return sortAutomationKeyframes([
    ...keyframes.filter(key => !belongs(key) || key.time < start || key.time > end),
    ...generated,
  ]);
};

export const findCreatorBeat = (markers, time, duration) => {
  const valid = (markers || []).map(marker => Number(typeof marker === "number" ? marker : marker?.time))
    .filter(beat => Number.isFinite(beat) && beat >= 0 && beat < duration);
  if (!valid.length) return null;
  return valid.reduce((nearest, beat) => Math.abs(beat - time) < Math.abs(nearest - time) ? beat : nearest);
};
