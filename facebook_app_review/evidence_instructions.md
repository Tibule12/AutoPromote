Evidence & Upload Guidance for Facebook App Review — Data Protection

What Facebook asks

- Upload a policy or procedure document that shows how you keep third-party software updated.
- Upload at least one piece of evidence (tool config, screenshot) demonstrating the policy in practice.

Files included

- data_protection_policy.md — concise policy describing identification, prioritization (CVSS), patching cadence, roles, and evidence types.
- evidence_instructions.md — this guidance file describing which repository artifacts or screenshots you should upload.

Suggested evidence to upload

1. Repository files (preferred)
   - `package.json` and `package-lock.json` from the repository root or relevant subprojects.
   - A screenshot of a GitHub pull request that updates a dependency (title, changed package.json lines, and PR date visible).
   - A screenshot of CI passing for that PR (build checks) or CI logs showing tests ran.

2. Automated tooling screenshots or exports
   - Dependabot or Renovate pull request listing (if you enable it). If not enabled, a short note that you use manual npm audit and PRs.
   - npm audit output (terminal screenshot or saved text file) showing vulnerabilities and timestamps.
   - An example `npm audit --json` output file (redacted if it includes sensitive info).

3. Change logs and release notes
   - Release note or changelog entry for a security update showing the dependency, CVE (if present), and date.

Quick steps to get a valid screenshot (if you don't have Dependabot enabled)

- Create a small test branch.
- Run `npm audit --json > audit.json` in your project folder. Save the `audit.json` file and upload it.
- Edit `package.json` to bump a non-critical dev dependency, open a PR, then screenshot the PR page showing the changed lines and the PR title.

What to highlight for Facebook reviewers

- In the policy PDF (or Markdown) circle/highlight the section that explains: identification method, CVSS-based prioritization, patch cadence, and roles.
- For evidence, mark where the PR or audit output shows dates and the updated versions.

If you want, I can:

- Generate a sample `npm audit` output using your local environment (requires running commands).
- Create a Dependabot configuration file `/.github/dependabot.yml` you can enable to show automated updates.

Upload tips

- Do not password-protect files.
- Redact any sensitive keys or tokens.
- Preferred formats: .md, .pdf, .txt, .png, .jpg.

End.
