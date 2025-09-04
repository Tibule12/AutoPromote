const fetch = require('node-fetch');

// Test if the server is actually listening on port 5000
// This test bypasses other complex dependencies
async function testServerOnly() {
  console.log('🔍 Testing if server is actually listening on port 5000...');
  
  try {
    // Check a few different endpoints to see if any respond
    const endpoints = [
      '/api/health',
      '/api',
      '/'
    ];
    
    let serverResponding = false;
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying to connect to http://localhost:5000${endpoint}...`);
        const response = await fetch(`http://localhost:5000${endpoint}`);
        console.log(`Response status for ${endpoint}: ${response.status}`);
        serverResponding = true;
        break;
      } catch (error) {
        console.log(`Failed to connect to ${endpoint}: ${error.message}`);
      }
    }
    
    if (serverResponding) {
      console.log('✅ Server is responding to requests!');
    } else {
      console.log('❌ Server is not responding to any requests.');
      console.log('This could be due to:');
      console.log('1. Port 5000 is already in use by another application');
      console.log('2. Server is not binding correctly to the interface');
      console.log('3. A firewall is blocking the connection');
    }
  } catch (error) {
    console.error('Error in server test:', error);
  }
}

testServerOnly();
