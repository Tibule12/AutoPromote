// test-admin-login-direct.js
// Script to test admin login directly with Firebase Authentication

// Use this script to test if the admin user can login directly with Firebase
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, signOut } = require('firebase/auth');

// Firebase configuration with correct API key
const firebaseConfig = {
  apiKey: "AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY",
  authDomain: "autopromote-464de.firebaseapp.com",
  projectId: "autopromote-464de",
  storageBucket: "autopromote-464de.firebasestorage.app",
  messagingSenderId: "317746682241",
  appId: "1:317746682241:web:f363e099d55ffd1af1b080",
  measurementId: "G-8QDQXF0FPQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
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
