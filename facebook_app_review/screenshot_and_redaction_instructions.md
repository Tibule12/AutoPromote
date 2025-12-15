Screenshot & Redaction Instructions for Facebook App Review

Before you capture screenshots

- Remove or blur any hostnames, IP addresses, credentials, or internal-only URIs.
- Keep timestamps, software names, and version numbers visible.

Windows Update

- Open Settings → Update & Security → Windows Update.
- Capture the page showing "Last checked" / "Last updated" and the Windows version if available.
- Redact machine names if shown.

Antivirus dashboard

- Open the antivirus product and navigate to the update or status page.
- Capture definition update time and product version. Redact any subscriptions/IDs.

Browser About page

- In Chrome/Edge/Firefox open About (chrome://settings/help). Screenshot the version and last updated message.

Server patch logs

- Copy a short (10-30 lines) snippet showing patch commands and timestamps, remove hostnames/IPs.

Inventory snapshot

- Use `host_inventory_example.csv` as a template and fill with real values; redact hostnames if necessary.

Saving & uploading

- Save screenshots as PNG or JPG. Keep file names meaningful, e.g. `windows_update_2025-10-18.png`.
- Avoid password-protecting files.

What to highlight for reviewers

- In the policy PDF/MD, highlight the identification, prioritization, and cadence sections.
- For evidence files, highlight timestamps and version numbers.

If you want, I can produce a small packaged zip containing the policy + example evidence files so you can upload them directly. Say “Make zip” and I’ll create it in `facebook_app_review/`.
