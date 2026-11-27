const crypto = require('node:crypto');
const { fail } = require('../unifiedCredits/policy');

// One pending agreement per owner. In particular, a lost HTTP response must
// never cause another agreement to be created. Provider mutations have no
// automatic retry; recovery reads the same subscription/session instead.
async function createOwnedCheckout({ db, userId, planId, paypalPlanId, returnUrl, cancelUrl,
  create, read, now = Date.now }) {
  if (planId !== 'plus' || !userId || !/^P-[A-Z0-9]+$/i.test(paypalPlanId || ''))
    fail('INVALID_CHECKOUT_PLAN', 400);
  const ref = db.collection('processing_checkout_sessions').doc(
    crypto.createHash('sha256').update(userId).digest('hex'));
  const session = await db.runTransaction(async tx => {
    const [previous, subscription] = await tx.getAll(ref, db.collection('user_subscriptions').doc(userId));
    const sub = subscription.data();
    if (sub?.paypalSubscriptionId && ['active', 'cancel_at_period_end'].includes(sub.status) &&
        Date.parse(sub.expiresAt || sub.nextBillingDate || '') > now())
      fail('SUBSCRIPTION_ALREADY_ACTIVE', 409);
    const existing = previous.data();
    if (existing && existing.state !== 'closed') {
      if (existing.planId !== planId || existing.paypalPlanId !== paypalPlanId ||
          existing.returnUrl !== returnUrl || existing.cancelUrl !== cancelUrl)
        fail('CHECKOUT_SESSION_CONFLICT', 409);
      if (existing.state !== 'ready') fail('CHECKOUT_RECONCILIATION_REQUIRED', 503);
      return { ...existing, duplicate: true };
    }
    const record = { userId, planId, paypalPlanId, returnUrl, cancelUrl, state: 'creating',
      requestId: crypto.randomUUID(), createdAt: now() };
    tx.set(ref, record);
    return record;
  });
  if (session.duplicate) {
    const remote = await read(session.subscriptionId);
    if (remote?.id !== session.subscriptionId || remote.custom_id !== userId || remote.plan_id !== paypalPlanId)
      fail('CHECKOUT_OWNER_MISMATCH', 403);
    if (['CANCELLED', 'EXPIRED'].includes(remote.status)) {
      await db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        if (current?.requestId !== session.requestId) fail('CHECKOUT_SESSION_CONFLICT', 409);
        tx.update(ref, { state: 'closed', closedAt: now() });
      });
      // Do not create a second agreement in this request. A subsequent explicit
      // checkout action can start one after the terminal provider read above.
      fail('CHECKOUT_ENDED', 409);
    }
    if (['ACTIVE', 'APPROVED', 'SUSPENDED'].includes(remote.status))
      fail('CHECKOUT_ALREADY_APPROVED', 409);
    if (remote.status !== 'APPROVAL_PENDING') fail('CHECKOUT_RECONCILIATION_REQUIRED', 503);
    return { subscriptionId: session.subscriptionId, approvalUrl: session.approvalUrl, duplicate: true };
  }
  let remote;
  try {
    remote = await create(session.requestId);
    if (!/^I-[A-Z0-9]+$/i.test(remote?.id || '') ||
        (remote.custom_id && remote.custom_id !== userId) ||
        (remote.plan_id && remote.plan_id !== paypalPlanId)) fail('INVALID_CHECKOUT_RESPONSE', 503);
    const approvalUrl = remote.links?.find(link => link.rel === 'approve')?.href;
    let approval;
    try { approval = new URL(approvalUrl); } catch { fail('INVALID_APPROVAL_URL', 503); }
    if (approval.protocol !== 'https:' || !['www.paypal.com', 'www.sandbox.paypal.com'].includes(approval.hostname) ||
        approval.port || approval.username || approval.password || approval.hash)
      fail('INVALID_APPROVAL_URL', 503);
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current?.requestId !== session.requestId || current.state !== 'creating')
        fail('CHECKOUT_SESSION_CONFLICT', 409);
      tx.create(db.collection('subscription_intents').doc(remote.id), {
        userId, planId, paypalSubscriptionId: remote.id, checkoutRequestId: session.requestId,
        status: 'pending', amount: 4.99, createdAt: new Date(now()).toISOString() });
      tx.update(ref, { state: 'ready', subscriptionId: remote.id, approvalUrl });
    });
    return { subscriptionId: remote.id, approvalUrl, duplicate: false };
  } catch (error) {
    // No releasing/retrying an ambiguous provider mutation. Keep the durable
    // request ID for provider reconciliation, including if persistence failed.
    await ref.set({ state: 'uncertain', updatedAt: now(),
      ...(remote?.id ? { subscriptionId: remote.id } : {}) }, { merge: true }).catch(() => {});
    throw error;
  }
}
module.exports = { createOwnedCheckout };
