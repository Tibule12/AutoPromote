const {
  createCreativePlanner,
  validateContext,
  validateStoryboard,
  localInference,
  materializeMotionIntent,
} = require('../src/services/studioDirectorCreativePlanner');

const context = {
  brief: 'A wordless cinematic travel montage.',
  projectId: 'project',
  baseRevision: 4,
  duration: 12,
  media: [
    { id: 'coast', name: 'Coast.mp4', duration: 15, contentHash: 'a'.repeat(64) },
    { id: 'city', name: 'City.mp4', duration: 12, contentHash: 'b'.repeat(64) },
  ],
};
const board = {
  name: 'Changing horizons',
  shots: [
    {
      sourceMediaId: 'city',
      sourceStart: 0,
      duration: 6,
      treatment: 'time_weave',
      reason: 'Open with motion.',
    },
    {
      sourceMediaId: 'coast',
      sourceStart: 1,
      duration: 6,
      treatment: 'radial_reveal',
      reason: 'Open into a new horizon.',
    },
  ],
};

test('uses actual inference choices, binds them to current revision, and records model provenance without mutating input', async () => {
  const infer = jest.fn().mockResolvedValue(JSON.stringify(board));
  const before = JSON.stringify(context);
  const plan = await createCreativePlanner({ infer, now: () => '2026-11-07T08:00:00Z' })(context);
  expect(infer).toHaveBeenCalledTimes(1);
  expect(infer.mock.calls[0][0].context).toEqual(context);
  expect(plan.storyboard).toEqual(board);
  expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(plan.baseRevision).toBe(4);
  expect(plan.provenance.automaticModelPlanning).toBe(true);
  expect(plan.provenance.sourceUnderstanding).toBe('brief_and_clip_metadata_only');
  expect(JSON.stringify(context)).toBe(before);
});

test.each([
  [{ ...context, extra: true }],
  [{ ...context, duration: 31 }],
  [{ ...context, baseRevision: -1 }],
  [{ ...context, media: [...context.media, context.media[0]] }],
  [{ ...context, media: [{ ...context.media[0], url: 'https://private.example' }] }],
])('invalid and excess-context input is refused before inference: %j', async value => {
  const infer = jest.fn();
  await expect(createCreativePlanner({ infer })(value)).rejects.toMatchObject({ status: 400 });
  expect(infer).not.toHaveBeenCalled();
});

test.each([
  { ...board, shots: [{ ...board.shots[0], sourceMediaId: 'foreign' }] },
  { ...board, shots: [{ ...board.shots[0], sourceStart: 10, duration: 12 }] },
  { ...board, shots: [{ ...board.shots[0], treatment: 'execute_code', duration: 12 }] },
  { ...board, shots: [{ ...board.shots[0], duration: 2 }] },
  { ...board, shots: [{ ...board.shots[0], duration: 12, script: 'arbitrary' }] },
])(
  'invalid source, geometry capability, duration or extra operations fail closed: %j',
  value => {
    expect(() => validateStoryboard(value, context)).toThrow();
  }
);

test('malformed model JSON is a visible failure, not a deterministic recipe fallback or retry', async () => {
  const infer = jest.fn().mockResolvedValue('not json');
  await expect(createCreativePlanner({ infer })(context)).rejects.toMatchObject({ status: 422 });
  expect(infer).toHaveBeenCalledTimes(1);
});

test('fixed local inference enforces CPU-only, bounded completion and unload without outbound provider fallback', async () => {
  const fetchBefore = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify({
          ...board,
          shots: board.shots.map(s => ({
            sourceMediaId: s.sourceMediaId === 'coast' ? 'clip_1' : 'clip_2',
            sourcePosition: 'beginning',
            weight: 1,
            treatment: s.treatment,
            reason: s.reason,
          })),
        }),
      },
    }),
  });
  try {
    await localInference({ system: 'Director', context, model: 'phi3:latest' });
    const [url, request] = global.fetch.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    expect(body.options.num_gpu).toBe(0);
    expect(body.options.num_thread).toBe(3);
    expect(body.keep_alive).toBe(0);
    expect(request.signal).toBeDefined();
  } finally {
    global.fetch = fetchBefore;
  }
});

test('model shot weights map to exactly the 90khz duration and bounded source handles without model arithmetic', () => {
  const c = {
    ...context,
    media: [
      { ...context.media[0], duration: 2 },
      { ...context.media[1], duration: 12 },
    ],
  };
  const intent = {
    name: 'Motion',
    shots: [
      {
        sourceMediaId: 'clip_1',
        sourcePosition: 'ending',
        weight: 3,
        treatment: 'time_weave',
        reason: 'A bold opening.',
      },
      {
        sourceMediaId: 'clip_2',
        sourcePosition: 'middle',
        weight: 1,
        treatment: 'full_frame',
        reason: 'Settle the ending.',
      },
    ],
  };
  const out = materializeMotionIntent(
    intent,
    c,
    new Map([
      ['clip_1', 'coast'],
      ['clip_2', 'city'],
    ])
  );
  expect(out.shots.reduce((n, s) => n + Math.round(s.duration * 90000), 0)).toBe(1080000);
  expect(out.shots[0].duration).toBe(2);
  expect(out.shots[1].duration).toBe(10);
  expect(out.shots[1].sourceStart).toBe(1);
});
