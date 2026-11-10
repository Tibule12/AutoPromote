import {
  directorCompositionContext,
  compileDirectorComposition,
  buildSourceBoundDirectorProposal,
  analyzeDirectorClipTelemetry,
} from '../studioDirectorComposition';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { executeStudioSceneActions, prepareStudioSceneActions } from '../studioSceneActions';

const pose = (at, scale = 1) => ({ at, x: 50, y: 50, scale, rotation: 0, opacity: 1 });

function fixture() {
  const s = {
    orderedClips: [{ id: 's', url: 'http://localhost/s', start: 0, end: 8 }],
    timeline: [{ id: 'o', sourceClipId: 's', startRequest: 0, endRequest: 8 }],
    overlays: [],
    motionKeyframes: [],
    projectMedia: [
      {
        id: 'city',
        name: 'City',
        status: 'ready',
        duration: 10,
        storagePath: 'owned/city',
        url: 'http://localhost/s',
        contentHash: 'a'.repeat(64),
      },
    ],
  };
  s.studioDocument = adaptStudioSnapshotToDocument({ projectId: 'p', snapshot: s });
  return s;
}

const layer = () => ({
  id: 'base',
  name: 'City canvas',
  kind: 'video',
  sourceMediaId: 'city',
  sourceStart: 1,
  start: 0,
  end: 8,
  shape: 'none',
  polygon: '',
  color: '',
  parentId: '',
  matteId: '',
  matteMode: '',
  poses: [pose(0), pose(8, 1.1)],
});

function proposal(s) {
  return {
    version: 2,
    projectId: 'p',
    baseRevision: s.studioDocument.revision,
    brief: 'A visual film',
    duration: 8,
    sourceEvidence: [{ id: 'city', contentHash: 'a'.repeat(64) }],
    fingerprint: 'd'.repeat(64),
    provenance: { automaticModelPlanning: true },
    composition: {
      name: 'City canvas',
      concept: 'Move through the picture.',
      layers: [layer()],
    },
  };
}

test('model-authored poses compile to ordinary canonical video keys, not a treatment recipe', () => {
  const s = fixture();
  const before = JSON.stringify(s);
  const r = compileDirectorComposition(proposal(s), s);
  let id = 0;
  const next = executeStudioSceneActions(r.plan, s, () => `node-${++id}`);
  expect(next.overlays).toHaveLength(1);
  expect(next.overlays[0].sourceStartTime).toBe(1);
  expect(next.overlays[0].scale).toBeCloseTo(10 / 7);
  expect(next.motionKeyframes).toHaveLength(10);
  expect(next.motionKeyframes.find(k => k.property === 'scale' && k.time === 8).value).toBeCloseTo(
    (1.1 * 10) / 7
  );
  expect(JSON.stringify(s)).toBe(before);
});

test('source matte footage remains available for a graph, unlike the legacy effect selector', () => {
  const s = fixture();
  s.projectMedia[0].name = 'City person luma matte';
  expect(directorCompositionContext(s, 'Matte film', 8).media).toHaveLength(1);
});

test.each(['stale', 'source', 'timing'])(
  '%s graph is refused before canonical mutation',
  mode => {
    const s = fixture();
    const r = proposal(s);
    if (mode === 'stale') r.baseRevision++;
    if (mode === 'source') r.sourceEvidence[0].contentHash = 'e'.repeat(64);
    if (mode === 'timing') r.composition.layers[0].end = 12;
    expect(() => compileDirectorComposition(r, s)).toThrow();
  }
);

