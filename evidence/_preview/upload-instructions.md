# Evidence generation and upload instructions

Follow these steps to produce artifacts Facebook expects and to properly redact sensitive details before upload.

1) Generate dependency scan outputs
- Run the PowerShell script we added to create `evidence/npm-audit.json` and `evidence/npm-deps.json`:

  PowerShell:

  .\scripts\generate-dependency-scan.ps1

  This will run `npm audit --json` and `npm ls --all --json` and save the results in `evidence/`.

2) Produce admin audit logs or screenshots
- Export a recent set of admin audit logs (within 3 months). If your logs are in Firestore/Cloud Logging/console, create a redacted CSV or capture a dashboard screenshot.
- Use `evidence/sample-admin-audit-log.csv` as a template for the CSV format. Ensure timestamps and event types are clearly visible.

3) Provide evidence of automated monitoring
- Provide a screenshot of the alert or the exported ticket (redact PII). `evidence/sample-alert.txt` provides a sample format Facebook accepts.

4) Redaction checklist
- Replace actual user IDs, IPs, emails, and tokens with the literal string REDACTED.
- Keep event types and timestamps intact.

5) What to highlight for reviewers
- In `docs/audit-logs-collection-review-policy.md` highlight these lines:
  - the weekly review cadence
  - the list of logged events
  - the escalation steps
- In `docs/security-event-investigation-policy.md` highlight triage, evidence collection and escalation sections.

6) Common acceptable evidence formats
- `npm-audit.json` or Snyk report (JSON or PDF)
- CLI output that shows an alert triggered (text)
- Dashboard screenshots (redacted)

7) After you generate real outputs
- Attach the generated files (`npm-audit.json`, `npm-deps.json`, redacted CSV or screenshots, and any ticket/alert exports) to the Facebook review portal. In the portal, point to the highlighted lines in the policy documents and include the generated artifacts.
