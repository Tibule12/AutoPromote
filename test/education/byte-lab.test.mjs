import test from 'node:test';
import assert from 'node:assert/strict';
import { explainByte } from '../../scripts/education/byteLabAlgorithm.mjs';
test('all unsigned byte values reconstruct exactly from eight weighted bits', () => {
  for (let value = 0; value <= 255; value++) {
    const result = explainByte(String(value));
    assert.equal(result.ok, true);assert.equal(result.binary.length, 8);assert.equal(result.check, value);
    assert.equal(parseInt(result.binary, 2), value);
  }
});
test('invalid and misleading numeric inputs are rejected', () => {
  for (const value of ['', '-1', '256', '999', '1000', '1.5', '2e2', 'Infinity', '<script>', 'NaN']) assert.equal(explainByte(value).ok, false, value);
});
