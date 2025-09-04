const { auth } = require('./firebaseAdmin');

/**
 * Utility to debug and validate Firebase tokens
 * 
 * This script helps diagnose token-related issues by:
 * 1. Checking token format
 * 2. Attempting to verify the token
 * 3. Displaying detailed token information
 */

// Test token from command line argument or environment
const testToken = process.argv[2] || process.env.TEST_TOKEN;

if (!testToken) {
  console.log('❌ No token provided. Please provide a token as command line argument:');
  console.log('   node debug-token.js YOUR_TOKEN_HERE');
  process.exit(1);
}

// Basic format validation
console.log('📝 Token Information:');
console.log('---------------------------------------------------------');
console.log(`Length: ${testToken.length} characters`);
console.log(`Format: ${testToken.startsWith('eyJ') ? '✅ Begins with eyJ (likely JWT)' : '❌ Does not begin with eyJ (not a standard JWT)'}`);
console.log(`Preview: ${testToken.substring(0, 10)}...${testToken.substring(testToken.length - 5)}`);
console.log('---------------------------------------------------------');

// Structure check
const parts = testToken.split('.');
if (parts.length === 3) {
  console.log('✅ Token has 3 parts (header.payload.signature) - correct JWT structure');
  
  try {
    // Try to decode the header and payload parts
    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    console.log('\n📋 Token Header:');
    console.log(JSON.stringify(header, null, 2));
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    console.log('\n📋 Token Payload:');
    console.log(JSON.stringify(payload, null, 2));
    
    // Check for expiration
    if (payload.exp) {
      const expDate = new Date(payload.exp * 1000);
      const now = new Date();
      const isExpired = expDate < now;
      
      console.log('\n⏰ Expiration:');
      console.log(`Expires: ${expDate.toLocaleString()}`);
      console.log(`Current: ${now.toLocaleString()}`);
      console.log(`Status: ${isExpired ? '❌ EXPIRED' : '✅ Valid'}`);
    }
  } catch (e) {
    console.log('❌ Failed to decode token parts:', e.message);
  }
} else {
  console.log(`❌ Token has ${parts.length} parts instead of 3 - incorrect JWT structure`);
}

// Attempt verification with Firebase
console.log('\n🔐 Verifying token with Firebase...');
auth.verifyIdToken(testToken)
  .then(decodedToken => {
    console.log('✅ Token successfully verified!');
    console.log('\n📋 Decoded Token from Firebase:');
    console.log(JSON.stringify(decodedToken, null, 2));
  })
  .catch(error => {
    console.log('❌ Token verification failed:');
    console.log(error.message);
    
    // Additional troubleshooting based on error
    if (error.code === 'auth/argument-error') {
      console.log('\n👉 This might be a custom token rather than an ID token.');
      console.log('   Custom tokens need to be exchanged for ID tokens before use with verifyIdToken().');
    } else if (error.code === 'auth/id-token-expired') {
      console.log('\n👉 The token is expired. Get a new token from the client.');
    } else if (error.code === 'auth/invalid-argument') {
      console.log('\n👉 The token format is incorrect. Make sure it\'s a complete, unmodified JWT.');
    }
  })
  .finally(() => {
    console.log('\n💡 Troubleshooting Tips:');
    console.log('1. Ensure system clock is synchronized');
    console.log('2. For custom tokens, exchange them for ID tokens first');
    console.log('3. Check token expiration time');
    console.log('4. Verify Firebase project configuration');
  });
