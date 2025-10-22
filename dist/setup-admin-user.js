const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

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

async function setupAdminUser() {
  try {
    console.log('Setting up admin user in Firestore...');
    
    // 1. Define admin user credentials
    const adminEmail = 'admin123@gmail.com';
    const adminPassword = 'Admin12345';
    const adminName = 'System Administrator';
    
    // 2. Check if user exists in Firebase Auth
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(adminEmail);
      console.log('Admin user already exists in Auth:', userRecord.uid);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        // Create user if not found
        userRecord = await admin.auth().createUser({
          email: adminEmail,
          password: adminPassword,
          displayName: adminName,
          emailVerified: true
        });
        console.log('Created new admin user in Auth:', userRecord.uid);
      } else {
        throw error;
      }
    }
    
    // 3. Set admin custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      admin: true,
      role: 'admin'
    });
    console.log('Set admin custom claims for user:', userRecord.uid);
    
    // 4. Create/update admin document in Firestore
    const adminRef = admin.firestore().collection('admins').doc(userRecord.uid);
    await adminRef.set({
      uid: userRecord.uid,
      email: adminEmail,
      name: adminName,
      role: 'admin',
      isAdmin: true,
      accessLevel: 'full',
      permissions: ['all'],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('Created/updated admin document in Firestore');
    
    // 5. Create admin_settings collection if needed
    const settingsRef = admin.firestore().collection('admin_settings').doc('global');
    await settingsRef.set({
      dashboardEnabled: true,
      analyticsEnabled: true,
      userManagementEnabled: true,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log('Created/updated admin settings in Firestore');
    
    console.log('\n✅ Admin setup complete!');
    console.log('Admin Email:', adminEmail);
    console.log('Admin Password:', adminPassword);
    console.log('Admin UID:', userRecord.uid);
    console.log('Admin Document Path:', `admins/${userRecord.uid}`);
    
    return {
      success: true,
      uid: userRecord.uid,
      email: adminEmail
    };
  } catch (error) {
    console.error('Error setting up admin user:', error);
    return { success: false, error: error.message };
  }
}

// Run the function
setupAdminUser()
  .then(() => {
    console.log('Admin setup script completed');
    setTimeout(() => process.exit(0), 2000);
  })
  .catch(error => {
    console.error('Admin setup script failed:', error);
    process.exit(1);
  });
