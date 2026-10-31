import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { executeStudioSceneActions, buildStudioEvidenceScenePlan } from '../studioSceneActions';

const snapshot = () => {
  const state = { orderedClips: [{ id: 'source', url: 'http://127.0.0.1/source.mp4', start: 0, end: 8 }],
    timeline: [{ id: 'occ', sourceClipId: 'source', startRequest: 0, endRequest: 8 }], overlays: [], motionKeyframes: [],
    projectMedia: [{ id: 'media', name: 'Presenter', status: 'ready', duration: 8,
      storagePath: 'users/local/source.mp4', url: 'http://127.0.0.1/source.mp4' }] };
  state.studioDocument = adaptStudioSnapshotToDocument({ projectId: 'local-project', snapshot: state });
  return state;
};
const factory = () => { let n = 0; return prefix => `${prefix}-${++n}`; };
test('reviewed evidence recipe compiles into ordinary editable perspective media and keys', () => {
  const state = snapshot(), before = JSON.stringify(state);
  const plan = buildStudioEvidenceScenePlan(state, 'media', 2);
  const result = executeStudioSceneActions(plan, state, factory());
  expect(result.overlays).toHaveLength(1); expect(result.motionKeyframes).toHaveLength(6);
  expect(result.overlays[0].sourceStoragePath).toBe('users/local/source.mp4');
  expect(result.overlays[0].perspective.corners).toHaveLength(4);
  expect(result.studioDocument.projectId).toBe('local-project');
  expect(JSON.stringify(state)).toBe(before);
});
test.each(['stale', 'missing-media', 'unsupported', 'invalid-curve', 'overrun'])(
  '%s scene plan rejects atomically before any current state is mutated', mode => {
    const state = snapshot(), before = JSON.stringify(state);
    const plan = buildStudioEvidenceScenePlan(state, 'media', 2);
    if (mode === 'stale') plan.baseRevision += 1;
    if (mode === 'missing-media') plan.actions[0].sourceMediaId = 'missing';
    if (mode === 'unsupported') plan.actions.push({ type: 'remote-script', text: 'run' });
    if (mode === 'invalid-curve') plan.actions[1].keys[1].curve[0] = Infinity;
    if (mode === 'overrun') plan.actions[0].sourceStart = 7;
    expect(() => executeStudioSceneActions(plan, state, factory())).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  }
);
