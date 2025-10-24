System & Endpoint Patch Policy — AutoPromote

Scope
- This policy covers operating systems, browsers, antivirus, and other endpoint software used by AutoPromote developers and operations staff to build, test, and operate the application.

1. Identification
- We maintain an inventory of critical developer and production hosts (workstations, CI runners, servers). Inventory records include OS type and major versions.
- We track installed third-party endpoint software (antivirus, browser versions, developer tooling) on these hosts.

2. Prioritization
- Security updates are triaged using CVSS scores and vendor advisories. Priority mapping:
  - Critical (CVSS >= 9.0): apply within 24-72 hours.
  - High (CVSS 7.0-8.9): apply within 7 days.
  - Medium (CVSS 4.0-6.9): apply within 30 days.
  - Low (CVSS < 4.0): address in the next maintenance window.

3. Patching Process
- Workstations: Developers and staff are instructed to enable automatic OS and browser updates. Where auto-updates are disabled, IT or the project lead schedules manual updates weekly.
- Antivirus: Endpoint antivirus solutions are configured to update definitions automatically daily.
- Servers and CI runners: System updates are applied using automated scripts or standard configuration management (Ansible/other). Critical patches are applied immediately and followed by smoke-tests.
- Patch verification: After patching, affected systems run basic functionality checks and CI pipelines run end-to-end smoke tests where applicable.

4. Ongoing Activity
- Monthly review of inventory and update status.
- Emergency patch process for critical vulnerabilities with owner contact and rapid-release steps.

5. Evidence of Compliance
- Inventory snapshots (server/CI/host lists) and dates of last update.
- Screenshots of update settings for workstations (Windows Update settings, macOS Software Update, browser About pages showing versions).
- Antivirus update logs or dashboard screenshots showing recent definition update times.
- Server patch logs or CI job run showing system updates and successful tests.

Contact
- For security questions contact security@yourdomain.example (replace with actual contact).

Notes
- This document is concise and prepared for App Review; internal operations may include additional implementation details and automation scripts.