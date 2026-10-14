import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createStudioGroup, studioGroupTree, moveStudioGroupNode, removeStudioGroup, removeStudioGroupMembers, studioGroupLocalPoint, GROUP_TRANSFORM, evaluateStudioGroupTransform, validateStudioGroupKeyframes, pruneRemovedStudioGroupKeys } from '../studioGroups';
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

const key = (id, targetId, property, time, value, easing = 'linear') => ({ id, targetId, property, time, value, easing });

test('empty-group removal prunes only its owned keys while parent and surviving child keys remain', () => {
  const compounds=nested(),active=removeStudioGroupMembers(compounds,['image','motion']);
  const keys=[key('a','inner','x',0,0),key('b','outer','x',0,0),key('c','text','x',0,20)];
  expect(pruneRemovedStudioGroupKeys(keys,compounds,active)).toEqual(keys.slice(1));
});

test('group keys use shared interpolation, clamp overshoot and remain outside the membership settings', () => {
  const groups = nested(), keys = [key('a','inner','x',0,-8), key('b','inner','x',2,8,'ease_in_out'),
    key('c','inner','opacity',0,.8), { ...key('d','inner','opacity',2,1,'bezier'), curve: [.2,2,.8,2] }];
  expect(() => validateStudioGroupKeyframes(groups, keys)).not.toThrow();
  const middle = evaluateStudioGroupTransform(groups[0], keys, 1);
  expect(middle.x).toBeCloseTo(0); expect(middle.opacity).toBe(1); expect(middle.scale).toBe(.85);
  expect(groups[0].transform.x).toBe(-8); expect(groups[0].motionKeyframes).toBeUndefined();
});

test('animated ancestor transforms invert drag coordinates at the current edit time', () => {
  const groups=nested(),tree=studioGroupTree(groups,order),width=720,height=1280;
  const keys=[key('x0','inner','x',0,-8),key('x1','inner','x',2,8),key('r0','outer','rotation',0,0),key('r1','outer','rotation',2,90)];
  let x=width*.3,y=height*.56;
  for(const group of groups) {
    const t=evaluateStudioGroupTransform(group,keys,1),a=t.rotation*Math.PI/180;
    const dx=(x-width/2)*t.scale,dy=(y-height/2)*t.scale;
    x=width*(.5+t.x/100)+dx*Math.cos(a)-dy*Math.sin(a);y=height*(.5+t.y/100)+dx*Math.sin(a)+dy*Math.cos(a);
  }
  const point=studioGroupLocalPoint(tree,'image',x/width*100,y/height*100,width,height,keys,1);
  expect(point.x).toBeCloseTo(30,10);expect(point.y).toBeCloseTo(56,10);
});

test('the group key limit rejects another key without rejecting the owned 256-key track', () => {
  const keys=Array.from({length:256},(_,i)=>key(`key${i}`,'inner','x',i,0));
  expect(()=>validateStudioGroupKeyframes(nested(),keys)).not.toThrow();
  expect(()=>validateStudioGroupKeyframes(nested(),[...keys,key('excess','inner','x',256,0)])).toThrow(/256/);
});

test.each([
  [key('a','inner','cropX',0,20)], [key('a','inner','scale',0,3)],
  [key('a','inner','x',-1,10)], [key('a','inner','x',0,null)],
  [key('a','inner','x',0,10,'unknown')], [{...key('a','inner','x',0,10,'bezier'),curve:[-1,0,1,1]}],
  [key('a','inner','x',0,10),key('b','inner','x',0,12)],
])('invalid group transform keys are rejected without changing existing leaf keys', (...keys) => {
  expect(() => validateStudioGroupKeyframes(nested(), keys)).toThrow();
  expect(() => validateStudioGroupKeyframes(nested(), [key('old-leaf','image','cropX',0,20)])).not.toThrow();
});

test('group keys survive canonical cold projection and compile from owned timing references', () => {
  const state = { orderedClips:[{id:'source',start:0,end:3}],selectedClipId:'source',
    timeline:[{id:'main',sourceClipId:'source',startRequest:0,endRequest:3}],
    overlays:[{id:'image',type:'image'},{id:'text',type:'text'}],motionScenes:[{id:'motion'}],threeDScenes:[{id:'depth'}],
    compositionOrder:order,compoundClips:nested(),motionKeyframes:[key('first','inner','x',0,-8),key('last','inner','x',2,8,'ease_out')] };
  const doc=adaptStudioSnapshotToDocument({projectId:'keyed-groups',snapshot:state});
  expect(doc.linkedTiming.keys.motionKeyframes[1].atProgrammeTick).toBe(180000);
  const reopened=projectStudioEditableStateToSnapshot(JSON.parse(JSON.stringify(doc)),{...state,motionKeyframes:[],compoundClips:[]});
  expect(reopened.motionKeyframes).toEqual(state.motionKeyframes);
  const plan=compileStudioCompositionForRender(doc);
  expect(plan.groups[0].motion_keyframes).toEqual(state.motionKeyframes.map(({targetId,...rest})=>rest));
  plan.groups[0].motion_keyframes[0].value=90; expect(reopened.motionKeyframes[0].value).toBe(-8);
});

test('animated preview updates both nested wrappers while preserving child-local transforms and captions', () => {
  const keys=[key('a','inner','x',0,-8),key('b','inner','x',2,8),key('c','outer','opacity',0,.9),key('d','outer','opacity',2,.5)];
  const {container,rerender}=render(<StudioGroupPreview compounds={nested()} order={order} keyframes={keys} time={0}>
    <div data-studio-layer-id="image" style={{transform:'scale(2)'}}>Image</div>
  </StudioGroupPreview>);
  rerender(<StudioGroupPreview compounds={nested()} order={order} keyframes={keys} time={1}>
    <div data-studio-layer-id="image" style={{transform:'scale(2)'}}>Image</div>
  </StudioGroupPreview>);
  expect(container.querySelector('[data-studio-group-id="inner"]').style.transform).toContain('translate(0%');
  expect(container.querySelector('[data-studio-group-id="outer"]').style.opacity).toBe('0.7');
  expect(container.querySelector('[data-studio-layer-id="image"]').style.transform).toBe('scale(2)');
});

test('group inspector displays evaluated values, supports property keys and respects the graphics lock', () => {
  const toggle=jest.fn(),property=jest.fn(),seek=jest.fn();
  const props={tree:studioGroupTree(nested(),order),entries:order.map(id=>({id,label:id})),onCreate:jest.fn(),onTransform:jest.fn(),onRemove:jest.fn(),onMove:jest.fn(),
    playhead:1,keyframes:[key('a','inner','x',0,-8),key('b','inner','x',2,8)],onProperty:property,onToggleKey:toggle,onSeek:seek};
  const {rerender}=render(<StudioGroupInspector {...props}/>);
  expect(screen.getByLabelText('inner x')).toHaveValue(0);
  fireEvent.click(screen.getByRole('button',{name:'Add inner x keyframe at playhead'}));expect(toggle).toHaveBeenCalledWith('inner','x');
  fireEvent.change(screen.getByLabelText('inner x'),{target:{value:'-3'}});fireEvent.blur(screen.getByLabelText('inner x'));
  expect(property).toHaveBeenCalledWith('inner','x',-3);
  rerender(<StudioGroupInspector {...props} locked/>);
  expect(screen.getByLabelText('inner x')).toBeDisabled();expect(screen.getByRole('button',{name:'Add inner x keyframe at playhead'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Next inner x keyframe'}));expect(seek).toHaveBeenCalledWith(2);
});
