# Firebase Custom Token Exchange Guide

## Overview
This guide explains how to properly handle Firebase custom tokens returned by the AutoPromote API login endpoint.

## Problem
The login endpoint returns Firebase custom tokens for email/password authentication. These custom tokens **cannot** be used directly for authenticated API requests. They must be exchanged for ID tokens first.

## Solution
Use the Firebase Authentication SDK to exchange custom tokens for ID tokens.

## Implementation Steps

### 1. Login Request
```javascript
// Send login request to your API
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const data = await response.json();
```

### 2. Check Token Type
```javascript
if (data.tokenType === 'custom_token') {
  console.log('Received custom token, must exchange for ID token');
  console.log('Exchange instructions:', data.tokenInstructions.exchangeInstructions);
}
```

### 3. Exchange Custom Token for ID Token
```javascript
import { getAuth, signInWithCustomToken } from 'firebase/auth';

// Initialize Firebase Auth
const auth = getAuth();

try {
  // Sign in with custom token
  const userCredential = await signInWithCustomToken(auth, data.token);

  // Get the ID token
  const idToken = await userCredential.user.getIdToken();

  console.log('Successfully exchanged custom token for ID token');
  console.log('ID Token:', idToken);

  // Now you can use the ID token for authenticated requests
  // Store it securely (localStorage, secure cookie, etc.)
  localStorage.setItem('idToken', idToken);

} catch (error) {
  console.error('Error exchanging custom token:', error);
}
```

### 4. Use ID Token for API Requests
```javascript
// Use the ID token for authenticated requests
const apiResponse = await fetch('/api/protected-endpoint', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  }
});
```

### 5. Handle Token Refresh
```javascript
// Firebase automatically refreshes ID tokens
// Listen for auth state changes to get updated tokens
import { onAuthStateChanged } from 'firebase/auth';

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const freshIdToken = await user.getIdToken();
    localStorage.setItem('idToken', freshIdToken);
  }
});
```

## Complete Example
```javascript
import { getAuth, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';

const auth = getAuth();

async function login(email, password) {
  try {
    // 1. Login via your API
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // 2. Check if we got a custom token
    if (data.tokenType === 'custom_token') {
      // 3. Exchange custom token for ID token
      const userCredential = await signInWithCustomToken(auth, data.token);
      const idToken = await userCredential.user.getIdToken();

      // 4. Store the ID token
      localStorage.setItem('idToken', idToken);

      console.log('Login successful with ID token');
      return { user: data.user, idToken };
    } else {
      // Already got an ID token
      localStorage.setItem('idToken', data.token);
      return { user: data.user, idToken: data.token };
    }

  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

// Listen for token refresh
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const freshToken = await user.getIdToken();
    localStorage.setItem('idToken', freshToken);
  }
});
```

## Important Notes

1. **Never send custom tokens directly in Authorization headers** - they will be rejected by the auth middleware.

2. **Always exchange custom tokens for ID tokens** before making authenticated requests.

3. **Store ID tokens securely** - use localStorage, sessionStorage, or secure HTTP-only cookies.

4. **Handle token expiration** - Firebase automatically refreshes ID tokens, but you should listen for auth state changes.

5. **For ID token login** - if your frontend already uses Firebase Auth, you can pass the ID token directly to the login endpoint.

## API Response Format
```json
{
  "message": "Login successful",
  "user": {
    "uid": "user-uid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "user",
    "isAdmin": false,
    "fromCollection": "users"
  },
  "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
  "tokenType": "custom_token",
  "tokenInstructions": {
    "type": "custom_token",
    "message": "This is a Firebase custom token. You must exchange it for an ID token before using it for authenticated requests.",
    "exchangeInstructions": "Use Firebase Auth SDK: firebase.auth().signInWithCustomToken(token).then(() => firebase.auth().currentUser.getIdToken())",
    "note": "Do not send custom tokens directly in Authorization headers. Always exchange them for ID tokens first."
  }
}
```

## Troubleshooting

### Error: "Invalid token format"
- You're sending a custom token directly in the Authorization header
- Exchange the custom token for an ID token first

### Error: "Token expired"
- ID tokens expire after 1 hour
- Firebase automatically refreshes them when you call `getIdToken()`

### Error: "auth/argument-error"
- The auth middleware received a custom token instead of an ID token
- Ensure you're exchanging custom tokens before sending them
