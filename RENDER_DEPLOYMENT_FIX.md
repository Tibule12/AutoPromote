# Deployment Fix for Render

## Issues Fixed

This commit fixes multiple deployment errors on Render:

1. Legacy dependency reference: `Error: Cannot find module '<legacy-module>'`
2. Missing service account file: `Error: Cannot find module '../serviceAccountKey.json'`
3. Missing adminTestRoutes module: `Error: Cannot find module './adminTestRoutes'`

## Changes Made

### 1. Firebase-Only Cleanup

- Removed the unused legacy dependency and the compatibility layer that wrapped it
- Verified all modules now import the shared Firebase admin instance instead

### 2. Firebase Service Account Fix

- Updated the Firebase configuration to check for credentials in multiple locations:
  - First priority: `FIREBASE_SERVICE_ACCOUNT` environment variable (full JSON)
  - Second priority: Individual credential fields (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
  - Third priority: Local `serviceAccountKey.json` file
  - Last resort: Application default credentials

### 3. Admin Test Routes Fix

- Modified server.js to handle missing adminTestRoutes module gracefully
- The server will now create a dummy router if the module is missing

## Deployment Instructions

When deploying to Render, make sure to set at least one of these options for Firebase credentials:

### Option 1: Full Service Account JSON (Recommended)

Set the `FIREBASE_SERVICE_ACCOUNT` environment variable with the entire JSON content of your service account key file. Make sure to escape newlines with `\n`.

### Option 2: Individual Credential Fields

Set these three environment variables:

- `FIREBASE_PROJECT_ID`: Your Firebase project ID
- `FIREBASE_CLIENT_EMAIL`: Your Firebase client email
- `FIREBASE_PRIVATE_KEY`: Your Firebase private key (with newlines as `\n`)

### Option 3: Upload serviceAccountKey.json

If you're using a custom build command in Render, you could include steps to generate or download the service account key file before starting the server.

### Additional Configuration

Other helpful environment variables:

- `FIREBASE_DATABASE_URL`: Your Firebase database URL
- `FIREBASE_STORAGE_BUCKET`: Your Firebase storage bucket
- `FRONTEND_URL`: URL of your frontend app (for CORS)
- `JWT_SECRET`: Secret for JWT token generation

### Use deterministic installs on Render

Ensure Render uses `npm ci` (not `npm install`) when installing dependencies so the `package-lock.json` is enforced and `overrides` are respected. If Render uses a cached node_modules or `npm install`, you may encounter transitive dependency version mismatches (e.g., `@grpc/grpc-js` conflicting versions).

If you see runtime errors similar to "Cannot find module './single-subchannel-channel'", try the following on Render:

- Clear the build cache on Render and trigger a fresh redeploy
- Ensure your build command includes `npm ci`
- Verify Render environment uses the repo's `package-lock.json` rather than resolving on each build

### Debugging tip: Dependency verification endpoint

If you are still seeing gRPC or Firestore errors after redeploy, you can enable a temporary debug endpoint in the deployed server to inspect installed versions. Set `DEBUG_DEPS_TOKEN` env var to a secret value in Render and request `/api/debug/deps` with header `x-debug-token: <token>` to obtain a JSON payload describing installed `google-gax` and `@grpc/grpc-js` versions and whether the `single-subchannel-channel.js` file exists on disk.

## Troubleshooting

If you encounter issues:

1. Check the Render logs for specific error messages
2. Verify that your environment variables are correctly set
3. Confirm that your Firebase project has the necessary services enabled
4. Make sure that the service account has the required permissions
5. If you suspect `@grpc/grpc-js` version mismatch, add a build step in Render to run `node ./scripts/check-grpc-install.js` after install to ensure the installed package includes the expected files. This script exits non-zero if the internal `single-subchannel-channel.js` file is missing, preventing a deployment scarred by runtime errors.
