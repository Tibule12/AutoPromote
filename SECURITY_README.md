## Encryption keys for token secrets 🔐

This repository enforces token encryption checks in CI to prevent accidental builds/deploys without encryption keys present.

Required keys (set as GitHub Actions repository secrets):
- `GENERIC_TOKEN_ENCRYPTION_KEY`
- `FUNCTIONS_TOKEN_ENCRYPTION_KEY`
- `TWITTER_TOKEN_ENCRYPTION_KEY`

How to generate a secure key:
1. Local quick generation using Node:
```powershell
node scripts/generateSecret.js 64
```
2. Copy the output and set it as a GitHub Actions secret.

Local development:
- If you want to run preflight locally without filling secrets, run:
```powershell
npm run preflight:local
```

CI (recommended):
- Ensure the above secrets exist in your project `Settings → Secrets and variables → Actions`.
- CI will run `npm run preflight` and fail if the required keys are missing.

If you need help generating key values or want additional automation, we can add a helper script to print instructions or set the environment for CI.
