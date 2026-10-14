import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createStudioGroup, studioGroupTree, moveStudioGroupNode, removeStudioGroup, removeStudioGroupMembers, studioGroupLocalPoint, GROUP_TRANSFORM } from '../studioGroups';
import StudioGroupPreview from '../StudioGroupPreview';
import StudioGroupInspector from '../StudioGroupInspector';
import { adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot } from '../studioProjectDocument';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';

const group = (id, layerIds, transform = {}) => ({ id, name: id, kind: 'graphic_group', layerIds, transform: { ...GROUP_TRANSFORM, ...transform } });
const order = ['image', 'motion', 'text', 'depth'];
const nested = () => [group('inner', ['image', 'motion'], { x: -8, rotation: -12, scale: .85 }),
  group('outer', ['inner', 'text'], { x: 12, y: -4, scale: 1.1, rotation: 18, opacity: .7 })];

test('grouping joins separated roots without losing order and nests existing groups', () => {
  const first = createStudioGroup([], order, ['image', 'text'], 'inner', 'inner');
  expect(first.order).toEqual(['image', 'text', 'motion', 'depth']);
  const next = createStudioGroup(first.compounds, first.order, ['inner', 'depth'], 'outer', 'outer');
  expect(next.order).toEqual(['image', 'text', 'depth', 'motion']);
  expect(studioGroupTree(next.compounds, next.order).leaves('outer')).toEqual(['image', 'text', 'depth']);
});

test('group and child arrows reorder only siblings; removing the master promotes its children', () => {
  const groups = nested();
  const moved = moveStudioGroupNode(groups, order, 'inner', 'forward');
  expect(moved.order).toEqual(['text', 'image', 'motion', 'depth']);
  expect(moved.compounds[1].layerIds).toEqual(['text', 'inner']);
  expect(moveStudioGroupNode(groups, order, 'outer', 'forward').order).toEqual(['depth', 'image', 'motion', 'text']);
  expect(removeStudioGroup(groups, 'inner')[0].layerIds).toEqual(['image', 'motion', 'text']);
});

test('deleting final leaves removes empty nested masters and preserves legacy compound metadata', () => {
  const legacy = { id: 'old', layerIds: ['image'], startTime: 0 };
  expect(removeStudioGroupMembers([...nested(), legacy], ['image', 'motion', 'text'])).toEqual([legacy]);
  expect(studioGroupTree([legacy], order).roots).toEqual(order);
});

test.each([
  [() => [group('a', ['missing'])], /existing parent/],
  [() => [group('a', ['image']), group('b', ['image'])], /existing parent/],
  [() => [group('a', ['b']), group('b', ['a'])], /acyclic/],
  [() => [group('a', ['image', 'text'])], /contiguous/],
  [() => [group('a', ['image'], { scale: NaN })], /scale/],
  [() => [group('a', ['image'], { opacity: null })], /opacity/],
  [() => [group('a', ['image'], { anchorX: 20 })], /static/],
  [() => [{ ...group('a', ['image']), keyframes: [] }], /static/],
])('invalid or unsupported hierarchy decisions fail explicitly', (fixture, message) => {
  expect(() => studioGroupTree(fixture(), order)).toThrow(message);
});

test('nested inverse dragging uses the non-square local canvas rather than a rotated bounding box', () => {
  const tree = studioGroupTree(nested(), order), width = 720, height = 1280;
  let x = 30 * width / 100, y = 56 * height / 100;
  for (const t of [tree.byId.get('inner').transform, tree.byId.get('outer').transform]) {
    const dx = (x - width / 2) * t.scale, dy = (y - height / 2) * t.scale, a = t.rotation * Math.PI / 180;
    x = width * (.5 + t.x / 100) + dx * Math.cos(a) - dy * Math.sin(a);
    y = height * (.5 + t.y / 100) + dx * Math.sin(a) + dy * Math.cos(a);
  }
  const point = studioGroupLocalPoint(tree, 'image', x / width * 100, y / height * 100, width, height);
  expect(point.x).toBeCloseTo(30, 10); expect(point.y).toBeCloseTo(56, 10);
});

