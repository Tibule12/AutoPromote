const fetch = require('node-fetch');

async function testLogin() {
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'tmtshwelo21@gmail.com',
        password: 'Thulani1205@'
      })
    });

    const data = await response.json();
    console.log('Login response:', data);
  } catch (error) {
    console.error('Error during login test:', error);
  }
}

testLogin();
