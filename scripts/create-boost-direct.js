#!/usr/bin/env node
// Create a boost directly in Firestore to simulate the flow (deducts adCredits)
const admin = require('firebase-admin');
const { recordUsage } = require('../src/services/usageLedgerService');

async function main(){
  if (admin.apps.length === 0) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'autopromote-cc6d3' });
  const db = admin.firestore();
  const uid = process.argv[2] || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
  const contentId = process.argv[3] || 'test-content-1';
  const targetViews = Number(process.argv[4] || '5000');
  const durationHours = Number(process.argv[5] || '48');

  const cost = Math.ceil(targetViews / 1000) * 1.0;
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? userSnap.data() : {};
  const adCredits = Number(user.adCredits || 0);
  if (adCredits < cost) {
    console.error('insufficient credits:', adCredits, 'need', cost);
    process.exit(2);
  }
  await userRef.set({ adCredits: admin.firestore.FieldValue.increment(-cost) }, { merge: true });
  await recordUsage({ type: 'ad_credit_used', userId: uid, amount: cost, meta: { contentId, targetViews } });

  const boost = {
    contentId,
    userId: uid,
    packageId: 'paid_direct',
    targetViews,
    durationHours,
    cost,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paidByCredits: true,
    isFree: false,
  };

  const ref = await db.collection('viral_boosts').add(boost);
  console.log('Boost created', ref.id);

  // simulate report in 5s
  setTimeout(async ()=>{
    const views = Math.max(0, Math.round(targetViews * (0.6 + Math.random() * 0.8)));
    const engagements = Math.round(views * (0.01 + Math.random() * 0.05));
    const followers = Math.round(engagements * (0.05 + Math.random() * 0.2));
    const cpv = boost.cost && views ? boost.cost / views : 0;
    const report = { boostId: ref.id, contentId, userId: uid, views, engagements, followersGained: followers, cpv, generatedAt: new Date().toISOString() };
    await db.collection('viral_boosts').doc(ref.id).collection('report').doc('summary').set(report, { merge: true });
    await db.collection('viral_boosts').doc(ref.id).set({ status: 'completed', updatedAt: new Date().toISOString() }, { merge: true });
    console.log('Report written for boost', ref.id);
  }, 5000);
}

main().catch(err => { console.error(err); process.exit(1); });