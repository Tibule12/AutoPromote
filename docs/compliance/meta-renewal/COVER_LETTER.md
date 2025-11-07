# Cover Letter – Meta Data Access Renewal

Date: 2025-11-04
Applicant: AutoPromote (autopromote.org)
Primary Contact: Thulani Mtshwelo, Founder, tmtshwelo21@gmail.com

## Purpose of the Application
AutoPromote automates promotion workflows for creators and brands by integrating with social platforms to fetch analytics and publish content under the user’s explicit authorization. We access only the endpoints necessary for the features the user is actively using, and we strictly limit storage and processing to the minimum required.

## Summary of Security & Data Protection Controls
- No platform data on personal devices: We prohibit storing, processing, or caching Meta platform data on personal devices. Only managed cloud systems are used (Render-hosted Node/React services, Firebase/Firestore). See attached formal policy.
- Least privilege access: Access to production data is restricted to a small, vetted admin group with role-based access controls (RBAC) and principle of least privilege.
- Encryption: All data in transit is protected via TLS. Data at rest within our cloud providers is encrypted by default. Secrets are stored in encrypted environment variable stores (Render/Firebase) and never committed to source control.
- Token handling: Access tokens are stored server-side in encrypted storage or in memory-bound caches and are never written to developer laptops or personal devices. We rotate and revoke tokens on role changes or suspected compromise. See attached SOP.
- Logging & auditability: Administrative actions are logged; access to secrets and tokens is restricted and auditable within cloud provider consoles.
- Incident response: Defined processes exist for suspected compromise, including immediate token revocation, forced re-auth, and notifying affected users as applicable.

## Evidence Attachments (Included in this Submission)
1. Formal policy: “No Platform Data on Personal Devices” (signed/acknowledgment-ready)
2. Token Handling SOP (storage, rotation, revocation, breach handling)
3. Source code security scan (Semgrep) – cover sheet with date/scope + full report
4. Cloud configuration misconfiguration scan (e.g., NCC Group Scout Suite or equivalent) – cover sheet with date/scope + full report
5. Evidence index mapping reviewer requirements to artifacts

## Compliance With Reviewer Requirements
- Policy: Our policy explicitly forbids the storage of Meta platform data on personal devices, including removable media. Enforcement is covered (HR, IT, and administrative controls) with an employee acknowledgment form.
- Code scan: We run Semgrep across the backend and frontend repositories. The latest scan date and tool version are documented in the cover sheet; the attached report shows status of findings and remediation. We target zero high/critical issues; any that arise are remediated before submission.
- Cloud config scan: We run a cloud security posture assessment (e.g., Scout Suite or Prowler) across our cloud resources (Render/Firebase/GCP/Cloudflare). The latest report is attached with a cover sheet including scope, date, and results. We target zero high/critical misconfigurations; otherwise we include remediation steps and evidence.
- Token SOP: Procedures ensure tokens are never stored on personal devices, are protected in transit and at rest, and are rotated/revoked promptly when required.

## Data Minimization and Retention
- We store only the data necessary for the product features selected by the user and retain it for as short a period as possible.
- Users may request deletion of their data, and we cascade deletion to dependent systems where applicable.

## Recent Improvements
- Clarified and enforced Terms of Service acceptance flow to ensure informed consent before accessing or storing user-related data.
- Consolidated backend routes and tightened input validation to reduce attack surface.
- Standardized email and notification providers with domain authentication to reduce spoofing risk.

## Contact
If you require any additional information or need live verification of our controls, we’re happy to provide it.

Thank you for your review,

Thulani Mtshwelo
Founder, AutoPromote
tmtshwelo21@gmail.com