import { splitStudioOverlayAtProgrammeTime } from '../studioTrimTransaction';
import { interpolateAutomationValue } from '../studioAutomation';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';

test('a normal layer split retains nested ownership, stack order, exact source phase and curved motion on both pieces', () => {
  const snapshot = { timeline: [{ id: 'main', sourceClipId: 'source', startRequest: 0, endRequest: 10 }],
    overlays: [{ id: 'shot', type: 'video', sourceStartTime: 20, startTime: 1, duration: 8 },
      { id: 'other', type: 'image', startTime: 0, duration: 10 }], compositionOrder: ['shot', 'other'],
    compoundClips: [{ id: 'inner', kind: 'graphic_group', name: 'Inner', layerIds: ['shot'], mask: { enabled: true, shape: 'ellipse' } },
      { id: 'outer', kind: 'graphic_group', name: 'Outer', layerIds: ['inner', 'other'] }],
    motionKeyframes: [{ id: 'a', targetId: 'shot', property: 'x', time: 1, value: 20 },
      { id: 'b', targetId: 'shot', property: 'x', time: 9, value: 80, easing: 'bezier', curve: [.1, 0, .7, 1] }],
  };
  const split = splitStudioOverlayAtProgrammeTime(snapshot, 'shot', 4, 'right');
  expect(split.overlays[1]).toMatchObject({ id: 'right', startTime: 4, duration: 5, sourceStartTime: 23 });
  expect(split.compoundClips[0].layerIds).toEqual(['shot', 'right']);
  expect(split.compositionOrder).toEqual(['shot', 'right', 'other']);
  for (const time of [1, 2.5, 3.99, 4, 4.5, 7, 8.99]) {
    const id = time < 4 ? 'shot' : 'right';
    const value = (keys, at) => interpolateAutomationValue({ keyframes: keys, property: 'x', time: at });
    expect(value(split.motionKeyframes.filter(key => key.targetId === id), time))
      .toBeCloseTo(value(snapshot.motionKeyframes, time), 4);
  }
  expect(new Set(split.motionKeyframes.map(key => key.id)).size).toBe(split.motionKeyframes.length);
  const plan = compileStudioCompositionForRender(adaptStudioSnapshotToDocument({ snapshot: split, projectId: 'split' }));
  expect(plan.order).toEqual(split.compositionOrder);
  expect(plan.groups[0].layerIds).toEqual(['shot', 'right']);
  expect(snapshot.overlays).toHaveLength(2);
});

test('invalid split points and reused identities leave the original graph intact', () => {
  const snapshot = { overlays: [{ id: 'layer', type: 'text', startTime: 1, duration: 2 }] };
  for (const time of [0, 1, 3, NaN]) expect(() => splitStudioOverlayAtProgrammeTime(snapshot, 'layer', time, 'right')).toThrow();
  expect(() => splitStudioOverlayAtProgrammeTime(snapshot, 'layer', 2, 'layer')).toThrow(/unique/);
  expect(snapshot.overlays[0].duration).toBe(2);
});
