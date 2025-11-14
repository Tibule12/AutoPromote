Evidence bundle for Meta Data Access Review - AutoPromote

Files included:

1) firestore.rules
   - Purpose: Active Firestore Security Rules showing access control for collections (users, content, analytics, promotions, activities).
   - Use: Demonstrates that Firestore access is restricted to admin/service account/backend and enforces per-user access for user-owned documents.

2) firestore_init_snippet.txt
   - Purpose: Redacted snippet of Firebase Admin initialization. Confirms the application initializes the Firebase Admin SDK and obtains a Firestore client (`admin.firestore()`) for persistent storage.
   - Redaction: All service-account private key material and other secrets have been removed. Do NOT upload unredacted service account JSON.

3) token_handling_snippet.txt
   - Purpose: Shows how social-platform access tokens (example: Facebook) are handled. Demonstrates application-level encryption using `encryptToken()` and deletion of plaintext `user_access_token` when encryption is available.
   - Use: Evidence that tokens are not persisted in plaintext and that encrypted fields are used.

4) env_example.txt
   - Purpose: Safety placeholder showing the repo expects environment-based secret management. Do NOT upload real `.env` files containing secrets.

Suggested additional attachments (if available outside this bundle):
- Semgrep/static-analysis PDF (e.g., semgrep_report.pdf)
- Dependency-scan PDF (e.g., npm-audit or dependency-scan.pdf)
- Firebase Console screenshot (Firestore page) with project name (redact project id if desired)
- Render dashboard screenshot showing the service (optional) to demonstrate Render is used for hosting while Firebase is used for persistent data.

Notes and upload guidance:
- Always redact private keys, service account JSON, API keys, and other secrets before uploading.
- Preferred evidence format: PDF or PNG screenshots for consoles and plain text for code snippets. Avoid uploading full .env files.
- Date: 2025-11-03 (local repo state)

If you want, I can now zip these files into `evidence/autopromote_meta_evidence.zip` and place it in the repo root for download. Reply "zip evidence" to proceed.
