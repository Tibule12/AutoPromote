# Firebase Authentication Setup Guide

This guide provides instructions for setting up Firebase Authentication in the AutoPromote application.

## Client-Side Setup

### 1. Initialize Firebase in the client

Make sure the Firebase client is properly initialized in your React application:

```javascript
// firebaseConfig.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Import the client config
import { clientConfig } from './config/firebaseClient';

// Initialize Firebase
const app = initializeApp(clientConfig);
const auth = getAuth(app);
const storage = getStorage(app);

export { app, auth, storage };
```

### 2. Implement the Login Form

Create a LoginForm component that handles user authentication:

```javascript
// LoginForm.js
import React, { useState } from 'react';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const LoginForm = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const auth = getAuth();
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const idToken = await user.getIdToken();
      
      // Call your backend with the token
      const response = await fetch('https://autopromote.onrender.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, email }),
      });
      
      if (!response.ok) {
        throw new Error('Server authentication failed');
      }
      
      const data = await response.json();
      onLogin({ ...data.user, token: idToken });
    } catch (error) {
      console.error('Login error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
      {error && <div className="error">{error}</div>}
      <div>
        <label>Email:</label>
        <input 
          type="email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          required 
        />
      </div>
      <div>
        <label>Password:</label>
        <input 
          type="password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          required 
        />
      </div>
      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
};

export default LoginForm;
```

### 3. Use the token for API requests

Once authenticated, use the token for subsequent API requests:

```javascript
// Example API call with authentication token
const fetchUserProfile = async (token) => {
  const response = await fetch('https://autopromote.onrender.com/api/users/profile', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  return response.json();
};
```

## Server-Side Setup

The server is already configured to handle Firebase authentication. The login endpoint supports two authentication methods:

1. **ID Token Verification (Preferred)**: Client authenticates with Firebase directly and sends the ID token to the server
2. **Email/Password Authentication (Fallback)**: Server verifies credentials directly

## Creating Test Users

To create test users for Firebase Authentication:

1. Use the Firebase console to create users
2. Or use the Firebase Admin SDK to programmatically create users:

```javascript
const admin = require('firebase-admin');

async function createTestUser() {
  try {
    const userRecord = await admin.auth().createUser({
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test User'
    });
    
    console.log('Created test user:', userRecord.uid);
    
    // Add custom claims for admin role if needed
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'admin' });
    
    // Add user to Firestore database
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      email: 'test@example.com',
      name: 'Test User',
      role: 'admin',
      isAdmin: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('Added user data to Firestore');
  } catch (error) {
    console.error('Error creating test user:', error);
  }
}

createTestUser();
```

## Troubleshooting

1. **401 Unauthorized Errors**: Check that your token is being correctly sent in the Authorization header
2. **Invalid Token Errors**: Ensure your Firebase configuration is correct and you're using the right project
3. **Missing User Data**: Check that your user exists in the Firestore database
4. **CORS Errors**: Ensure your CORS configuration includes your frontend domain
