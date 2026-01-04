# Render Environment Variables Setup Guide

## Step 1: Get Your Firebase Service Account Key

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select your project (autopromote-464de)
3. Go to Project Settings > Service Accounts
4. Click "Generate new private key" to download a new private key file

## Step 2: Add Service Account to Render Environment Variables

1. Log in to your [Render Dashboard](https://dashboard.render.com/)
2. Select your "AutoPromote" service
3. Click on the "Environment" tab
4. Add a new environment variable:
   - Key: `FIREBASE_SERVICE_ACCOUNT`
   - Value: Paste the ENTIRE contents of your service account JSON file

   Make sure to copy ALL of the JSON content, including the opening and closing braces `{ }`.

## Step 3: Add Other Required Environment Variables

For additional security and configuration, add these environment variables:

- `FIREBASE_PROJECT_ID`: autopromote-464de
- `FIREBASE_STORAGE_BUCKET`: autopromote-464de.appspot.com
- `FIREBASE_DATABASE_URL`: https://autopromote-464de.firebaseio.com (if using Realtime Database)

## Step 4: Save and Redeploy

After adding all variables, click "Save Changes" and Render will automatically redeploy your application.

## Troubleshooting

If you still see errors after setting up the environment variables:

1. **Double-check JSON format**: Make sure the `FIREBASE_SERVICE_ACCOUNT` value is a valid JSON string with no line breaks.
2. **Check for typos**: Ensure all variable names are spelled correctly.
3. **View logs**: Check Render logs for specific error messages.
