import { buildMotionAutomationStyle, interpolateAutomationValue } from './studioAutomation';

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
  const effective = draft ? editStudioPositionPose(positions, fallback.id, draft.time, draft, () => 'draft') : positions;
  const at = time => ({ time, ...buildMotionAutomationStyle(effective, time, fallback) });
  const points = times.map(at), samples = [];
  for (let index = 0; index < times.length - 1; index++)
    for (let sample = 0; sample < 32; sample++) samples.push(at(times[index] + (times[index + 1] - times[index]) * sample / 32));
  if (times.length) samples.push(at(times.at(-1)));
  return { points, samples };
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
