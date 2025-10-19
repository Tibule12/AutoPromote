#!/usr/bin/env node
// scripts/get-tiktok-lastAuthUrl.js
// Usage: node scripts/get-tiktok-lastAuthUrl.js <uid>
// Reads users/{uid}/oauth_state/tiktok and prints the document for debugging.

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: node scripts/get-tiktok-lastAuthUrl.js <uid>');
  process.exit(2);
}

async function main() {
  try {
    const { db } = require('../firebaseAdmin');
    const docRef = db.collection('users').doc(uid).collection('oauth_state').doc('tiktok');
    const snap = await docRef.get();
    if (!snap.exists) {
      console.error('No oauth_state/tiktok doc found for uid:', uid);
      process.exit(1);
    }
    const data = snap.data();
    console.log('users/%s/oauth_state/tiktok ->', uid, JSON.stringify(data, null, 2));
    if (data.lastAuthUrl) {
      console.log('\nlastAuthUrl:\n', data.lastAuthUrl);
    }
    process.exit(0);
  } catch (e) {
    console.error('Error reading Firestore:', e.message || e);
    process.exit(3);
  }
}

main();
