#!/usr/bin/env node
// Verify credentials using OAuth1 tokens stored in Firestore emulator
// Usage: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/verify-credentials-oauth1.js [uid]

require('dotenv').config();
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const { decryptToken } = require('../src/services/secretVault');
const { buildOauth1Header } = require('../src/utils/oauth1');

async function main(){
  if (admin.apps.length === 0) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'autopromote-cc6d3' });
  const db = admin.firestore();
  const uid = process.argv[2] || 'bf04dPKELvVMivWoUyLsAVyw2sg2';

  const snap = await db.collection('users').doc(uid).collection('connections').doc('twitter').get();
  if (!snap.exists) throw new Error('twitter connection not found for uid '+uid);
  const d = snap.data();

  const tokenEnc = d.encrypted_oauth1_access_token || d.oauth1_access_token;
  const secretEnc = d.encrypted_oauth1_access_secret || d.oauth1_access_secret;
  const oauthToken = decryptToken(tokenEnc);
  const oauthSecret = decryptToken(secretEnc);
  if (!oauthToken || !oauthSecret) throw new Error('no oauth1 tokens available');

  const consumerKey = process.env.TWITTER_CONSUMER_KEY || process.env.TWITTER_CLIENT_ID;
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET || process.env.TWITTER_CLIENT_SECRET;
  if (!consumerKey || !consumerSecret) throw new Error('missing consumer key/secret env vars');

  const url = 'https://api.twitter.com/1.1/account/verify_credentials.json';
  const authHeader = buildOauth1Header({ method: 'GET', url, consumerKey, consumerSecret, token: oauthToken, tokenSecret: oauthSecret });

  const r = await fetch(url, { method: 'GET', headers: { Authorization: authHeader } });
  const txt = await r.text();
  console.log('status', r.status);
  try{ console.log('body', JSON.stringify(JSON.parse(txt), null, 2)); }catch(e){ console.log('raw', txt.slice(0,1000)); }
  if (!r.ok) process.exit(2);
}

main().catch(err => { console.error(err && err.message); console.error(err && err.stack); process.exit(1); });