const axios = require('axios');
const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, deleteUser } = require('firebase/auth');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY",
  authDomain: "autopromote-464de.firebaseapp.com",
  projectId: "autopromote-464de",
  storageBucket: "autopromote-464de.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const API_BASE_URL = 'http://localhost:5000';

async function testRegistration() {
  console.log('\n=== Testing Registration Flow ===');

  const testEmail = `testuser_${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  const testName = 'Test User';

  try {
    console.log(`Attempting to register user: ${testEmail}`);

    // Test Firebase Auth registration
    console.log('1. Creating user in Firebase Auth...');
    const userCredential = await createUserWithEmailAndPassword(auth, testEmail, testPassword);
    const user = userCredential.user;
    console.log('✅ Firebase Auth registration successful:', user.uid);

    // Test backend registration endpoint
    console.log('2. Testing backend registration endpoint...');
    const backendResponse = await axios.post(`${API_BASE_URL}/api/auth/register`, {
      name: testName,
      email: testEmail,
      password: testPassword
    });
    console.log('✅ Backend registration successful:', backendResponse.data);

    // Test login after registration
    console.log('3. Testing login after registration...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      email: testEmail,
      password: testPassword
    });
    console.log('✅ Login successful:', loginResponse.data);

    // Clean up - delete the test user
    console.log('4. Cleaning up test user...');
    await deleteUser(user);
    console.log('✅ Test user deleted successfully');

    return { success: true, email: testEmail };

  } catch (error) {
    console.error('❌ Registration test failed:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

async function testLogin() {
  console.log('\n=== Testing Login Flow ===');

  // Use existing admin user for login test
  const adminEmail = 'admin123@gmail.com';
  const adminPassword = 'AdminAuto123';

  try {
    console.log(`Attempting to login as admin: ${adminEmail}`);

    // Test Firebase Auth login
    console.log('1. Testing Firebase Auth login...');
    const userCredential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
    const user = userCredential.user;
    console.log('✅ Firebase Auth login successful:', user.uid);

    // Get ID token
    const idToken = await user.getIdToken();
    console.log('✅ ID token obtained');

    // Test backend login endpoint
    console.log('2. Testing backend login endpoint...');
    const backendResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      idToken: idToken,
      email: adminEmail
    });
    console.log('✅ Backend login successful:', backendResponse.data);

    // Test admin login endpoint
    console.log('3. Testing admin login endpoint...');
    const adminResponse = await axios.post(`${API_BASE_URL}/api/auth/admin-login`, {
      idToken: idToken,
      email: adminEmail
    });
    console.log('✅ Admin login successful:', adminResponse.data);

    return { success: true, email: adminEmail };

  } catch (error) {
    console.error('❌ Login test failed:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

async function testTokenVerification() {
  console.log('\n=== Testing Token Verification ===');

  try {
    // First login to get a token
    const userCredential = await signInWithEmailAndPassword(auth, 'admin123@gmail.com', 'AdminAuto123');
    const idToken = await userCredential.user.getIdToken();

    console.log('1. Testing token verification endpoint...');
    const verifyResponse = await axios.get(`${API_BASE_URL}/api/auth/verify`, {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });
    console.log('✅ Token verification successful:', verifyResponse.data);

    return { success: true };

  } catch (error) {
    console.error('❌ Token verification test failed:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 Starting Registration and Login Tests');
  console.log('========================================');

  // Test registration flow
  const registrationResult = await testRegistration();

  // Test login flow
  const loginResult = await testLogin();

  // Test token verification
  const tokenResult = await testTokenVerification();

  // Summary
  console.log('\n=== Test Results Summary ===');
  console.log('Registration:', registrationResult.success ? '✅ PASSED' : '❌ FAILED');
  console.log('Login:', loginResult.success ? '✅ PASSED' : '❌ FAILED');
  console.log('Token Verification:', tokenResult.success ? '✅ PASSED' : '❌ FAILED');

  if (!registrationResult.success || !loginResult.success || !tokenResult.success) {
    console.log('\n❌ Some tests failed. Check the error messages above.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed successfully!');
    process.exit(0);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
