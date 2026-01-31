#!/usr/bin/env node
require('dotenv').config();
const admin = require('firebase-admin');
const { decryptToken } = require('../src/services/secretVault');

async function main(){
  if (admin.apps.length === 0) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'autopromote-cc6d3' });
  const db = admin.firestore();
  const uid = process.argv[2] || 'bf04dPKELvVMivWoUyLsAVyw2sg2';

  const snap = await db.collection('users').doc(uid).collection('connections').doc('linkedin').get();
  if (!snap.exists) {
    console.log('No LinkedIn connection for uid', uid);
    process.exit(0);
  }
  const data = snap.data();
  console.log('LinkedIn doc found. Fields:', Object.keys(data));
  if (data.tokens) {
    const dec = decryptToken(data.tokens);
    console.log('Decrypted tokens (truncated):', dec && dec.slice && dec.slice(0,80));
  } else if (data.encrypted_access_token) {
    console.log('Has encrypted_access_token, decrypting...');
    const access = decryptToken(data.encrypted_access_token);
    console.log('access token truncated:', access && access.slice && access.slice(0,80));
  } else {
    console.log('No tokens present in LinkedIn doc');
  }
}

main().catch(err => { console.error(err); process.exit(2); });