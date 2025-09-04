/**
 * Test Backend Connectivity
 * 
 * This script tests connectivity to the backend API and verifies
 * that Firebase authentication is working correctly.
 */

require('dotenv').config();
const axios = require('axios');
const admin = require('firebase-admin');
const { adminConfig } = require('./config/firebase');

// Initialize Firebase Admin
if (admin.apps.length === 0) {
  admin.initializeApp(adminConfig);
}

// Configuration
const API_URL = 'https://autopromote.onrender.com';
const FIREBASE_EMAIL = 'test@example.com'; // Replace with a test user email
const FIREBASE_PASSWORD = 'testpassword123'; // Replace with a test user password

// Test function
async function testBackendConnectivity() {
  console.log('===============================================');
  console.log('   BACKEND CONNECTIVITY & AUTH TEST TOOL       ');
  console.log('===============================================');
  
  // Step 1: Check if the backend is reachable
  console.log('\n1. Testing backend connectivity...');
  try {
    const response = await axios.get(`${API_URL}/api/health`);
    console.log('✅ Backend is reachable');
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.log('❌ Backend is not reachable');
    console.log(`   Error: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Response: ${JSON.stringify(error.response.data)}`);
    }
  }
  
  // Step 2: Check Firebase Admin authentication
  console.log('\n2. Testing Firebase Admin authentication...');
  try {
    // List users to verify Firebase Admin is working
    const listUsersResult = await admin.auth().listUsers(1);
    console.log('✅ Firebase Admin authentication is working');
    console.log(`   Found ${listUsersResult.users.length} user(s) in the project`);
  } catch (error) {
    console.log('❌ Firebase Admin authentication is not working');
    console.log(`   Error: ${error.message}`);
  }
  
  // Step 3: Test custom token creation and verification
  console.log('\n3. Testing custom token creation and verification...');
  try {
    const uid = 'test-user-' + Date.now();
    
    // Create a custom token
    const customToken = await admin.auth().createCustomToken(uid);
    console.log('✅ Custom token created successfully');
    
    // Verify custom token with backend
    try {
      const response = await axios.post(`${API_URL}/api/auth/verify-custom-token`, {
        customToken
      });
      console.log('✅ Backend successfully verified custom token');
      console.log(`   Response: ${JSON.stringify(response.data)}`);
    } catch (error) {
      console.log('❌ Backend failed to verify custom token');
      console.log(`   Error: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Response: ${JSON.stringify(error.response.data)}`);
      }
    }
  } catch (error) {
    console.log('❌ Custom token creation failed');
    console.log(`   Error: ${error.message}`);
  }
  
  // Step 4: Test CORS configuration
  console.log('\n4. Testing CORS configuration...');
  try {
    const response = await axios.options(`${API_URL}/api/auth/login`, {
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST'
      }
    });
    console.log('✅ CORS is properly configured');
    console.log(`   Status: ${response.status}`);
    console.log(`   Access-Control-Allow-Origin: ${response.headers['access-control-allow-origin']}`);
  } catch (error) {
    console.log('❌ CORS may not be properly configured');
    console.log(`   Error: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Headers: ${JSON.stringify(error.response.headers)}`);
    }
  }
  
  console.log('\n===============================================');
  console.log('   TEST COMPLETE                                ');
  console.log('===============================================');
}

// Run the test
testBackendConnectivity().catch(console.error);
