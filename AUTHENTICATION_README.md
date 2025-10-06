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

### Email Verification Policy (Updated Behavior)

By default the backend now ALLOWS login for users whose `emailVerified` flag is false (non-blocking). A banner / frontend notice should still encourage verification, but backend does not 403 unless explicitly enabled.

If you want to ENFORCE (block login until verified) set:
```
ENFORCE_VERIFICATION_ON_LOGIN=true
```
When enforcement is on, an unverified user attempting to log in receives:
```
HTTP 403
{ "error": "email_not_verified", "requiresEmailVerification": true }
```

After registration a verification email link is still generated using:
`admin.auth().generateEmailVerificationLink(email, { url: VERIFY_REDIRECT_URL })`

Users must click the link in their inbox to flip `emailVerified` to true before the login endpoint will succeed.

Deprecated legacy flag:
```
ALLOW_UNVERIFIED_LOGIN=true
```
Previously used to allow unverified logins when blocking was the default. It is now redundant because the default is already permissive. If BOTH `ENFORCE_VERIFICATION_ON_LOGIN=true` and `ALLOW_UNVERIFIED_LOGIN=true` are set, the system will allow unverified (legacy override wins) and log a warning.

Grandfathering Existing Users (only applies when enforcement is ON):
If you enforce verification but want only NEW users blocked while old accounts bypass, set a cutoff timestamp:
```
EMAIL_VERIFICATION_GRANDFATHER_BEFORE=2025-02-20T00:00:00Z
```
Behavior:
* Users whose Auth creation time (or Firestore `users/{uid}.createdAt`) is BEFORE this timestamp are considered `grandfathered` and may log in even if not verified.
* Users created AT or AFTER the cutoff must verify (unless `ALLOW_UNVERIFIED_LOGIN=true`).
* Responses now include:
   * `grandfathered: true|false`
   * `grandfatherPolicyCutoff: <ISO string or null>`

Security Notes:
* Choose a cutoff equal to the moment you deployed enforcement (so all prior accounts are exempt).
* Remove the variable (or set it empty) once legacy users have mostly verified to tighten policy.
* Grandfathering is an access convenience; still encourage verification for all users for better deliverability and password reset reliability.

Resend endpoint:
```
POST /api/auth/resend-verification { "email": "user@example.com" }
```
Returns 200 even if the email already verified (idempotent) or a 404 if the user record is missing.

Frontend Guidance:
1. After registration: show banner “Check your email to verify your account”.
2. On 403 email_not_verified during login: show a “Resend email” button calling resend endpoint.
3. Poll / re-attempt login after user confirms verification.

Security Note: Do not allow unverified login in production; verified emails reduce abuse and enable password resets reliably.

### Admin Email Verification Management

New admin endpoints (require admin auth token):

1. List unverified users (paged within a single `listUsers` page):
```
GET /api/admin/email-verification/unverified?limit=50&nextPageToken=XYZ
```
Response: `{ ok, count, users:[{uid,email,created}], nextPageToken }`

2. Bulk resend (dry run by default):
```
POST /api/admin/email-verification/bulk-resend { "limit": 75, "dryRun": false }
```
Caps at 500 per call. Use `dryRun:true` first to preview.

### Resend Rate Limiting

User-facing resend endpoint `/api/auth/resend-verification` is limited per email:
- Window: 15 minutes
- Default limit: 5 (override with `RESEND_VERIFICATION_LIMIT`)
- Returns HTTP 429 with `retryAfterMinutes` when exceeded.

### Email Provider Configuration

Environment variables:
```
EMAIL_PROVIDER=console|sendgrid|mailgun
EMAIL_FROM="AutoPromote <no-reply@yourdomain.com>"
SENDGRID_API_KEY=...            # if using sendgrid
MAILGUN_API_KEY=...             # if using mailgun
MAILGUN_DOMAIN=mg.yourdomain.com
EMAIL_SENDER_MODE=enabled|disabled  # if disabled, emails are logged only
RESEND_VERIFICATION_LIMIT=5
```
Fallback `console` provider prints email contents to logs (safe for dev).

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
