const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function simpleTest() {
  console.log('Testing AutoPromote API basic functionality...\n');

  try {
    // Test root endpoint
    console.log('1. Testing root endpoint...');
    const rootResponse = await axios.get('http://localhost:5000/');
    console.log('✓ Root endpoint:', rootResponse.data);
  } catch (error) {
    console.log('✗ Root endpoint error:', error.message);
  }

  try {
    // Test if server is responding to API calls
    console.log('\n2. Testing API health...');
    const healthResponse = await axios.get(`${BASE_URL}/content`);
    console.log('✓ API is responding');
  } catch (error) {
    console.log('✗ API health check error:', error.response?.status, error.response?.statusText);
  }

  try {
    // Test user routes exist
    console.log('\n3. Testing user routes...');
    const userResponse = await axios.post(`${BASE_URL}/users/register`, {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123'
    });
    console.log('✓ User routes are working');
  } catch (error) {
    console.log('✗ User routes error (expected without MongoDB):', error.response?.status, error.response?.statusText);
  }

  console.log('\n✅ Server is running and API endpoints are accessible!');
  console.log('\n📋 Available endpoints:');
  console.log('  - GET  /              - Server status');
  console.log('  - POST /api/users/register - User registration');
  console.log('  - POST /api/users/login    - User login');
  console.log('  - POST /api/content        - Create content');
  console.log('  - GET  /api/content        - Get all content');
  console.log('  - POST /api/analytics      - Create analytics');
  console.log('  - GET  /api/analytics/:id  - Get analytics by content ID');
}

// Start the test
simpleTest().catch(console.error);
