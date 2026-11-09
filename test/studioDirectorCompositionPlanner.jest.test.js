const {
  validateComposition,
  validatePixelEvidence,
  planComposition,
  compositionInference,
} = require('../src/services/studioDirectorCompositionPlanner');

const context = {
  projectId: 'p',
  baseRevision: 2,
  brief: 'An ocean inside a walking figure.',
  duration: 8,
  media: [{ id: 'city', name: 'City.mp4', duration: 10, contentHash: 'a'.repeat(64) }],
  pixelEvidence: [
    {
      id: 'city',
      contentHash: 'a'.repeat(64),
      method: 'decoded_rgb_96x54_three_samples_v1',
      samples: [1, 4, 7].map(time => ({
        time,
        meanRgb: [100, 80, 40],
        luma: 86,
        tonalEntropy: 3,
        frameDifference: 15,
        motionCentroid: [50, 50],
      })),
    },
  ],
};
const pose = (at, scale = 1) => ({ at, x: 50, y: 50, scale, rotation: 0, opacity: 1 });
const node = (id = 'base') => ({
  id,
  name: 'Owned picture',
  kind: 'video',
  sourceMediaId: 'city',
  sourceStart: 0,
  start: 0,
  end: 8,
  shape: 'none',
  polygon: '',
  color: '',
  parentId: '',
  matteId: '',
  matteMode: '',
  poses: [pose(0), pose(8, 1.08)],
});
const graph = () => ({
  name: 'Inside',
  concept: 'A continuous picture becomes a window.',
  layers: [node()],
});

test('free composition poses are retained, hash-bound and attributed to actual inference without preset expansion', async () => {
  const infer = jest.fn(async () => graph());
  const before = JSON.stringify(context);
  const plan = await planComposition(context, { infer });
  expect(infer).toHaveBeenCalledTimes(1);
  expect(plan.version).toBe(2);
  expect(plan.composition).toEqual(graph());
  expect(plan.provenance.pixelEvidence).toEqual(context.pixelEvidence);
  expect(plan.provenance.authoring).toBe('ordinary_scene_actions_no_effect_recipes');
  expect(JSON.stringify(context)).toBe(before);
});

test.each(['foreign', 'overrun', 'gap', 'cycle', 'matte', 'pose', 'polygon', 'extra'])(
  '%s composition is refused before mutation',
  mode => {
    const g = graph();
    if (mode === 'foreign') g.layers[0].sourceMediaId = 'other';
    if (mode === 'overrun') g.layers[0].sourceStart = 4;
    if (mode === 'gap') g.layers[0].start = 0.5;
    if (mode === 'cycle') g.layers[0].parentId = 'base';
    if (mode === 'matte') g.layers[0].matteId = 'absent';
    if (mode === 'pose') g.layers[0].poses[1].scale = Infinity;
    if (mode === 'polygon') {
      g.layers[0].shape = 'polygon';
      g.layers[0].polygon = 'polygon(foo)';
    }
    if (mode === 'extra') g.layers[0].script = 'code';
    expect(() => validateComposition(g, context)).toThrow();
  }
);

test('decoded evidence cannot describe a different hash or repeated media ID', () => {
  const c = JSON.parse(JSON.stringify(context));
  c.pixelEvidence[0].contentHash = 'b'.repeat(64);
  expect(() => validatePixelEvidence(c)).toThrow();
});

test('invalid model result is a single visible failure without replacement graph', async () => {
  const infer = jest.fn(async () => ({ name: 'Unfinished', layers: [] }));
  await expect(planComposition(context, { infer })).rejects.toMatchObject({ status: 422 });
  expect(infer).toHaveBeenCalledTimes(1);
});

test('compact model wire poses expand to the same generic graph without adding motion or recipes', async () => {
  const original = global.fetch;
  const g = {
    name: 'Inside',
    concept: 'A continuous picture becomes a window.',
    layers: [
      {
        i: 'a',
        k: 'video',
        s: 1,
        a: 0,
        b: 8,
        o: 0,
        m: 'none',
        c: '',
        p: '',
        t: '',
        z: '',
        q: [
          [0, 50, 50, 1, 0, 1],
          [8, 50, 50, 1.08, 0, 1],
        ],
      },
    ],
  };
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ message: { content: JSON.stringify(g) } }),
  }));
  try {
    const result = await compositionInference({ context, model: 'phi3:latest' });
    expect(result.layers[0]).toEqual({ ...node('a'), name: 'City.mp4 / 1' });
    const [url, request] = global.fetch.mock.calls[0];
    const wire = JSON.parse(request.body);
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    expect(wire.options.num_gpu).toBe(0);
    expect(wire.format.properties.layers.maxItems).toBe(8);
    expect(wire.format.properties.layers.items.properties.q.items.type).toBe('array');
    expect(wire.format.properties.layers.items.properties.s.enum).toEqual([0, 1]);
  } finally {
    global.fetch = original;
  }
});

test('planning deadline is reported clearly, with no second model call', async () => {
  const original = global.fetch;
  global.fetch = jest.fn(async () => {
    throw Object.assign(Error('deadline'), { name: 'TimeoutError' });
  });
  try {
    await expect(compositionInference({ context, model: 'llama3:latest' })).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/time limit/),
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  } finally {
    global.fetch = original;
  }
});
