# Staged production checklist

## 1. Independent cost/security release — deployed

- [x] Prepare isolated release from current main; exclude subscription catalog,
  numerical allowances, worker enablement, Functions migration and registry deletion.
- [x] Preserve the two independent infrastructure/payment review branches.
- [x] Complete local financial/security/publishing/scheduling/Studio regression,
  strict frontend build, current-main welcome comparison and authenticated smoke.
- [x] Push, review and merge PR560; existing release pipeline passes.
- [x] Verify both production API origins serve commit
  `2c92c8c978acac837dfa97f7082c9a08dd964539`; verify client payment-security notice.
- [x] Publish only the financial Rules delta with runtime/baseline guards; retain
  old/new ruleset identities and verify returned source hash.
- [x] Verify unauthenticated admin access remains refused and legacy plans remain.
- [x] Observe a complete live cleanup cycle. Record query improvement and zero
  repeated content writes/trigger delivery; do not claim document-read savings.

## 2. Retention document-read follow-up — PR561 deployed

- [x] Implement bounded negative-only cache; preserve fresh deletion checks.
- [x] Prove six real-emulator scans:558→143 document reads, zero writes/deletions.
- [x] Prove content invalidation, dependency-only safety, one-hour expiry, exact
  future publication expiry, fresh dry runs and uncached truncation/errors.
- [x] Pass12 isolated emulator and21 existing scheduling/upload/background cases.
- [x] Push PR561; backend/security/cache, frontend build, CI and scanning pass.
- [x] All release checks pass; PR561 is merged as
  `6690909415043deff3662dd94d6db6fb581bda9e`. Both public API origins now serve
  that exact revision. Production pipeline succeeds; financial Rules delta is
  read back unchanged. See retention-cache-deployed.json.
- [ ] Observe both cold and warm production cycles; compare complete windows
  with Monitoring lag and other applications disclosed. Invoice savings remain
  unknown until provider usage/billing reflects the change.

Rollback either safe release through a reviewed revert while retaining financial
protections. Never restore the unverified grant endpoint or broad financial
client writes. Do not restore an old subscription implementation by resetting
customer balances, settlements or scheduled content.

## 3. Coordinated content-trigger cutover — blocked

- [x] Replace additive new-trigger preparation with the existing approval export
  as survivor; exact relevant-handler selection and duplicate schedule tested.
- [x] Preserve current production four-trigger deployment and rollback metadata.
- [ ] Complete content-writer inventory across clients, Render, Functions, workers
  and other applications. Establish a complete writer barrier or transactional
  producer journal at every relevant writer.
- [ ] Qualify all-handler side-effect idempotency and drainage receipts.
- [ ] Select a window with no due/in-flight operations that the barrier interrupts.
- [ ] Under verified barrier, drain; retire exactly three old triggers; deploy the
  existing approval export in place; reconcile; resume writers. Never overlap an
  additional router with old exports. Follow CONTENT-TRIGGER-CUTOVER.md exactly.
- [ ] Monitor delivery, side effects and error costs; retain journal/rollback proof.

Do not execute deletion/cutover steps without the specific approval still withheld.
The deployed unchanged-write fix already reduces unnecessary source events.

## 4. Registry cleanup — ownership incomplete; no deletion authorized

- [x] Complete pagination, OCI graph, retained revision/execution and build review.
- [x] Preserve211 images and all managed Functions/rollback repositories.
- [x] Identify five exact conditional candidates and7.169GiB unique candidate-set
  files after subtracting retained/shared files; no additive image-size claim.
- [ ] Confirm Render/external consumers and every candidate's actual ownership.
- [ ] Refresh inventory immediately before a separately approved deletion.
- [ ] Obtain deletion approval for exact digests; delete only approved candidates;
  verify retained image reachability and later provider storage/billing.

Confirmed reclaimable storage remains unknown; deletion-eligible count is zero.

## 5. Renewable accounting/production adapters — local implementation only

- [x] Add durable Cloud Run binding, immutable job admission, no retry of uncertain
  run POST, authoritative terminal settlement, native worker admission and
  conservative platform liability for started failed work.
