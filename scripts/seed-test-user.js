#!/usr/bin/env node
// Seed a test user with adCredits and reset freeBoostUsed false
const admin = require('firebase-admin');
async function main(){
  if (admin.apps.length === 0) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'autopromote-cc6d3' });
  const db = admin.firestore();
  const uid = process.argv[2] || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
  console.log('Seeding user', uid);
  await db.collection('users').doc(uid).set({ email: 'testuser@example.com', name: 'Test User', adCredits: 50.0, freeBoostUsed: false, createdAt: new Date().toISOString() }, { merge: true });
  console.log('Done');
}
main().catch(err => { console.error(err); process.exit(1); });