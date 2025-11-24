const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const region = 'us-central1';

exports.getPinterestAuthUrl = functions.region(region).https.onCall(async (data, context) => {
  const clientId = process.env.PINTEREST_CLIENT_ID;
  const redirectUri = process.env.PINTEREST_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new functions.https.HttpsError('failed-precondition', 'Pinterest client config missing.');
  }
  const scope = (process.env.PINTEREST_SCOPES || 'pins:read,pins:write,boards:read');
  const state = data && data.state ? data.state : Math.random().toString(36).slice(2);
  const authUrl = `https://www.pinterest.com/oauth/?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
  return { url: authUrl, state };
});

exports.pinterestOAuthCallback = functions.region(region).https.onRequest(async (req, res) => {
  const clientId = process.env.PINTEREST_CLIENT_ID;
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
  const redirectUri = process.env.PINTEREST_REDIRECT_URI;
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    if (!(clientId && clientSecret && redirectUri)) {
      // Store a placeholder token shape so UI can still validate callback
      try { await admin.firestore().collection('oauth_states').doc(state || 'anon').set({ lastCallback: Date.now(), platform: 'pinterest', placeholder: true }, { merge: true }); } catch(_){}
      return res.status(200).send('Pinterest callback received; server missing client config for token exchange.');
    }
    // Exchange code for tokens
    const tokenUrl = 'https://api.pinterest.com/v5/oauth/token';
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret });
    const tokenRes = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tokenJson = await tokenRes.json();
    // Try to resolve uid from oauth_states mapping if provided
    let uid = null;
    if (state) {
      try {
        const sd = await admin.firestore().collection('oauth_states').doc(state).get();
        if (sd.exists) { const s = sd.data(); if (!s.expiresAt || new Date(s.expiresAt) > new Date()) uid = s.uid || null; try{ await admin.firestore().collection('oauth_states').doc(state).delete(); } catch(_){} }
      } catch (_) {}
    }
    const { encryptToken } = require('./secretVault');
    const storeData = { connected: true, tokens: encryptToken(JSON.stringify(tokenJson)), updatedAt: new Date().toISOString() };
    if (uid && uid !== 'anon') {
      const userRef = admin.firestore().collection('users').doc(uid);
      await userRef.collection('connections').doc('pinterest').set(storeData, { merge: true });
    } else {
      // fallback: store in central collection for debugging
      await admin.firestore().collection('pinterest_tokens').add({ tokenJson: encryptToken(JSON.stringify(tokenJson)), createdAt: Date.now() });
    }
    return res.status(200).send('Pinterest OAuth callback received. You can close this window.');
  } catch (e) {
    console.error('Pinterest callback error:', e);
    return res.status(500).send('Pinterest callback error: ' + (e && e.message ? e.message : 'unknown'));
  }
});
