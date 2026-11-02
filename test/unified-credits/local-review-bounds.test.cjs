const { test } = require('node:test');
const assert = require('node:assert/strict');
const { localReviewBounds, validateLongReviewRequest } = require('../../scripts/monetization/local-review-bounds.cjs');
const demo = { NODE_ENV: 'test', UNIFIED_CREDITS_SANDBOX: 'true',
  UNIFIED_CREDITS_PROJECT_ID: 'demo-autopromote-credits', FIRESTORE_EMULATOR_HOST: '127.0.0.1:1234',
  STUDIO_BACKGROUND_DEMO: 'true', STUDIO_BACKGROUND_LONG_DEMO: 'true' };
test('ordinary rendering retains its existing 120-second and file budgets', () => {
  const bounds = localReviewBounds({});
  assert.equal(bounds.renderCpuSeconds, 120);
  assert.equal(bounds.renderTimeoutMs, 120000);
  assert.equal(bounds.maxArtifactBytes, 20 * 1024**2);
  assert.equal(bounds.maxSourceBytes, 50 * 1024**2);
  assert.equal(bounds.maxSourceSeconds, 30);
});
test('a four-minute allowance is impossible in production or on a remote emulator', () => {
  for (const [key, value] of [['NODE_ENV','production'],['STUDIO_BACKGROUND_DEMO','false'],
    ['UNIFIED_CREDITS_SANDBOX','false'],['UNIFIED_CREDITS_PROJECT_ID','autopromote-cc6d3'],
    ['FIRESTORE_EMULATOR_HOST','example.com:8080']])
    assert.throws(() => localReviewBounds({ ...demo, [key]: value }), /LOOPBACK_DEMO/);
});
test('the explicit local allowance accepts four minutes and rejects unbounded ranges', () => {
  const bounds = localReviewBounds(demo);
  assert.equal(validateLongReviewRequest({ start_time: 0, end_time: 240 }, '/render-viral-clip', bounds), true);
  assert.equal(bounds.renderCpuSeconds, 900);
  assert.equal(bounds.maxArtifactBytes, 512 * 1024**2);
  assert.equal(bounds.maxSourceSeconds, 240);
  for (const end_time of [0, -1, 241, Infinity, NaN])
    assert.throws(() => validateLongReviewRequest({ start_time: 0, end_time }, '/render-viral-clip', bounds), /RANGE_INVALID/);
  assert.throws(() => validateLongReviewRequest({ timeline_segments: [
    { start_time: 0, end_time: 150 }, { start_time: 0, end_time: 100 }] }, '/render-viral-clip', bounds), /RANGE_INVALID/);
});
test('analysis and delivery do not receive the longer rendering allowance', () => {
  for (const endpoint of ['/analyze-clips','/dispatch','/process'])
    assert.equal(validateLongReviewRequest({ start_time: 0, end_time: 240 }, endpoint, localReviewBounds(demo)), false);
});
