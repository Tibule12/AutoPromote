# SOP: Access Token Handling

Version: 1.0
Effective Date: 2025-11-04
Owner: Security & Compliance Lead

## 1. Purpose
Define standardized procedures to securely request, store, use, rotate, and revoke access and refresh tokens for Meta platform APIs.

## 2. Scope
Applies to all services and personnel handling OAuth tokens, app secrets, and API credentials within AutoPromote.

## 3. Roles & Responsibilities
- Engineering: Implement secure token storage and rotation logic.
- Security: Validate controls, monitor access, and drive remediation.
- Operations: Manage secrets stores and access reviews.

## 4. Procedures
### 4.1 Token Request & Receipt
- Use OAuth flows recommended by Meta (Authorization Code with PKCE where applicable).
- Redirect URIs must be HTTPS and pre-registered.
- Do not log raw tokens in any environment.

### 4.2 Storage
- Server-side only: Store tokens in encrypted secret stores or application databases with encryption at rest. Prefer short-lived tokens with refresh flow.
- Do NOT store tokens on:
  - Developer laptops/desktops (even company-managed)
  - Personal devices
  - Source control
  - Client-side localStorage/sessionStorage/cookies (except ephemeral session identifiers that are not access/refresh tokens)

### 4.3 Access Control
- Restrict token decryption/access to service identities needing them.
- Enforce least privilege and rotate service credentials quarterly.

### 4.4 Usage
- Transmit tokens only over TLS.
- Use in-memory variables for the shortest feasible duration.
- Avoid including tokens in URLs or query strings.

### 4.5 Rotation
- Rotate app secrets at least every 180 days or on personnel changes.
- Re-issue tokens when:
  - User changes password or permissions
  - App scopes change
  - Suspected compromise

### 4.6 Revocation
- On termination or role change, revoke access tokens for affected users/staff immediately.
- For suspected compromise, revoke tokens and force re-auth, then investigate and document root cause.

### 4.7 Logging & Monitoring
- Log token-related events without sensitive values (redact tokens).
- Monitor for anomalous API usage; alert on off-hours spikes or geo anomalies.

### 4.8 Backup & Recovery
- Backups of encrypted token stores must remain within managed cloud storage and inherit encryption.
- Test restoration procedures quarterly.

## 5. Incident Response
- Contain: Revoke potentially impacted tokens; block suspicious IPs.
- Eradicate: Patch vulnerabilities; rotate secrets; update dependencies.
- Recover: Validate normal operation; perform limited re-enablement.
- Lessons Learned: Document within 5 business days; update SOP/policy as needed.

## 6. Evidence & Auditing
- Maintain change tickets for rotations and revocations.
- Keep access reviews and audit trails for at least 12 months.

## 7. Review Cycle
Review this SOP annually or when platform requirements change.
