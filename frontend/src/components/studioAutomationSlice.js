import { automationSegmentValue, interpolateAutomationValue, SPATIAL_CURVE_STEPS } from './studioAutomation';

const lerp = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
const split = (points, t) => {
  const a = lerp(points[0], points[1], t), b = lerp(points[1], points[2], t), c = lerp(points[2], points[3], t);
  const d = lerp(a, b, t), e = lerp(b, c, t), f = lerp(d, e, t);
  return [[points[0], a, d, f], [f, e, c, points[3]]];
};
const parameterAt = (points, time) => {
  let low = 0, high = 1;
  for (let i = 0; i < 40; i++) {
    const t = (low + high) / 2;
    if (split(points, t)[0][3][0] < time) low = t; else high = t;
  }
  return (low + high) / 2;
};
const turningTimes = (left, right) => {
  const [x1, y1, x2, y2] = right.curve || [.33, 0, .67, 1];
  const a = 3 * y1 - 3 * y2 + 1, b = -6 * y1 + 3 * y2, c = 3 * y1;
  const discriminant = b * b - 3 * a * c;
  const roots = Math.abs(a) < 1e-12 ? (Math.abs(b) < 1e-12 ? [] : [-c / (2 * b)]) :
    discriminant <= 0 ? [] : [(-b - Math.sqrt(discriminant)) / (3 * a), (-b + Math.sqrt(discriminant)) / (3 * a)];
  return roots.filter(t => t > 0 && t < 1).sort((a, b) => a - b).map(t => left.time + (right.time - left.time) *
    (3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3));
};

// Keep the original arrival curve when a ripple removes part of its interval.
// The resulting handles are ordinary Bézier keys, consumed by both engines.
function croppedCurve(left, right, start, end) {
  const span = right.time - left.time, delta = right.value - left.value;
  let curve = right.curve;
  if (right.easing === 'ease_in') curve = [1 / 3, 0, 2 / 3, 0];
  else if (right.easing === 'ease_out') curve = [1 / 3, 1, 2 / 3, 1];
  else if (right.easing !== 'bezier') return { easing: right.easing || 'linear' };
  curve ||= [.33, 0, .67, 1];
  const points = [[left.time, left.value], [left.time + span * curve[0], left.value + delta * curve[1]],
    [left.time + span * curve[2], left.value + delta * curve[3]], [right.time, right.value]];
  const last = end >= right.time ? 1 : parameterAt(points, end);
  const first = start <= left.time ? 0 : parameterAt(points, start);
  const clipped = split(split(points, last)[0], last ? first / last : 0)[1];
  const dx = clipped[3][0] - clipped[0][0], dy = clipped[3][1] - clipped[0][1];
  if (Math.abs(dy) < 1e-12) return { easing: 'linear' };
  return { easing: 'bezier', curve: [
    (clipped[1][0] - clipped[0][0]) / dx, (clipped[1][1] - clipped[0][1]) / dy,
    (clipped[2][0] - clipped[0][0]) / dx, (clipped[2][1] - clipped[0][1]) / dy,
  ] };
}

export function sliceStudioAutomation(keys, { start = 0, end = Infinity, offset = 0, createId }) {
  const properties = [...new Set(keys.map(key => key.property))];
  return properties.flatMap(property => {
    // Expand ease-in/out at its existing cubic join. Spatial paths already use
    // a fixed sampled-distance curve, so retain those same knots without fitting.
    const original = keys.filter(key => key.property === property).sort((a, b) => a.time - b.time);
    const expanded = [original[0]];
    for (let i = 1; i < original.length; i++) {
      const left = original[i - 1], right = original[i], span = right.time - left.time;
      const partial = (left.time < start && right.time > start) || (left.time < end && right.time > end);
      if (partial && right.spatialCurve && right.easing !== 'hold') {
        for (let step = 1; step < SPATIAL_CURVE_STEPS; step++) expanded.push({ ...right, id: createId(),
          time: left.time + span * step / SPATIAL_CURVE_STEPS,
          value: automationSegmentValue(left.value, right.value, step / SPATIAL_CURVE_STEPS, right),
          easing: 'linear', curve: undefined, spatialCurve: undefined });
        expanded.push({ ...right, easing: 'linear', curve: undefined, spatialCurve: undefined });
      } else if (partial && right.easing === 'ease_in_out') {
        expanded.push({ ...right, id: createId(), time: left.time + span / 2,
          value: (left.value + right.value) / 2, easing: 'bezier', curve: [1 / 3, 0, 2 / 3, 0] });
        expanded.push({ ...right, easing: 'bezier', curve: [1 / 3, 1, 2 / 3, 1] });
      } else if (partial && right.easing === 'bezier' && turningTimes(left, right).length) {
        // A cropped overshoot can have equal endpoint values while still
        // moving. Split at its extrema so ordinary bounded handles retain it.
        let previous = left.time;
        for (const time of [...turningTimes(left, right), right.time]) {
          expanded.push({ ...right, ...croppedCurve(left, right, previous, time),
            id: time === right.time ? right.id : createId(), time,
            value: interpolateAutomationValue({ keyframes: [left, right], property, time }) });
          previous = time;
        }
      } else expanded.push(right);
    }
    const times = [...new Set([start, ...expanded.map(key => key.time).filter(time => time > start && time < end),
      ...(Number.isFinite(end) ? [end] : [])])].sort((a, b) => a - b);
    return times.map((time, index) => {
      const authored = expanded.find(key => key.time === time);
      const arrival = expanded.find(key => key.time > time) || expanded.at(-1);
      const previousTime = times[index - 1];
      const right = expanded.find(key => key.time >= time), left = right && expanded[expanded.indexOf(right) - 1];
      const partial = left && right && previousTime >= left.time && time <= right.time &&
        (previousTime !== left.time || time !== right.time);
      const timing = partial ? croppedCurve(left, right, previousTime, time) : {};
      const key = { ...(authored || arrival), ...timing, time: time - offset,
        value: interpolateAutomationValue({ keyframes: expanded, property, time }),
        id: authored?.id || createId() };
      if (partial) { delete key.spatialCurve; if (!timing.curve) delete key.curve; }
      return key;
    });
  });
}

// A removed programme interval is a discontinuity, not a faster interpolation
// between its outer keys. Retain both sides on the integer 90 kHz clock.
export function rippleStudioAutomation(keys, from, to, createId) {
  if (!(to > from)) return keys;
  const tracks = new Map();
  for (const key of keys) {
    const id = JSON.stringify([key.targetId, key.property]);
    if (!tracks.has(id)) tracks.set(id, []);
    tracks.get(id).push(key);
  }
  return [...tracks.values()].flatMap(track => {
    const before = track.some(key => key.time < from), after = track.some(key => key.time >= to);
    const inside = track.some(key => key.time >= from && key.time < to);
    if (!track.every(key => Number.isFinite(key.value)) || (!inside && !(before && after))) {
      return track.filter(key => key.time < from || key.time >= to)
        .map(key => key.time >= to ? { ...key, time: key.time - (to - from) } : key);
    }
    const left = from > 0 ? sliceStudioAutomation(track, { end: Math.max(0, from - 1 / 90000), createId }) : [];
    const right = sliceStudioAutomation(track, { start: to, offset: to - from, createId });
    if (left.length) right[0] = { ...right[0], easing: 'hold', curve: undefined, spatialCurve: undefined };
    return [...left, ...right];
  });
}
