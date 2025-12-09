#!/usr/bin/env node
// Mark a user's `lastAcceptedTerms` in Firestore for testing.
// Usage:
//   node acceptTermsForUid.js --token <idToken>
//   node acceptTermsForUid.js --uid <uid> [--version AUTOPROMOTE-v1.0]

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node acceptTermsForUid.js --token <idToken> | --uid <uid> [--version VERSION]');
}

async function main() {
  const args = process.argv.slice(2);
  let uid = null;
  let token = null;
  let version = process.env.REQUIRED_TERMS_VERSION || 'AUTOPROMOTE-v1.0';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--token' && args[i+1]) { token = args[i+1]; i++; }
    else if (a === '--uid' && args[i+1]) { uid = args[i+1]; i++; }
    else if (a === '--version' && args[i+1]) { version = args[i+1]; i++; }
  }

  if (!uid && !token) { usage(); process.exit(2); }

  const svcPath = path.resolve(process.cwd(), 'service-account-key.json');
  if (!fs.existsSync(svcPath)) { console.error('service-account-key.json not found in repo root.'); process.exit(3); }

  admin.initializeApp({ credential: admin.credential.cert(require(svcPath)) });
  const db = admin.firestore();

  try {
    if (!uid) {
      // verify token to extract uid
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
    }

    if (!uid) { throw new Error('Unable to determine uid'); }

    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // create backups dir
    const backupsDir = path.resolve(process.cwd(), 'tools', 'smoke-tests', 'backups');
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupsDir, `${uid}-lastAcceptedTerms-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(userData.lastAcceptedTerms || null, null, 2), 'utf8');
    console.log('Backed up existing lastAcceptedTerms to', backupPath);

    const update = {
      lastAcceptedTerms: {
        version: version,
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        acceptedBy: 'smoke-tests'
      }
    };

    await userRef.set(update, { merge: true });
    console.log(`Wrote lastAcceptedTerms.version=${version} for uid=${uid}`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err && err.message ? err.message : err);
    process.exit(4);
  }
}

main();
