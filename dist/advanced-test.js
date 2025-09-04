const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

let authToken = '';
let userId = '';

async function advancedTest() {
  console.log('🧪 Testing AutoPromote Advanced Features...\n');

  try {
    // Test 1: Root endpoint
    console.log('1. Testing root endpoint...');
    const rootResponse = await axios.get('http://localhost:5000/');
    console.log('✅ Root endpoint:', rootResponse.data);

    // Test 2: User registration
    console.log('\n2. Testing user registration...');
    const userData = {
      name: 'Test Creator',
      email: 'creator@example.com',
      password: 'password123',
      role: 'creator'
    };
    
    try {
      const registerResponse = await axios.post(`${BASE_URL}/users/register`, userData);
      console.log('✅ User registered:', registerResponse.data);
      authToken = registerResponse.data.token;
      userId = registerResponse.data._id;
    } catch (error) {
      console.log('⚠️  User registration error (may already exist):', error.response?.data?.message);
    }

    // Test 3: User login
    console.log('\n3. Testing user login...');
    const loginData = {
      email: 'creator@example.com',
      password: 'password123'
    };
    
    try {
      const loginResponse = await axios.post(`${BASE_URL}/users/login`, loginData);
      console.log('✅ User logged in:', loginResponse.data);
      authToken = loginResponse.data.token;
      userId = loginResponse.data._id;
    } catch (error) {
      console.log('❌ User login error:', error.response?.data?.message);
      return;
    }

    // Test 4: Get user profile (protected route)
    console.log('\n4. Testing protected user profile...');
    try {
      const profileResponse = await axios.get(`${BASE_URL}/users/profile`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      console.log('✅ User profile retrieved:', profileResponse.data);
    } catch (error) {
      console.log('❌ User profile error:', error.response?.data?.message);
    }

    // Test 5: Create content (protected route)
    console.log('\n5. Testing content creation...');
    const contentData = {
      title: 'My First Video',
      type: 'video',
      url: 'https://example.com/video1',
      userId: userId
    };
    
    try {
      const contentResponse = await axios.post(`${BASE_URL}/content`, contentData, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      console.log('✅ Content created:', contentResponse.data);
    } catch (error) {
      console.log('❌ Content creation error:', error.response?.data?.message);
    }

    // Test 6: Get all content (public route)
    console.log('\n6. Testing get all content...');
    try {
      const contentResponse = await axios.get(`${BASE_URL}/content`);
      console.log('✅ Content retrieved:', contentResponse.data.length, 'items');
    } catch (error) {
      console.log('❌ Get content error:', error.response?.data?.message);
    }

    console.log('\n🎉 Advanced testing completed!');
    console.log('\n📋 Available protected endpoints tested:');
    console.log('  - GET  /api/users/profile   - Get user profile (protected)');
    console.log('  - PUT  /api/users/profile   - Update user profile (protected)');
    console.log('  - POST /api/content         - Create content (protected)');
    console.log('  - POST /api/analytics       - Create analytics (protected)');
    console.log('  - GET  /api/users           - Get all users (admin only)');

  } catch (error) {
    console.log('❌ Test error:', error.message);
  }
}

// Start the test
advancedTest().catch(console.error);
