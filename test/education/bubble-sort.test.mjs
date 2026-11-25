import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bubbleSortTrace } from '../../scripts/education/bubbleSortTrace.mjs';
test('teaching example has six adjacent comparisons, four swaps and the stated pass invariant', () => {
  const trace = bubbleSortTrace([5, 1, 4, 2]);
  assert.deepEqual(trace.output, [1, 2, 4, 5]);
  assert.equal(trace.comparisons, 6); assert.equal(trace.swaps, 4);
  assert.deepEqual(trace.steps.filter(step => step.pass === 1).at(-1).after, [1, 4, 2, 5]);
  for (const step of trace.steps) {
    assert(step.j + 1 <= step.end);
    assert.equal(step.left, step.before[step.j]);
    assert.deepEqual(step.before.filter((_, i) => i !== step.j && i !== step.j + 1), step.after.filter((_, i) => i !== step.j && i !== step.j + 1));
  }
});
test('empty/single/sorted inputs, negative values and duplicate identity remain correct', () => {
  for (const input of [[], [1], [1, 2, 3], [-2, -4, 0], [3, 2, 2, 1]]) {
    assert.deepEqual(bubbleSortTrace(input).output, [...input].sort((a, b) => a - b));
  }
  const input = [{ n: 2, id: 'A' }, { n: 1, id: 'B' }, { n: 2, id: 'C' }];
  assert.deepEqual(bubbleSortTrace(input, x => x.n).output.map(x => x.id), ['B', 'A', 'C']);
  assert.equal(bubbleSortTrace([1, 2, 3, 4]).comparisons, 3);
  assert.throws(() => bubbleSortTrace([NaN]));
});
