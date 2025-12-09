<#
Rotate service account key (manual steps).

Prereqs:
- You must have GCP Console access for the project.
- You must have `gh` CLI and appropriate repo permissions to update GitHub secrets.

Steps:
1. In the GCP Console go to IAM & Admin -> Service Accounts -> select the Autopromote service account.
2. Create a new key (JSON). Save it to your machine as `new-service-account.json`.
3. Validate the new key locally (optional):
   - set `GOOGLE_APPLICATION_CREDENTIALS=./new-service-account.json` and run a quick smoke command.
4. Update the GitHub repo secret used by CI. You can use the helper `scripts\update-github-secret.ps1` below.
   Example (PowerShell):
     .\scripts\update-github-secret.ps1 -RepoOwner 'Tibule12' -Repo 'AutoPromote' -SecretName 'FIREBASE_ADMIN_SERVICE_ACCOUNT' -FilePath '.\\new-service-account.json'
5. After CI uses the new secret successfully, revoke the old key in GCP (delete the old key) and optionally remove its copies from local machines.
6. If the old key was accidentally committed, use the BFG Repo Cleaner (or git filter-branch) to remove it from history, then force-push.

Notes:
- Do not hardcode the service account in the repo. Keep the secret only in GitHub Actions secrets and/or an internal secret manager.
- Coordinate with any running deployments to avoid disruptions.
#>

param()

Write-Host "This script documents the rotation steps. Use 'update-github-secret.ps1' to push the new JSON into GitHub Secrets." -ForegroundColor Green
