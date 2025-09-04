/**
 * Firebase Authentication Test
 * 
 * This script tests Firebase Authentication service, looking for specific issues
 * related to authentication and user management.
 */

require('dotenv').config();
const { auth, admin } = require('./firebaseAdmin');

console.log('Starting Firebase Authentication test...');
console.log('-------------------------------------');

// Check Firebase Admin initialization
if (!admin.apps.length) {
  console.error('❌ Firebase Admin SDK is not initialized');
  process.exit(1);
}

console.log('✅ Firebase Admin SDK is initialized');
console.log('-------------------------------------');

// Test Authentication connection
console.log('Testing basic Authentication connection...');

auth.listUsers(1)
  .then(listUsersResult => {
    console.log('✅ Successfully connected to Firebase Authentication');
    console.log(`Found ${listUsersResult.users.length} user(s) in the project`);
    console.log('-------------------------------------');
    
    // Check for admin users
    console.log('Checking for admin users...');
    return auth.listUsers()
      .then(allUsers => {
        console.log(`Total users in project: ${allUsers.users.length}`);
        
        // Look for users with admin custom claims
        const adminUsers = allUsers.users.filter(user => 
          user.customClaims && (user.customClaims.admin === true || user.customClaims.role === 'admin')
        );
        
        if (adminUsers.length > 0) {
          console.log(`✅ Found ${adminUsers.length} user(s) with admin privileges:`);
          adminUsers.forEach(user => {
            console.log(`- ${user.email || user.uid} (${user.displayName || 'No display name'})`);
          });
        } else {
          console.log('❌ No users with admin privileges found');
          console.log('This might cause 401 errors when trying to access admin endpoints');
        }
        
        console.log('-------------------------------------');
        
        // Test email/password authentication
        console.log('Testing user lookup by email...');
        
        // Use the first user's email for testing
        if (allUsers.users.length > 0) {
          const testUserEmail = allUsers.users[0].email;
          
          if (testUserEmail) {
            return auth.getUserByEmail(testUserEmail)
              .then(userRecord => {
                console.log(`✅ Successfully retrieved user by email: ${testUserEmail}`);
                console.log(`User ID: ${userRecord.uid}`);
                console.log(`Email verified: ${userRecord.emailVerified}`);
                console.log(`Provider(s): ${userRecord.providerData.map(p => p.providerId).join(', ')}`);
                
                return userRecord;
              })
              .catch(error => {
                console.error(`❌ Failed to retrieve user by email: ${error.message}`);
              });
          } else {
            console.log('❌ No user with email found for testing');
            return null;
          }
        } else {
          console.log('❌ No users available for testing');
          return null;
        }
      })
      .then(userRecord => {
        if (!userRecord) return;
        
        console.log('-------------------------------------');
        console.log('Testing custom token creation...');
        
        // Test creating a custom token
        return auth.createCustomToken(userRecord.uid)
          .then(customToken => {
            console.log('✅ Successfully created custom token');
            console.log(`Custom token length: ${customToken.length} characters`);
            
            // The custom token test is successful if we can create it
            // But we can't verify it without the client side Firebase SDK
            console.log('Note: Custom token can only be verified on the client side');
          })
          .catch(error => {
            console.error(`❌ Failed to create custom token: ${error.message}`);
            console.log('This might indicate issues with the service account permissions');
          });
      })
      .then(() => {
        console.log('-------------------------------------');
        console.log('✅ Firebase Authentication tests completed');
        
        // Recommendations based on test results
        console.log('\nRecommendations:');
        console.log('1. If you\'re experiencing 401 errors, ensure that:');
        console.log('   - The user has the correct custom claims (admin: true or role: admin)');
        console.log('   - The token being verified is not expired');
        console.log('   - The service account has the correct permissions');
        console.log('\n2. To test with a specific user token:');
        console.log('   - Use the test-token-verification.js script');
        console.log('   - Add a user token to your .env file as TEST_FIREBASE_TOKEN');
      });
  })
  .catch(error => {
    console.error('❌ Failed to connect to Firebase Authentication');
    console.error(`Error: ${error.message}`);
    console.log('-------------------------------------');
    
    // Provide guidance based on error
    console.log('Possible issues:');
    console.log('1. Firebase project ID is incorrect or the project doesn\'t exist');
    console.log('2. Service account lacks the necessary permissions');
    console.log('3. Service account has been revoked or is invalid');
    console.log('4. Environment variables are not properly configured');
    
    console.log('\nTry these steps:');
    console.log('1. Check your .env file for correct Firebase credentials');
    console.log('2. Regenerate your service account key in Firebase Console');
    console.log('3. Make sure your project is active and not suspended');
  });
