const admin = require('firebase-admin');
const fs = require('fs');

/**
 * Usage:
 *   node scripts/add_facebook_connection.js --uid=USER_UID --token=USER_ACCESS_TOKEN [--pages='[JSON]']
 *
 * This script writes a minimal Facebook connection document to:
 *   users/{uid}/connections/facebook
 *
 * It expects a local service account JSON at ./service-account-key.json (the repo contains it),
 * or you can set GOOGLE_APPLICATION_CREDENTIALS to point to the file.
 */

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  });
  return args;
}

async function main() {
  const args = parseArgs();
  const uid = args.uid;
  const token = args.token;
  const pagesJson = args.pages;

  if (!uid || !token) {
    console.error('Missing --uid or --token. See usage in file header.');
    process.exit(2);
  }

  // Initialize Firebase Admin with local key if available
  if (!admin.apps.length) {
    try {
      const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account-key.json';
      if (!fs.existsSync(keyPath)) {
        console.error('Service account key not found at', keyPath);
        process.exit(2);
      }
      const serviceAccount = require(require('path').resolve(keyPath));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (e) {
      console.error('Failed to initialize firebase-admin:', e && e.message);
      process.exit(2);
    }
  }

  const db = admin.firestore();

  let pages = [];
  try {
    if (pagesJson) pages = JSON.parse(pagesJson);
  } catch (e) {
    console.error('Failed to parse --pages JSON:', e.message);
    process.exit(2);
  }

  const payload = {
    provider: 'facebook',
    token_type: 'USER_TOKEN',
    expires_in: null,
    pages: pages,
    ig_business_account_id: null,
    obtainedAt: admin.firestore.FieldValue.serverTimestamp(),
    // Store the user token temporarily; prefer encryption in production.
    user_access_token: token,
  };

  const docRef = db.collection('users').doc(uid).collection('connections').doc('facebook');
  await docRef.set(payload, { merge: true });
  console.log(`Wrote Facebook connection for uid=${uid}`);
  process.exit(0);
}

main().catch(e => {
  console.error('Unhandled error:', e && e.message);
  process.exit(1);
});
