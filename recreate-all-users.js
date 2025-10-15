// recreate-all-users.js
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

// Define all users we want to create
const users = [
  {
    email: 'test@example.com',
    password: 'Test123!',
    name: 'Test User',
    role: 'user'
  },
  {
    email: 'tmtshwelo21@gmail.com', 
    password: 'Thulani1205@',
    name: 'Tulani Mtshwelo',
    role: 'user'
  },
  {
    email: 'admin123@gmail.com',
    password: 'Admin12345',
    name: 'System Administrator',
    role: 'admin',
    isAdmin: true
  },
  {
    email: 'admin@example.com',
    password: 'Admin123!',
    name: 'Admin Test',
    role: 'admin',
    isAdmin: true
  }
];

async function createUser(userData) {
  console.log(`\nCreating user: ${userData.email} (${userData.role})`);
  
  try {
    // First, try to see if user already exists
    try {
      const userRecord = await admin.auth().getUserByEmail(userData.email);
      console.log(`User ${userData.email} already exists with UID: ${userRecord.uid}`);
      
      // Update user's password in Firebase Auth
      await admin.auth().updateUser(userRecord.uid, {
        password: userData.password
      });
      console.log(`Updated password for ${userData.email}`);
      
      // Set custom claims if needed
      if (userData.role === 'admin') {
        await admin.auth().setCustomUserClaims(userRecord.uid, { 
          admin: true, 
          role: 'admin' 
        });
        console.log(`Set admin claims for ${userData.email}`);
      }
      
      // Update in Firestore
      if (userData.role === 'admin') {
        await admin.firestore().collection('admins').doc(userRecord.uid).set({
          uid: userRecord.uid,
          email: userData.email,
          name: userData.name,
          role: userData.role,
          isAdmin: true,
          accessLevel: 'full',
          permissions: ['all'],
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`Updated admin in Firestore: ${userData.email}`);
      }
      
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        uid: userRecord.uid,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log(`Updated user in Firestore: ${userData.email}`);
      
      return userRecord.uid;
      
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
      
      // User doesn't exist, create a new one
      console.log(`User ${userData.email} doesn't exist, creating...`);
      
      // Create user in Firebase Auth
      const userRecord = await admin.auth().createUser({
        email: userData.email,
        password: userData.password,
        displayName: userData.name,
        emailVerified: true
      });
      console.log(`Created user in Firebase Auth: ${userData.email} (${userRecord.uid})`);
      
      // Set custom claims if needed
      if (userData.role === 'admin') {
        await admin.auth().setCustomUserClaims(userRecord.uid, { 
          admin: true, 
          role: 'admin' 
        });
        console.log(`Set admin claims for ${userData.email}`);
      }
      
      // Store in Firestore
      if (userData.role === 'admin') {
        await admin.firestore().collection('admins').doc(userRecord.uid).set({
          uid: userRecord.uid,
          email: userData.email,
          name: userData.name,
          role: userData.role,
          isAdmin: true,
          accessLevel: 'full',
          permissions: ['all'],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Saved admin to Firestore: ${userData.email}`);
      }
      
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        uid: userRecord.uid,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`Saved user to Firestore: ${userData.email}`);
      
      return userRecord.uid;
    }
  } catch (error) {
    console.error(`Failed to create/update user ${userData.email}:`, error);
    return null;
  }
}

async function testLogin(email, password) {
  try {
    console.log(`\nTesting login for: ${email}`);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log(`✅ Login successful for ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Login failed for ${email}:`, error.code, error.message);
    return false;
  }
}

async function recreateAllUsers() {
  console.log('Starting user recreation process...');
  
  // First recreate all users
  for (const userData of users) {
    await createUser(userData);
  }
  
  console.log('\n--- Testing logins ---');
  
  // Then test all logins
  for (const userData of users) {
    await testLogin(userData.email, userData.password);
  }
  
  console.log('\n✅ User recreation completed!');
  console.log('Please use one of these credentials to log in:');
  
  users.forEach(user => {
    console.log(`\n${user.role.toUpperCase()}: ${user.email}`);
    console.log(`Password: ${user.password}`);
  });
}

recreateAllUsers().catch(console.error);
