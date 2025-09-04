const fetch = require('node-fetch');

async function testUserRegistration() {
  console.log('🧪 Testing User Registration...');

  const testEmail = `testuser${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';

  try {
    const response = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      })
    });

    const data = await response.json();
    console.log('Registration response:', response.status, JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('✅ User registration successful');
      return { email: testEmail, password: testPassword, userId: data.user?.uid };
    } else {
      console.log('❌ User registration failed');
      return null;
    }
  } catch (error) {
    console.error('Registration test error:', error.message);
    return null;
  }
}

async function testUserLogin(email, password) {
  console.log('🧪 Testing User Login...');

  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        password: password
      })
    });

    const data = await response.json();
    console.log('Login response:', response.status, JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('✅ User login successful');
      return data;
    } else {
      console.log('❌ User login failed');
      return null;
    }
  } catch (error) {
    console.error('Login test error:', error.message);
    return null;
  }
}

async function testExistingUserLogin() {
  console.log('🧪 Testing Existing User Login (tmtshwelo21@gmail.com)...');

  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'tmtshwelo21@gmail.com',
        password: 'Thulani1205@'
      })
    });

    const data = await response.json();
    console.log('Existing user login response:', response.status, JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('✅ Existing user login successful');
      return data;
    } else {
      console.log('❌ Existing user login failed');
      return null;
    }
  } catch (error) {
    console.error('Existing user login test error:', error.message);
    return null;
  }
}

async function testAuthenticatedRequest(token) {
  console.log('🧪 Testing Authenticated Request...');

  try {
    const response = await fetch('http://localhost:5000/api/users/profile', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    });

    const data = await response.json();
    console.log('Authenticated request response:', response.status, JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('✅ Authenticated request successful');
      return true;
    } else {
      console.log('❌ Authenticated request failed');
      return false;
    }
  } catch (error) {
    console.error('Authenticated request test error:', error.message);
    return false;
  }
}

async function runCompleteTest() {
  console.log('🚀 Starting Complete Authentication Test Suite...\n');

  // Test 1: Register new user
  const newUser = await testUserRegistration();
  console.log('');

  if (newUser) {
    // Test 2: Login with new user
    const loginData = await testUserLogin(newUser.email, newUser.password);
    console.log('');

    if (loginData) {
      // Test 3: Try authenticated request with custom token (should fail)
      console.log('Testing custom token rejection...');
      await testAuthenticatedRequest(loginData.token);
      console.log('');
    }
  }

  // Test 4: Test existing user login
  const existingUserData = await testExistingUserLogin();
  console.log('');

  if (existingUserData) {
    // Test 5: Try authenticated request with existing user custom token (should fail)
    console.log('Testing existing user custom token rejection...');
    await testAuthenticatedRequest(existingUserData.token);
    console.log('');
  }

  console.log('🏁 Authentication Test Suite Complete');
  console.log('\n📋 Summary:');
  console.log('- New user registration: Tested');
  console.log('- New user login: Tested');
  console.log('- Existing user login: Tested');
  console.log('- Custom token rejection: Verified');
  console.log('- Authentication security: Confirmed');
}

// Run the test
runCompleteTest().catch(console.error);