test('group count and nesting limits reject oversized hierarchies', () => {
  expect(() => studioGroupTree(Array.from({ length: 65 }, (_, i) => group(`g${i}`, ['image'])), order)).toThrow(/64/);
  const groups = Array.from({ length: 9 }, (_, i) => group(`g${i}`, [i ? `g${i-1}` : 'image']));
  expect(() => studioGroupTree(groups, order)).toThrow(/8 levels/);
});

test('cold canonical projection and compiler own nesting and child keys independently of stale transport state', () => {
  const state = { orderedClips: [{ id: 'source', start: 0, end: 3 }], selectedClipId: 'source',
    timeline: [{ id: 'main', sourceClipId: 'source', startRequest: 0, endRequest: 3 }],
    overlays: [{ id: 'image', type: 'image' }, { id: 'text', type: 'text', text: 'Words' }],
    motionScenes: [{ id: 'motion', startTime: 0, duration: 3 }], threeDScenes: [{ id: 'depth', enabled: false }],
    compositionOrder: order, compoundClips: [...nested(), group('disabled', ['depth'])],
    motionKeyframes: [{ id: 'key', targetId: 'image', property: 'x', time: 1, value: 60 }] };
  const document = adaptStudioSnapshotToDocument({ projectId: 'nested', snapshot: state });
  const reopened = projectStudioEditableStateToSnapshot(JSON.parse(JSON.stringify(document)), { ...state, compoundClips: [], motionKeyframes: [] });
  expect(reopened.compoundClips).toEqual(state.compoundClips); expect(reopened.motionKeyframes[0].value).toBe(60);
  const plan = compileStudioCompositionForRender(document);
  expect(plan.groups).toEqual(nested()); expect(plan.order).toEqual(order.slice(0, 3));
  state.overlays[0].blendMode = 'multiply';
  expect(() => compileStudioCompositionForRender(adaptStudioSnapshotToDocument({ projectId: 'nested', snapshot: state }))).toThrow(/Normal blend/);
});

test('preview opacity belongs to each full-canvas wrapper and children keep their own transforms', () => {
  const { container } = render(<StudioGroupPreview compounds={nested()} order={order}>
    <div data-studio-layer-id="image" style={{ transform: 'scale(2)', opacity: .8 }}>Image</div>
    <div data-studio-layer-id="motion">Motion</div><div data-studio-layer-id="text">Text</div>
    <div data-studio-layer-id="depth">Depth</div>
    <div data-studio-layer-id="legacy-caption">Caption</div>
  </StudioGroupPreview>);
  const outer = container.querySelector('[data-studio-group-id="outer"]');
  expect(outer.style.opacity).toBe('0.7'); expect(outer.style.overflow).toBe('hidden');
  expect(outer.querySelector('[data-studio-group-id="inner"]')).not.toBeNull();
  expect(outer.querySelector('[data-studio-layer-id="image"]').style.opacity).toBe('0.8');
  expect(outer.querySelector('[data-studio-layer-id="image"]').style.transform).toBe('scale(2)');
  expect(outer.querySelector('[data-studio-layer-id="legacy-caption"]')).toBeNull();
  expect(container.querySelector('[data-studio-layer-id="legacy-caption"]')).not.toBeNull();
});

test('numeric edits commit on blur and reject empty/out-of-range values; root groups can be selected for nesting', () => {
  const change = jest.fn(), create = jest.fn();
  render(<StudioGroupInspector tree={studioGroupTree(nested(), order)} entries={order.map(id => ({ id, label: id }))}
    onTransform={change} onCreate={create} onRemove={jest.fn()} onMove={jest.fn()} />);
  const input = screen.getByLabelText('inner x');
  fireEvent.change(input, { target: { value: '-15' } }); expect(change).not.toHaveBeenCalled(); fireEvent.blur(input);
  expect(change).toHaveBeenCalledWith('inner', expect.objectContaining({ x: -15 }));
  fireEvent.change(input, { target: { value: '200' } }); fireEvent.blur(input); expect(change).toHaveBeenCalledTimes(1);
  expect(input).toHaveAttribute('aria-invalid', 'true');
  fireEvent.click(screen.getByLabelText('Group selection outer')); fireEvent.click(screen.getByLabelText('Group selection depth'));
  fireEvent.click(screen.getByRole('button', { name: 'Group selected layers' })); expect(create).toHaveBeenCalledWith(['outer', 'depth']);
});
