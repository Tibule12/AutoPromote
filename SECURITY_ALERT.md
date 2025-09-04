# SECURITY ALERT: Credential Leak

## URGENT: Security Credentials Have Been Exposed

**⚠️ CRITICAL SECURITY ISSUE ⚠️**

Firebase credentials have been accidentally committed to the repository. These credentials have been publicly exposed and should be considered compromised.

## Immediate Actions Required

1. **Rotate All Credentials**:
   - Go to the [Firebase Console](https://console.firebase.google.com/)
   - Navigate to Project Settings > Service Accounts
   - Generate new private keys for all service accounts
   - Update all API keys and secrets

2. **Update Environment Variables**:
   - Update all environment variables in your deployment platforms (Render, Vercel, etc.)
   - Never commit `.env` files to the repository

3. **Review Security Rules**:
   - Check Firebase security rules to ensure they are properly restricted
   - Enable IP allowlisting if available

## Security Best Practices

1. **Never Commit Credentials**:
   - Always use environment variables for sensitive information
   - Ensure `.env` files are in your `.gitignore`

2. **Use Secret Management**:
   - Consider using a secret management service like AWS Secrets Manager, HashiCorp Vault, or similar

3. **Implement Least Privilege**:
   - Service accounts should have only the permissions they need
   - Use different accounts for different environments (dev, staging, prod)

4. **Monitor for Suspicious Activity**:
   - Set up alerts for unusual usage patterns
   - Regularly check logs for unauthorized access

## Changes Made

We have:
1. Removed all hardcoded credentials from the source code
2. Updated configuration to only use environment variables
3. Added security notices to prevent future incidents
4. Documented proper credential management

## Environment Variables Setup

### For Backend (server):
```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...} # Full JSON service account key
# OR individual fields:
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_PRIVATE_KEY=your-private-key-with-newlines
```

### For Frontend (client):
```
REACT_APP_FIREBASE_API_KEY=your-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-auth-domain
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-storage-bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
REACT_APP_FIREBASE_APP_ID=your-app-id
```

**IMPORTANT**: After rotating credentials, monitor your Firebase usage for any suspicious activity that may indicate unauthorized use of the leaked credentials.
