// Server-side Firebase configuration loader
// Loads either a raw JSON from FIREBASE_SERVICE_ACCOUNT_JSON, a base64-encoded JSON from FIREBASE_SERVICE_ACCOUNT_BASE64,
// or individual FIREBASE_* env vars (FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, FIREBASE_PROJECT_ID, etc.).

function loadServiceAccountFromEnv() {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (parsed && parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      return parsed;
    }
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      const parsed = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
      if (parsed && parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      return parsed;
    }
    // Individual env vars fallback
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
      return {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || undefined,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
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
