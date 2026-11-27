const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { createSandboxDatabase } = require('../../src/services/unifiedCredits/runtime');
const { createProcessingService } = require('../../src/services/processingTokens/service');
const db = createSandboxDatabase();
after(() => db.terminate());
async function fixture() {
  const prefix = 'cashcap_' + crypto.randomBytes(8).toString('hex') + '_';
  const scope = { collection: name => db.collection(prefix + name), runTransaction: fn => db.runTransaction(fn) };
  const now = Date.parse('2027-05-01T12:00:00Z');
  const service = createProcessingService({ db: scope, now: () => now, entitlement: async () => 'free',
    operations: {
      publish: { tokens: 2, maxMicros: 70000, maxSeconds: 120, resource: 'network', retries: 0 },
      ai: { tokens: 1, maxMicros: 20000, maxSeconds: 30, resource: 'external-api', retries: 0 },
    } });
  await service.configure({ enabled: true });
  return { scope, service, request: (operation, notBefore = now + 60000) => ({ operation, notBefore,
    requestId: crypto.randomUUID(), fingerprint: 'owned-input', approvedTokens: operation === 'ai' ? 1 : 2 }) };
}
test('a pending publication cannot consume the external-AI sub-limit; global cash and one running slot remain enforced', async () => {
  const { service, scope, request } = await fixture();
  await service.reserve('owner', request('publish'));
  const ai = request('ai', 0);
  await service.reserve('owner', ai);
  await service.start('owner', ai.requestId);
  await assert.rejects(service.reserve('another', request('ai', 0)), { code: 'CONCURRENT_JOB_LIMIT' });
  await service.settle('owner', ai.requestId, { eventId: 'provider-completed', success: true, actualMicros: 5000, stopped: true });
  const global = (await scope.collection('processing_control').doc('global').get()).data();
  assert.equal(global.reservedMicros, 70000);
  assert.equal(global.apiReservedMicros, 0);
  assert.equal(global.freeReservedMicros, 70000);
  assert.equal((await service.status('owner')).remaining, 97);
});
test('concurrent future AI holds cannot exceed the daily AI cap or be erased by old-counter migration', async () => {
  const { service, scope, request } = await fixture();
  await service.reserve('owner', request('publish'));
  await service.reserve('owner', request('ai'));
  const control = scope.collection('processing_control').doc('global');
  await control.update({ apiReservedMicros: FieldValue.delete(), freeReservedMicros: FieldValue.delete() });
  await service.reserve('owner', request('ai'));
  const global = (await control.get()).data();
  assert.equal(global.apiReservedMicros, 40000);
  assert.equal(global.freeReservedMicros, 110000);
  await assert.rejects(service.reserve('owner', request('ai')), { code: 'EXTERNAL_API_BUDGET' });
  assert.equal((await service.status('owner')).remaining, 96);
});
