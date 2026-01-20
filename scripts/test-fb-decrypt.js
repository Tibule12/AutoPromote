// test-fb-decrypt.js
// Run with FIREBASE_ADMIN_BYPASS=1 and GENERIC_TOKEN_ENCRYPTION_KEY set
process.env.FIREBASE_ADMIN_BYPASS = process.env.FIREBASE_ADMIN_BYPASS || '1';

const { db } = require('../src/firebaseAdmin');
const { encryptToken, decryptToken, hasEncryption } = require('../src/services/secretVault');
const { tokensFromDoc } = require('../src/services/connectionTokenUtils');

async function run() {
  console.log('hasEncryption:', hasEncryption());
  const uid = `fb-test-${Date.now()}`;
  const connRef = db.collection('users').doc(uid).collection('connections').doc('facebook');
  const rawUserToken = 'USER_SHORT_TOKEN_ABC123';
  const rawPageToken = 'PAGE_TOKEN_XYZ789';

  const encUser = encryptToken(rawUserToken);
  const encPage = encryptToken(rawPageToken);

  await connRef.set({
    encrypted_user_access_token: encUser,
    pages: [
      { id: '111222', name: 'Test Page', encrypted_access_token: encPage },
    ],
    meta: { pages: [{ id: '111222', name: 'Test Page', access_token: encPage }] },
  });

  console.log('Wrote encrypted tokens to in-memory DB for uid:', uid);

  const snap = await connRef.get();
  const doc = snap.exists ? snap.data() : null;
  console.log('Raw doc:', doc);

  // Use tokensFromDoc to read
  const tokens = tokensFromDoc(doc);
  console.log('tokensFromDoc result:', tokens);

  // Manually decrypt page token
  const page = doc && doc.pages && doc.pages[0];
  if (page && page.encrypted_access_token) {
    const dec = decryptToken(page.encrypted_access_token);
    console.log('Decrypted page token:', dec);
  }
}

run().catch(e => { console.error(e); process.exitCode = 1; });
