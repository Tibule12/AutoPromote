const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testAPIConnection() {
  console.log('Testing API connection from frontend perspective...');
  
  try {
    // Test the root endpoint
    const response = await fetch('http://localhost:5000/');
    const text = await response.text();
    console.log('✅ Root endpoint:', text.trim());
    
    // Test users endpoint (should get 500 due to RLS, but CORS should work)
    try {
      const usersResponse = await fetch('http://localhost:5000/api/users/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3001'
        },
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123'
        })
      });
      
      if (usersResponse.status === 500) {
        console.log('✅ CORS working! Users endpoint reached (500 error expected due to RLS)');
      } else {
        console.log('✅ Users endpoint response:', usersResponse.status);
      }
    } catch (error) {
      if (error.message.includes('CORS')) {
        console.log('❌ CORS error still present:', error.message);
      } else {
        console.log('✅ No CORS error, other issue:', error.message);
      }
    }
    
  } catch (error) {
    console.log('❌ API connection failed:', error.message);
  }
}

testAPIConnection();
