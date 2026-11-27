const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createSandboxDatabase } = require('../../src/services/unifiedCredits/runtime');
const { createOwnedCheckout } = require('../../src/services/payments/checkoutSession');
const db = createSandboxDatabase();
after(() => db.terminate());
function fixture() {
  const userId = 'checkout-' + crypto.randomUUID();
  const remote = { id: 'I-' + crypto.randomBytes(8).toString('hex').toUpperCase(), custom_id: userId,
    plan_id: 'P-LAUNCH', status: 'APPROVAL_PENDING', links: [{ rel: 'approve', href: 'https://www.paypal.com/webapps/billing/subscriptions?ba_token=test' }] };
  let posts = 0, reads = 0;
  const input = { db, userId, planId: 'plus', paypalPlanId: remote.plan_id,
    returnUrl: 'https://autopromote.org/pricing', cancelUrl: 'https://autopromote.org/pricing',
    create: async key => { assert.match(key, /^[a-f0-9-]{36}$/); posts++; return remote; },
    read: async id => { assert.equal(id, remote.id); reads++; return remote; } };
  return { input, remote, get posts() { return posts; }, get reads() { return reads; } };
}
test('simultaneous checkout requests create one agreement; a retry reads and reuses its approval', async () => {
  const f = fixture();
  const results = await Promise.allSettled([createOwnedCheckout(f.input), createOwnedCheckout(f.input)]);
  assert.ok(results.some(r => r.status === 'fulfilled'));
  assert.equal(f.posts, 1);
  const repeated = await createOwnedCheckout(f.input);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.subscriptionId, f.remote.id);
  assert.equal(f.posts, 1);
  assert.ok(f.reads >= 1);
});
test('lost provider response retains its durable claim and never creates another agreement', async () => {
  const f = fixture(); let attempts = 0;
  const input = { ...f.input, create: async () => { attempts++; throw Error('response lost after provider accepted'); } };
  await assert.rejects(createOwnedCheckout(input), /response lost/);
  await assert.rejects(createOwnedCheckout(input), { code: 'CHECKOUT_RECONCILIATION_REQUIRED' });
  assert.equal(attempts, 1);
});
test('active legacy agreements prevent a second purchase and preserve the existing subscription', async () => {
  const f = fixture();
  const legacy = { paypalSubscriptionId: 'I-LEGACY', planId: 'pro', status: 'active',
    nextBillingDate: new Date(Date.now() + 86400000).toISOString() };
  await db.collection('user_subscriptions').doc(f.input.userId).set(legacy);
  await assert.rejects(createOwnedCheckout(f.input), { code: 'SUBSCRIPTION_ALREADY_ACTIVE' });
  assert.equal(f.posts, 0);
  assert.deepEqual((await db.collection('user_subscriptions').doc(f.input.userId).get()).data(), legacy);
});
test('approval is owner-bound and an ended provider agreement requires another explicit checkout action', async () => {
  const f = fixture(); await createOwnedCheckout(f.input);
  f.remote.custom_id = 'another-owner';
  await assert.rejects(createOwnedCheckout(f.input), { code: 'CHECKOUT_OWNER_MISMATCH' });
  f.remote.custom_id = f.input.userId; f.remote.status = 'CANCELLED';
  await assert.rejects(createOwnedCheckout(f.input), { code: 'CHECKOUT_ENDED' });
  assert.equal(f.posts, 1);
  f.remote.id = 'I-' + crypto.randomBytes(8).toString('hex').toUpperCase();
  f.remote.status = 'APPROVAL_PENDING';
  await createOwnedCheckout(f.input);
  assert.equal(f.posts, 2);
});
