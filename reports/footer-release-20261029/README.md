# Public footer review and repair — all 18 destinations

29 October 2026 · Branch `fix/public-footer-pages-20261029` · Base `3885295a`.

**This is a prepared local repair, not a deployment.** The live site was inspected
anonymously. Every footer destination worked through its hash link, but **16 of
the 18 clean URLs returned HTTP 404**. Only `/privacy` and `/terms` returned 200.
Ten informational pages reused numbered card grids, often with the same generic
closing pitch. They had different text, but their presentation obscured their purpose.

The repair covers the complete footer. It preserves the shared identity/navigation
while giving company information, contact, guidance, references and policies
appropriate content and actions. It does not certify the entire application or
guarantee Google approval.

| Destination | Review and prepared result |
| --- | --- |
| Features | Clear feature heading; six existing tool descriptions and real guide links retained. |
| Integrations | Six actual platform marks and account/permission limitations retained; explicit page heading. |
| Analytics | Reference table for publication state, metrics and unavailable data; no invented customer statistics. |
| Pricing | Existing four server-provided plans visible immediately; anonymous visitors no longer appear to have an active account subscription. Broken external badge removed; public comparison contrast corrected. Prices, credits, provider actions and signed-in account behaviour preserved. |
| Changelog | Explicit Product updates heading; dated development notes remain labelled as development work. |
| Documentation | Existing guide catalogue and generated documentation service retained; eight real guides loaded and nested direct entries supplied. |
| Help Center | Explicit help heading, task guides, real FAQ disclosure controls and support links verified. |
| Blog | Explicit blog heading; existing real articles and an actual article transition verified. Direct article entries supplied. |
| API Access | Footer no longer promises an absent API reference; access requirements and direct contact are explicit. No fake endpoint/key signup added. |
| About Us | Dedicated company-purpose narrative and working contact action, replacing the feature-card clone. No invented founding date, office or team biography. |
| Contact | One public email address, useful problem checklist and accessible email composer. The visitor reviews/sends through their own email app; the site never claims an email was sent. |
| Careers | Readable expression-of-interest page; explicitly states no specific vacancies are listed. No inactive Apply buttons or invented roles. |
| Partners | Proposal outline and one contact action instead of three repetitions of the same inbox. No platform endorsement or affiliate offer invented. |
| Privacy | Exact policy text/dates preserved in both React and standalone HTML. Repeated marketing close removed from the React shell. Existing draft status remains unresolved. |
| Terms | Exact policy text/dates preserved in both React and standalone HTML. Existing draft status remains unresolved. |
| Cookies | Storage-purpose/control reference and project-backup guidance instead of another card grid. |
| Security | Reading layout, account/connection guidance and private-report contact. No new certification/audit claims. |
| Accessibility | Reading layout, keyboard skip action, visible focus and stated product limitations. No unverified conformance claim. |

## Direct links and readable HTML

The ordinary production postbuild now supplies **39 physical public entry pages**
for footer destinations, linked articles/guides, support and password-entry routes.
Informational HTML is rendered from the **same React components** used by the app,
with page-specific titles/descriptions and a canonical URL. There is no duplicate
copy catalogue. Existing static legal documents are never overwritten.

The existing HashRouter remains. Recognised direct public URLs select their intended
route and retain query/anchor data; root invitation links, existing hash links and
provider callback paths stay unchanged. Pricing and account support retain their
normal client-side services. Detailed guides continue to fetch actual reviewed
documentation rather than embedding fabricated answers.

## Evidence and checks

- **18 actual footer transitions**, **18 clean URLs returning 200 locally**, and
  **18 distinct main-page bodies**; all destinations checked at 1440px and 390px.
- **40 responsive checks**, including the unchanged welcome entry at four widths;
  one heading per page, no page overflow or missing visible images. Reference-table
  horizontal scrolling and the last column were checked on mobile.
- **17 footer pages readable with JavaScript disabled**; pricing requires its existing
  client-side plan service. Contact retains its email link without exposing an inert form.
- Eight real guide loads, one real blog article, keyboard skip-to-content, normal
  Sign In form entry and encoded contact-email preparation passed. No email was sent.
- The plan comparison used an actual **GET-only pass-through** to the public plans
  endpoint, not a mocked plan response. All four prices/allowances match the existing
  server configuration. No checkout, activation, cancellation or top-up was attempted.
- **25 focused frontend tests** and **21 existing backend billing/security regressions**
  passed. Production build, targeted lint, syntax, formatting and whitespace passed.
- Browser QA was headless/muted with no injected sessions, page data or responses.
  Non-GET requests were blocked; two PayPal SDK logger POSTs were blocked. No app
  write, authentication submission, payment, support ticket or advertising request ran.
- All 18 named subscription functions are unchanged when compared as parsed code, including
  create/activate/cancel/capture handlers. Backend security, Rules, subscriptions,
  balances, support implementation, canonical editing code and selected welcome
  source/media are unchanged. The build verified all 19 retained welcome assets.

[Complete browser evidence](browser/verification.json) ·
[source/test preservation](validation.json) ·
[live direct-URL observations](live-direct-before.json).

Visual review: [About](browser/about-1440.png), [Contact](browser/contact-1440.png),
[Pricing](browser/pricing-1440.png), [Analytics on mobile](browser/metrics-390.png),
[Careers on mobile](browser/careers-390.png), [API Access](browser/api-docs-1440.png).
The browser folder contains every destination at both desktop/phone sizes.

Early attempts are retained privately: an initial static renderer CSS-module error,
a capture during an inherited Contact form animation, and a failed browser check
that exposed the broken PayPal image. The selected renderer/form/image corrections
passed without weakening the missing-image assertion.

## Remaining factual/release limits

Terms and Privacy still describe themselves as drafts. Confirming the legal operator,
applicable policy terms and actual data-retention practices needs owner-reviewed
business facts; this repair does not replace them with invented assertions. Careers
availability, any formal partnership/API offer and inbox delivery were not independently
established. These pages state their available contact path rather than inventing details.

No push, merge, deployment, production data change, new credit policy, advertisement
or subscription price change occurred in this task. The earlier monetisation and
security-incident follow-up remain separate. The prepared revision needs the normal
approved publication/release process and a live direct-URL recheck afterward.

Local review: http://127.0.0.1:46301/#/features (loopback only).

The local build records base commit `3885295a`; the source manifest identifies the
prepared changes. It is not evidence of a new live release. Prior local builds and
the user's active workspace build were preserved.
