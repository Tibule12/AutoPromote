# Firebase Setup Guide

## Prerequisites
1. Node.js installed
2. Firebase CLI installed (`npm install -g firebase-tools`)
3. Google account

## Setup Steps

1. Create a Firebase Project:
   ```bash
   # Login to Firebase
   firebase login

   # Initialize project
   firebase init
   ```
   Select the following features:
   - Authentication
   - Firestore
   - Storage
   - Hosting (optional)

2. Enable Authentication Methods:
   - Go to Firebase Console > Authentication
   - Enable Email/Password authentication
   - Add other methods as needed (Google, etc.)

3. Configure Environment Variables:
   
   Create a `.env` file in the root directory:
   ```env
   # Firebase Frontend Config
   REACT_APP_FIREBASE_API_KEY=your-api-key
   REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   REACT_APP_FIREBASE_PROJECT_ID=your-project
   REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   REACT_APP_FIREBASE_APP_ID=your-app-id

   # Firebase Backend Config
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project",...}
   FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   ```

4. Install Dependencies:
   ```bash
   # In root directory
   npm install firebase-admin

   # In frontend directory
   cd frontend
   npm install firebase
   ```

5. Set up Firestore Rules:
   - Copy the rules from FIRESTORE_SCHEMA.md to your firestore.rules file
   - Deploy the rules:
     ```bash
     firebase deploy --only firestore:rules
     ```

6. Initialize Storage Rules:
   Create storage.rules:
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /uploads/{allPaths=**} {
         allow read: if true;
         allow write: if request.auth != null 
           && request.resource.size < 50 * 1024 * 1024; // 50MB limit
       }
     }
   }
   ```
   Deploy storage rules:
   ```bash
   firebase deploy --only storage
   ```

7. Migrate Data (if needed):
   ```bash
   # Export your Supabase data first
   # Then run the migration script
   node migrate-to-firebase.js
   ```

## Important Notes

1. Security:
   - Never commit `.env` files or service account keys
   - Always use environment variables for sensitive data
   - Review and test security rules thoroughly

2. Migration:
   - Back up all Supabase data before migration
   - Test migration with a small dataset first
   - Verify data integrity after migration

3. Testing:
   - Update all test files to use Firebase instead of Supabase
   - Test authentication flows thoroughly
   - Verify file upload functionality

4. Monitoring:
   - Set up Firebase Monitoring
   - Configure error reporting
   - Set up usage alerts

5. Cost Management:
   - Review Firebase pricing
   - Set up budget alerts
   - Monitor usage regularly
