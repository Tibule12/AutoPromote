# Firebase Service Account Setup Guide

## Issue Detected

The integration tests failed because of an authentication issue with your Firebase service account.

## How to Fix

### 1. Generate a New Service Account Key

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `autopromote-464de`
3. Click the gear icon ⚙️ (Settings) next to "Project Overview"
4. Select "Project settings"
5. Go to the "Service accounts" tab
6. Click "Generate new private key" button
7. Save the downloaded JSON file as `serviceAccountKey.json` in the project root directory

### 2. Verify Firestore Is Enabled

1. In the Firebase Console, select "Firestore Database" from the left menu
2. If prompted, click "Create database"
3. Choose either production mode or test mode as appropriate

### 3. Check Firestore Rules

Ensure your Firestore security rules allow admin SDK access:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow admin SDK full access
    match /{document=**} {
      allow read, write: if request.auth != null && request.auth.token.admin == true;
    }

    // Your other rules here
  }
}
```

### 4. Re-run the Connection Test

After completing the steps above, run:

```
node checkDatabaseConnectionDebug.js
```

If the connection test passes, you can proceed with the full integration tests:

```
.\Start-Tests.ps1
```

## Common Issues

1. **Expired Service Account**: Service account keys can expire or be revoked
2. **Project Mismatch**: The service account might be for a different project
3. **Missing Permissions**: The service account might not have the necessary permissions
4. **Firestore Not Enabled**: Firestore Database might not be enabled in your project

## Need More Help?

Refer to the [Firebase Admin SDK documentation](https://firebase.google.com/docs/admin/setup) for more details on setting up authentication.
