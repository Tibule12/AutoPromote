# AutoPromote Policy Matrix — Paid Engagement & Sponsored Promotions

Purpose
-------
This document maps major platform policies to the product behaviors AutoPromote must enforce to avoid facilitating inauthentic engagement or violating third‑party platform rules. Use this as the primary artifact for Legal review, Product sign‑off, and Engineering implementation guidance.

Summary (short)
---------------
- We _do not_ enable or facilitate inauthentic engagement (fake likes/views/bots).
- We only support paid *sponsored promotion* workflows that route funds to and are executed by real creators or verified publisher accounts.
- All paid campaigns must include transparent disclosure (e.g., #ad) and be auditable.

Platforms (high level)
----------------------
For each platform, the matrix below summarizes known constraints and required product controls. This is an initial pass — Legal must validate before launch.

Platform: TikTok
- Likely constraints: No purchase of inauthentic views/likes; sponsored content must be disclosed; API limitations on automating creator actions.
- Required product behavior:
  - Only post via authenticated creator OAuth tokens (record account ID + token provenance).
  - Require creator acceptance of sponsorship terms and disclosure obligations.
  - Block any attempt to fabricate metrics (do not call into private APIs that simulate engagement).
  - Keep immutable logs (campaignId, contentId, timestamps).

Platform: YouTube
- Likely constraints: No buying views/likes/subscriptions; inauthentic engagement is prohibited.
- Required product behavior:
  - Use only creator-owned channels via OAuth; require creator confirmation before campaigns run.
  - No API usage that artificially inflates view counts.
  - Disclose sponsorship in video metadata/description if required.

Platform: Facebook / Instagram (Meta)
- Likely constraints: No inauthentic activity; sponsored content and branded content must be labeled; ad APIs exist for paid ads (different from "engagement" purchase).
- Required product behavior:
  - Use branded content tags, require creator authorization for branded posts.
  - Do not offer direct purchase of likes/shares; support sponsored posts only.

Platform: X (Twitter)
- Likely constraints: No inauthentic amplification (bots, purchased likes); policies vary.
- Required product behavior:
  - Enforce creator posting via connected accounts; do not simulate actions.

Platform: LinkedIn
- Likely constraints: Corporate-sponsored content allowed, but inauthentic engagement prohibited.
- Required product behavior: KYC for brands; require verified brand accounts for purchases.

Platform: Pinterest
- Likely constraints: No inauthentic activity; developer apps may be limited.
- Required product behavior: Follow same blocked/allowed rules as above.

Other/Smaller Platforms
- Treat similarly: require creator ownership, avoid API calls that simulate engagement, require disclosure, legal sign-off.

Universal Controls (product → compliance mapping)
------------------------------------------------
These are the baseline product controls to implement and enforce across all platforms:

- Creator provenance (mandatory): store authenticated accountId, token source, consent timestamp.
- Brand identity verification (KYC): require business verification for buyers above thresholds.
- Spend caps & pre-authorization: pre-authorize payment; enforce per-campaign and per-account caps.
- Disclosure requirements: surface a sponsored badge and require the creator to mark posts as sponsored per platform guidance.
- Audit trail & immutable logs: write `compliance_logs` for purchases, enqueues, posts, and any enforcement action.
- Fraud detection & circuit breakers: implement velocity/IP/device heuristics and send suspicious campaigns to a manual review queue.
- Refund & dispute flow: support hold/refund when fraud is confirmed; preserve evidence for investigations.
- No synthetic metrics: explicitly ban features that create or buy artificial likes/views/engagement.

Technical Implementation Checklist (initial)
-------------------------------------------
- [ ] Add `docs/policy-matrix.md` (this file) and request Legal review.
- [ ] Add `compliance_logs` collection and define schema: {type, entityId, userId, campaignId, action, payload, createdAt}.
- [ ] Require creator sponsorship consent during upload flow and record `creatorConsents.sponsorship=true` with timestamp.
- [ ] Add KYC & spend caps: implement `brand_accounts` fields (verified: boolean, spendCap: number).
- [ ] Add UI copy & disclosure banners on purchase flow ("This funds creator-sponsored promotion; AutoPromote does not buy inauthentic likes.").
- [ ] Add fraud heuristics (velocity, IP diversity, device clusters) and a manual review queue `compliance_reviews`.
- [ ] Add logs retention/archival policy for `compliance_logs` (e.g., 1–7 years depending on legal guidance).
- [ ] Add an automated compliance smoke test suite (simulate policy-violating behavior and assert blocks).

Legal & Process Next Steps
--------------------------
- Legal should review and annotate per-platform rows with links to platform developer/policy pages and specific clauses to follow.
- Product should link ticket(s) to required engineering work and owner(s).
- Prepare a public-facing terms update and a short FAQ for brands and creators explaining policy and refunds.

Acceptance Criteria for Launch
------------------------------
- Legal sign-off recorded in PR description.
- Compliance smoke tests pass in CI.
- UI disclosure copy reviewed and live in staging.
- Manual review queue and refund/dispute flow validated by QA.

Contact / Owners
----------------
- Legal: @legal-team (assign reviewer)
- Security / Fraud: @sec-team
- Product: @pm-growth
- Engineering: @eng-team (owner for compliance tickets)

---

This is the initial policy mapping and implementation checklist — create follow-up tickets to implement these controls and link the legal annotations here.
