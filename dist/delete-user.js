// delete-user.js
// Script to delete a user from Firebase Auth and Firestore
const admin = require('firebase-admin');
const readline = require('readline');

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

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to delete a user by email
async function deleteUserByEmail(email) {
  try {
    console.log(`Searching for user with email: ${email}...`);
    
    // First, find the user in Firebase Auth
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;
    
    console.log(`Found user in Firebase Auth: ${uid}`);
    console.log('User details:');
    console.log(`- Email: ${userRecord.email}`);
    console.log(`- Display Name: ${userRecord.displayName || 'Not set'}`);
    console.log(`- Email Verified: ${userRecord.emailVerified}`);
    
    // Confirm deletion
    return new Promise((resolve) => {
      rl.question(`Are you sure you want to delete user ${email}? (yes/no): `, async (answer) => {
        if (answer.toLowerCase() !== 'yes') {
          console.log('User deletion cancelled.');
          resolve(false);
          return;
        }
        
        try {
          // Delete from Firestore first
          console.log(`Deleting user data from Firestore...`);
          
          // Check if user exists in 'users' collection
          const userDoc = await admin.firestore().collection('users').doc(uid).get();
          if (userDoc.exists) {
            await admin.firestore().collection('users').doc(uid).delete();
            console.log(`- Deleted user document from 'users' collection`);
          } else {
            console.log(`- No user document found in 'users' collection`);
          }
          
          // Check if user exists in 'admins' collection
          const adminDoc = await admin.firestore().collection('admins').doc(uid).get();
          if (adminDoc.exists) {
            await admin.firestore().collection('admins').doc(uid).delete();
            console.log(`- Deleted user document from 'admins' collection`);
          } else {
            console.log(`- No user document found in 'admins' collection`);
          }
          
          // Delete user content
          const contentSnapshot = await admin.firestore().collection('content')
            .where('userId', '==', uid)
            .get();
          
          if (!contentSnapshot.empty) {
            const batch = admin.firestore().batch();
            contentSnapshot.forEach(doc => {
              batch.delete(doc.ref);
            });
            await batch.commit();
            console.log(`- Deleted ${contentSnapshot.size} content items`);
          } else {
            console.log(`- No content found for this user`);
          }
          
          // Delete from Firebase Auth
          console.log(`Deleting user from Firebase Auth...`);
          await admin.auth().deleteUser(uid);
          console.log(`✅ User successfully deleted from Firebase Auth`);
          
          console.log(`\n✅ User ${email} (${uid}) has been completely removed from the system.`);
          console.log(`They can now register again with the same email address.`);
          
          resolve(true);
        } catch (error) {
          console.error(`Error during deletion process:`, error);
          resolve(false);
        }
      });
    });
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ User with email ${email} not found in Firebase Auth.`);
    } else {
      console.error(`❌ Error looking up user:`, error);
    }
    return false;
  }
}

// Main function
async function main() {
  rl.question('Enter the email of the user to delete: ', async (email) => {
    await deleteUserByEmail(email);
    rl.close();
  });
}

// Run the script
main()
  .then(() => {
    console.log('\nDelete user script completed.');
    setTimeout(() => process.exit(0), 1000);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
