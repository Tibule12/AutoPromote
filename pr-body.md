What

- Adds `docs/LOCAL_TESTING.md` with instructions for local E2E testing and security guidance
- Adds `scripts/copy-local-service-account.ps1` (PowerShell helper to copy a local `service-account-key.json` into `test/e2e/tmp/service-account.json`)
- CI: ensures `test/e2e/tmp/service-account.json` is removed after Playwright runs by adding a cleanup step in `.github/workflows/playwright-e2e.yml`

Notes

- I intentionally excluded any local secret files from this branch (e.g. `service-account-key.json`, `tools/smoke-tests/.idtoken`, and local `frontend/.env*` changes).
- Next recommended steps: add `.gitignore` entries for `service-account-key.json` and `.idtoken`, and remove committed service account file after rotating keys if you want me to do that.

If you'd like changes to the PR description or want me to also add a `.gitignore` commit, tell me and I'll update the branch.
