import { buildStudioKineticType } from '../studioKineticType';
import { buildMotionAutomationStyle } from '../studioAutomation';
import { studioGroupTree } from '../studioGroups';
import { normalizeStudioTitleText } from '../studioTitleLayout';

const source = { id: 'title', type: 'text', text: 'MAKE EVERY WORD MOVE', x: 50, y: 50,
  scale: 1, rotation: 0, opacity: 1, width: 90, startTime: 2, duration: 4, bg: 'transparent', fontFamily: 'Inter' };
const build = (changes = {}) => { let id = 0; return buildStudioKineticType({ source, overlays: [source], keyframes: [],
  compounds: [], order: [source.id], width: 1280, height: 720, measure: value => value.length * 20,
  createId: prefix => `${prefix}-${++id}`, ...changes }); };

test('words become ordinary grouped titles and keys; source graph is immutable and unrelated keys survive', () => {
  const foreign = { id: 'keep', targetId: 'other', property: 'x', time: 0, value: 20 };
  const result = build({ keyframes: [foreign] });
  expect(result.layers.map(layer => layer.text)).toEqual(['MAKE', 'EVERY', 'WORD', 'MOVE']);
  expect(result.keys).toHaveLength(64); expect(new Set(result.keys.map(key => key.id)).size).toBe(64);
  expect(result.keyframes[0]).toBe(foreign); expect(source.text).toBe('MAKE EVERY WORD MOVE');
  expect(studioGroupTree(result.compounds, result.order).leaves(result.group.id)).toEqual(result.layers.map(layer => layer.id));
  const first = result.layers[0], keys = result.keys.filter(key => key.targetId === first.id);
  expect(buildMotionAutomationStyle(keys, 2, first)).toMatchObject({ opacity: 0, y: first.y + 8 });
  expect(buildMotionAutomationStyle(keys, 3, first)).toMatchObject({ opacity: 1, y: first.y, scale: 1, rotation: 0 });
  expect(buildMotionAutomationStyle(keys, 6 - 1 / 24, first).opacity).toBeCloseTo(0, 4);
  expect(keys.filter(key => key.time > 2.5 && key.time < 5.8).every(key => key.easing === 'hold')).toBe(true);
});

test('reverse and center order change stagger timing without changing reading order', () => {
  const reverse = build({ direction: 'reverse' });
  expect(reverse.layers.map(layer => layer.startTime)).toEqual([2.36, 2.24, 2.12, 2]);
  const center = build({ direction: 'center' });
  expect(center.layers.map(layer => layer.startTime)).toEqual([2.24, 2, 2.12, 2.36]);
});

test('spin writes existing cubic curves and alternating rotation; hold poses remain stable', () => {
  const result = build({ style: 'spin', tilt: 20 });
  const rotation = layer => result.keys.filter(key => key.targetId === layer.id && key.property === 'rotation');
  expect(rotation(result.layers[0])[0].value).toBe(-20); expect(rotation(result.layers[1])[0].value).toBe(20);
  expect(rotation(result.layers[0])[1]).toMatchObject({ easing: 'bezier', curve: [.16, 1.35, .3, 1] });
});

test('letters preserve complete graphemes and multi-line centred geometry', () => {
  const changed = { ...source, text: 'Á B\nCD' };
  const result = build({ source: changed, overlays: [changed], unit: 'letter' });
  expect(result.layers.map(layer => layer.text)).toEqual(['Á', 'B', 'C', 'D']);
  expect(result.layers[0].y).toBeLessThan(result.layers[2].y);
});

test('ordinary title copy retains new lines while typing without admitting control markup', () => {
  expect(normalizeStudioTitleText('MAKE EVERY\r\nWORD MOVE\n')).toBe('MAKE EVERY\nWORD MOVE\n');
  expect(normalizeStudioTitleText('<MOVE>\u0000\tIT')).toBe('MOVE  IT');
});

test('nested title replacement preserves parent ownership, stack and unrelated children', () => {
  const other = { id: 'other', type: 'image' };
  const result = build({ overlays: [other, source], order: ['other', 'title'],
    compounds: [{ id: 'parent', name: 'Parent', kind: 'graphic_group', layerIds: ['other', 'title'] }] });
  const tree = studioGroupTree(result.compounds, result.order);
  expect(tree.parent.get(result.group.id)).toBe('parent'); expect(result.order[0]).toBe('other');
  expect(tree.leaves('parent')).toEqual(result.order);
});

test('rejects time collisions, excess letters and altered existing motion instead of dropping them', () => {
  expect(() => build({ stagger: 1, source: { ...source, duration: 3.5 } })).toThrow('more time');
  expect(() => build({ entry: '' })).toThrow('Entrance');
  expect(() => build({ keyframes: [{ targetId: 'title', property: 'x', time: 0, value: 20 }] })).toThrow('already has motion');
  const changed = { ...source, text: 'a '.repeat(49), duration: 60 };
  expect(() => build({ source: changed, overlays: [changed] })).toThrow('at most 48');
  expect(() => build({ source: { ...source, bg: '#000000' } })).toThrow('No background');
});
