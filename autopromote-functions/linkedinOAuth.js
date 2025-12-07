const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const region = 'us-central1';

exports.getLinkedInAuthUrl = functions.region(region).https.onCall(async (data, context) => {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new functions.https.HttpsError('failed-precondition', 'LinkedIn client config missing.');
  }
  const scopes = (process.env.LINKEDIN_SCOPES || 'r_liteprofile r_emailaddress');
  const state = data && data.state ? data.state : (require('crypto').randomBytes(8).toString('hex'));
  const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scopes)}`;
  return { url, state };
});

exports.linkedinOAuthCallback = functions.region(region).https.onRequest(async (req, res) => {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    if (!(clientId && clientSecret && redirectUri)) {
      try { await admin.firestore().collection('oauth_states').doc(state || 'anon').set({ lastCallback: Date.now(), platform: 'linkedin', placeholder:true }, { merge: true }); } catch(_){}
      return res.status(200).send('LinkedIn callback received; server missing client config for token exchange.');
    }
    const tokenUrl = 'https://www.linkedin.com/oauth/v2/accessToken';
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret });
    const tokenRes = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tokenJson = await tokenRes.json();
    let uid = null;
    const { encryptToken } = require('./secretVault');
    if (state) {
      try {
        const sd = await admin.firestore().collection('oauth_states').doc(state).get();
        if (sd.exists) { const s = sd.data(); if (!s.expiresAt || new Date(s.expiresAt) > new Date()) uid = s.uid || null; try{ await admin.firestore().collection('oauth_states').doc(state).delete(); } catch(_){} }
      } catch (_) {}
    }
    const storeData = { connected:true, tokens: encryptToken(JSON.stringify(tokenJson)), updatedAt: new Date().toISOString() };
    if (uid && uid !== 'anon') {
      await admin.firestore().collection('users').doc(uid).collection('connections').doc('linkedin').set(storeData, { merge: true });
    } else {
      await admin.firestore().collection('linkedin_tokens').add({ tokenJson: encryptToken(JSON.stringify(tokenJson)), createdAt: Date.now() });
    }
    return res.status(200).send('LinkedIn OAuth callback received. You can close this window.');
  } catch (e) {
    console.error('LinkedIn callback error', e);
    return res.status(500).send('LinkedIn callback error: ' + (e && e.message ? e.message : 'unknown'));
  }
});
