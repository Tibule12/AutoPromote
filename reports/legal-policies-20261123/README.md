# Current Terms and Privacy policies

23 November 2026. The owner requested updated policies and explicitly selected keeping the operator as **AutoPromote** with **thulani@autopromote.org**. No registered company name, business address or incorporation details are invented.

## Change

The old 2025 draft notice and dates are removed. The Privacy page's duplicated sections and inconsistent Terms numbering are replaced by one ordered document each. The content now explains current editing and AI processing, connected-platform publishing, workspace access, plans/credits, temporary exports, browser storage, rights and support-managed deletion requests. Billing enquiries go to AutoPromote instead of implying that a payment provider alone decides refunds. Mandatory consumer/privacy rights are preserved.

The canonical source is `frontend/src/content/legalPolicies.json`. Both React routes use `LegalPolicyPage`; `node scripts/build-legal-pages.js` updates ten static policy files across the public frontend, legacy frontend URLs, API legal pages and retained docs folders. `--check` detects drift. The frontend prebuild runs that check, and the existing public-page postbuild retains the generated standalone policies. Existing compiled JavaScript archives are preserved.

The update adds the YouTube terms, Google privacy and Google authorisation-revocation links, alongside the support email and South African Information Regulator link. External references were checked against the official [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies) and [Information Regulator notice](https://inforegulator.org.za/privacy-notice/). These references do not certify the application's compliance or replace a legal review.

## Verification

- Eight frontend tests pass across legal-policy parity, existing public pages and footer coverage. Both React policy bodies and links match all ten static files exactly; heading order and dates match the canonical source.
- Headless, muted Chromium checks pass for both policies at 1440px and 390px, with current dates, sequential headings, no draft text and no horizontal overflow. Both legacy `/legal/*.html` aliases return the expected policy. Desktop and mobile screenshots were visually inspected.
- The actual frontend prebuild guard passes for all ten files. Changed JavaScript passes ESLint; syntax and whitespace checks pass.
- Product knowledge output remains valid across all 43 generated files. Its eight existing deferred-surface warnings remain unrelated.

Private browser evidence is retained under `~/.local/share/autopromote-qa/legal-policies-20261123/verification.json`, with screenshots and a SHA-256 of the reviewed policy source. No account session or live user data was used. This change does not send policy notices, alter recorded terms acceptance, run deletion requests, change billing, or publish media. Main merge/deployment and live page verification remain separate from the local checks.
