// Firebase Configuration for Server-Side (CommonJS)
// Enhanced loader: supports either individual FIREBASE_* env vars, FIREBASE_SERVICE_ACCOUNT_JSON (raw JSON),
// or FIREBASE_SERVICE_ACCOUNT_BASE64 (base64 encoded JSON). Provides validation & helpful error context.

function loadServiceAccount() {
  let parsed = null;
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (rawJson) {
    try { parsed = JSON.parse(rawJson); } catch (e) { console.warn('[firebaseConfig] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message); }
  } else if (b64) {
    try { parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')); } catch (e) { console.warn('[firebaseConfig] Failed to decode FIREBASE_SERVICE_ACCOUNT_BASE64:', e.message); }
  }
  if (parsed && parsed.private_key && typeof parsed.private_key === 'string') {
    // Normalize newlines (common issue when stored in env)
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed;
}

function buildFromIndividualEnv() {
  return {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID || '',
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || '',
    private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL || '',
    client_id: process.env.FIREBASE_CLIENT_ID || '',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL || ''
  };
}

function validateConfig(cfg) {
  const required = ['project_id','private_key','client_email'];
  const missing = required.filter(k => !cfg[k] || typeof cfg[k] !== 'string' || !cfg[k].trim());
  return missing;
}

let adminConfig = loadServiceAccount();
if (!adminConfig) {
  adminConfig = buildFromIndividualEnv();
}

const missing = validateConfig(adminConfig);
if (missing.length) {
  // Don't throw here—firebaseAdmin.js will decide whether to error based on bypass flags.
  console.warn('[firebaseConfig] Missing required service account fields:', missing.join(','));
}

module.exports = adminConfig;
