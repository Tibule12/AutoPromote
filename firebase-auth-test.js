// firebase-auth-test.js
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = require('firebase/auth');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
try {
  admin.app();
  console.log('Firebase Admin already initialized');
} catch (error) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://autopromote-cc6d3.firebaseio.com"
  });
  console.log('Firebase Admin initialized');
}

// Initialize Firebase Client
const firebaseConfig = {
  apiKey: "AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY",
  authDomain: "autopromote-cc6d3.firebaseapp.com",
  projectId: "autopromote-cc6d3",
  storageBucket: "autopromote-cc6d3.firebasestorage.app",
  messagingSenderId: "317746682241",
  appId: "1:317746682241:web:f363e099d55ffd1af1b080"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function createAndVerifyUsers() {
  try {
    console.log('Starting Firebase authentication test...');
    console.log('Using Firebase project ID:', firebaseConfig.projectId);
    console.log('Using API Key:', firebaseConfig.apiKey);
    
    // Test 1: Create a new user for testing
    const testEmail = 'newtest@example.com';
    const testPassword = 'Test123!';
    
    try {
      console.log(`\nTest 1: Creating new test user (${testEmail})...`);
      const userCredential = await createUserWithEmailAndPassword(auth, testEmail, testPassword);
      console.log('✅ User created successfully!');
      console.log('User UID:', userCredential.user.uid);
      
      // Save user to Firestore
      await admin.firestore().collection('users').doc(userCredential.user.uid).set({
        email: testEmail,
        name: 'New Test User',
        role: 'user',
        createdAt: new Date().toISOString()
      });
      console.log('✅ User saved to Firestore');
      
    } catch (error) {
      console.log('❌ Error creating user:', error.code, error.message);
      console.log('Continuing with tests...');
    }
    
    // Test 2: Create admin user
    const adminEmail = 'newadmin@example.com';
    const adminPassword = 'Admin123!';
    
    try {
      console.log(`\nTest 2: Creating new admin user (${adminEmail})...`);
      const adminCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
      console.log('✅ Admin user created!');
      console.log('Admin UID:', adminCredential.user.uid);
      
      // Set admin custom claims
      await admin.auth().setCustomUserClaims(adminCredential.user.uid, { admin: true, role: 'admin' });
      console.log('✅ Admin custom claims set');
      
      // Save admin to Firestore
      await admin.firestore().collection('admins').doc(adminCredential.user.uid).set({
        email: adminEmail,
        name: 'New Admin User',
        role: 'admin',
        isAdmin: true,
        createdAt: new Date().toISOString()
      });
      console.log('✅ Admin saved to Firestore');
      
    } catch (error) {
      console.log('❌ Error creating admin:', error.code, error.message);
      console.log('Continuing with tests...');
    }
    
    // Test 3: Attempt to sign in with the new test user
    try {
      console.log(`\nTest 3: Testing login with new test user (${testEmail})...`);
      const userCredential = await signInWithEmailAndPassword(auth, testEmail, testPassword);
      console.log('✅ Login successful!');
      console.log('User:', userCredential.user.email);
      
      // Get token
      const token = await userCredential.user.getIdToken();
      console.log('Token received:', token.substring(0, 20) + '...');
    } catch (error) {
      console.log('❌ Login failed:', error.code, error.message);
    }
    
    // Test 4: Attempt to sign in with the new admin user
    try {
      console.log(`\nTest 4: Testing login with new admin user (${adminEmail})...`);
      const adminCredential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      console.log('✅ Admin login successful!');
      console.log('Admin:', adminCredential.user.email);
      
      // Get token
      const token = await adminCredential.user.getIdToken();
      console.log('Admin token received:', token.substring(0, 20) + '...');
    } catch (error) {
      console.log('❌ Admin login failed:', error.code, error.message);
    }
    
    console.log('\n---------------------------------------');
    console.log('Firebase authentication test completed');
    console.log('---------------------------------------');
    console.log('New test user credentials:');
    console.log('Email:', testEmail);
    console.log('Password:', testPassword);
    console.log('\nNew admin user credentials:');
    console.log('Email:', adminEmail);
    console.log('Password:', adminPassword);
    console.log('---------------------------------------');
    
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

createAndVerifyUsers().catch(console.error);
