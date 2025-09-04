// This is a test script for the updated admin credentials
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { app } = require('./firebaseClient');

async function testAdminAuth() {
  try {
    const auth = getAuth(app);
    console.log('Testing admin login with updated credentials...');
    
    const email = 'admin@autopromote.com';
    const password = 'AdminPass123!';
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      console.log('Login successful!');
      console.log('User ID:', user.uid);
      console.log('Email:', user.email);
      
      // Get the ID token to check claims
      const idToken = await user.getIdToken(true);
      console.log('ID Token (first 50 chars):', idToken.substring(0, 50) + '...');
      
      // Test admin API endpoint
      const fetch = require('node-fetch');
      console.log('\nTesting admin API endpoint...');
      const response = await fetch('http://localhost:5001/api/admin/analytics/overview', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      console.log('API response status:', response.status);
      
      if (response.status === 200) {
        const data = await response.json();
        console.log('Response contains mock data:', data.isMockData === true ? 'Yes' : 'No');
        console.log('API access successful!');
      } else {
        console.error('API access failed with status:', response.status);
        try {
          const errorData = await response.json();
          console.error('Error details:', errorData);
        } catch (e) {
          console.error('Could not parse error response');
        }
      }
      
    } catch (authError) {
      console.error('Authentication failed:', authError.message);
      console.error('Error code:', authError.code);
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testAdminAuth();
