# Independent cost and payment-security release

This release reduces unnecessary background database work and hardens existing
subscription verification. It preserves the existing public plans, customer
balances, creative tools, media quality and scheduled publications.

Included:

- Skip unchanged source-retention writes; batch sparse publication dependency
  queries and retain fresh transaction checks before deletion.
- Exclude account/allowance/connection polling from optional background demand.
- Coalesce diagnostic requests and nonfinancial counter increments; pause hidden
  diagnostic polling and release prolonged hidden log listeners.
- Verify subscription ownership, provider identity, actual paid state and currency;
  deduplicate payment events and preserve valid cancelled paid periods.
- Retire the unverified usage-upgrade endpoint. Keep asynchronous renewable
  receipts out of legacy-wallet refunds, even after their request context ends.
- Deny client writes to financial evidence/ledgers, including broad admin-client
  overrides. Trusted server accounting still uses IAM.

Excluded: the Free/Plus public catalog and numerical allowances, renewable
processing activation, worker/profile enablement, trigger consolidation, media
worker deployments, PayPal plan creation/activation and registry cleanup.

Local-emulator-only upload handling avoids empty offset-probe finalization in
the Storage emulator; production resumable recovery and source/hash checks remain.
The old billing notice now says that activation requires verified payment.

The two original changes are retained as independent review branches. This
production candidate includes both on the current main baseline plus release
validation and the previously tested idle-polling exclusion.

The release's exact seven emulator tests, 99 existing profile/authority/isolation
tests, 48 payment/publishing/scheduling/retention regressions, 14 idle/background
tests, eight frontend polling/listener tests, seven existing resumable-upload tests
and three Rules-publisher safety cases pass. Strict build, the eight-layout
current-main welcome comparison and real local sign-in/workspace/help also pass.
The workspace proof uses a fresh local account with an existing Studio entitlement
and an unchanged native-movie excerpt; it does not qualify the unfinished Free
subscription workflow or live merchant payment.
No local test is an attributed invoice or a proof of whole-Studio readiness.

Deploy the backend and frontend using the existing main release pipeline, then
verify `/api/version` on both API origins. Publish only the financial delta from
`config/security/firestore.cost-security-release.rules` using the guarded
publisher after the exact backend revision is live. It preserves the currently
deployed workspace/content policy rather than silently publishing other
repository-only rule changes. Storage rules and indexes are outside this release.

The guarded Rules publisher defaults to read-only verification and refuses a
changed production baseline or unverified backend revision. Capture a receipt
with both before/after ruleset identities and source hashes. Rollback must retain
financial protections and must not enable the unfinished subscription paths.

Production verification is read-only: versions, anonymous plan catalog, health,
unauthenticated administrative/payment rejection and deployed client assets.
Observe Firestore consumption after the release; do not describe local avoided
reads/writes as an already-reduced cloud bill. Useful follow-up evidence is the
idle document-read/write rate and the content-trigger delivery rate, compared
over equivalent periods. Registered-user totals alone are not a capacity signal.

Existing Studio counts, S02/S04/S03, historical typography failures and creative
approval/held-publication requirements remain unchanged.
