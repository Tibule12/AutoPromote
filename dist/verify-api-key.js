// verify-api-key.js
const fetch = require('node-fetch');

async function verifyApiKey() {
  try {
    const apiKey = 'AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY';
    console.log('Testing Firebase API Key:', apiKey);
    
    // Create a dummy request to test the API key
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          continueUri: 'http://localhost',
          identifier: 'test@example.com',
        }),
      }
    );
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ API Key is valid and working!');
      console.log('Response:', JSON.stringify(data, null, 2));
    } else if (data.error && data.error.message === 'API key not valid. Please pass a valid API key.') {
      console.log('❌ API Key is NOT valid!');
      console.log('Error:', data.error.message);
    } else {
      console.log('⚠️ API request worked but returned an error:');
      console.log('Status:', response.status);
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Error testing API key:', error);
  }
}

verifyApiKey();
