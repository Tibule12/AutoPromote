import { rippleProgrammeSpeedKeys } from '../studioTrimTransaction';
import { interpolateAutomationValue } from '../studioAutomation';
import { adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot, reconcileStudioDocument, validateStudioProjectDocument } from '../studioProjectDocument';
import { runStudioCommandOnSnapshot, executeStudioCommandBatch, undoStudioCommandBatch } from '../studioCommands';
import { compileStudioCompositionForRender, assertStudioSpeedPlanMatchesDocument } from '../studioRenderCompiler';
import { buildSpeedSegmentsFromKeyframes } from '../studioCreatorRecipes';
import { secondsToTicks } from '../studioTime';

const toCanonical = keys => keys.map(({ time, value, property, ...key }) => ({
  ...key, atProgrammeTick: secondsToTicks(time), rate: value,
}));
const toKeys = keys => keys.map(({ atProgrammeTick, rate, ...key }) => ({
  ...key, property: 'speed', time: atProgrammeTick / 90000, value: rate,
}));
const rateAt = (keys, time) => interpolateAutomationValue({ keyframes: keys, property: 'speed', time });
const originalKeys = easing => [
  { id: 'opening', property: 'speed', time: 0, value: 1, easing: 'linear' },
  { id: 'fast', property: 'speed', time: 3, value: 2, easing },
  { id: 'slow', property: 'speed', time: 5, value: .5, easing },
  { id: 'closing', property: 'speed', time: 8, value: 1, easing },
].map(key => easing === 'bezier' ? { ...key, curve: [.2, -.3, .8, 1.3] } : key);

test.each(['linear', 'hold', 'ease_in', 'ease_out', 'ease_in_out', 'bezier'])(
  '%s speed survives a cut through its ramp on both sides of the join', easing => {
    const keys = originalKeys(easing), untouched = JSON.stringify(keys);
    const cut = { fromTick: secondsToTicks(2), toTick: secondsToTicks(4) };
    const retained = toKeys(rippleProgrammeSpeedKeys(toCanonical(keys), cut, 'retain-speed'));
    let error = 0;
    for (let i = 0; i < 600; i++) {
      const t = i / 100;
      error = Math.max(error, Math.abs(rateAt(retained, t) - rateAt(keys, t < 2 ? t : t + 2)));
    }
    expect(error).toBeLessThan(6e-5);
    expect(JSON.stringify(keys)).toBe(untouched);
    expect(new Set(retained.map(key => key.id)).size).toBe(retained.length);
    expect(rippleProgrammeSpeedKeys(toCanonical(keys), cut, 'retain-speed')).toEqual(toCanonical(retained));
  }
);

test('leading, repeated and trailing cuts retain the original speed of every surviving interval', () => {
  const original = originalKeys('ease_in_out');
  let retained = toCanonical(original);
  const intervals = [[1, 2], [4, 6], [6.5, 8]];
  for (const [from, to] of [[6, 6.5], [2, 4], [0, 1]]) {
    retained = rippleProgrammeSpeedKeys(retained, { fromTick: secondsToTicks(from), toTick: secondsToTicks(to) }, `cut-${from}`);
  }
  let joined = 0;
  for (const [start, end] of intervals) {
    for (let local = 0; local < end - start; local += .037) {
      expect(rateAt(toKeys(retained), joined + local)).toBeCloseTo(rateAt(original, start + local), 4);
    }
    joined += end - start;
  }
});

