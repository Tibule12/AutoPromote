# Policy: No Platform Data on Personal Devices

Version: 1.0
Effective Date: 2025-11-04
Owner: Security & Compliance Lead
Approved by: Thulani Mtshwelo

## 1. Purpose
This policy prohibits the storage, processing, or transmission of Meta platform data on personal devices. It ensures platform data remains within managed, secure environments and is accessed only through approved methods.

## 2. Scope
- People: All employees, contractors, and third parties with access to platform data.
- Systems: All computing devices (laptops, desktops, mobile phones, tablets), removable media, and cloud services used to access AutoPromote systems.
- Data: All Meta platform data, access tokens, refresh tokens, API responses, and derived data containing or referencing platform information.

## 3. Definitions
- Personal Device: Any device not centrally managed by AutoPromote IT or its designated MDM/endpoint security solution.
- Managed Environment: Cloud or on-premises systems controlled by AutoPromote with enforced security baselines, access controls, and logging.

## 4. Policy Statements
1. Prohibited Storage: Meta platform data must not be stored on personal devices or removable media (USB drives, external disks).
2. Prohibited Processing: Platform data must not be processed, cached, or backed up to personal devices (including local browser storage for admin tooling). Any local storage in end-user browsers is limited to session context and must not contain access tokens or sensitive platform data.
3. Access Path: Access to platform data must occur only via approved applications and managed cloud environments. Direct database or storage access from personal devices is prohibited.
4. Secrets & Tokens: Access tokens, refresh tokens, API keys, and credentials must not be saved on personal devices (including in code editors). They must reside only in encrypted secrets managers or environment stores.
5. Data Transfer: Emailing, messaging, or otherwise exporting platform data to personal accounts or devices is prohibited.
6. Logging: Logs containing platform data must not be exported to personal systems. Debugging must use redacted logs and approved tools.
7. Exceptions: Temporary exceptions require written approval from Security & Compliance and must include mitigating controls and expiry.

## 5. Technical & Administrative Controls
- IAM & RBAC: Limit production data access to least privilege; review quarterly.
- Encryption: Enforce TLS in transit; ensure encryption at rest for all stores.
- Endpoint Security: Company-managed devices must enforce disk encryption, screen lock, and MDM controls.
- Secrets Management: Use cloud secret stores and role-based access. No secrets in source control.
- Monitoring: Maintain audit logs for admin actions and access to production data.
- Vendor Risk: Use vetted providers (e.g., Render, Firebase) with contractual security baselines.

## 6. Enforcement
- Violations may result in disciplinary action up to and including termination and legal action.
- Repeated or willful violations trigger immediate access revocation and incident review.

## 7. Employee Acknowledgment
I acknowledge receiving and understanding this policy and agree to comply.

Name: Thulani Mtshwelo  Date: 2025-11-04
Signature: M.T  Role: Founder

## 8. Review Cycle
This policy is reviewed at least annually or upon significant system changes.

## 9. References
- SOC2/ISO27001 control mappings (A.8, A.9, A.12)
- Platform data protection requirements from Meta
