#!/usr/bin/env node
// Seed a user's twitter connection with encrypted oauth1 tokens in the Firestore emulator
// Usage: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-twitter-connection.js

const admin = require('firebase-admin');

async function main(){
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'autopromote-cc6d3' });
  }
  const db = admin.firestore();
  const uid = process.argv[2] || 'bf04dPKELvVMivWoUyLsAVyw2sg2';

  // Replace these with encrypted token values you trust (from production snapshot)
  const encryptedOauth1AccessToken = process.env.SEED_ENCRYPTED_OAUTH1_ACCESS_TOKEN || '5jNI59YOngaSDOPkpb1LlS3U/2xxDrb8GMc423/u6jDrcCdyi3YhYI+G2ooMkjlDhVgtNyLFzcL5U9DlhTmKvxwubiCXj2yswTBr5eOT';
  const encryptedOauth1AccessSecret = process.env.SEED_ENCRYPTED_OAUTH1_ACCESS_SECRET || 'yEIdQO6GsVRFsl6GWO4uZRtyDWhh/NOsvFudNYM6mpj/O3M4oAk9/uY/p+LWZmtyy2Gbbf5oXBeCdxvnFgNcs/m/m7Vm+hDYFg==';

  console.log('Seeding twitter connection for uid', uid);
  const ref = db.collection('users').doc(uid).collection('connections').doc('twitter');
  await ref.set({
    oauth1_connected: true,
    oauth1_missing: false,
    encrypted_oauth1_access_token: encryptedOauth1AccessToken,
    encrypted_oauth1_access_secret: encryptedOauth1AccessSecret,
    oauth1_meta: { screen_name: 'Tibule1205', user_id: '1882965608935170049' },
    // Also seed OAuth2 encrypted tokens for postTweet path
    encrypted_access_token: process.env.SEED_ENCRYPTED_ACCESS_TOKEN || 'ug/sQfBjv5c7O4ZF5ta7AKZFxKUYpoGXojfavGsI8LEEvRJRydAPsxbY6lMfrVO2fZum9qwsSrlG9ez188QNFRHJ0eD4YPK0GtW+uZ9/CQeFNoBqF5/yeml9wJlyWTqSkKI5kqrnQ6ej9sPzr0TuH4P/4+ewcMM=',
    encrypted_refresh_token: process.env.SEED_ENCRYPTED_REFRESH_TOKEN || 'jKTNEl5ulivFHPDIoOh5xMg5ybO8B0i7olnOC0+YkChaKF1GznbPncqUylk8fgV7kyGro6ltdo3Gpaai8RoJJBM6g8esedpCenoiF3PIrcXsJycipa1bg6qomX+uklevNga0IVO+hA8UWitC7D8ckacMwAox1c4=',
    expires_at: Date.now() + 1000 * 60 * 60 * 24 * 30, // 30 days from now
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('✅ Seeded twitter connection');
}

main().catch(err => { console.error(err); process.exit(1); });
