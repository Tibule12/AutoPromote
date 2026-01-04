Although `keys/autopromote-audit-sa.json` was removed from the working tree and added to .gitignore, we should verify that it was never committed and pushed. If it's found in history, perform the following steps:

- Immediately rotate the service account credentials and revoke the old key.
- Remove the file from git history (use git filter-repo or BFG) and force-push the cleaned history to remote (coordinate with the team).
- Add a security checklist entry to prevent local credential files from being committed and to rotate secrets on any potential exposure.

Suggested commands to check history:

- git log --all -- keys/autopromote-audit-sa.json
- git grep --cached --line-number "autopromote-audit-sa.json"

Note: Workspace search found no commits referencing the file; this issue is to track the audit/rotation steps and any follow-up actions.
