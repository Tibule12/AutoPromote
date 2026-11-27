const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createSandboxDatabase } = require('../../src/services/unifiedCredits/runtime');
const { createProcessingService } = require('../../src/services/processingTokens/service');
const db = createSandboxDatabase();
after(() => db.terminate());
let now = Date.parse('2027-03-01T00:00:00Z');
const service = createProcessingService({ db, now: () => now, entitlement: async () => 'free',
  operations: { publish: { tokens: 2, maxMicros: 70000, maxSeconds: 120, resource: 'network', retries: 0 } } });
const uid = () => 'scheduled-' + crypto.randomUUID();
const request = (notBefore = 0) => ({ operation: 'publish', requestId: crypto.randomUUID(),
  fingerprint: 'owned-private-channel-and-exact-source', approvedTokens: 2, notBefore });
const settle = (u, r, success = true) => service.settle(u, r.requestId,
  { eventId: 'confirmed-' + r.requestId, success, actualMicros: success ? 10000 : 0, stopped: true });

test('a future publication holds funding without occupying the only execution slot', async () => {
  await service.configure({ enabled: true });
  const u = uid(), scheduled = request(now + 60000), immediate = request();
  await service.reserve(u, scheduled);
  assert.equal((await service.status(u)).activeJobs, 0);
  await assert.rejects(service.start(u, scheduled.requestId), { code: 'PUBLICATION_NOT_DUE' });
  await service.reserve(u, immediate);
  await service.start(u, immediate.requestId);
  now += 60000;
  await assert.rejects(service.start(u, scheduled.requestId), { code: 'CONCURRENT_JOB_LIMIT' });
  await settle(u, immediate);
  await service.start(u, scheduled.requestId);
  await service.authorizeDispatch(u, scheduled.requestId);
  await assert.rejects(service.authorizeDispatch(u, scheduled.requestId), { code: 'JOB_ALREADY_DISPATCHED' });
  await settle(u, scheduled);
  const status = await service.status(u);
  assert.equal(status.activeJobs, 0);
  assert.equal(status.remaining, 96);
  assert.equal(status.rollingSpentTokens, 4);
});

test('concurrent due schedules acquire exactly one slot and cancellation cannot release another job slot', async () => {
  const a = uid(), b = uid(), ra = request(now + 1000), rb = request(now + 1000);
  await Promise.all([service.reserve(a, ra), service.reserve(b, rb)]);
  now += 1000;
  const attempts = await Promise.allSettled([service.start(a, ra.requestId), service.start(b, rb.requestId)]);
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(r => r.status === 'rejected').reason.code, 'CONCURRENT_JOB_LIMIT');
  const winner = attempts[0].status === 'fulfilled' ? [a, ra] : [b, rb];
  const loser = attempts[0].status === 'rejected' ? [a, ra] : [b, rb];
  await settle(...loser, false);
  assert.equal((await service.status(winner[0])).activeJobs, 1);
  assert.equal((await db.collection('processing_control').doc('global').get()).data().active, 1);
  await settle(...winner);
  assert.equal((await db.collection('processing_control').doc('global').get()).data().active, 0);
});

test('six-day reset preserves a scheduled liability and due publication is charged once', async () => {
  const u = uid(), r = request(now + 7 * 86400000);
  await service.reserve(u, r);
  now += 6 * 86400000;
  assert.equal((await service.status(u)).remaining, 98);
  assert.equal((await service.status(u)).activeJobs, 0);
  await assert.rejects(service.reserve(u, { ...r, notBefore: r.notBefore + 1 }), { code: 'IDEMPOTENCY_CONFLICT' });
  now += 86400000;
  await service.start(u, r.requestId);
  await settle(u, r);
  await settle(u, r);
  const status = await service.status(u);
  assert.equal(status.remaining, 100);
  assert.equal(status.rollingSpentTokens, 2);
  assert.equal(status.activeJobs, 0);
});
