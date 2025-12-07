const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const region = 'us-central1';

exports.getInstagramAuthUrl = functions.region(region).https.onCall(async (data, context) => {
  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new functions.https.HttpsError('failed-precondition', 'Instagram client config missing.');
  }
  const state = data && data.state ? data.state : (require('crypto').randomBytes(8).toString('hex'));
  const url = `https://api.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(process.env.INSTAGRAM_SCOPES || 'user_profile,user_media')}&response_type=code&state=${encodeURIComponent(state)}`;
  return { url, state };
});

exports.instagramOAuthCallback = functions.region(region).https.onRequest(async (req, res) => {
  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    if (!(clientId && clientSecret && redirectUri)) {
      try { await admin.firestore().collection('oauth_states').doc(state || 'anon').set({ lastCallback: Date.now(), platform: 'instagram', placeholder:true }, { merge: true }); } catch(_){}
      return res.status(200).send('Instagram callback received; server missing client config for token exchange.');
    }
    const tokenUrl = 'https://api.instagram.com/oauth/access_token';
    const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    const tokenRes = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tokenJson = await tokenRes.json();
    let uid = null;
    const { encryptToken } = require('./secretVault');
    if (state) {
      try { const sd = await admin.firestore().collection('oauth_states').doc(state).get(); if (sd.exists) { const s = sd.data(); if (!s.expiresAt || new Date(s.expiresAt) > new Date()) uid = s.uid || null; try{ await admin.firestore().collection('oauth_states').doc(state).delete(); } catch(_){} }} catch(_){}
    }
    const storeData = { connected: true, tokens: encryptToken(JSON.stringify(tokenJson)), updatedAt: new Date().toISOString() };
    if (uid && uid !== 'anon') { await admin.firestore().collection('users').doc(uid).collection('connections').doc('instagram').set(storeData, { merge: true }); } else { await admin.firestore().collection('instagram_tokens').add({ tokenJson: encryptToken(JSON.stringify(tokenJson)), createdAt: Date.now() }); }
    return res.status(200).send('Instagram OAuth callback received. You can close this window.');
  } catch (e) { console.error('Instagram callback error', e); return res.status(500).send('Instagram callback error: ' + (e && e.message ? e.message : 'unknown')); }
});
