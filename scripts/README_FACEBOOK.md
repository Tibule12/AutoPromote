Add a Facebook connection to Firestore

Usage (local):

1. Ensure you have a Firebase service account JSON at `./service-account-key.json` or set `GOOGLE_APPLICATION_CREDENTIALS` to its path.
2. Install dependencies (from repo root):

```bash
npm install firebase-admin
```

3. Run the script with your user UID and the Facebook user access token:

```bash
node scripts/add_facebook_connection.js --uid=USER_UID --token=USER_ACCESS_TOKEN --pages='[{"id":"12345","name":"My Page","access_token":"PAGE_TOKEN"}]'
```

Notes & security:

- The script writes to `users/{uid}/connections/facebook` and stores the provided token in `user_access_token`. In production you should encrypt tokens and use secure storage (the repo has `secretVault` helpers used by the main app).
- Do not paste long-lived tokens in public chat. Run the script locally or from a secure CI environment.

Run on Render:

- If your Render instance has access to the service account and node tooling, you can run this script from a one-off shell. Alternatively, deploy a temporary admin endpoint that accepts a signed request and performs the write (not recommended without strong auth).
