/**
 * Firebase Token Verification Test
 * 
 * This script helps diagnose issues with Firebase token verification.
 * It attempts to verify a Firebase ID token and displays detailed information
 * about the token and any errors that occur.
 * 
 * Usage: 
 * 1. Add a test token to your .env file as TEST_FIREBASE_TOKEN
 * 2. Run this script: node test-token-verification.js
 */

require('dotenv').config();
const { auth, admin } = require('./firebaseAdmin');

// Get test token from environment variable or use a provided token
const testToken = process.env.TEST_FIREBASE_TOKEN || process.argv[2];

if (!testToken) {
  console.error('❌ No test token provided. Please add TEST_FIREBASE_TOKEN to your .env file or pass a token as an argument.');
  console.log('Usage: node test-token-verification.js [optional-token]');
  process.exit(1);
}

console.log('Starting Firebase token verification test...');
console.log('-------------------------------------');

// Print token information (first 10 chars for security)
console.log(`Token: ${testToken.substring(0, 10)}...${testToken.substring(testToken.length - 5)}`);
console.log(`Token length: ${testToken.length} characters`);
console.log('-------------------------------------');

// Attempt to verify the token
console.log('Verifying token...');

auth.verifyIdToken(testToken)
  .then(decodedToken => {
    console.log('✅ Token verification successful!');
    console.log('-------------------------------------');
    console.log('Decoded token information:');
    console.log('- User ID:', decodedToken.uid);
    console.log('- Email:', decodedToken.email);
    console.log('- Email verified:', decodedToken.email_verified);
    console.log('- Name:', decodedToken.name);
    console.log('- Picture:', decodedToken.picture);
    console.log('- Is admin:', decodedToken.admin === true);
    console.log('- Role:', decodedToken.role || 'Not specified');
    console.log('- Auth time:', new Date(decodedToken.auth_time * 1000).toLocaleString());
    console.log('- Issued at:', new Date(decodedToken.iat * 1000).toLocaleString());
    console.log('- Expires at:', new Date(decodedToken.exp * 1000).toLocaleString());

    // Check for imminent expiration
    const expirationTime = decodedToken.exp * 1000;
    const currentTime = Date.now();
    const timeToExpire = expirationTime - currentTime;
    
    if (timeToExpire < 0) {
      console.log('⚠️ WARNING: Token has already expired!');
    } else if (timeToExpire < 60 * 60 * 1000) {
      console.log(`⚠️ WARNING: Token will expire soon (in ${Math.round(timeToExpire / 60000)} minutes)`);
    } else {
      console.log(`✅ Token is valid for ${Math.round(timeToExpire / 3600000)} more hours`);
    }

    console.log('-------------------------------------');

    // Test getting user record
    return auth.getUser(decodedToken.uid)
      .then(userRecord => {
        console.log('✅ Successfully retrieved user record');
        console.log('- Display name:', userRecord.displayName);
        console.log('- Email:', userRecord.email);
        console.log('- Phone number:', userRecord.phoneNumber);
        console.log('- Photo URL:', userRecord.photoURL);
        console.log('- Email verified:', userRecord.emailVerified);
        console.log('- Created at:', userRecord.metadata.creationTime);
        console.log('- Last sign in:', userRecord.metadata.lastSignInTime);
        console.log('- Custom claims:', JSON.stringify(userRecord.customClaims, null, 2));
      })
      .catch(userError => {
        console.error('❌ Failed to retrieve user record:', userError.message);
      });
  })
  .catch(error => {
    console.error('❌ Token verification failed!');
    console.log('-------------------------------------');
    console.log('Error details:');
    console.log('- Error code:', error.code);
    console.log('- Error message:', error.message);
    console.log('-------------------------------------');
    
    // Provide guidance based on error code
    switch(error.code) {
      case 'auth/id-token-expired':
        console.log('📋 Your token has expired. Get a new token from the client side.');
        break;
      case 'auth/id-token-revoked':
        console.log('📋 Your token has been revoked. User needs to re-authenticate.');
        break;
      case 'auth/invalid-id-token':
        console.log('📋 The token format is invalid. Check that you are sending a Firebase ID token.');
        break;
      case 'auth/argument-error':
        console.log('📋 The token is malformed or has an incorrect format.');
        break;
      default:
        console.log('📋 This might be a credential or project configuration issue.');
        console.log('   - Check that your Firebase Admin SDK is properly initialized');
        console.log('   - Verify your .env configuration');
        console.log('   - Make sure you are using the correct project');
        break;
    }
  })
  .finally(() => {
    console.log('Token verification test completed.');
  });
