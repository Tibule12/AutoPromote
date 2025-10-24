// delete-users-batch.js
// Script to delete multiple users from Firebase Auth and Firestore
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

// Function to list all users matching a pattern
async function listUsers(pattern = null) {
  try {
    console.log('Fetching users from Firebase Auth...');
    
    // Get first batch of users
    const listUsersResult = await admin.auth().listUsers(1000);
    
    let filteredUsers = listUsersResult.users;
    
    // If pattern provided, filter users
    if (pattern) {
      console.log(`Filtering users with email matching: ${pattern}`);
      filteredUsers = filteredUsers.filter(user => 
        user.email && user.email.includes(pattern)
      );
    }
    
    // Display users
    console.log(`\nFound ${filteredUsers.length} users${pattern ? ' matching pattern' : ''}:`);
    
    filteredUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email || 'No email'} (${user.uid})`);
    });
    
    return filteredUsers;
  } catch (error) {
    console.error('Error listing users:', error);
    return [];
  }
}

// Function to delete a user by uid
async function deleteUser(uid) {
  try {
    // Get user details
    const userRecord = await admin.auth().getUser(uid);
    
    console.log(`\nDeleting user: ${userRecord.email} (${uid})`);
    
    // Delete from Firestore
    console.log(`- Checking Firestore collections...`);
    
    // Check 'users' collection
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    if (userDoc.exists) {
      await admin.firestore().collection('users').doc(uid).delete();
      console.log(`  ✓ Deleted from 'users' collection`);
    } else {
      console.log(`  ✓ No document in 'users' collection`);
    }
    
    // Check 'admins' collection
    const adminDoc = await admin.firestore().collection('admins').doc(uid).get();
    if (adminDoc.exists) {
      await admin.firestore().collection('admins').doc(uid).delete();
      console.log(`  ✓ Deleted from 'admins' collection`);
    } else {
      console.log(`  ✓ No document in 'admins' collection`);
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
      console.log(`  ✓ Deleted ${contentSnapshot.size} content items`);
    } else {
      console.log(`  ✓ No content items found`);
    }
    
    // Delete from Firebase Auth
    await admin.auth().deleteUser(uid);
    console.log(`✓ User deleted from Firebase Auth`);
    
    return true;
  } catch (error) {
    console.error(`Error deleting user ${uid}:`, error);
    return false;
  }
}

// Function to handle batch deletion
async function batchDelete() {
  // Ask for email pattern
  rl.question('Enter email pattern to filter users (leave empty for all): ', async (pattern) => {
    const users = await listUsers(pattern || null);
    
    if (users.length === 0) {
      console.log('No users found matching the criteria.');
      rl.close();
      return;
    }
    
    // Ask which users to delete
    rl.question(
      'Enter user numbers to delete (comma separated, or "all" for all listed): ',
      async (answer) => {
        let usersToDelete = [];
        
        if (answer.toLowerCase() === 'all') {
          usersToDelete = users;
        } else {
          // Parse selected indices
          const indices = answer.split(',')
            .map(s => parseInt(s.trim()))
            .filter(n => !isNaN(n) && n > 0 && n <= users.length);
          
          // Get selected users
          usersToDelete = indices.map(i => users[i - 1]);
        }
        
        if (usersToDelete.length === 0) {
          console.log('No valid users selected for deletion.');
          rl.close();
          return;
        }
        
        // Confirm deletion
        console.log(`\nYou've selected ${usersToDelete.length} users for deletion:`);
        usersToDelete.forEach((user, i) => {
          console.log(`${i + 1}. ${user.email} (${user.uid})`);
        });
        
        rl.question('\nAre you sure you want to delete these users? (yes/no): ', async (confirm) => {
          if (confirm.toLowerCase() !== 'yes') {
            console.log('Batch deletion cancelled.');
            rl.close();
            return;
          }
          
          console.log('\nStarting batch deletion...');
          
          // Delete users one by one
          let successCount = 0;
          let failCount = 0;
          
          for (const user of usersToDelete) {
            const success = await deleteUser(user.uid);
            if (success) {
              successCount++;
            } else {
              failCount++;
            }
          }
          
          console.log('\nBatch deletion completed:');
          console.log(`✅ Successfully deleted: ${successCount} users`);
          if (failCount > 0) {
            console.log(`❌ Failed to delete: ${failCount} users`);
          }
          
          rl.close();
        });
      }
    );
  });
}

// Function to recreate a specific admin user
async function recreateAdminUser() {
  const adminEmail = 'admin123@gmail.com';
  const adminPassword = 'Admin12345';
  const adminName = 'System Administrator';
  
  // First, try to delete the existing user
  try {
    const userRecord = await admin.auth().getUserByEmail(adminEmail);
    console.log(`Found existing admin user: ${userRecord.uid}`);
    
    // Delete from Firestore
    try {
      const adminDoc = await admin.firestore().collection('admins').doc(userRecord.uid).get();
      if (adminDoc.exists) {
        await admin.firestore().collection('admins').doc(userRecord.uid).delete();
        console.log(`Deleted admin document from Firestore`);
      }
    } catch (error) {
      console.log(`Error deleting from Firestore:`, error);
    }
    
    // Delete from Auth
    await admin.auth().deleteUser(userRecord.uid);
    console.log(`Deleted admin user from Firebase Auth`);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log(`Admin user does not exist, will create new`);
    } else {
      console.error(`Error looking up admin user:`, error);
      return false;
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
    
    // Set admin custom claims
    await admin.auth().setCustomUserClaims(newUserRecord.uid, {
      admin: true,
      role: 'admin'
    });
    
    // Create admin document
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

// Main function
async function main() {
  console.log('🔥 Firebase User Management Tool 🔥');
  console.log('-----------------------------------');
  console.log('1. Delete a specific user by email');
  console.log('2. Batch delete users');
  console.log('3. Recreate admin user (admin123@gmail.com)');
  
  rl.question('\nSelect an option (1-3): ', async (option) => {
    switch (option) {
      case '1':
        rl.question('Enter the email of the user to delete: ', async (email) => {
          await deleteUserByEmail(email);
          rl.close();
        });
        break;
        
      case '2':
        await batchDelete();
        break;
        
      case '3':
        await recreateAdminUser();
        rl.close();
        break;
        
      default:
        console.log('Invalid option selected.');
        rl.close();
    }
  });
}

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

// Run the script
main()
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
