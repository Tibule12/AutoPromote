// subscriptionSyncService.js - map Stripe webhook events to user subscription state
const { db } = require('../firebaseAdmin');

async function applyStripeEvent(event) {
  if (!event || !event.type) return;
  switch(event.type) {
    case 'checkout.session.completed': {
      const session = event.data && event.data.object;
      if (session && session.client_reference_id && session.subscription) {
        await db.collection('users').doc(session.client_reference_id).set({
          plan: {
            id: session.display_items ? inferPlan(session) : (session.metadata && session.metadata.plan) || 'pro',
            source: 'stripe',
            subscriptionId: session.subscription,
            updatedAt: new Date().toISOString()
          }
        }, { merge: true });
      }
      break; }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data && event.data.object;
      if (sub && sub.metadata && sub.metadata.userId) {
        const status = sub.status;
        await db.collection('users').doc(sub.metadata.userId).set({
          plan: {
            id: sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].plan && sub.items.data[0].plan.nickname || 'unknown',
            source: 'stripe',
            subscriptionId: sub.id,
            status,
            cancelAt: sub.cancel_at ? new Date(sub.cancel_at*1000).toISOString() : null,
            updatedAt: new Date().toISOString()
          }
        }, { merge: true });
      }
      break; }
    default: break;
  }
}

function inferPlan(session) {
  try {
    const item = session.display_items[0];
    return (item && item.plan && item.plan.nickname) || 'pro';
  } catch(_) { return 'pro'; }
}

module.exports = { applyStripeEvent };