- [x] Reject unqualified/expired contracts, unsafe allocation, request mismatch,
  unsupported long/automatic/caption Cam scope before admission.
- [x] Reconcile pending jobs from authenticated usage/status and preserve legacy
  purchased/promotional balances and independent renewable reset architecture.
- [ ] Qualify immutable worker image, service-account/IAM isolation, first-use and
  host-loss termination, startup/queue tails, network/storage/retention worst case.
- [ ] Cover every production dispatcher/provider/fallback with the renewable
  admission/terminal contract. Existing legacy fallback is not a qualified adapter.
- [ ] Publish an expiring scope-specific qualification record only after proof.
- [ ] Run specifically approved bounded production tests; verify funded exposure,
  duplicate prevention, reconciliation and exact final output.

Adapter flags, profiles and new indexes remain unactivated/undeployed. No paid
processing was initiated. Do not enable Free with all useful operations refused.

## 6. Meaningful all-tool workflows and numerical limits — not final

- [x] Retain actual signed-in60s edit/save/reopen/export/playback and local
  accounting24 consumed/30 reserved; three identical operations per100 tokens.
- [x] Retain complete local native captions, longer-footage Finder+export,
  manual two-stream external-audio Cam, effects/keyed-title outputs/resources.
- [x] Preserve reservation-aware all-in reference costs and alternative capacities;
  all-in estimates are distinct from measured local resources/cloud invoices.
- [ ] Complete independent-camera sync/drift/active-speaker/reaction/external-audio
  workflow through actual authenticated UI and bound production accounting.
- [ ] Complete normal authenticated FX/motion, first-use background and3D scopes.
- [ ] Complete Publisher/Scheduler and six actual provider deliveries using an
  approved exact final movie/thumbnail; preserve all held prior publications.
- [ ] Attribute ingress/egress/storage/AI, failures/retries and fixed-cost share;
  prove Free100 and Plus2,000 rolling sufficiency with mixed complete workflows.
- [ ] Finalize numerical consumption only after that evidence. Keep USD4.99 and
  the six-day Free reset unchanged; no feature paywalls or free-quality reduction.

## 7. Authenticated subscription experience and PayPal — prepared, inactive

- [x] Usage/reset/exhaustion UI; rolling-only exhaustion; pending activation retry;
  deduplicated visible polling; owner isolation; no-op status writes avoided.
- [x] Local provider/financial cases reject old payment as a new Plus period,
  preserve unchanged receipts, ownership and valid cancelled paid access.
- [x] Prepare and offline-validate inactive USD4.99 drafts with unresolved product
  ID; no product/plan creation, activation or merchant transaction performed.
- [ ] Qualify merchant sandbox lifecycle, actual fee/FX/tax terms, paid activation,
  renewal, failure, cancellation, reordered webhook, refund and reversal cases.
- [ ] Integrate current main (including released Education and independent cost/
  security changes) into the feature branch through a reviewed merge; resolve
  overlaps and rerun source-lock, financial, welcome and authenticated checks.
  Do not copy the entire older feature tree over current main.
- [ ] Complete stage5/6 before enabling the new catalog/checkout and adapters.
- [ ] With separate explicit activation approval, create/read back inactive live
  objects; configure IDs/webhook/origins; verify exact terms; activate the approved
  plan; enable bounded cohort; verify actual funded payment and authoritative UI.
- [ ] Preserve existing agreements, credits, balances and paid periods. Retire old
  plans only from new purchases in the same reviewed catalog migration release.

## Local handoff

73 combined feature emulator/native/economics cases pass after the retention
addition; four focused billing UI cases, two native-admission cases and eight
existing Cam retry cases pass separately. Mock provider transport is not a live
worker/payment proof. Checkpoint stores Auth, Firestore, exact media bytes and
metadata privately before owned service shutdown. The optional native Storage
export failed; independently exported media/persistence survive. Full fresh replay
is unqualified. Unrelated Education emulator and original login/work are preserved.