test('mixed shape/video/matte graph preserves authored stack, resolved edges and pose keys through the existing compiler', async () => {
  const s = fixture();
  const r = proposal(s);
  const base = layer();
  const shape = {
    ...base,
    id: 'paper',
    name: 'Paper',
    kind: 'shape',
    sourceMediaId: '',
    sourceStart: 0,
    color: '#eee7da',
  };
  const matte = { ...base, id: 'silhouette', name: 'Silhouette source' };
  const fill = {
    ...base,
    id: 'fill',
    name: 'Moving window',
    matteId: 'silhouette',
    matteMode: 'luma',
  };
  r.composition.layers = [shape, base, matte, fill];
  let serial = 0;
  const next = await prepareStudioSceneActions(
    compileDirectorComposition(r, s).plan,
    s,
    p => `${p}-${++serial}`,
    {
      aspect: 16 / 9,
      rasterize: async () => new File(['raster fixture'], 'art.png', { type: 'image/png' }),
      createUrl: () => `blob:fixture-${serial}`,
      revokeUrl: () => {},
    }
  );
  const layers = next.snapshot.overlays;
  const byName = name => layers.find(l => l.name === name);
  expect(next.snapshot.compositionOrder).toEqual(
    ['Paper', 'City canvas', 'Silhouette source', 'Moving window'].map(name => byName(name).id)
  );
  expect(byName('Moving window').trackMatte).toEqual({
    mode: 'luma',
    sourceLayerId: byName('Silhouette source').id,
  });
  expect(
    next.snapshot.motionKeyframes.filter(k => k.targetId === byName('Paper').id)
  ).toHaveLength(10);
});

test('source-bound Director choreographer compiles Null Rig, Track Matte, soft mask, animated polygon vertices, motion drivers, 3D LUT Color Cube and Beat-Synced Grade Pulses', async () => {
  const s = fixture();
  const context = {
    ...directorCompositionContext(s, 'Kodak 2383 golden portal reveal with beat pulses', 8),
    pixelEvidence: [
      {
        id: 'city',
        contentHash: 'a'.repeat(64),
        method: 'decoded_rgb_96x54_three_samples_v1',
        samples: [
          {
            time: 1.5,
            meanRgb: [130, 102, 74],
            luma: 108,
            tonalEntropy: 3.1,
            frameDifference: 28,
            motionCentroid: [56, 42],
          },
          {
            time: 5.0,
            meanRgb: [142, 110, 78],
            luma: 116,
            tonalEntropy: 3.3,
            frameDifference: 34,
            motionCentroid: [48, 44],
          },
          {
            time: 8.5,
            meanRgb: [118, 94, 68],
            luma: 98,
            tonalEntropy: 2.9,
            frameDifference: 19,
            motionCentroid: [52, 48],
          },
        ],
      },
    ],
  };
  const telemetry = analyzeDirectorClipTelemetry(context);
  expect(telemetry).toHaveLength(1);
  expect(telemetry[0].salienceScore).toBeGreaterThan(0);

  const built = buildSourceBoundDirectorProposal(context, {
    lookProfileId: 'kodak_2383',
    beatSyncPulses: true,
    bpm: 120,
  });
  const compiled = compileDirectorComposition(built, s);
  expect(compiled.topologySummary.nullRigs).toBe(1);
  expect(compiled.topologySummary.trackMattes).toBe(1);
  expect(compiled.topologySummary.softMasks).toBeGreaterThanOrEqual(2);
  expect(compiled.topologySummary.motionDrivers).toBeGreaterThanOrEqual(1);
  expect(compiled.topologySummary.animatedMaskKeys).toBeGreaterThanOrEqual(16);
  expect(compiled.topologySummary.colorGrade.id).toBe('kodak_2383');

  let serial = 0;
  const prepared = await prepareStudioSceneActions(
    compiled.plan,
    s,
    p => `${p}-${++serial}`,
    {
      aspect: 16 / 9,
      rasterize: async () => new File(['raster fixture'], 'art.png', { type: 'image/png' }),
      createUrl: () => `blob:fixture-${serial}`,
      revokeUrl: () => {},
    }
  );
  const next = prepared.snapshot;
  expect(next.overlays.some(l => l.isNullRig && l.motionDrivers?.x?.enabled)).toBe(true);
  expect(next.overlays.some(l => l.trackMatte?.mode === 'alpha')).toBe(true);
  expect(next.overlays.some(l => Number(l.mask?.feather) > 0)).toBe(true);
  expect(next.motionKeyframes.some(k => /^maskPoint\d+[XY]$/.test(k.property))).toBe(true);
  expect(next.finishFx.precisionGrade).toBe(true);
  expect(next.advancedColor.lutData?.size).toBe(17);
  expect(next.finishKeyframes.length).toBeGreaterThan(4);
});
