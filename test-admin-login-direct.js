// test-admin-login-direct.js
// Script to test admin login directly with Firebase Authentication

// Use this script to test if the admin user can login directly with Firebase
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, signOut } = require('firebase/auth');

// Firebase configuration - read from environment variables
function getClientFirebaseConfig() {
  const keys = [
    'REACT_APP_FIREBASE_API_KEY',
    'REACT_APP_FIREBASE_AUTH_DOMAIN',
    'REACT_APP_FIREBASE_PROJECT_ID',
    'REACT_APP_FIREBASE_STORAGE_BUCKET',
    'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
    'REACT_APP_FIREBASE_APP_ID'
  ];
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('Missing required Firebase client env vars:', missing.join(', '));
    process.exit(1);
  }
  return {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
    measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
  };
}

// Initialize Firebase
const app = initializeApp(getClientFirebaseConfig());
const auth = getAuth(app);

// Admin credentials
const adminEmail = 'admin123@gmail.com';
const adminPassword = 'admin123456';

async function testAdminLogin() {
  console.log(`Testing admin login with email: ${adminEmail}`);
  
  try {
    // Sign in with email and password
    const userCredential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
    const user = userCredential.user;
    
    console.log('✅ Admin login successful!');
    console.log('User details:');
    console.log(`- UID: ${user.uid}`);
    console.log(`- Email: ${user.email}`);
    console.log(`- Email verified: ${user.emailVerified}`);
    console.log(`- Display name: ${user.displayName || 'Not set'}`);
    
    // Get ID token
    const idToken = await user.getIdToken(true);
    console.log(`\nID Token (first 50 chars): ${idToken.substring(0, 50)}...`);
    
    // Sign out after successful test
    await signOut(auth);
    console.log('\nSigned out successfully');
    
    return true;
  } catch (error) {
    console.error('❌ Admin login failed:');
    console.error(`Error code: ${error.code}`);
    console.error(`Error message: ${error.message}`);
    
    if (error.code === 'auth/invalid-credential') {
      console.log('\nPossible solutions:');
      console.log('1. The admin user may not exist - run recreate-admin-improved.js');
      console.log('2. The password may be incorrect - default is "admin123456"');
      console.log('3. The user may be disabled in Firebase Console');
    }
    
    return false;
  }
}

// Run the test
testAdminLogin()
  .then(success => {
    console.log(`\nTest ${success ? 'passed' : 'failed'}`);
    setTimeout(() => process.exit(0), 1000);
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
