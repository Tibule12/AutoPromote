const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testAPI() {
  console.log('Testing AutoPromote API endpoints...\n');

  try {
    // Test root endpoint
    console.log('1. Testing root endpoint...');
    const rootResponse = await axios.get('http://localhost:5000/');
    console.log('✓ Root endpoint:', rootResponse.data);
  } catch (error) {
    console.log('✗ Root endpoint error:', error.message);
  }

  try {
    // Test user registration
    console.log('\n2. Testing user registration...');
    const userData = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      role: 'creator'
    };
    const registerResponse = await axios.post(`${BASE_URL}/users/register`, userData);
    console.log('✓ User registered:', registerResponse.data);
  } catch (error) {
    console.log('✗ User registration error:', error.response?.data?.message || error.message);
  }

  try {
    // Test user login
    console.log('\n3. Testing user login...');
    const loginData = {
      email: 'test@example.com',
      password: 'password123'
    };
    const loginResponse = await axios.post(`${BASE_URL}/users/login`, loginData);
    console.log('✓ User logged in:', loginResponse.data);
  } catch (error) {
    console.log('✗ User login error:', error.response?.data?.message || error.message);
  }

  try {
    // Test getting all content
    console.log('\n4. Testing get all content...');
    const contentResponse = await axios.get(`${BASE_URL}/content`);
    console.log('✓ Content retrieved:', contentResponse.data);
  } catch (error) {
    console.log('✗ Get content error:', error.response?.data?.message || error.message);
  }

  console.log('\nAPI test completed!');
}

// Start the test
testAPI().catch(console.error);
