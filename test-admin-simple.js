const fetch = require('node-fetch');

async function testAdminLoginAndEndpoint() {
  try {
    // Step 1: Create admin user first (in case it doesn't exist)
    console.log('Creating or verifying admin user...');
    const { auth } = require('./firebaseAdmin');
    const email = 'admin123@gmail.com';
    const password = 'Admin12345';
    
    try {
      let userId;
      try {
        const userRecord = await auth.getUserByEmail(email);
        console.log('Admin user exists with UID:', userRecord.uid);
        userId = userRecord.uid;
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          const newUser = await auth.createUser({
            email,
            password,
            emailVerified: true
          });
          userId = newUser.uid;
          console.log('Created new admin user with UID:', userId);
        } else {
          throw error;
        }
      }
      
      // Set admin custom claims
      await auth.setCustomUserClaims(userId, { admin: true, role: 'admin' });
      console.log('Set admin custom claims for user');
    } catch (error) {
      console.error('Error setting up admin user:', error);
    }
    
    // Step 2: Perform login to get token
    console.log('\nLogging in as admin...');
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const loginData = await loginResponse.json();
    console.log('Login response status:', loginResponse.status);
    
    if (!loginData.token) {
      console.error('Login failed, no token received:', loginData);
      return;
    }
    
    console.log('Login successful, token received');
    const token = loginData.token;
    
    // Step 3: Test an admin endpoint
    console.log('\nTesting admin analytics overview endpoint...');
    const analyticsResponse = await fetch('http://localhost:5000/api/admin/analytics/overview', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const status = analyticsResponse.status;
    console.log('Admin analytics response status:', status);
    
    if (status === 200) {
      console.log('Admin endpoint access successful!');
      const data = await analyticsResponse.json();
      console.log('Is mock data:', data.isMockData || false);
    } else {
      console.error('Admin endpoint access failed');
      try {
        const errorData = await analyticsResponse.json();
        console.error('Error details:', errorData);
      } catch (e) {
        console.error('Could not parse error response');
      }
    }
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

testAdminLoginAndEndpoint();
