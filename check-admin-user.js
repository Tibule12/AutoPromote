// check-admin-user.js
// Script to check if admin user exists and display its details
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

async function checkAdminUser() {
  const adminEmail = 'admin123@gmail.com';
  
  console.log(`Checking admin user: ${adminEmail}`);
  
  try {
    // Check Firebase Auth
    console.log('\nChecking Firebase Auth...');
    const userRecord = await admin.auth().getUserByEmail(adminEmail);
    console.log(`✅ User exists in Firebase Auth`);
    console.log(`- UID: ${userRecord.uid}`);
    console.log(`- Email: ${userRecord.email}`);
    console.log(`- Email Verified: ${userRecord.emailVerified}`);
    console.log(`- Display Name: ${userRecord.displayName || 'Not set'}`);
    
    // Get user claims
    const customClaims = (await admin.auth().getUser(userRecord.uid)).customClaims || {};
    console.log('- Custom Claims:', JSON.stringify(customClaims, null, 2));
    
    // Check Firestore - admins collection
    console.log('\nChecking admins collection in Firestore...');
    const adminDoc = await admin.firestore().collection('admins').doc(userRecord.uid).get();
    
    if (adminDoc.exists) {
      console.log(`✅ User exists in admins collection`);
      console.log('- Admin Document:', JSON.stringify(adminDoc.data(), null, 2));
    } else {
      console.log(`❌ User does not exist in admins collection`);
    }
    
    // Check Firestore - users collection
    console.log('\nChecking users collection in Firestore...');
    const userDoc = await admin.firestore().collection('users').doc(userRecord.uid).get();
    
    if (userDoc.exists) {
      console.log(`✅ User exists in users collection`);
      console.log('- User Document:', JSON.stringify(userDoc.data(), null, 2));
    } else {
      console.log(`❌ User does not exist in users collection`);
    }
    
    return true;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log(`❌ Admin user does not exist in Firebase Auth`);
    } else {
      console.error(`❌ Error checking admin user:`, error);
    }
    return false;
  }
}

// Run the script
checkAdminUser()
  .then(() => {
    console.log('\nCheck admin user script completed.');
    setTimeout(() => process.exit(0), 1000);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
