# Local testing with Firebase service account

This repository's Playwright E2E and some smoke-tests require a Firebase service account JSON at `test/e2e/tmp/service-account.json` when running against the real Firebase project.

Important: Do NOT commit your real service account JSON into the repository. Use the repository secret `FIREBASE_ADMIN_SERVICE_ACCOUNT` in CI and keep local copies out of git.

Local quick-start (PowerShell)

1. Copy a local service account file into the temp path:

```powershell
mkdir -Force test\e2e\tmp
Copy-Item -Path service-account-key.json -Destination test\e2e\tmp\service-account.json -Force
```

2. Run Playwright E2E:

```powershell
npm run test:e2e:playwright
```

Helper script

There is a small helper script at `scripts/copy-local-service-account.ps1` that will create the `test/e2e/tmp` directory and copy `service-account-key.json` into place if you prefer a shortcut.

CI notes

- GitHub Actions writes the `FIREBASE_ADMIN_SERVICE_ACCOUNT` secret to `test/e2e/tmp/service-account.json` during the `playwright-e2e` job via `scripts/write-service-account.js`.
- The workflow now cleans up `test/e2e/tmp/service-account.json` after tests run.

Security & cleanup

- After you confirm CI uses the repo secret and you've rotated keys, remove any local copies of service-account JSON with `Remove-Item service-account-key.json` and remove `test/e2e/tmp/service-account.json`.
- If you accidentally committed a key, rotate it immediately and consider using `git-filter-repo` or BFG to remove from history.

Contact

If you want, I can remove the committed `service-account-key.json` from the repo in a follow-up commit once you confirm CI secrets are set and you want the file deleted.
