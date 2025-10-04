// checkFirebaseCredentials.js - quick diagnostic for Firebase Admin credential loading
require('dotenv').config();
const path = require('path');
console.log('[diag] Starting Firebase credential diagnostic...');

function redact(v) {
  if (!v) return v;
  if (v.length <= 8) return '***';
  return v.slice(0,4) + '...' + v.slice(-4);
}

// Load config module (will throw if invalid)
try {
  const config = require('../src/firebaseConfig.server');
  if (!config || !config.credentialSource) {
    console.log('⚠️  Config loaded but credentialSource missing.');
  } else {
    console.log('[diag] credentialSource:', config.credentialSource);
  }
  if (config && config.serviceAccount) {
    const sa = config.serviceAccount;
    const required = ['project_id','client_email','private_key'];
    const missing = required.filter(k => !sa[k]);
    if (missing.length) {
      console.log('❌ Missing required fields:', missing.join(','));
    } else {
      console.log('✅ Required fields present.');
      console.log(' project_id =', sa.project_id);
      console.log(' client_email =', sa.client_email);
      console.log(' private_key (redacted) =', redact(sa.private_key || ''));
    }
  }
  // Attempt to init admin (will use firebaseAdmin wrapper)
  try {
    const { db } = require('../src/firebaseAdmin');
    console.log('✅ firebaseAdmin initialized; attempting lightweight read (list 1 content doc).');
    db.collection('content').limit(1).get().then(snap => {
      console.log(`[diag] Firestore read success. Sample size: ${snap.size}`);
    }).catch(e => console.log('⚠️ Firestore read failed:', e.message));
  } catch (e) {
    console.log('❌ firebaseAdmin init failed:', e.message);
  }
} catch (e) {
  console.error('❌ Failed to load firebaseConfig.server:', e.message);
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    console.log('Path specified:', path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
  }
  process.exit(1);
}
