const fetch = require('node-fetch');

async function testPort8080() {
  console.log('🔍 Testing if server is responding on port 8080...');
  
  try {
    console.log('Trying to connect to http://localhost:8080/api/health...');
    const response = await fetch('http://localhost:8080/api/health');
    console.log(`Response status: ${response.status}`);
    
    const data = await response.json();
    console.log('Response data:', data);
    
    console.log('✅ Server is responding on port 8080!');
  } catch (error) {
    console.log(`❌ Failed to connect: ${error.message}`);
    console.log('Server is not responding on port 8080.');
  }
}

testPort8080();
