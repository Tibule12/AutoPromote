/**
 * Create a test user in Firebase Authentication
 * 
 * This script creates a test user with email and password
 * and adds their information to Firestore.
 */
const admin = require('firebase-admin');
const { adminConfig } = require('./config/firebase');

// Initialize Firebase Admin
if (admin.apps.length === 0) {
  admin.initializeApp(adminConfig);
}

async function createTestUser(email, password, name, isAdmin = false) {
  try {
    console.log(`Creating test user: ${email} (Admin: ${isAdmin})`);
    
    // Check if user already exists
    try {
      const existingUser = await admin.auth().getUserByEmail(email);
      console.log(`User ${email} already exists with UID: ${existingUser.uid}`);
      
      // Update existing user
      await admin.auth().updateUser(existingUser.uid, {
        password,
        displayName: name
      });
      
      // Set custom claims
      await admin.auth().setCustomUserClaims(existingUser.uid, { 
        role: isAdmin ? 'admin' : 'user',
        admin: isAdmin
      });
      
      // Update user in Firestore
      const collection = isAdmin ? 'admins' : 'users';
      await admin.firestore().collection(collection).doc(existingUser.uid).set({
        email,
        name,
        role: isAdmin ? 'admin' : 'user',
        isAdmin,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      console.log(`Updated existing user: ${existingUser.uid}`);
      return existingUser.uid;
    } catch (notFoundError) {
      // User doesn't exist, continue with creation
      if (notFoundError.code !== 'auth/user-not-found') {
        throw notFoundError;
      }
    }
    
    // Create new user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name
    });
    
    console.log(`Created new user with UID: ${userRecord.uid}`);
    
    // Set custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, { 
      role: isAdmin ? 'admin' : 'user',
      admin: isAdmin
    });
    
    // Add user to Firestore
    const collection = isAdmin ? 'admins' : 'users';
    await admin.firestore().collection(collection).doc(userRecord.uid).set({
      email,
      name,
      role: isAdmin ? 'admin' : 'user',
      isAdmin,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`Added user data to Firestore collection: ${collection}`);
    return userRecord.uid;
  } catch (error) {
    console.error('Error creating test user:', error);
    throw error;
  }
}

// Create a regular test user
createTestUser('testuser@example.com', 'password123', 'Test User')
  .then(uid => {
    console.log(`Test user created with UID: ${uid}`);
    
    // Create an admin test user
    return createTestUser('admin@example.com', 'admin123', 'Admin User', true);
  })
  .then(adminUid => {
    console.log(`Admin user created with UID: ${adminUid}`);
    console.log('\nTest Users Created:');
    console.log('1. Regular User:');
    console.log('   Email: testuser@example.com');
    console.log('   Password: password123');
    console.log('2. Admin User:');
    console.log('   Email: admin@example.com');
    console.log('   Password: admin123');
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to create test users:', error);
    process.exit(1);
  });
