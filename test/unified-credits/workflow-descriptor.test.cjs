const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compactWorkflowDescriptor } = require('../../src/services/unifiedCredits/workflowDescriptor');
const { digest } = require('../../src/services/unifiedCredits/workerVerification');

test('large creative input remains fingerprint-bound without duplicating its body in the operation descriptor', () => {
  const body = { options: { color_cube: { data: Array(107811).fill(.1234567) } } };
  const sources = [{ contentHash: 'a'.repeat(64), objectGeneration: '1', size: 123, gatewayPath: '/owned/source' }];
  const input = { requestBody: body, sources, route: '/api/media/process', expectedExecutions: 1, duration: 16 };
  const before = JSON.stringify(input), result = compactWorkflowDescriptor(input);
  assert.equal(result.requestBodyHash, digest(body)); assert.equal(result.requestBody, undefined);
  assert.deepEqual(result.sources, sources); assert.equal(result.expectedExecutions, 1);
  assert(JSON.stringify(result).length < 131072); assert.equal(JSON.stringify(input), before);
  assert.notEqual(compactWorkflowDescriptor({ ...input, requestBody: { options: {} } }).requestBodyHash, result.requestBodyHash);
});
