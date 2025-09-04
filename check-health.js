const fetch = require('node-fetch');

async function checkHealth() {
  try {
    console.log('Checking server health at http://localhost:8080/api/health...');
    const response = await fetch('http://localhost:8080/api/health');
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Server is healthy!');
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      console.log('❌ Server returned an error:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('❌ Failed to connect to server:', error.message);
  }
}

checkHealth();
