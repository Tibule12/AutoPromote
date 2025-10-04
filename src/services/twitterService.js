// twitterService.js
// Handles OAuth2 PKCE flow & token refresh for Twitter (X) user-context posting

const fetch = require('node-fetch');
const crypto = require('crypto');
const { db, admin } = require('../firebaseAdmin');

const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const AUTH_BASE = 'https://twitter.com/i/oauth2/authorize';
const SCOPES = (process.env.TWITTER_SCOPES || 'tweet.read tweet.write users.read offline.access').split(/\s+/).filter(Boolean);

function generatePkcePair() {
  const code_verifier = crypto.randomBytes(64).toString('base64url');
  const challenge = crypto.createHash('sha256').update(code_verifier).digest('base64')
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return { code_verifier, code_challenge: challenge };
}

async function createAuthStateDoc({ uid, code_verifier }) {
  const state = crypto.randomBytes(16).toString('hex');
  await db.collection('oauth_states').doc(state).set({
    uid,
    code_verifier,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return state;
}

async function consumeAuthState(state) {
  if (!state) return null;
  const ref = db.collection('oauth_states').doc(state);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.delete().catch(()=>{}); // one-time use
  return snap.data();
}

function buildAuthUrl({ clientId, redirectUri, state, code_challenge }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
    code_challenge,
    code_challenge_method: 'S256'
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

async function exchangeCode({ code, code_verifier, redirectUri, clientId }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier,
    client_id: clientId
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const json = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(json.error_description || json.error || 'twitter_token_exchange_failed');
  return json; // { token_type, expires_in, access_token, scope, refresh_token }
}

async function refreshToken({ refresh_token, clientId }) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token,
    client_id: clientId
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const json = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(json.error_description || json.error || 'twitter_refresh_failed');
  return json;
}

// Optional at-rest encryption for tokens
const ENC_KEY_RAW = process.env.TWITTER_TOKEN_ENCRYPTION_KEY || null; // Provide 32+ chars for good entropy

function deriveKey() {
  if (!ENC_KEY_RAW) return null;
  // Derive a 32-byte key via SHA-256 of provided secret
  return crypto.createHash('sha256').update(ENC_KEY_RAW).digest();
}

function encryptToken(plaintext) {
  if (!plaintext) return null;
  const key = deriveKey();
  if (!key) return plaintext; // store plaintext if no key
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const packed = Buffer.concat([iv, tag, enc]).toString('base64');
    return packed;
  } catch (e) {
    console.warn('[Twitter][encryptToken] failed, storing plaintext:', e.message);
    return plaintext;
  }
}

function decryptToken(stored) {
  if (!stored) return null;
  const key = deriveKey();
  if (!key) return stored; // plaintext path
  try {
    const buf = Buffer.from(stored, 'base64');
    if (buf.length < 16) return stored; // not encrypted or malformed
    const iv = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const data = buf.slice(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return dec;
  } catch (e) {
    // Return original so caller may attempt usage (could have been plaintext)
    console.warn('[Twitter][decryptToken] failed, returning raw value:', e.message);
    return stored;
  }
}

async function storeUserTokens(uid, tokens) {
  const ref = db.collection('users').doc(uid).collection('connections').doc('twitter');
  const expires_at = Date.now() + (tokens.expires_in ? tokens.expires_in * 1000 : 3600 * 1000);
  const useEncryption = !!deriveKey();
  const doc = {
    token_type: tokens.token_type,
    scope: tokens.scope,
    expires_at,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    hasEncryption: useEncryption
  };
  if (useEncryption) {
    doc.encrypted_access_token = encryptToken(tokens.access_token);
    if (tokens.refresh_token) doc.encrypted_refresh_token = encryptToken(tokens.refresh_token);
    // remove legacy plaintext if re-writing
    doc.access_token = admin.firestore.FieldValue.delete();
    doc.refresh_token = admin.firestore.FieldValue.delete();
  } else {
    doc.access_token = tokens.access_token;
    doc.refresh_token = tokens.refresh_token || null;
  }
  await ref.set(doc, { merge: true });
  return { expires_at };
}

async function getValidAccessToken(uid) {
  const clientId = process.env.TWITTER_CLIENT_ID;
  if (!clientId) throw new Error('TWITTER_CLIENT_ID missing');
  const ref = db.collection('users').doc(uid).collection('connections').doc('twitter');
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  const now = Date.now();
  // Resolve access token (decrypt if needed)
  const accessPlain = data.encrypted_access_token ? decryptToken(data.encrypted_access_token) : data.access_token;
  const refreshPlain = data.encrypted_refresh_token ? decryptToken(data.encrypted_refresh_token) : data.refresh_token;

  if (data.expires_at && data.expires_at - now > 120000) {
    return accessPlain; // still valid
  }
  if (!refreshPlain) {
    return accessPlain; // cannot refresh
  }
  try {
    const refreshed = await refreshToken({ refresh_token: refreshPlain, clientId });
    await storeUserTokens(uid, refreshed); // will encrypt if key present
    return refreshed.access_token;
  } catch (e) {
    console.warn('[Twitter][refresh] failed:', e.message);
    return accessPlain; // fallback (may be expired)
  }
}

// Cleanup old oauth state docs (default older than 30 minutes)
async function cleanupOldStates(maxAgeMinutes = 30) {
  const cutoff = Date.now() - maxAgeMinutes * 60 * 1000;
  const query = await db.collection('oauth_states')
    .where('createdAt', '<', new admin.firestore.Timestamp(Math.floor(cutoff/1000), 0))
    .limit(50) // batch limit
    .get().catch(()=>({ empty: true, docs: [] }));
  if (query.empty) return 0;
  const batch = db.batch();
  query.docs.forEach(d => batch.delete(d.ref));
  await batch.commit().catch(()=>{});
  return query.docs.length;
}

module.exports = {
  generatePkcePair,
  createAuthStateDoc,
  consumeAuthState,
  buildAuthUrl,
  exchangeCode,
  storeUserTokens,
  getValidAccessToken,
  cleanupOldStates
};
