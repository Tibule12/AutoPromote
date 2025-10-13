// check-admin-claims.js
// Script to check if admin user exists and has admin claims properly set
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

async function checkAdminClaims() {
  const adminEmail = 'admin123@gmail.com';
  
  console.log(`Checking admin claims for: ${adminEmail}`);
  
  try {
    // Check Firebase Auth
    const userRecord = await admin.auth().getUserByEmail(adminEmail);
    console.log(`Found user with UID: ${userRecord.uid}`);
    
    // Get user claims
    const customClaims = (await admin.auth().getUser(userRecord.uid)).customClaims || {};
    console.log('Custom Claims:', JSON.stringify(customClaims, null, 2));
    
    // If admin claim is missing, set it
    if (!customClaims.admin) {
      console.log('Admin claim is missing, setting it now...');
      await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
      console.log('Admin claim set successfully');
      
      // Verify it was set
      const updatedClaims = (await admin.auth().getUser(userRecord.uid)).customClaims || {};
      console.log('Updated Claims:', JSON.stringify(updatedClaims, null, 2));
    } else {
      console.log('Admin claim is already set correctly');
    }
    
    console.log('\nAdmin user is properly configured.');
    console.log('You can now log in with:');
    console.log(`Email: ${adminEmail}`);
    console.log('Password: admin123456');
    return true;
  } catch (error) {
    console.error(`Error checking admin claims:`, error);
    return false;
  }
}

// Run the script
checkAdminClaims()
  .then(() => {
    console.log('\nCheck admin claims script completed.');
    setTimeout(() => process.exit(0), 1000);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
