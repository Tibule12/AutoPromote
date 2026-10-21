import { buildMotionAutomationStyle, validateSpatialCurve } from '../studioAutomation';
import { editStudioSpatialPath, editStudioPositionPose } from '../studioMotionEditing';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';
import { editStudioKeyframeSelection } from '../studioKeyframeSelection';

export const positionKeys = () => ['x', 'y'].flatMap(property => [
  {id: `${property}0`, targetId: 'art', property, time: 0, value: property === 'x' ? 15 : 60, easing: 'linear'},
  {id: `${property}1`, targetId: 'art', property, time: 2, value: property === 'x' ? 85 : 60, easing: property === 'x' ? 'linear' : 'ease_out'},
]);
const arc = () => editStudioSpatialPath(editStudioSpatialPath(positionKeys(), 'art', 2,
  {handle: 0, position: {x: 15, y: 0}}), 'art', 2, {handle: 1, position: {x: 85, y: 0}});

test('a horizontal journey can arc above its equal-height endpoints, preserving the original graph and identities', () => {
  const before = positionKeys(), keys = arc();
  expect(positionKeys()).toEqual(before);
  expect(keys.map(key => key.id)).toEqual(before.map(key => key.id));
  expect(buildMotionAutomationStyle(keys, 1, {})).toMatchObject({x: 50, y: 15});
  expect(buildMotionAutomationStyle(keys, .5, {})).toMatchObject({x: 25.9375, y: 26.25});
  expect(keys.find(key => key.id === 'y1')).toMatchObject({easing: 'linear', spatialCurve: [-60, -60]});
  const moved = editStudioPositionPose(keys, 'art', 0, {x: 20, y: 70}, () => 'unused');
  expect(moved.find(key => key.id === 'y1').spatialCurve).toEqual([-60, -60]);
  expect(keys.find(key => key.id === 'y0').value).toBe(60);
  const straight = editStudioSpatialPath(keys, 'art', 2, {enabled: false});
  expect(straight.every(key => key.spatialCurve === undefined)).toBe(true);
  expect(buildMotionAutomationStyle(straight, 1, {})).toMatchObject({x: 50, y: 60});
});

test('hold reaches its endpoint exactly; spatial timing remains finite for custom overshoot and flat axes', () => {
  const held = arc().map(key => ({...key, easing: 'hold'}));
  expect(buildMotionAutomationStyle(held, 1.99999, {})).toMatchObject({x: 15, y: 60});
  expect(buildMotionAutomationStyle(held, 2, {})).toMatchObject({x: 85, y: 60});
  const loop = arc().map(key => key.property === 'x' ? {...key, value: 50, ...(key.time ? {spatialCurve: [-30, 30]} : {})} : key);
  expect(buildMotionAutomationStyle(loop, .5, {}).x).toBe(41.5625);
  const overshoot = arc().map(key => ({...key, easing: 'bezier', curve: [.2, 2, .8, 2]}));
  for (let time = 0; time <= 2; time += .017) {
    const pose = buildMotionAutomationStyle(overshoot, time, {});
    expect(pose.x).toBeGreaterThanOrEqual(15 - 1e-8); expect(pose.x).toBeLessThanOrEqual(85 + 1e-8);
    expect(pose.y).toBeGreaterThanOrEqual(15 - 1e-8); expect(pose.y).toBeLessThanOrEqual(60 + 1e-8);
  }
});

test('native document roundtrip, layer/group compilation and clipboard retain independent spatial controls', () => {
  const keys = arc(), groupKeys = keys.map(key => ({...key, id: `g${key.id}`, targetId: 'group'}));
  const snapshot = {timeline: [{id: 'shot', sourceClipId: 'source', startRequest: 0, endRequest: 3, duration: 3}],
    overlays: [{id: 'art', type: 'image', startTime: 0, duration: 3, x: 50, y: 50}],
    motionKeyframes: [...keys, ...groupKeys], compoundClips: [{id: 'group', name: 'Group', kind: 'graphic_group', layerIds: ['art']}],
    compositionOrder: ['art'], motionScenes: [], threeDScenes: [], reframeAspect: '16:9'};
  const doc = JSON.parse(JSON.stringify(adaptStudioSnapshotToDocument({projectId: 'spatial', snapshot})));
  const compiled = compileStudioCompositionForRender(doc);
  expect(compiled.layers.find(layer => layer.id === 'art').motion_keyframes.find(key => key.id === 'y1').spatialCurve).toEqual([-60, -60]);
  expect(compiled.groups[0].motion_keyframes.find(key => key.id === 'gy1').spatialCurve).toEqual([-60, -60]);
  let id = 0;
  const pasted = editStudioKeyframeSelection([], [], 'paste', {clipboard: keys, value: 0, duration: 3, createId: () => `copy${++id}`}).keys;
  pasted.find(key => key.property === 'y' && key.time === 2).spatialCurve[0] = 20;
  expect(keys.find(key => key.id === 'y1').spatialCurve).toEqual([-60, -60]);
});

test('invalid spatial offsets and unmatched position intervals fail before editing', () => {
  for (const spatialCurve of [null, [1], [true, 2], ['1', 2], [Infinity, 0], [NaN, 0], [201, 0]])
    expect(() => validateSpatialCurve({property: 'x', spatialCurve})).toThrow('Spatial');
  expect(() => validateSpatialCurve({property: 'opacity', spatialCurve: [1, 2]})).toThrow('Spatial');
  expect(() => editStudioSpatialPath(positionKeys().filter(key => key.id !== 'y0'), 'art', 2)).toThrow('paired');
  expect(() => editStudioSpatialPath(positionKeys(), 'art', 2, {handle: 0, position: {x: 1000, y: 0}})).toThrow('Spatial');
});
