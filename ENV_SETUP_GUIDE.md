# Environment Setup Guide

## Required Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Firebase Backend Config (Service Account)
FIREBASE_PRIVATE_KEY_JSON=your_service_account_json_here

# Firebase Client Config (Frontend)
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Other Backend Settings
JWT_SECRET=your_jwt_secret_for_additional_token_signing
NODE_ENV=development
PORT=5000

# Optional: Allowed CORS origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

## Getting Firebase Configuration

1. **Service Account Setup**:
   - Go to Firebase Console > Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file and copy its contents to `FIREBASE_PRIVATE_KEY_JSON`

2. **Web App Configuration**:
   - Go to Firebase Console > Project Settings > Your Apps
   - Create a web app if you haven't already
   - Copy the configuration object values to the respective `REACT_APP_FIREBASE_*` variables

## Testing Setup

After setting up your `.env` file, test the configuration:

```bash
node test-env.js
node test-firebase-connection.js
```

## Running the Server

```bash
node start-server.js
```

## Setting Up Firebase Security Rules

1. **Firestore Rules** (`firestore.rules`):
   - Ensure proper access control for your data
   - Deploy using `firebase deploy --only firestore:rules`

2. **Storage Rules** (`storage.rules`):
   - Configure access rules for file uploads
   - Deploy using `firebase deploy --only storage`

## Additional Security Considerations

- Keep your Firebase service account JSON private
- Set appropriate security rules in Firestore and Storage
- Use Firebase Authentication for user management
- Implement proper role-based access control
- Regularly update Firebase SDK dependencies
