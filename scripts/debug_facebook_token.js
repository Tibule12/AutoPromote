#!/usr/bin/env node
// Debug helper: read Firestore facebook connection, decrypt token, call Facebook debug_token and /me/accounts
// Usage: node scripts/debug_facebook_token.js <UID>

const fetch = require('node-fetch');
const crypto = require('crypto');
const path = require('path');

// Require firebase admin shim from project
const { db } = require(path.join(__dirname, '..', 'src', 'firebaseAdmin'));
const { decryptToken } = require(path.join(__dirname, '..', 'src', 'services', 'secretVault'));

function appsecretProofFor(token) {
  const secret = process.env.FB_CLIENT_SECRET;
  try {
    if (!secret || !token) return null;
    return crypto.createHmac('sha256', String(secret)).update(String(token)).digest('hex');
  } catch (e) {
    return null;
  }
}

async function main() {
  const uid = process.argv[2];
  if (!uid) {
    console.error('Usage: node scripts/debug_facebook_token.js <UID>');
    process.exit(2);
  }

  try {
    const docRef = db.collection('users').doc(uid).collection('connections').doc('facebook');
    const snap = await docRef.get();
    if (!snap.exists) {
      console.error('No facebook connection doc for uid', uid);
      process.exit(1);
    }
    const data = snap.data();
    console.log('Connection doc keys:', Object.keys(data));
    console.log('hasEncryption:', !!data.hasEncryption, 'encrypted_user_access_token present:', !!data.encrypted_user_access_token, 'user_access_token present:', !!data.user_access_token);

    const stored = data.user_access_token || data.encrypted_user_access_token || null;
    const token = stored ? decryptToken(stored) : null;
    if (!token) console.warn('No usable user token found after decrypt');

    const fbId = process.env.FB_CLIENT_ID;
    const fbSecret = process.env.FB_CLIENT_SECRET;
    if (!fbId || !fbSecret) console.warn('FB_CLIENT_ID or FB_CLIENT_SECRET missing in env; debug_token may fail');

    if (token && fbId && fbSecret) {
      const appAccess = `${fbId}|${fbSecret}`;
      console.log('\nCalling debug_token...');
      const dbgRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appAccess)}`);
      const dbgJson = await dbgRes.json();
      console.log('debug_token result:', JSON.stringify(dbgJson, null, 2));

      console.log('\nCalling /me/accounts to list pages...');
      const proof = appsecretProofFor(token);
      const accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(token)}${proof ? `&appsecret_proof=${proof}` : ''}`;
      const accRes = await fetch(accountsUrl);
      const accJson = await accRes.json();
      console.log('/me/accounts result:', JSON.stringify(accJson, null, 2));
    } else {
      console.log('Skipping Facebook API calls due to missing token or app credentials.');
    }

    // Print pages field if present
    console.log('\nStored pages count:', Array.isArray(data.pages) ? data.pages.length : 0);
    if (Array.isArray(data.pages) && data.pages.length > 0) {
      console.log('Sample page keys:', Object.keys(data.pages[0] || {}));
    }
    // Print recent audits if any
    try {
      const auditsCol = docRef.collection('audits');
      const auditsSnap = await auditsCol.orderBy
        ? await auditsCol.orderBy('createdAt', 'desc').limit(5).get()
        : await auditsCol.get();
      if (auditsSnap && auditsSnap.docs && auditsSnap.docs.length > 0) {
        console.log('\nRecent audits:');
        for (const a of auditsSnap.docs) {
          console.log('-', a.id, a.data ? a.data() : a);
        }
      } else {
        console.log('\nNo audits found.');
      }
    } catch (e) {
      console.warn('Could not read audits:', e && e.message ? e.message : e);
    }
  } catch (e) {
    console.error('Error during debug run:', e && e.message ? e.message : e);
    process.exit(3);
  }
}

main();
