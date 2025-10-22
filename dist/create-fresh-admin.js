// create-fresh-admin.js
// Script to create a fresh admin user with a different email
const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } = require('firebase/auth');

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

// Initialize Firebase Client (needed to test login)
const firebaseConfig = {
  apiKey: "AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY",
  authDomain: "autopromote-cc6d3.firebaseapp.com",
  projectId: "autopromote-cc6d3",
  storageBucket: "autopromote-cc6d3.firebasestorage.app",
  messagingSenderId: "317746682241",
  appId: "1:317746682241:web:f363e099d55ffd1af1b080",
  measurementId: "G-8QDQXF0FPQ"
};
const clientApp = initializeApp(firebaseConfig);
const clientAuth = getAuth(clientApp);

// New admin user details
const adminEmail = 'admin@autopromote.com';
const adminPassword = 'AdminPassword123!';
const adminName = 'Admin User';

async function createFreshAdmin() {
  console.log(`Creating fresh admin user: ${adminEmail}`);
  
  try {
    // Check if the user already exists
    try {
      const existingUser = await admin.auth().getUserByEmail(adminEmail);
      console.log(`User already exists with UID: ${existingUser.uid}`);
      
      // Delete existing user from Auth and Firestore
      console.log('Deleting existing user...');
      
      // Delete from Firestore first
      try {
        await admin.firestore().collection('admins').doc(existingUser.uid).delete();
        console.log('- Deleted from admins collection');
      } catch (err) {
        console.log('- No admin record to delete in admins collection');
      }
      
      try {
        await admin.firestore().collection('users').doc(existingUser.uid).delete();
        console.log('- Deleted from users collection');
      } catch (err) {
        console.log('- No user record to delete in users collection');
      }
      
      // Delete from Auth
      await admin.auth().deleteUser(existingUser.uid);
      console.log('- Deleted from Firebase Auth');
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.log('User does not exist, proceeding with creation');
      } else {
        throw error;
      }
    }
    
    // Create the new admin user
    console.log(`Creating new admin user in Firebase Auth...`);
    const userRecord = await admin.auth().createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: adminName,
      emailVerified: true
    });
    
    const uid = userRecord.uid;
    console.log(`Admin user created with UID: ${uid}`);
    
    // Set admin custom claims
    console.log('Setting admin custom claims...');
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    console.log('Admin custom claims set successfully');
    
    // Create admin in Firestore admins collection
    console.log('Creating admin record in Firestore...');
    await admin.firestore().collection('admins').doc(uid).set({
      email: adminEmail,
      name: adminName,
      role: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('Admin record created in admins collection');
    
    // Create admin in Firestore users collection (for compatibility)
    await admin.firestore().collection('users').doc(uid).set({
      email: adminEmail,
      displayName: adminName,
      role: 'admin',
      isAdmin: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('Admin record created in users collection');
    
    // Wait for Firebase to propagate changes
    console.log('Waiting for Firebase to propagate changes...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test login with the new admin credentials
    console.log('\nTesting login with new admin credentials...');
    try {
      const userCredential = await signInWithEmailAndPassword(clientAuth, adminEmail, adminPassword);
      console.log('✅ Login successful with new admin credentials!');
      
      // Get the ID token
      const idToken = await userCredential.user.getIdToken(true);
      console.log(`ID Token (first 50 chars): ${idToken.substring(0, 50)}...`);
      
      // Verify admin claims
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      console.log('Admin claim in token:', decodedToken.admin === true ? 'Yes' : 'No');
    } catch (loginError) {
      console.error('❌ Login test failed:', loginError.message);
    }
    
    console.log('\n✅ Fresh admin user created successfully');
    console.log('Use these credentials to log in:');
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    
    return uid;
  } catch (error) {
    console.error('Error creating fresh admin:', error);
    throw error;
  }
}

// Run the script
createFreshAdmin()
  .then(uid => {
    console.log(`\nFresh admin creation completed. UID: ${uid}`);
    setTimeout(() => process.exit(0), 2000);
  })
  .catch(error => {
    console.error('Fresh admin creation failed:', error);
    process.exit(1);
  });
