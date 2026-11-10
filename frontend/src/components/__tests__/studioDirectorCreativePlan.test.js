import { directorCreativeContext, compileDirectorCreativePlan } from '../studioDirectorCreativePlan';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { executeStudioSceneActions } from '../studioSceneActions';

function snapshot() {
  const s = {
    orderedClips: [{ id: 'source', url: 'http://127.0.0.1/source.mp4', start: 0, end: 12 }],
    timeline: [{ id: 'occ', sourceClipId: 'source', startRequest: 0, endRequest: 12 }],
    overlays: [],
    motionKeyframes: [],
    projectMedia: [
      {
        id: 'city',
        name: 'City.mp4',
        status: 'ready',
        duration: 15,
        storagePath: 'owned/city.mp4',
        url: 'http://127.0.0.1/source.mp4',
        contentHash: 'a'.repeat(64),
      },
    ],
  };
  s.studioDocument = adaptStudioSnapshotToDocument({ projectId: 'project', snapshot: s });
  return s;
}

function result(s, treatment) {
  return {
    version: 1,
    projectId: 'project',
    baseRevision: s.studioDocument.revision,
    brief: 'Wordless moving pictures.',
    duration: 12,
    fingerprint: 'a'.repeat(64),
    sourceEvidence: [{ id: 'city', contentHash: 'a'.repeat(64) }],
    provenance: { automaticModelPlanning: true },
    storyboard: {
      name: 'Motion study',
      shots: [
        {
          sourceMediaId: 'city',
          sourceStart: 0,
          duration: 12,
          treatment,
          reason: 'A visual rhythm.',
        },
      ],
    },
  };
}

test.each(['full_frame', 'time_weave', 'orbit_cards', 'radial_reveal'])(
  'model-selected %s becomes canonical ordinary layers and motion keys, with exact timing and no source mutation',
  treatment => {
    const s = snapshot();
    const before = JSON.stringify(s);
    const compiled = compileDirectorCreativePlan(result(s, treatment), s);
    let n = 0;
    const { graphics, ...plan } = compiled.plan;
    const next = executeStudioSceneActions(plan, s, p => `${p}-${++n}`);
    expect(next.overlays.length).toBeGreaterThan(0);
    expect(next.motionKeyframes.length).toBeGreaterThan(0);
    expect(
      next.overlays.every(
        l => l.startTime === 0 && l.duration === 12 && l.sourceStoragePath === 'owned/city.mp4'
      )
    ).toBe(true);
    expect(next.studioDocument.layers.length).toBe(next.overlays.length);
    expect(JSON.stringify(s)).toBe(before);
    expect(graphics.layers[0].duration).toBe(12);
    expect(compiled.shots[0].endTime).toBe(12);
  }
);

test('source handles never overrun when the footage is exactly the storyboard duration', () => {
  const s = snapshot();
  s.projectMedia[0].duration = 12;
  const { plan } = compileDirectorCreativePlan(result(s, 'time_weave'), s);
  expect(
    plan.actions.filter(a => a.type === 'media_plane').every(a => a.sourceStart + a.duration <= 12)
  ).toBe(true);
});

test.each(['revision', 'foreign', 'duration', 'unsupported'])(
  '%s model plan is refused before applying',
  mode => {
    const s = snapshot();
    const r = result(s, 'time_weave');
    const before = JSON.stringify(s);
    if (mode === 'revision') r.baseRevision++;
    if (mode === 'foreign') r.storyboard.shots[0].sourceMediaId = 'not-owned';
    if (mode === 'duration') r.storyboard.shots[0].duration = 11;
    if (mode === 'unsupported') r.storyboard.shots[0].treatment = 'execute';
    expect(() => compileDirectorCreativePlan(r, s)).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  }
);

test('only compact ready clip metadata is sent to the model, without URLs, tokens or local files', () => {
  const s = snapshot();
  s.projectMedia.push({
    ...s.projectMedia[0],
    id: 'matte',
    name: 'City - source-bound luma matte.mp4',
  });
  const c = directorCreativeContext(s, 'Motion', 12);
  expect(c.media).toEqual([
    { id: 'city', name: 'City.mp4', duration: 15, contentHash: 'a'.repeat(64) },
  ]);
  expect(JSON.stringify(c)).not.toMatch(/http|owned\//);
});
