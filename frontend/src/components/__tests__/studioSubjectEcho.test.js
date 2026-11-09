import { buildStudioSubjectEchoPlan } from '../studioSubjectEcho';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { executeStudioSceneActions, prepareStudioSceneActions } from '../studioSceneActions';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';

const fixture = () => {
  const s = { orderedClips: [{ id: 'clip', url: 'http://localhost/footage', start: 0, end: 8 }],
    timeline: [{ id: 'occ', sourceClipId: 'clip', startRequest: 0, endRequest: 8 }], overlays: [], motionKeyframes: [],
    projectMedia: ['footage', 'matte'].map((id, i) => ({ id, name: id, duration: 10, status: 'ready',
      url: `http://localhost/${id}`, storagePath: `owned/${id}`, contentHash: String(i + 1).repeat(64) })) };
  s.studioDocument = adaptStudioSnapshotToDocument({ projectId: 'echo-project', snapshot: s });
  return s;
};
const options = { sourceMediaId: 'footage', matteMediaId: 'matte', mode: 'ghost', count: 4,
  delay: .12, opacity: .5, spread: -3, sourceStart: 1, matteStart: 1, startTime: 1, duration: 6,
  width: 1280, height: 720, trails: false, trailX: 55, trailY: 80 };
const ids = () => { let id = 0; return p => `${p}-${++id}`; };
test('photographic echoes keep picture and isolation on identical delayed source clocks with the lead on top', () => {
  const state = fixture(), original = JSON.stringify(state), plan = buildStudioSubjectEchoPlan(state, options);
  const result = executeStudioSceneActions(plan, state, ids());
  expect(result.overlays).toHaveLength(10);
  const compiled = compileStudioCompositionForRender(result.studioDocument);
  expect(compiled).toBeTruthy();
  for (const picture of result.overlays.filter(l => l.trackMatte)) {
    const mask = result.overlays.find(l => l.id === picture.trackMatte.sourceLayerId);
    expect(picture.sourceStartTime).toBe(mask.sourceStartTime);
    expect(picture.startTime).toBe(mask.startTime);
    expect(picture.duration).toBe(mask.duration);
    expect(picture.x).toBe(mask.x);
    expect(mask.opacity).toBe(1);
    expect(mask.layerShadow.enabled).toBe(false);
    expect(mask.mask.enabled).toBe(false);
  }
  const oldest = result.overlays.find(l => l.name.startsWith('Photographic echo 4'));
  expect(oldest.startTime).toBe(1.48);
  expect(oldest.sourceStartTime + 3 - oldest.startTime).toBeCloseTo(2.52);
  const lead = result.overlays.find(l => l.name === 'Natural-colour lead subject');
  expect(result.compositionOrder.at(-1)).toBe(lead.id);
  expect(JSON.stringify(state)).toBe(original);
});
test.each(['ghost', 'chroma'])('%s with light arcs compiles ordinary editable vector stroke keys and bounded glow', async mode => {
  const state = fixture(), plan = buildStudioSubjectEchoPlan(state, { ...options, mode, count: 6, trails: true });
  expect(plan.actions.length).toBeLessThanOrEqual(64);
  const result = await prepareStudioSceneActions(plan, state, ids(), { aspect: 16 / 9,
    rasterize: async () => new File(['pixels'], 'path.png', { type: 'image/png' }), createUrl: () => 'blob:echo-path' });
  expect(result.snapshot.overlays.filter(l => l.name.startsWith('Light arc'))).toHaveLength(6);
  expect(result.snapshot.motionKeyframes.filter(k => k.property === 'strokeEnd')).toHaveLength(18);
  expect(result.snapshot.overlays.filter(l => l.glow?.enabled)).toHaveLength(3);
  expect(compileStudioCompositionForRender(result.snapshot.studioDocument)).toBeTruthy();
  if (mode === 'chroma') expect(result.snapshot.overlays.filter(l => l.name.startsWith('Colour echo'))).toHaveLength(6);
});
test.each([
  { matteMediaId: 'footage' }, { matteMediaId: 'missing' }, { delay: NaN }, { count: 3.5 },
  { sourceStart: 8 }, { startTime: 4 }, { duration: .5 }, { spread: 20 }, { trailX: '' },
])('invalid or unavailable source/settings are rejected before changing a project: %j', change => {
  const state = fixture(), before = JSON.stringify(state);
  expect(() => buildStudioSubjectEchoPlan(state, { ...options, ...change })).toThrow();
  expect(JSON.stringify(state)).toBe(before);
});
test('a reviewed plan cannot apply after the project revision changes', () => {
  const state = fixture(), plan = buildStudioSubjectEchoPlan(state, options);
  state.studioDocument.revision++;
  expect(() => executeStudioSceneActions(plan, state, ids())).toThrow(/stale/);
});
test('a trimmed matte keeps its declared alignment offset at every delayed occurrence', () => {
  const state = fixture(), plan = buildStudioSubjectEchoPlan(state, { ...options, sourceStart: 2, matteStart: 0 });
  const result = executeStudioSceneActions(plan, state, ids());
  for (const picture of result.overlays.filter(l => l.trackMatte)) {
    const matte = result.overlays.find(l => l.id === picture.trackMatte.sourceLayerId);
    expect(picture.sourceStartTime - matte.sourceStartTime).toBe(2);
    expect(picture.startTime).toBe(matte.startTime);
  }
});
test.each([{ blendMode: 'unsupported' }, { glow: { enabled: true, color: '#ffffff', radius: Infinity, intensity: .5 } },
  { remoteShader: 'url' }])('invalid layer styling is rejected atomically: %j', style => {
  const state = fixture(), plan = buildStudioSubjectEchoPlan(state, options), before = JSON.stringify(state);
  plan.actions.push({ type: 'layer_style', targetId: 'echo_picture_0', style });
  expect(() => executeStudioSceneActions(plan, state, ids())).toThrow();
  expect(JSON.stringify(state)).toBe(before);
});
