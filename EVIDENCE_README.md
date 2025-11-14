# Evidence collection and submission guidance for Facebook Data Access Renewal

This repository includes a lightweight PowerShell script to collect evidence showing how you keep third-party software and antivirus software updated across machines. Use the artifacts below to provide screenshots and a spreadsheet to the Facebook reviewer.

Files added:
- `scripts/collect_update_evidence.ps1` — PowerShell script that collects OS, last installed update (hotfix), antivirus product/version and common browser versions. Writes CSV to `evidence/update_inventory.csv`.
- `evidence/update_inventory_sample.csv` — Sample spreadsheet showing the expected columns and example rows.

What the reviewer asked for (summary):
- A screenshot or tooling configuration showing how you push OS/software updates across your organization (WSUS, Intune, SCCM, Chef/Puppet/Ansible).
- A screenshot or config showing antivirus software is set to automatically update across your organization (endpoint management console or AV console).
- OR a spreadsheet/manual tracking file showing what services you use and what needs to be updated.

Recommended evidence package to upload to Facebook:
1. A screenshot of your update management console (WSUS, SCCM, Microsoft Intune > Update rings, or your MDM console). Redact any personally-identifying details but keep the configuration and dates visible.
2. A screenshot of your antivirus management/endpoint security console that clearly shows auto-update settings or policy enforcement (e.g., definitions auto-update enabled across devices).
3. A CSV or spreadsheet exported from `scripts/collect_update_evidence.ps1` (`evidence/update_inventory.csv`). This shows results collected from representative endpoints. If you manage many devices, run the script on a representative sample or aggregate results.

How to run the script (local):
1. Open PowerShell as Administrator.
2. From the repository root run:

```powershell
cd <repo-root>\scripts
.\collect_update_evidence.ps1
```

By default the script writes to `./evidence/update_inventory.csv` inside the repo.

How to run the script remotely (PSRemoting):
1. Ensure PSRemoting is enabled on target hosts (WinRM) and you have network access.
2. From an admin workstation run:

```powershell
.\scripts\collect_update_evidence.ps1 -Targets server01,host02,host03
```

Notes and best practices for screenshots:
- For WSUS: capture the target group and last synchronization time, and the list of approved updates for Feature and Quality updates. Redact server names if necessary.
- For Intune: capture the Update rings or Feature update policy page showing the ring and enforcement status or last check-in.
- For Antivirus consoles: capture a policy or dashboard showing definitions update status and date, and that auto-update is enabled.
- Remember to redact user-sensitive data (usernames, email addresses, internal IP addresses) if necessary — but leave policy names and timestamps intact so the reviewer can verify.

If you cannot run PSRemoting or have a different endpoint management tool (e.g., Jamf, CrowdStrike, Tanium, Chef, Puppet), provide an exported policy screenshot or a PDF of the configuration page that shows auto-update settings and a timestamp.

If anything fails when running the script (missing permissions or classes like SecurityCenter2), include the script output and note which hosts couldn't be queried — the reviewer understands some checks require local/admin access.

Next steps I can do for you:
- Run the script here to produce a sample CSV.
- Customize the script to query your specific endpoint management solution (Intune/WSUS/SCCM) if you provide access or screenshots.
- Produce a one-page PDF combining the screenshots and CSV summary for uploading to Facebook.

Contact me with which console you use for update management and antivirus management and I will tailor the evidence files and a recommended screenshot checklist.
