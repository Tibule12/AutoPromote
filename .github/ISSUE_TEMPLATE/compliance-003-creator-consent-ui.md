---
name: "Compliance: Creator Sponsorship Consent & UI Disclosure"
about: "Add explicit creator consent flow and UI disclosure requirements for sponsored posts and purchases."
title: "[COMPLIANCE] Creator Sponsorship Consent & Disclosure UI"
labels: ["compliance","frontend","ux"]
assignees: ["eng-team","pm-growth","legal-team"]
---

## Summary

Require creators to accept a sponsorship consent during onboarding or before accepting a campaign. Display disclosure copy in the creator UI and require creators to confirm they will mark posts as sponsored (e.g., using platform-specific labels or #ad in the caption).

## Requirements

- Consent model persisted as `creatorConsents.sponsorship = {accepted: boolean, acceptedAt: timestamp}`.
- Purchase flow shows "This funds creator-sponsored promotion..." banner.
- If platform supports branded content tags (Meta), set tags in post metadata when posting.

## Acceptance Criteria

- [ ] Consent flow implemented and audited in `compliance_logs`.
- [ ] UI shows disclosure in purchase and campaign pages.
- [ ] Tests ensure campaigns cannot run without consent for participating creators.

---
