import { buildStudioStripTransitionPlan, stripTransitionRegions } from '../studioStripTransition';
import { adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot } from '../studioProjectDocument';
import { executeStudioSceneActions } from '../studioSceneActions';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';

const fixture = () => {
  const snapshot = { orderedClips: [{ id: 'clip', url: 'http://localhost/a', start: 0, end: 12 }],
    timeline: [{ id: 'occ', sourceClipId: 'clip', startRequest: 0, endRequest: 12 }], overlays: [], motionKeyframes: [],
    projectMedia: ['a', 'b'].map((id, i) => ({ id, type: 'video', name: id, duration: 20, status: 'ready',
      url: `http://localhost/${id}`, storagePath: `owned/${id}`, contentHash: String(i + 1).repeat(64) })) };
  snapshot.studioDocument = adaptStudioSnapshotToDocument({ projectId: 'strip-project', snapshot });
  return snapshot;
};
const options = { layout: 'fashion_mosaic', count: 5, direction: 'alternating', outgoingId: 'a', incomingId: 'b',
  outgoingStart: 1, incomingStart: 3, startTime: 1, openingHold: 1.5, transitionDuration: 1.4, incomingHold: 1.5, stagger: .08 };
const ids = () => { let next = 0; return prefix => `${prefix}-${++next}`; };

test('pieces tile the incoming source without holes or overlapping interiors', () => {
  for (const layout of ['fashion_mosaic', 'vertical', 'horizontal']) {
    const regions = stripTransitionRegions(layout, 6);
    expect(regions.reduce((a, [x0, y0, x1, y1]) => a + (x1 - x0) * (y1 - y0), 0)).toBeCloseTo(10000);
    for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i], b = regions[j];
      expect(Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
        Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))).toBeCloseTo(0);
    }
  }
});

test('ordinary compilation and exact project recovery retain panel clocks, crisp masks and the full-shot handoff', () => {
  const snapshot = fixture(), before = JSON.stringify(snapshot);
  const result = executeStudioSceneActions(buildStudioStripTransitionPlan(snapshot, options), snapshot, ids());
  const panels = result.overlays.filter(l => l.name.includes('incoming piece'));
  expect(panels).toHaveLength(5);
  expect(result.overlays).toHaveLength(7);
  const full = result.overlays.find(l => l.name.includes('resolved'));
  for (const panel of panels) {
    expect(panel.startTime).toBe(2.5);
    expect(panel.sourceStartTime).toBe(3);
    expect(panel.layerShadow.enabled).toBe(false);
    expect(panel.mask.feather).toBe(0);
    expect(panel.mediaFit).toBe('cover');
    expect(panel.muted).toBe(true);
    expect(panel.sourceStartTime + full.startTime - panel.startTime).toBeCloseTo(full.sourceStartTime);
    for (const property of ['x', 'y']) {
      const keys = result.motionKeyframes.filter(k => k.targetId === panel.id && k.property === property);
      expect(keys.at(-1).value).toBe(50);
      expect(new Set(keys.map(k => k.time)).size).toBe(keys.length);
    }
  }
  const compiled = compileStudioCompositionForRender(result.studioDocument);
  const restored = projectStudioEditableStateToSnapshot(result.studioDocument, result);
  expect(compileStudioCompositionForRender(adaptStudioSnapshotToDocument({ projectId: 'strip-project', snapshot: { ...result, ...restored } }))).toEqual(compiled);
  expect(JSON.stringify(snapshot)).toBe(before);
});

test.each(['fashion_mosaic', 'vertical', 'horizontal'])('%s works for all supported directions and zero stagger', layout => {
  for (const direction of ['alternating', 'left', 'right', 'up', 'down']) {
    const snapshot = fixture();
    expect(() => executeStudioSceneActions(buildStudioStripTransitionPlan(snapshot, { ...options, layout, direction, count: 6, stagger: 0 }), snapshot, ids())).not.toThrow();
  }
});

test('one source can supply two different moments without cloning its media identity', () => {
  const snapshot = fixture();
  const result = executeStudioSceneActions(buildStudioStripTransitionPlan(snapshot, { ...options, incomingId: 'a', incomingStart: 8 }), snapshot, ids());
  expect(new Set(result.overlays.map(l => l.sourceMediaId))).toEqual(new Set(['a']));
});

test.each([{ stagger: .3, transitionDuration: .8 }, { startTime: 11 }, { incomingStart: 19 }, { outgoingStart: 19 }, { transitionDuration: NaN },
  { incomingId: 'missing' }, { direction: 'spin' }, { layout: 'unknown' }, { outgoingStart: '' }])('invalid settings leave the original project unchanged: %j', patch => {
  const snapshot = fixture(), before = JSON.stringify(snapshot);
  expect(() => buildStudioStripTransitionPlan(snapshot, { ...options, ...patch })).toThrow();
  expect(JSON.stringify(snapshot)).toBe(before);
});

test('stale plans are refused rather than applying to a newer project', () => {
  const snapshot = fixture(), plan = buildStudioStripTransitionPlan(snapshot, options);
  snapshot.studioDocument.revision++;
  expect(() => executeStudioSceneActions(plan, snapshot, ids())).toThrow(/stale/);
});
