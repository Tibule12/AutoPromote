#!/usr/bin/env node
// Simulate a PayPal capture event by creating a completed payment doc and calling fulfillment
const admin = require('firebase-admin');
const { fulfillPayment } = require('../src/services/payments/fulfillmentService');

async function main(){
  if (admin.apps.length === 0) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'autopromote-cc6d3' });
  const db = admin.firestore();
  const userId = process.argv[2] || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
  const amount = Number(process.argv[3] || '10');
  const orderId = `SIM-${Date.now()}`;

  // create a payment doc as if PayPal sent a capture
  await db.collection('payments').doc(orderId).set({
    provider: 'paypal',
    providerOrderId: orderId,
    status: 'captured',
    amount,
    currency: 'USD',
    metadata: { type: 'ad_credits', amount, userId },
    raw: { simulated: true },
    createdAt: new Date().toISOString(),
  });

  console.log('[simulate] created payment doc', orderId, 'for user', userId, 'amount', amount);
  const res = await fulfillPayment(orderId, { payment_status: 'COMPLETED' });
  console.log('[simulate] fulfill result:', res);
  const user = await db.collection('users').doc(userId).get();
  console.log('[simulate] user adCredits after fulfill:', user.exists ? user.data().adCredits : null);
}

main().catch(err => { console.error(err); process.exit(1); });