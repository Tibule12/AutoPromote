System Patch Evidence & Upload Guidance for Facebook App Review

What Facebook asks in this section

- Confirm you have a repeatable way to identify, prioritize and apply patches to operating systems, antivirus, browsers, and other systems used to build and operate your app.

Suggested evidence to upload

1. Host/inventory snapshots
   - A short CSV or text file listing critical hosts, OS, and “last updated” dates.

2. Screenshots (preferred)
   - Windows Update settings page showing automatic updates enabled and last checked date.
   - macOS Software Update or About This Mac showing current OS version and last update date.
   - Browser About page (Chrome/Edge/Firefox) showing version and update check time.
   - Antivirus dashboard or settings showing definition update time.

3. Server/CI logs
   - A short log snippet from a server or CI runner showing patch commands ran and timestamps (e.g., apt/yum/windows update), and that smoke-tests ran afterwards.

4. Policy document
   - Upload `system_patch_policy.md` (included) — highlight the identification/prioritization/patch cadence sections.

How to capture quick evidence (Windows example)

- Open Windows Update → Settings → take a screenshot showing "Last checked" or "Last updated".
- Open your antivirus product (if used) → take a screenshot of its update or protection status.

How to redact before upload

- Remove or blur hostnames/IPs and any credentials.
- Keep timestamps and versions visible.

Optional: automate future evidence

- Enable system management tools (WSUS, Jamf, SCCM, or equivalent) and export periodic reports.
- Enable automated updates for antivirus and browsers and keep records in a shared drive.

End.
