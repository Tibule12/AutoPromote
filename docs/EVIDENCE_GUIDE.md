# Security Evidence Pack (AutoPromote)

This guide helps you quickly generate acceptable evidence for Meta Data Access renewal:

What Meta asked for (from their message):
- Demonstrate that you review end-user application event logs for security-relevant events.
- Provide an alert or output that shows automated detection of suspicious events and a follow-up action.
- Acceptable examples: command-line tool output, a ticket created from the findings, or a Slack alert triggered by a log monitoring tool.

## What we implemented
- File-based access logs (server): enable with `LOG_EVENTS_TO_FILE=true`. Each request writes a structured line with timestamp to `logs/access-YYYY-MM-DD.log`.
- Analyzer script: `scripts/analyze-logs.js` scans the log and detects:
  - Brute-force login attempts (>= 8 x 401 per IP in 10 minutes)
  - Unauthorized admin probing (`/api/admin*` with 401/403, >= 3 in 10 minutes per IP)
  - 5xx spikes (error bursts)
- Evidence artifacts:
  - Console summary (screenshot)
  - JSON report saved under `logs/security-alerts-*.json` (upload as redacted PDF)
  - Optional Slack notification via `SECURITY_SLACK_WEBHOOK_URL` (screenshot the Slack alert)

## Quick steps (Render / local)
1) Enable file logging on your server process:
   - Set env var `LOG_EVENTS_TO_FILE=true`.
   - Redeploy/restart.
2) Generate some traffic (normal usage is fine). For faster results, you can attempt a few bad logins and hit `/api/admin/*` endpoints without auth to trigger alerts.
3) Run the analyzer locally in the repo root:

```powershell
# From AutoPromote repo root
node .\scripts\analyze-logs.js
# Or analyze a specific file
node .\scripts\analyze-logs.js .\logs\access-2025-11-07.log
```

4) Collect evidence:
   - Screenshot the console output block that lists detected alerts.
   - Upload the JSON report file from `logs/security-alerts-*.json` (redact IPs if necessary).
   - If `SECURITY_SLACK_WEBHOOK_URL` is set, screenshot the Slack message that the analyzer posts.

## Optional Slack setup
- Create an Incoming Webhook in your Slack workspace.
- Set `SECURITY_SLACK_WEBHOOK_URL` to the full webhook URL.
- Re-run the analyzer; it will send a summary message if alerts are present.

## Review process (what to write in the form)
- We collect application event logs for every request and persist them to daily files when `LOG_EVENTS_TO_FILE=true`.
- We run an automated analyzer that detects security-relevant signals (401 bursts, admin probing, 5xx spikes) and generates an alert.
- Alerts are summarized in a JSON report and can be routed to Slack for on-call notification.
- We review the alert and create a follow-up ticket (e.g., block offending IPs, enable additional rate-limits, audit auth attempts). Include a screenshot of the ticket or short write-up.

## Redaction
Before submitting artifacts, redact IP addresses, request IDs, and any user-identifying material.

## Troubleshooting
- If the analyzer says no file found, ensure traffic hit the server after enabling `LOG_EVENTS_TO_FILE`.
- If you see no alerts, intentionally trigger a few 401s and hit `/api/admin/*` without auth to demonstrate detection.