test('canonical trim retains custom speed curves, repeated-source ownership, nested gates and exact history/reopen', () => {
  const snapshot = {
    orderedClips: [{ id: 'source', start: 0, end: 8 }], selectedClipId: 'source',
    timeline: [{ id: 'first', sourceClipId: 'source', startRequest: 0, endRequest: 4 },
      { id: 'repeat', sourceClipId: 'source', startRequest: 0, endRequest: 4 }],
    speedKeyframes: originalKeys('bezier'),
    overlays: [{ id: 'title', type: 'text', text: 'Keep the pace', startTime: 0, duration: 8 }],
    compositionOrder: ['title'],
    compoundClips: [
      { id: 'inner', name: 'Inner', kind: 'graphic_group', layerIds: ['title'], timing: { startTime: 1, duration: 6 } },
      { id: 'outer', name: 'Outer', kind: 'graphic_group', layerIds: ['inner'], timing: { startTime: 0, duration: 8 } },
    ],
    voiceovers: [{ id: 'speech', startTime: 0, duration: 8, trimStart: 0, fadeIn: 2, fadeOut: 2 }],
    motionKeyframes: [{ id: 'a', targetId: 'title', property: 'x', time: 0, value: 25, easing: 'linear' },
      { id: 'b', targetId: 'title', property: 'x', time: 8, value: 75, easing: 'ease_in_out' }],
  };
  const document = adaptStudioSnapshotToDocument({ snapshot, projectId: 'retained-speed' });
  expect(toKeys(document.programmeSpeedKeys)).toEqual(snapshot.speedKeyframes);
  expect(document.programmeSpeedKeys[1].curve).not.toBe(snapshot.speedKeyframes[1].curve);
  const command = { projectId: document.projectId, baseRevision: document.revision,
    idempotencyKey: 'trim-rate', actor: { type: 'human', id: 'editor' }, operations: [
      { type: 'trim_clip', target: { occurrenceId: 'first' }, keep: { space: 'source', startTick: 0, endTick: secondsToTicks(2) } },
    ] };
  const result = runStudioCommandOnSnapshot({ snapshot: { ...snapshot, studioDocument: document },
    projectId: document.projectId, batch: command });
  expect(executeStudioCommandBatch(document, command).document).toEqual(result.document);
  expect(result.document.clipOccurrences[1].sourceRange).toEqual(document.clipOccurrences[1].sourceRange);
  expect(result.document.clipOccurrences[1].assetId).toBe(document.clipOccurrences[0].assetId);
  for (const t of [0, .7, 1.99, 2, 2.01, 3.4, 5.99]) {
    expect(rateAt(result.snapshot.speedKeyframes, t)).toBeCloseTo(rateAt(snapshot.speedKeyframes, t < 2 ? t : t + 2), 4);
  }
  expect(result.snapshot.voiceovers.map(take => take.fadeOffset)).toEqual([0, 4]);
  expect(result.snapshot.compoundClips.map(group => group.timing)).toEqual([
    { startTime: 1, duration: 4 }, { startTime: 0, duration: 6 },
  ]);
  const cold = projectStudioEditableStateToSnapshot(JSON.parse(JSON.stringify(result.document)), result.snapshot);
  const reopened = reconcileStudioDocument({ snapshot: cold, projectId: document.projectId, storedDocument: result.document });
  expect(reopened).toEqual(result.document);
  expect(compileStudioCompositionForRender(reopened).groups).toEqual(compileStudioCompositionForRender(result.document).groups);
  expect(() => assertStudioSpeedPlanMatchesDocument(reopened, buildSpeedSegmentsFromKeyframes({
    keyframes: cold.speedKeyframes, duration: 6,
  }))).not.toThrow();
  const undone = undoStudioCommandBatch(result.document, { baseRevision: result.document.revision,
    actor: { type: 'human', id: 'editor' }, idempotencyKey: 'undo-rate' }).document;
  expect(undone.programmeSpeedKeys).toEqual(document.programmeSpeedKeys);
  for (const curve of [[.2, 0, .8], [.2, NaN, .8, 1], [-.1, 0, .8, 1], [.2, -3, .8, 1], [.2, 0, 1.1, 1], 'invalid']) {
    expect(() => validateStudioProjectDocument({ ...document,
      programmeSpeedKeys: [{ ...document.programmeSpeedKeys[0], curve }] })).toThrow(/Speed curves/);
  }
});
