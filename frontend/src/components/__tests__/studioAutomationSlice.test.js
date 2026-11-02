import { sliceStudioAutomation, rippleStudioAutomation } from '../studioAutomationSlice';
import { interpolateAutomationValue } from '../studioAutomation';

let id;
beforeEach(() => { id = 0; });
const createId = () => `boundary-${++id}`;
const value = (keyframes, time) => interpolateAutomationValue({ keyframes, property: 'x', time });

test.each(['linear', 'hold', 'ease_in', 'ease_out', 'ease_in_out', 'bezier', 'spatial'])(
  'cutting a %s animation preserves its retained poses on both sides of the removed range', easing => {
    const keys = [{ id: 'left', targetId: 'title', property: 'x', time: 1, value: 10 },
      { id: 'right', targetId: 'title', property: 'x', time: 11, value: 90,
        easing: easing === 'spatial' ? 'ease_out' : easing, curve: [.1, 0, .3, 1],
        ...(easing === 'spatial' ? { spatialCurve: [35, -20] } : {}) }];
    const first = sliceStudioAutomation(keys, { start: 0, end: 4, createId });
    const second = sliceStudioAutomation(keys, { start: 7, offset: 3, createId });
    for (let i = 0; i <= 60; i++) {
      const before = 4 * i / 60, after = 7 + 5 * i / 60;
      expect(value(first, before)).toBeCloseTo(value(keys, before), 4);
      expect(value(second, after - 3)).toBeCloseTo(value(keys, after), 4);
    }
    expect(keys[1].time).toBe(11);
    expect(new Set([...first, ...second].map(key => key.id)).size).toBe(first.length + second.length);
  }
);

test('a removed complete envelope keeps its last held value on the surviving piece', () => {
  const keys = [{ id: 'before', property: 'x', time: 0, value: 20 },
    { id: 'inside', property: 'x', time: 2, value: 80, easing: 'hold' }];
  const result = sliceStudioAutomation(keys, { start: 3, offset: 2, createId });
  expect(result).toHaveLength(1);
  expect(value(result, 1)).toBe(80);
});

test.each([[.2, -1, .8, 2], [.1, 2, .9, -1], [0, 0, 0, 1], [1, 0, 1, 1]])(
  'a cropped custom curve keeps valid handles and original values: %j', (...curve) => {
    const keys = [{ id: 'a', property: 'x', time: 0, value: 0 },
      { id: 'b', property: 'x', time: 10, value: 100, easing: 'bezier', curve }];
    const result = sliceStudioAutomation(keys, { start: 2, end: 7, offset: 1, createId });
    for (let i = 0; i <= 50; i++) expect(value(result, 1 + i / 10)).toBeCloseTo(value(keys, 2 + i / 10), 3);
    for (const key of result) if (key.curve) key.curve.forEach((v, index) =>
      expect(v >= (index % 2 ? -2 : 0) && v <= (index % 2 ? 2 : 1)).toBe(true));
  }
);

test.each(['linear', 'hold', 'ease_in', 'ease_out', 'ease_in_out', 'bezier'])(
  'a ripple preserves the %s bus/group envelope and jumps at the exact join', easing => {
    const keys = [{ id: 'a', targetId: 'group', property: 'x', time: 0, value: 0 },
      { id: 'b', targetId: 'group', property: 'x', time: 10, value: 100, easing, curve: [.1, 0, .8, 1] }];
    const result = rippleStudioAutomation(keys, 3, 5, createId);
    for (const time of [0, 1, 2, 2.999, 3, 3.01, 4, 6, 8]) {
      expect(value(result, time)).toBeCloseTo(value(keys, time < 3 ? time : time + 2), 3);
    }
    expect(value(result, 3)).toBeCloseTo(value(keys, 5), 6);
    expect(new Set(result.map(key => key.id)).size).toBe(result.length);
  }
);

test('custom overshoot curves remain representable when a cut isolates a turning point', () => {
  const keys = [{ id: 'a', property: 'x', time: 0, value: 0 },
    { id: 'b', property: 'x', time: 10, value: 100, easing: 'bezier', curve: [.3, 2, .7, -1] }];
  for (const [start, end] of [[.5, 3], [1, 4], [2, 5], [3, 8], [6, 9], [7, 9.5]]) {
    const result = sliceStudioAutomation(keys, { start, end, createId });
    for (let i = 0; i <= 40; i++) {
      const time = start + (end - start) * i / 40;
      expect(value(result, time)).toBeCloseTo(value(keys, time), 3);
    }
    for (const key of result) if (key.curve) key.curve.forEach((v, index) =>
      expect(v >= (index % 2 ? -2 : 0) && v <= (index % 2 ? 2 : 1)).toBe(true));
  }
});
