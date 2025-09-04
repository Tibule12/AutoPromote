// recreate-admin-verbose.js
// Script to delete and recreate the admin user in Firebase with verbose logging
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
try {
  admin.app();
  console.log('Firebase Admin already initialized');
} catch (error) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://autopromote-464de.firebaseio.com"
  });
  console.log('Firebase Admin initialized');
}

async function recreateAdminUser() {
  const adminEmail = 'admin123@gmail.com';
  const adminPassword = 'Admin12345';
  const adminName = 'System Administrator';
  
  console.log(`Attempting to recreate admin user: ${adminEmail}`);
  console.log(`Password will be set to: ${adminPassword}`);
  
  // First, try to delete the existing user
  try {
    console.log('Checking if user already exists...');
    const userRecord = await admin.auth().getUserByEmail(adminEmail);
    console.log(`Found existing admin user: ${userRecord.uid}`);
    
    // Delete from Firestore
    try {
      console.log('Checking admin collection...');
      const adminDoc = await admin.firestore().collection('admins').doc(userRecord.uid).get();
      if (adminDoc.exists) {
        await admin.firestore().collection('admins').doc(userRecord.uid).delete();
        console.log(`Deleted admin document from Firestore`);
      } else {
        console.log('No admin document found in Firestore');
      }
      
      // Also check users collection
      console.log('Checking users collection...');
      const userDoc = await admin.firestore().collection('users').doc(userRecord.uid).get();
      if (userDoc.exists) {
        await admin.firestore().collection('users').doc(userRecord.uid).delete();
        console.log(`Deleted user document from Firestore`);
      } else {
        console.log('No user document found in Firestore');
      }
    } catch (error) {
      console.log(`Error deleting from Firestore:`, error);
    }
    
    // Delete from Auth
    console.log('Deleting user from Firebase Auth...');
    await admin.auth().deleteUser(userRecord.uid);
    console.log(`Deleted admin user from Firebase Auth`);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log(`Admin user does not exist, will create new`);
    } else {
      console.error(`Error looking up admin user:`, error);
      console.log('Continuing with creation anyway...');
    }
  }
  
  // Create new admin user
  try {
    console.log(`Creating new admin user...`);
    const newUserRecord = await admin.auth().createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: adminName,
      emailVerified: true
    });
    
    console.log(`Admin user created with UID: ${newUserRecord.uid}`);
    
    // Set admin custom claims
    console.log('Setting admin custom claims...');
    await admin.auth().setCustomUserClaims(newUserRecord.uid, {
      admin: true,
      role: 'admin'
    });
    console.log('Admin custom claims set successfully');
    
    // Create admin document
    console.log('Creating admin document in Firestore...');
    await admin.firestore().collection('admins').doc(newUserRecord.uid).set({
      uid: newUserRecord.uid,
      email: adminEmail,
      name: adminName,
      role: 'admin',
      isAdmin: true,
      accessLevel: 'full',
      permissions: ['all'],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('Admin document created in Firestore');
    
    console.log(`\n✅ Admin user recreated successfully!`);
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    console.log(`UID: ${newUserRecord.uid}`);
    
    return true;
  } catch (error) {
    console.error(`Error recreating admin user:`, error);
    return false;
  }
}

// Run the script
recreateAdminUser()
  .then(() => {
    console.log('\nRecreate admin script completed.');
    setTimeout(() => process.exit(0), 1000);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
