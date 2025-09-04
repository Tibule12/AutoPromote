const { auth } = require('./firebaseAdmin');

// Test token verification
async function testTokenVerification() {
  console.log('🔍 Testing Token Verification...\n');

  // Test with a dummy token first
  const dummyToken = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjFlOTczZDU4ODVjZjE5M2Q4MzQ3N2U5ZjgxNGVkZjY4MzY4NzY5ZjciLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vYXV0b3Byb21vdGUtNDY0ZGUiLCJhdWQiOiJhdXRvcHJvbW90ZS00NjRkZSIsImF1dGhfdGltZSI6MTcyNjI3MzQ4MywidXNlcl9pZCI6IlFLaERyVkRpMkFXaFM3UWJ1OGZIVGtsZVdIRjMiLCJzdWIiOiJRS0hkclZEaTJBV2hTN1FidThmSFRrbGVXSEYzIiwiaWF0IjoxNzI2MjczNDgzLCJleHAiOjE3MjYyNzcwODMsImVtYWlsIjoidG10c2h3ZWxvMjFAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZW1haWwiOlsidG10c2h3ZWxvMjFAZ21haWwuY29tIl19LCJzaWduX2luX3Byb3ZpZGVyIjoicGFzc3dvcmQifX0';

  try {
    console.log('Testing dummy token verification...');
    const decodedToken = await auth.verifyIdToken(dummyToken);
    console.log('✅ Dummy token verification successful');
    console.log('Decoded token:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      exp: decodedToken.exp,
      iat: decodedToken.iat
    });
  } catch (error) {
    console.log('❌ Dummy token verification failed:', error.message);
    console.log('Error code:', error.code);
  }

  console.log('\n📝 To test with a real token:');
  console.log('1. Open your browser and login to the app');
  console.log('2. Open browser dev tools (F12)');
  console.log('3. Go to Application > Local Storage > http://localhost:3000');
  console.log('4. Copy the Firebase ID token');
  console.log('5. Run: node test-token-debug.js <your-token-here>');
}

// If a token is provided as command line argument, test it
if (process.argv[2]) {
  const tokenToTest = process.argv[2];
  console.log('Testing provided token...');

  auth.verifyIdToken(tokenToTest)
    .then(decodedToken => {
      console.log('✅ Token verification successful');
      console.log('Decoded token:', {
        uid: decodedToken.uid,
        email: decodedToken.email,
        exp: decodedToken.exp,
        iat: decodedToken.iat,
        admin: decodedToken.admin,
        role: decodedToken.role
      });
    })
    .catch(error => {
      console.log('❌ Token verification failed:', error.message);
      console.log('Error code:', error.code);
      console.log('Error details:', error);
    });
} else {
  testTokenVerification();
}
