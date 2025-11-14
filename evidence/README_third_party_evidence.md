# Collecting third-party software & antivirus update evidence

This README explains how to collect evidence showing your organization keeps third-party software and antivirus up to date. Meta accepts any of the following as evidence:

- A tooling configuration screenshot that shows how you push OS/software updates across your organization (e.g., Intune, WSUS, SCCM, Chef).
- A tooling configuration screenshot that shows antivirus definitions/updates are automatic (EDR/antivirus console screenshot).
- A spreadsheet or CSV that lists devices, OS, antivirus product/version, last update date, and patch compliance status.

This repository contains helper files:

- `scripts/collect_update_evidence.ps1` — non-destructive PowerShell script to collect OS/AV/hotfix and installed application information from the local machine or remote targets. Usage examples below.
- `evidence/third_party_update_tracking.csv` — a CSV template you can use to collect and upload as evidence.

Recommended collection methods
1) Endpoint management console (Intune/WSUS/SCCM/EDR)
   - Export or screenshot the device list and show columns: device name, policy/profile applied, patch compliance, last check-in.
   - Redact any unrelated sensitive details.

2) PowerShell CSV export (representative devices)
   - Copy `scripts/collect_update_evidence.ps1` to a management host.
   - Run for a single machine (sample):

```powershell
# Run locally
.\scripts\collect_update_evidence.ps1

# Run for specific remote hosts (requires WinRM/CimSession access)
.\scripts\collect_update_evidence.ps1 -Targets @('server01','server02')
```

  The script writes `evidence/third_party_update_<timestamp>.csv` with the collected rows. Open the CSV, add owner/notes columns and a one-line summary describing your update policy.

3) WSUS / Intune / EDR console
   - Export the device compliance report or take a screenshot showing that updates/antivirus definitions are enforced and automatically updated.

What to upload to Meta
- One or two screenshots (tooling console) OR the CSV exported from `collect_update_evidence.ps1` plus one screenshot showing the update policy.
- A short explanation (in the text box) describing: the tooling used (Intune/WSUS/EDR), scope (all laptops/servers), frequency of updates, and that automatic updates are enforced.

Notes and cautions
- Do not upload secrets, internal IPs, or full domain lists. Redact anything sensitive before upload.
- The evidence should be organizational in scope — a single endpoint is not enough. Provide representative devices or an exported console report that covers the environment.

If you want, I can:
- Convert the CSV output into a PDF summary and add it to the evidence bundle.
- Draft the final Meta submission text for this question using the collected files and screenshots.
