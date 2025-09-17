const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

async function createUserRecord(user) {
  const userRef = admin.firestore().collection('users').doc(user.uid);
  await userRef.set({
    email: user.email,
    displayName: user.displayName || '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    // Add other fields as needed
  }, { merge: true });
  console.log(`User record created/updated for UID: ${user.uid}`);
}

// Example usage: node create-user.js <uid> <email> <displayName>
if (require.main === module) {
  const [,, uid, email, displayName] = process.argv;
  if (!uid || !email) {
    console.error('Usage: node create-user.js <uid> <email> <displayName>');
    process.exit(1);
  }
  createUserRecord({ uid, email, displayName })
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
