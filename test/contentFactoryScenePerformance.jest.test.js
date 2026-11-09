const { validateCreativeScene, validateScenePerformanceReview } = require('../src/services/contentFactoryScenePerformance');
const { createContentFactoryService } = require('../src/services/contentFactoryService');
const { compileFactoryEdit } = require('../src/services/contentFactoryStudioAdapter');
const { digest } = require('../src/services/contentFactoryContract');

const scene = () => ({ representation: 'A creator wakes the studio', before: 'The room is dark',
  during: 'The creator sits, turns and types', after: 'The moving clip plays',
  actions: [{ id: 'creator', kind: 'human', action: 'Sit, turn, blink and type' },
    { id: 'screen', kind: 'object', action: 'Wake and play moving footage' }],
  camera: 'Over-shoulder tracking', supportingShots: ['Hand insert'], vfx: ['Planar screen replacement'],
  sound: 'Chair, keys and room tone', transition: 'Cut on playing subject movement' });
const artifact = { path: 'assets/take/video.mp4', sha256: 'a'.repeat(64), duration: 5, fps: 24 };
const criteria = ['The creator physically sits, turns and types'];
function reviewed(s = scene()) {
  return { accepted: true, reason: 'Contract fixture, not creative evidence', reviewer: 'test fixture',
    modelRevision: 'fixture', evidenceSha256: 'b'.repeat(64), revisionInstructions: '',
    criteria: criteria.map(criterion => ({ criterion, passed: true, observation: 'Fixture' })),
    motionReview: { scope: 'full_video', artifactSha256: artifact.sha256, scenePlanHash: digest(s),
      duration: 5, cameraOnly: false, actions: s.actions.map(a => ({ id: a.id, kind: a.kind,
        independentMotion: true, observation: 'Fixture action at a bounded source interval', start: .2, end: 4,
        ...(a.kind === 'human' ? { anatomyStable: true, identityStable: true } : {}) })) } };
}
test('a scene requires action before/during/after plus actual human or object actions', () => {
  expect(validateCreativeScene(scene())).toEqual(scene());
  expect(() => validateCreativeScene({ ...scene(), after: '' })).toThrow('CREATIVE_SCENE_INVALID');
  expect(() => validateCreativeScene({ ...scene(), actions: [] })).toThrow('CREATIVE_SCENE_INVALID');
});
test('technical success or sampled pictures cannot accept a moving scene', () => {
  const review = reviewed(); delete review.motionReview;
  expect(() => validateScenePerformanceReview({ scene: scene(), artifact, review })).toThrow('full-video performance review');
  review.motionReview = { ...reviewed().motionReview, scope: 'sampled_frames' };
  expect(() => validateScenePerformanceReview({ scene: scene(), artifact, review })).toThrow('full-video performance review');
});
test('camera movement cannot stand in for human performance', () => {
  const review = reviewed(); review.motionReview.cameraOnly = true;
  expect(() => validateScenePerformanceReview({ scene: scene(), artifact, review })).toThrow('full-video performance review');
  review.motionReview.cameraOnly = false; review.motionReview.actions[0].independentMotion = false;
  expect(() => validateScenePerformanceReview({ scene: scene(), artifact, review })).toThrow('planned performance');
});
test('review cannot survive replacement bytes, changed action, or a new duration', () => {
  const review = reviewed();
  expect(() => validateScenePerformanceReview({ scene: scene(), artifact: { ...artifact, sha256: 'c'.repeat(64) }, review })).toThrow();
  const changed = scene(); changed.actions[0].action = 'Walk out of the room';
  expect(() => validateScenePerformanceReview({ scene: changed, artifact, review })).toThrow();
  expect(() => validateScenePerformanceReview({ scene: scene(), artifact: { ...artifact, duration: 6 }, review })).toThrow();
});
test('missing, duplicated, out-of-range or unstable performances block acceptance', () => {
  for (const mutate of [r => r.motionReview.actions.pop(), r => r.motionReview.actions[1] = r.motionReview.actions[0],
    r => r.motionReview.actions[0].end = 6, r => r.motionReview.actions[0].anatomyStable = false,
    r => r.motionReview.actions[0].identityStable = false]) {
    const review = reviewed(); mutate(review);
    expect(() => validateScenePerformanceReview({ scene: scene(), artifact, review })).toThrow();
  }
});
test('a negative review may reject immediately, and older scoped projects remain usable', () => {
  const rejected = { accepted: false, reason: 'Frozen person' };
  expect(validateScenePerformanceReview({ scene: scene(), artifact, review: rejected })).toBe(rejected);
  expect(validateScenePerformanceReview({ artifact, review: reviewed() })).toBeTruthy();
});
test('ordinary Studio adapter cannot import a claimed accepted scene without performance review', () => {
  const review = reviewed(); delete review.motionReview;
  const options = { jobId: 'scene-check', ownerUid: 'founder', assets: [{ assetId: 'take', type: 'video', status: 'accepted',
    artifact, provenance: { creativeScene: scene() }, review }],
    output: { outputId: 'film', aspect: '16:9', purpose: 'One moving scene', sequence: [{ assetId: 'take', start: 0, duration: 3 }] },
    urlFor: a => `http://127.0.0.1:8765/${a.path}` };
  expect(() => compileFactoryEdit(options)).toThrow('full-video performance review');
  options.assets[0].review = reviewed();
  const edit = compileFactoryEdit(options);
  expect(edit.document.clipOccurrences).toHaveLength(1);
  expect(edit.renderRequest.timeline_segments[0].source_clip_id).toBe('take');
  const studio = require('../src/generated/studioDirectorReplayKernel.cjs');
  const reopened = studio.projectStudioEditableStateToSnapshot(JSON.parse(JSON.stringify(edit.document)), {
    timeline: edit.snapshot.timeline,
    projectMedia: edit.snapshot.projectMedia.map(m => ({ ...m, generationProvenance: { stale: true } })),
  });
  expect(reopened.projectMedia[0].generationProvenance.creativeScene).toEqual(scene());
  expect(reopened.projectMedia[0].generationProvenance.review.motionReview).toEqual(reviewed().motionReview);
});
test('failed moving review preserves expensive take and retry reviews it without generation', async () => {
  const rows = new Map();
  const store = { get: async id => structuredClone(rows.get(id) || null),
    transaction: async (id, mutate) => { const next = mutate(structuredClone(rows.get(id) || null));
      if (next) rows.set(id, structuredClone(next)); return structuredClone(next); } };
  const plan = { schemaVersion: 1, title: 'A room responds', story: { about: 'Creator', whyCare: 'Idea comes alive',
    hook: 'Lights respond', beginning: 'Creator enters', development: 'Creator types', tension: 'Unfinished film',
    payoff: 'Film moves', ending: 'Room becomes story', withheld: 'Finished film', amplify: ['Human action'], remove: ['Still photos'] },
    script: ['hook', 'development', 'payoff'].map(beatId => ({ beatId, action: beatId, sound: 'Room and keys' })),
    assets: [{ assetId: 'take', type: 'video', beatId: 'hook', provider: 'wan', prompt: 'Creator sits and types',
      reason: 'Physical beginning', duration: 5, seed: 1, acceptanceCriteria: criteria, creativeScene: scene() }],
    outputs: [{ outputId: 'film', aspect: '16:9', purpose: 'Editable film', sequence: [
      { assetId: 'take', start: 0, duration: 2, reason: 'Entrance' }, { assetId: 'take', start: 2, duration: 2, reason: 'Action' }] }] };
  let adequate = false;
  const providers = { plan: async () => plan, generate: jest.fn(async () => ({ artifact, model: 'Wan',
    modelRevision: 'fixture', settings: { steps: 40 }, tool: 'test fixture' })), verifyArtifact: async a => a,
    review: jest.fn(async ({ output, criteria: expected }) => { const r = reviewed();
      r.criteria = expected.map(criterion => ({ criterion, passed: true, observation: 'Contract fixture' }));
      if (!adequate || output) delete r.motionReview; return r; }),
    render: jest.fn(async () => ({ artifact: { ...artifact, duration: 4 } })), urlFor: a => `http://127.0.0.1:8765/${a.path}` };
  const service = createContentFactoryService({ store, providers });
  const { job } = await service.create({ uid: 'founder', input: { requestId: 'performance', brief: 'Create a living studio' } });
  const failed = await service.process(job.jobId);
  expect(failed.assets[0].status).toBe('review_failed');
  expect(failed.assets[0].artifact.sha256).toBe(artifact.sha256);
  expect(failed.assets[0].provenance.creativeScene).toEqual(scene());
  expect(providers.generate).toHaveBeenCalledTimes(1); expect(providers.render).not.toHaveBeenCalled();
  adequate = true; await service.retry({ uid: 'founder', jobId: job.jobId });
  const resumed = await service.process(job.jobId);
  expect(resumed.status).toBe('awaiting_founder_review');
  expect(providers.generate).toHaveBeenCalledTimes(1); expect(providers.render).toHaveBeenCalledTimes(1);
});
