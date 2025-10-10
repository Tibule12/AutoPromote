// admin-login-firestore-test.js
// Node.js script to test admin login and Firestore admin recognition
// Usage: node admin-login-firestore-test.js

const fetch = require('node-fetch');

const ADMIN_EMAIL = 'Admin12@gmail.com';
const ADMIN_PASSWORD = 'Admin12345';
const LOGIN_ENDPOINT = 'https://autopromote.onrender.com/api/auth/login';

async function testAdminLogin() {
  try {
    // This script assumes your backend accepts email/password for login
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
      console.log('✅ Admin login recognized by backend and Firestore!');
    } else {
      console.log('❌ Admin login did NOT return admin role:', data.user);
    }
  } catch (err) {
    console.error('Error during login:', err);
  }
}

testAdminLogin();
