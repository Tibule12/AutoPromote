import { buildMotionAutomationStyle, interpolateAutomationValue, validateSpatialCurve, SPATIAL_CURVE_STEPS } from './studioAutomation';

const tick = time => Math.round(time * 90000) / 90000;
export function editStudioPositionPose(keys, targetId, time, position, createId) {
  if (!targetId || !Number.isFinite(time) || time < 0 ||
      ['x', 'y'].some(axis => !Number.isFinite(position[axis]) || position[axis] < 0 || position[axis] > 100))
    throw Error('Position needs a programme time and X/Y between 0 and 100.');
  const next = [...keys];
  for (const property of ['x', 'y']) {
    const index = next.findIndex(key => key.targetId === targetId && key.property === property &&
      Math.round(key.time * 90000) === Math.round(time * 90000));
    if (index >= 0) next[index] = { ...next[index], value: position[property] };
    else next.push({ id: createId(), targetId, time: tick(time), property, value: position[property], easing: 'ease_in_out' });
  }
  return next;
}

export function studioPositionPath(keys, fallback, draft) {
  const positions = keys.filter(key => ['x', 'y'].includes(key.property));
  const times = [...new Set(positions.map(key => tick(key.time)))].sort((a, b) => a - b);
  const effective = draft?.keys || (draft ? editStudioPositionPose(positions, fallback.id, draft.time, draft, () => 'draft') : positions);
  const at = time => ({ time, ...buildMotionAutomationStyle(effective, time, fallback) });
  const points = times.map(at), samples = [];
  const steps = effective.some(key => key.spatialCurve) ? SPATIAL_CURVE_STEPS : 32;
  for (let index = 0; index < times.length - 1; index++)
    for (let sample = 0; sample < steps; sample++) samples.push(at(times[index] + (times[index + 1] - times[index]) * sample / steps));
  if (times.length) samples.push(at(times.at(-1)));
  return { points, samples };
}

// Each curve is carried by the existing arriving X/Y keys. Keep tangents as
// offsets so moving an endpoint also moves its attached handle.
export function studioPositionSegments(keys, targetId) {
  const positions = keys.filter(key => key.targetId === targetId && ['x', 'y'].includes(key.property));
  const times = [...new Set(positions.map(key => tick(key.time)))].sort((a, b) => a - b), segments = [];
  const at = (time, axis) => positions.find(key => tick(key.time) === time && key.property === axis);
  for (let index = 1; index < times.length; index++) {
    const start = times[index - 1], end = times[index];
    const left = ['x', 'y'].map(axis => at(start, axis)), right = ['x', 'y'].map(axis => at(end, axis));
    if ([...left, ...right].some(key => !key)) continue;
    right.forEach(validateSpatialCurve);
    const first = {time: start, x: left[0].value, y: left[1].value}, last = {time: end, x: right[0].value, y: right[1].value};
    const curved = right.every(key => key.spatialCurve !== undefined);
    const coordinated = (right[0].easing || 'linear') === (right[1].easing || 'linear') &&
      JSON.stringify(right[0].curve) === JSON.stringify(right[1].curve);
    const controls = [0, 1].map(handle => ({ time: handle ? end : start,
      ...Object.fromEntries(['x', 'y'].map((axis, i) => [axis, (handle ? last : first)[axis] +
        (right[i].spatialCurve?.[handle] ?? (last[axis] - first[axis]) / 3 * (handle ? -1 : 1))])) }));
    segments.push({start, end, first, last, controls, curved, coordinated, right});
  }
  return segments;
}

export function editStudioSpatialPath(keys, targetId, endTime, { enabled = true, handle, position } = {}) {
  const segment = studioPositionSegments(keys, targetId).find(item => tick(item.end) === tick(endTime));
  if (!segment) throw Error('Add paired X/Y position keys at both ends of this path interval.');
  if (handle !== undefined && (![0, 1].includes(handle) || !position || ['x', 'y'].some(axis => !Number.isFinite(position[axis]))))
    throw Error('Choose a path handle and finite coordinates.');
  const ids = new Set(segment.right.map(key => key.id)), timing = segment.right[0];
  return keys.map(key => {
    if (!ids.has(key.id)) return key;
    const next = {...key, easing: timing.easing || 'linear'};
    delete next.curve;
    if (timing.curve) next.curve = [...timing.curve];
    delete next.spatialCurve;
    if (enabled) {
      next.spatialCurve = segment.controls.map((control, i) => control[key.property] - (i ? segment.last : segment.first)[key.property]);
      if (handle !== undefined) next.spatialCurve[handle] = position[key.property] - (handle ? segment.last : segment.first)[key.property];
      validateSpatialCurve(next);
    }
    return next;
  });
}

export function studioPropertyVelocity(keys, property, time, start, end, fallback = 0, limits) {
  const step = Math.max(1e-7, (end - start) / 100000);
  const a = Math.max(start, time - step), b = Math.min(end, time + step);
  if (b <= a) return 0;
  const at = time => { const value = interpolateAutomationValue({ keyframes: keys, property, time, fallback });
    return limits ? Math.max(limits[0], Math.min(limits[1], value)) : value; };
  return (at(b) - at(a)) / (b - a);
}

export function studioVelocityCurve(key) {
  if (key.easing === 'bezier') return [...(key.curve || [.33, 0, .67, 1])];
  if (key.easing === 'linear') return [1 / 3, 1 / 3, 2 / 3, 2 / 3];
  if (key.easing === 'ease_in') return [1 / 3, 0, 2 / 3, 0];
  if (key.easing === 'ease_out') return [1 / 3, 1, 2 / 3, 1];
  return [1 / 3, 0, 2 / 3, 1];
}

export function studioCurveVelocity(curve, first, last, duration) {
  const rate = (last - first) / duration;
  const tangent = (x1, y1, x2, y2) => x1 > 0 ? rate * y1 / x1 : y1 !== 0 ? null
    : x2 > 0 ? rate * y2 / x2 : y2 !== 0 ? null : rate;
  return { start: tangent(curve[0], curve[1], curve[2], curve[3]),
    end: tangent(1 - curve[2], 1 - curve[3], 1 - curve[0], 1 - curve[1]),
    startInfluence: curve[0] * 100, endInfluence: (1 - curve[2]) * 100 };
}

export function editStudioCurveVelocity(curve, first, last, duration, field, value) {
  if (!Number.isFinite(value) || !(duration > 0) || first === last) throw Error('Choose a changing property interval and a finite value.');
  const state = studioCurveVelocity(curve, first, last, duration), next = [...curve], rate = (last - first) / duration;
  if (field.endsWith('Influence')) {
    if (value < 1 || value > 99) throw Error('Influence must be between 1% and 99%.');
    if (field === 'startInfluence') { next[0] = value / 100; next[1] = (state.start ?? 0) / rate * next[0]; }
    else { next[2] = 1 - value / 100; next[3] = 1 - (state.end ?? 0) / rate * (1 - next[2]); }
  } else if (field === 'start') {
    if (next[0] === 0) next[0] = 1 / 3;
    next[1] = value / rate * next[0];
  } else if (field === 'end') {
    if (next[2] === 1) next[2] = 2 / 3;
    next[3] = 1 - value / rate * (1 - next[2]);
  } else throw Error('Choose a supported velocity control.');
  if (next.some((v, index) => !Number.isFinite(v) || v < (index % 2 ? -2 : 0) || v > (index % 2 ? 2 : 1)))
    throw Error('This speed exceeds the supported curve handles. Reduce speed or influence.');
  return next;
}
