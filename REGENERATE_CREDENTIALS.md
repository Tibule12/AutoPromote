# Regenerating Firebase Credentials

Follow these steps to generate new Firebase service account credentials after your previous ones were revoked:

## 1. Generate a New Service Account Key

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select your project "autopromote-464de"
3. Click on the gear icon ⚙️ (Project Settings) in the top left
4. Navigate to the "Service accounts" tab
5. Click "Generate new private key" button
6. Save the JSON file securely (NEVER commit this file to source control)

## 2. Update Your Environment Variables

1. Open your `.env` file in the project root
2. Replace the existing `FIREBASE_SERVICE_ACCOUNT` value with the contents of the new JSON file:

```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"autopromote-464de","private_key":"-----BEGIN PRIVATE KEY-----\nYOUR_NEW_PRIVATE_KEY\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk@autopromote-464de.iam.gserviceaccount.com",...}
```

Alternatively, you can update the individual credential fields:

```
FIREBASE_PROJECT_ID=autopromote-464de
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@autopromote-464de.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYOUR_NEW_PRIVATE_KEY\n-----END PRIVATE KEY-----\n
```

Make sure to replace any newlines in the private key with `\n` characters when adding it to the `.env` file.

## 3. Test the New Credentials

Run the test scripts again to verify the new credentials are working:

```bash
node test-firebase-connection.js
node test-firebase-auth.js
```

## 4. Update Production Credentials

If you're using environment variables in a production environment (like Render, Heroku, etc.), update those environment variables with the new credentials.

## 5. Verify Client-Side Firebase Configuration

Check if your client-side Firebase configuration also needs to be updated. Look for values in your `.env` file that start with `REACT_APP_FIREBASE_` and update those if necessary.

## Important Security Notes

1. **Never commit the new service account key to Git**
2. **Make sure your `.env` file is in your `.gitignore`**
3. **Consider restricting the new service account's permissions** in the Google Cloud Console to follow the principle of least privilege
4. **Set up monitoring alerts** to be notified of unusual activity
