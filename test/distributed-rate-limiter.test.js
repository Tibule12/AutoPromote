'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const redisPath = require.resolve('../src/services/distributed/redisClient');
const limiterPath = require.resolve('../src/middlewares/distributedRateLimiter');
function create(redis, options = {}) {
  const old = require.cache[redisPath];
  require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: { getRedis: () => redis } };
  delete require.cache[limiterPath];
  try { return require(limiterPath).distributedRateLimiter({ capacity: 2, refillPerSec: 0, windowHint: `test-${Math.random()}`, ...options }); }
  finally { if (old) require.cache[redisPath] = old; else delete require.cache[redisPath]; delete require.cache[limiterPath]; }
}
async function request(limiter, ip = 'test-ip', uid) {
  const result = { next: 0, headers: {} };
  const response = { setHeader: (k, v) => { result.headers[k] = v; }, status: n => { result.status = n; return response; }, json: value => { result.body = value; return response; } };
  await limiter({ ip, ...(uid ? { user: { uid } } : {}) }, response, () => { result.next++; });
  return result;
}
test('offline/reconnecting Redis is never queued and local limits remain enforced', async () => {
  for (const status of ['connecting', 'reconnecting', 'end']) {
    let evals = 0; const limiter = create({ status, eval: () => { evals++; return new Promise(() => {}); } });
    assert.equal((await request(limiter)).next, 1); assert.equal((await request(limiter)).next, 1);
    const rejected = await request(limiter); assert.equal(rejected.status, 429); assert.equal(rejected.next, 0); assert.equal(evals, 0);
  }
});
test('healthy distributed rejection preserves retry and never reaches the handler', async () => {
  let evals = 0; const limiter = create({ status: 'ready', eval: async () => { evals++; return [0, 8]; } });
  const r = await request(limiter); assert.equal(r.status, 429); assert.equal(r.headers['Retry-After'], 8); assert.equal(r.body.distributed, true); assert.equal(r.next, 0); assert.equal(evals, 1);
});
test('healthy distributed allowance and recovery resume normal distributed behavior', async () => {
  let evals = 0; const redis = { status: 'reconnecting', eval: async () => { evals++; return [1, 0]; } }; const limiter = create(redis);
  assert.equal((await request(limiter)).next, 1); assert.equal(evals, 0);
  redis.status = 'ready'; assert.equal((await request(limiter)).next, 1); assert.equal(evals, 1);
});
test('ready-client errors use a limited fallback rather than unrestricted admission', async () => {
  const limiter = create({ status: 'ready', eval: async () => { throw new Error('Unavailable'); } });
  assert.equal((await request(limiter)).next, 1); assert.equal((await request(limiter)).next, 1); assert.equal((await request(limiter)).status, 429);
});
test('local outage buckets retain independent users and missing-Redis behavior', async () => {
  const limiter = create(null);
  await request(limiter, 'shared-ip', 'one'); await request(limiter, 'shared-ip', 'one');
  assert.equal((await request(limiter, 'shared-ip', 'one')).status, 429);
  assert.equal((await request(limiter, 'shared-ip', 'two')).next, 1);
});
