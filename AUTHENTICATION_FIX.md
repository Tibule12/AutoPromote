# Authentication Troubleshooting Guide

## Common 401 Unauthorized Error Causes

If you're experiencing 401 Unauthorized errors in your application, here are the most common causes and their solutions:

### 1. System Clock Synchronization Issues

JWT tokens rely on timestamps to validate token expiration. If your system clock is out of sync with the Firebase servers, token validation will fail.

**Solution:**
- Run the `sync-system-clock.bat` script we've created for you
- This will synchronize your system clock with internet time servers
- After synchronization, try logging in again

### 2. Firebase Credentials Issues

Your application may be using outdated or invalid Firebase credentials.

**Solution:**
- Generate new Firebase service account credentials from the Firebase console
- Update your environment variables with the new credentials
- Restart your backend server

### 3. Token Expiration

Firebase ID tokens expire after 1 hour by default.

**Solution:**
- Make sure your application refreshes tokens before they expire
- Implement token refresh logic in your frontend

### 4. Cross-Origin Resource Sharing (CORS) Issues

If your backend is not configured to accept requests from your frontend domain, authentication requests will fail.

**Solution:**
- Check that your backend CORS configuration includes your frontend domain
- For GitHub Pages, make sure it allows `https://tibule12.github.io`

### 5. GitHub Pages API URL Issues

GitHub Pages hosts static content and cannot serve as an API backend.

**Solution:**
- Make sure all API requests go to your actual backend (`https://autopromote.onrender.com`)
- Run the `fix-github-pages.js` script after each build

## Troubleshooting Steps

1. Run `sync-system-clock.bat` to synchronize your system clock
2. Rebuild your frontend with `npm run build`
3. Run `fix-github-pages.js` to fix API URLs
4. Deploy the updated code to GitHub Pages
5. If issues persist, run `firebase-diagnostics.js` for more detailed diagnostics

## Contact Support

If you continue to experience issues after trying these solutions, please contact support with the output from `firebase-diagnostics.js`.
