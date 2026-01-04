# Debugging Guide: Login API Endpoint

This guide helps you debug issues with the `/api/auth/login` endpoint.

## Common Login Error Scenarios

1. **500 Internal Server Error**: The server encountered an unexpected error.
2. **401 Unauthorized**: Authentication credentials were not valid.
3. **403 Forbidden**: Authentication succeeded but the user lacks permissions.

## Debugging Steps

### 1. Check Server Logs

The first step is to check the server logs to see what error is occurring:

```bash
# If running on Render, check the logs in the Render dashboard
# Or if running locally:
node server.js
```

### 2. Test the Login API Directly

You can test the login API directly using curl or Postman:

```bash
# Using curl (replace with your server URL)
curl -X POST https://autopromote.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"password123"}'
```

### 3. Check Firebase Configuration

Make sure your Firebase configuration is correct:

1. Verify that Firebase Admin SDK is initialized properly
2. Check that the service account has sufficient permissions
3. Ensure environment variables are set correctly

### 4. Create Test Users

Run the test user creation script to ensure you have valid users:

```bash
node create-test-firebase-users.js
```

This will create:

- Regular user: testuser@example.com / password123
- Admin user: admin@example.com / admin123

### 5. Check Frontend Authentication Logic

Review the frontend authentication logic:

1. Make sure Firebase is initialized correctly in the browser
2. Verify that the idToken is being sent to the backend
3. Check for CORS issues in browser console

### 6. Debug the Firebase Auth Flow

The authentication flow works as follows:

1. User enters email/password in the frontend
2. Frontend attempts to authenticate with Firebase directly
3. If successful, gets an ID token
4. Sends this token to the backend
5. Backend verifies the token with Firebase Admin SDK
6. If verified, fetches user data from Firestore
7. Returns user data and token to the frontend

If any step fails, check the corresponding code.

### 7. Login Endpoint Implementation

The login endpoint supports two methods:

1. **Token-based authentication**: Send an idToken that was obtained from Firebase Auth.
2. **Direct email/password authentication**: Send email and password directly to the backend.

Method 1 is more secure and should be preferred.

### 8. Common Issues and Solutions

#### Token Verification Fails

- Check that the token is valid and not expired
- Verify that your Firebase project IDs match
- Make sure the service account has permission to verify tokens

#### User Not Found in Firestore

- Check that the user exists in the 'users' collection
- Verify that the UID in Firestore matches the UID from Auth
- Run the test user creation script to ensure users exist

#### CORS Issues

- Ensure your server CORS configuration includes your frontend domain
- Check that the OPTIONS preflight request is being handled correctly

#### Firebase Client Config Issues

- Verify that your apiKey and authDomain are correct
- Check that you're using the same Firebase project on frontend and backend

## Testing the Fix

After making changes:

1. Deploy the updated code
2. Open the browser console
3. Attempt to login
4. Monitor the network requests and console output

If login succeeds, you should see a 200 response from the `/api/auth/login` endpoint with user data.
