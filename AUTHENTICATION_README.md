# Authentication Troubleshooting Guide

## Security Issue: Leaked Firebase Credentials

A critical security issue has been identified in this codebase where Firebase credentials were accidentally committed to the repository and exposed publicly. Google has detected this exposure and may have already restricted your project's credentials.

## Current Status

1. **Security Fixes**:
   - Removed hardcoded project ID from `firebaseAdmin.js`
   - Updated `.env.example` to use safe placeholder values
   - Added security documentation in `SECURITY_ALERT.md`

2. **401 Unauthorized Error**:
   - Authentication is failing, likely due to credentials being revoked by Google or misconfiguration

## Steps to Fix

### 1. Rotate All Firebase Credentials

Follow the instructions in `SECURITY_ALERT.md` to:
- Generate new Firebase service account keys
- Update all API keys and client credentials
- Update environment variables in all deployment environments

### 2. Run Diagnostic Scripts

Use the provided diagnostic scripts to identify the specific authentication issue:

```bash
# Test basic Firebase connectivity
node test-firebase-connection.js

# Test authentication specifically
node test-firebase-auth.js

# Test token verification (add TEST_FIREBASE_TOKEN to .env first)
node test-token-verification.js
```

### 3. Check for Common Issues

See `TROUBLESHOOTING_401.md` for detailed troubleshooting steps, including:
- Environment variable configuration
- Firebase initialization issues
- Token verification problems
- Google Cloud security alerts

## Understanding the Authentication Flow

1. **Client Request**: The client sends a request with a Firebase ID token in the Authorization header
2. **Token Verification**: `authMiddleware.js` verifies the token using the Firebase Admin SDK
3. **User Lookup**: If the token is valid, the middleware looks up the user in Firestore
4. **Response**: The server responds with user data if authentication is successful, or a 401 error if not

## Common 401 Error Causes

1. **Revoked Credentials**: Google detected the credential leak and revoked access
2. **Missing Environment Variables**: Required Firebase configuration is missing
3. **Expired/Invalid Tokens**: The client is sending expired or malformed tokens
4. **Permission Issues**: The service account lacks necessary permissions

## Need More Help?

If you continue to face authentication issues after following the steps above:

1. Review detailed logs from your server
2. Check the Google Cloud Console for security alerts
3. Consider creating a new Firebase project as a last resort
4. Ensure your frontend is properly handling authentication

Remember to always keep credentials secure and never commit them to source control.
