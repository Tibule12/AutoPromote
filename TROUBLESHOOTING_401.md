# 401 Unauthorized Troubleshooting Guide

## Overview of the Issue

You're experiencing a 401 Unauthorized error when trying to log in to your application. This indicates that the authentication process is failing at the token verification stage.

## Likely Causes

1. **Google Security Alert**: Firebase has detected the leaked credentials and automatically disabled or restricted them.
2. **Missing or Invalid Environment Variables**: The Firebase configuration isn't properly loaded.
3. **Token Verification Failure**: The Firebase Admin SDK is failing to verify tokens due to credential issues.

## Step-by-Step Troubleshooting

### 1. Rotate Firebase Credentials

Since Google has detected the credential leak, the first step is to rotate all credentials:

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Navigate to Project Settings > Service Accounts
3. Generate a new private key
4. Update your environment variables with the new credentials

### 2. Check Environment Variables

Make sure your `.env` file contains all the necessary variables:

```
# Firebase Admin SDK (Server-side)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project-id","private_key":"-----BEGIN PRIVATE KEY-----\nYourKeyHere\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk@your-project.iam.gserviceaccount.com"}

# Or use individual fields
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYourKeyHere\n-----END PRIVATE KEY-----\n

# Additional Firebase Config
FIREBASE_DATABASE_URL=https://your-project-id.firebaseio.com
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
```

### 3. Check Firebase Admin Initialization

The server logs should show successful Firebase Admin initialization. Look for:
```
✅ Firebase Admin initialized successfully
```

If you see error messages or fallback initialization, it indicates problems with your Firebase credentials.

### 4. Test Authentication Flow

To isolate the issue, try the following steps:

1. **Test Firebase Connection**:
   Run the following script to test basic Firebase connectivity:

   ```javascript
   // test-firebase-connection.js
   require('dotenv').config();
   const admin = require('firebase-admin');

   try {
     const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
     
     admin.initializeApp({
       credential: admin.credential.cert(serviceAccount)
     });
     
     console.log('Firebase Admin initialized successfully');
     console.log('Project ID:', serviceAccount.project_id);
     
     // Test Firestore connection
     admin.firestore().collection('test').doc('test').set({
       test: 'Connection successful',
       timestamp: admin.firestore.FieldValue.serverTimestamp()
     })
     .then(() => {
       console.log('Firestore write successful');
       process.exit(0);
     })
     .catch(error => {
       console.error('Firestore write failed:', error);
       process.exit(1);
     });
   } catch (error) {
     console.error('Firebase initialization failed:', error);
     process.exit(1);
   }
   ```

2. **Test Token Verification**:
   If you have a valid Firebase token, test it with:

   ```javascript
   // test-token.js
   require('dotenv').config();
   const admin = require('firebase-admin');

   // Initialize Firebase
   try {
     const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
     
     admin.initializeApp({
       credential: admin.credential.cert(serviceAccount)
     });
     
     console.log('Firebase Admin initialized successfully');
     
     // Replace with your token
     const token = 'your-firebase-id-token';
     
     admin.auth().verifyIdToken(token)
       .then(decodedToken => {
         console.log('Token verification successful');
         console.log('User ID:', decodedToken.uid);
         console.log('Email:', decodedToken.email);
         console.log('Claims:', JSON.stringify(decodedToken, null, 2));
         process.exit(0);
       })
       .catch(error => {
         console.error('Token verification failed:', error);
         process.exit(1);
       });
   } catch (error) {
     console.error('Firebase initialization failed:', error);
     process.exit(1);
   }
   ```

### 5. Check for Google Cloud Security Alerts

1. Check your email for security notifications from Google
2. Visit the [Google Cloud Security Center](https://console.cloud.google.com/security)
3. Look for alerts about credential exposure or project restrictions

### 6. Debug Authentication Flow

Review the server logs during login attempts to identify the exact point of failure:

1. Is the token being properly received by the server?
2. Is the token verification failing with a specific error code?
3. Are there any Firestore errors during user retrieval?

## Common Error Messages and Solutions

### "Firebase App already exists"

**Problem**: Multiple attempts to initialize Firebase Admin SDK
**Solution**: Ensure Firebase Admin is initialized only once in your application

### "auth/id-token-expired"

**Problem**: The authentication token has expired
**Solution**: Refresh the token on the client side before sending requests

### "auth/argument-error" 

**Problem**: Invalid token format or structure
**Solution**: Ensure the token is being sent correctly from the client

### "auth/project-not-found" or "auth/invalid-credential"

**Problem**: Firebase project ID or credentials are incorrect
**Solution**: Check your environment variables and Firebase project settings

## Next Steps

After following these troubleshooting steps, if you're still experiencing 401 errors:

1. Examine the server logs for specific error messages
2. Check if your Firebase project has any restrictions or has been disabled due to security concerns
3. Consider creating a new Firebase project as a last resort if the current one has been compromised
