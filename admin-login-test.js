// admin-login-test.js
// Node.js script to test admin login endpoint
// Usage: node admin-login-test.js

const fetch = require('node-fetch');

// Replace with your actual admin credentials and API endpoint
const ADMIN_EMAIL = 'admin123@gmail.com';
const ADMIN_PASSWORD = 'AutoAdmin123';
const LOGIN_ENDPOINT = 'https://autopromote.onrender.com/api/auth/login';

async function testAdminLogin() {
  try {
    // Step 1: Get Firebase ID token (simulate or use Firebase SDK if needed)
    // For demo, this script expects your backend to accept email/password directly
    // If you require Firebase token, you need to use Firebase Admin SDK or REST API
    const res = await fetch(LOGIN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Login failed:', data);
      return;
    }
    console.log('Login response:', data);
    if (data.user && (data.user.role === 'admin' || data.user.isAdmin === true)) {
      console.log('✅ Admin login successful!');
    } else {
      console.log('❌ Admin login did not return admin role:', data.user);
    }
  } catch (err) {
    console.error('Error during login:', err);
  }
}

testAdminLogin();
