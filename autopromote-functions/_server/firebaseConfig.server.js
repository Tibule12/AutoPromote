// Placeholder for firebaseConfig.server.js
// Add Firebase server configuration logic here

// Server-side Firebase configuration loader
// Loads either a raw JSON from FIREBASE_SERVICE_ACCOUNT_JSON, a base64-encoded JSON from FIREBASE_SERVICE_ACCOUNT_BASE64,
// or individual FIREBASE_* env vars (FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, FIREBASE_PROJECT_ID, etc.).

function normalizeEnvPrivateKey(value) {
  if (!value || typeof value !== 'string') return value;
  let key = value.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\r/g, '');
  key = key.replace(/\\n/g, '\n');
  return key;
}

function loadServiceAccountFromEnv() {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (parsed && parsed.private_key) parsed.private_key = normalizeEnvPrivateKey(parsed.private_key);
      return parsed;
    }
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      const parsed = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
      if (parsed && parsed.private_key) parsed.private_key = normalizeEnvPrivateKey(parsed.private_key);
      return parsed;
    }
    // Individual env vars fallback
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
      return {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || undefined,
        private_key: normalizeEnvPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID || undefined,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs'
      };
    }
  } catch (e) {
    console.warn('[firebaseConfig] Failed to parse env-provided Firebase service account JSON:', e && e.message);
    return null;
  }
  return null;
}

const cfg = loadServiceAccountFromEnv() || {};

module.exports = cfg;
