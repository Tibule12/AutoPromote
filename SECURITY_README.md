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

Using the GitHub CLI to set secrets

- If you prefer, you can set required GitHub Actions secrets quickly using the `gh` CLI (GitHub CLI) rather than clicking through the UI.
- Example on macOS / Linux using `node` to generate a key and `gh` to set it:

```bash
# Generate a secure secret value
secret=$(node scripts/generateSecret.js 64)
echo -n "$secret" | gh secret set GENERIC_TOKEN_ENCRYPTION_KEY --repo Tibule12/AutoPromote
```

- Example PowerShell variant:

```powershell
$secret = node .\scripts\generateSecret.js 64
echo $secret | gh secret set GENERIC_TOKEN_ENCRYPTION_KEY --repo Tibule12/AutoPromote
```

- Convenience scripts: `scripts/gh-set-secrets.sh` and `scripts/gh-set-secrets.ps1` print sample `gh secret set` commands you can customize.

CI (recommended):

- Ensure the above secrets exist in your project `Settings → Secrets and variables → Actions`.
- CI will run `npm run preflight` and fail if the required keys are missing.

If you need help generating key values or want additional automation, we can add a helper script to print instructions or set the environment for CI.
