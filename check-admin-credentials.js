const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY",
  authDomain: "autopromote-464de.firebaseapp.com",
  projectId: "autopromote-464de",
  storageBucket: "autopromote-464de.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function checkAdminCredentials() {
  console.log('🔍 Checking admin credentials...\n');

  const adminCredentials = [
    { email: 'admin123@gmail.com', password: 'AdminAuto123' },
    { email: 'testadmin@example.com', password: 'admin123' },
    { email: 'admin@autopromote.com', password: 'admin123' },
    { email: 'admin@example.com', password: 'admin123' },
    { email: 'testadmin@gmail.com', password: 'admin123' }
  ];

  for (const creds of adminCredentials) {
    try {
      console.log(`Testing: ${creds.email}`);
      const userCredential = await signInWithEmailAndPassword(auth, creds.email, creds.password);
      console.log(`✅ SUCCESS: ${creds.email} - UID: ${userCredential.user.uid}`);

      // Get ID token to check custom claims
      const idTokenResult = await userCredential.user.getIdTokenResult();
      console.log(`Admin claim: ${idTokenResult.claims.admin || false}`);
      console.log(`Role: ${idTokenResult.claims.role || 'none'}\n`);

      return creds; // Return working credentials

    } catch (error) {
      console.log(`❌ FAILED: ${creds.email} - ${error.message}\n`);
    }
  }

  console.log('No working admin credentials found.');
  return null;
}

async function checkExistingUsers() {
  console.log('🔍 Checking existing users in Firebase Auth...\n');

  // This would require admin SDK to list users
  // For now, let's just check if we can find any working credentials
  const workingCreds = await checkAdminCredentials();

  if (workingCreds) {
    console.log('✅ Found working admin credentials:', workingCreds);
  } else {
    console.log('❌ No working admin credentials found. You may need to create an admin user.');
  }
}

checkExistingUsers().catch(console.error);
