// create-simple-user.js
const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = require('firebase/auth');

// Generate a unique email and password
const timestamp = new Date().getTime();
const email = `test_${timestamp}@example.com`;
const password = 'Test123456!';

// Initialize Firebase Admin
try {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin initialized');
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
  process.exit(1);
}

// Create the user with Admin SDK
async function createUserWithAdminSDK() {
  try {
    console.log(`Creating user ${email} with Admin SDK...`);
    
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      emailVerified: true
    });
    
    console.log(`User created with UID: ${userRecord.uid}`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    
    return userRecord.uid;
  } catch (error) {
    console.error('Error creating user with Admin SDK:', error);
    return null;
  }
}

// Initialize Firebase Client
function initializeClient() {
  const firebaseConfig = {
    apiKey: "AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY",
    authDomain: "autopromote-464de.firebaseapp.com",
    projectId: "autopromote-464de",
    storageBucket: "autopromote-464de.firebasestorage.app",
    messagingSenderId: "317746682241",
    appId: "1:317746682241:web:f363e099d55ffd1af1b080"
  };
  
  const app = initializeApp(firebaseConfig);
  return getAuth(app);
}

// Test login with the new user
async function testLogin(auth, uid) {
  try {
    console.log(`\nTesting login for ${email}...`);
    
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    console.log('Login successful!');
    console.log('User UID from login:', userCredential.user.uid);
    console.log('Matches created UID:', userCredential.user.uid === uid);
    
    return true;
  } catch (error) {
    console.error('Login failed:', error.code, error.message);
    return false;
  }
}

// Run the test
async function run() {
  // Step 1: Create user with Admin SDK
  const uid = await createUserWithAdminSDK();
  
  if (!uid) {
    console.log('Failed to create user, exiting');
    process.exit(1);
  }
  
  // Step 2: Initialize client SDK
  const auth = initializeClient();
  
  // Step 3: Test login
  const loginResult = await testLogin(auth, uid);
  
  // Report results
  console.log('\n--- RESULTS ---');
  console.log('User created:', uid ? 'YES' : 'NO');
  console.log('Login successful:', loginResult ? 'YES' : 'NO');
  console.log('\nIf login failed but user was created, there may be an issue with your Firebase Authentication configuration.');
}

run().catch(console.error);
