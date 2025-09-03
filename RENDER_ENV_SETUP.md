# Setting Up Environment Variables in Render

Follow these steps to add your Firebase credentials to your Render service:

## 1. Prepare Your Firebase Service Account

You'll need your Firebase service account credentials. You can get these from the Firebase console:

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings > Service Accounts
4. Click "Generate new private key"
5. Save the JSON file securely

## 2. Add Environment Variables in Render

1. Log in to your [Render Dashboard](https://dashboard.render.com/)
2. Select your AutoPromote service
3. Click on the "Environment" tab
4. Add the following environment variables:

### Option 1: Full Service Account JSON (Recommended)

Add a single environment variable with the entire JSON content:

- **Key**: `FIREBASE_SERVICE_ACCOUNT`
- **Value**: Paste the entire content of your service account JSON file
  - Make sure to replace newline characters with `\n` if needed
  - The value should be a valid JSON string

### Option 2: Individual Credential Fields

If Option 1 doesn't work, add these three separate variables:

- **Key**: `FIREBASE_PROJECT_ID`
- **Value**: Your Firebase project ID (e.g., `autopromote-464de`)

- **Key**: `FIREBASE_CLIENT_EMAIL`
- **Value**: Your Firebase client email (e.g., `firebase-adminsdk@autopromote-464de.iam.gserviceaccount.com`)

- **Key**: `FIREBASE_PRIVATE_KEY`
- **Value**: Your Firebase private key, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` parts
  - Replace literal newlines with `\n`

### Additional Variables

- **Key**: `FIREBASE_STORAGE_BUCKET`
- **Value**: Your Firebase storage bucket (e.g., `autopromote-464de.appspot.com`)

- **Key**: `FIREBASE_DATABASE_URL` (if using Realtime Database)
- **Value**: Your Firebase database URL (e.g., `https://autopromote-464de.firebaseio.com`)

## 3. Save Changes and Redeploy

1. Click "Save Changes" after adding the environment variables
2. Render will automatically redeploy your application with the new variables

## 4. Verify Configuration

1. After deployment, check the logs to ensure Firebase is initializing correctly
2. You should see "Firebase Admin initialized successfully" without warnings about credentials

## Troubleshooting

If you encounter issues:

1. **Invalid JSON Format**: Ensure your `FIREBASE_SERVICE_ACCOUNT` value is valid JSON
2. **Private Key Format**: If using `FIREBASE_PRIVATE_KEY`, make sure newlines are properly escaped as `\n`
3. **Permission Issues**: Verify that your service account has the necessary permissions in Firebase
