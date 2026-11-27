# Content-trigger cutover: in-place survivor, currently blocked

The production update triggers remain unchanged by PR560. No new content trigger
was deployed, no function was deleted and no paid Function test was run.

The previous additive `contentUpdated` export is now rejected in the feature
branch. `CONTENT_UPDATE_ROUTER_MODE=survivor` instead changes the existing
`createPromotionOnApproval` handler in place to route approval, landing-page,
smart-link and reward events. It omits the other three update exports. Existing
create triggers and the normal publisher/scheduler remain separate.

Replacing differently named Functions normally involves overlapping deployments;
that does not meet this owner's zero-overlap requirement. Deleting first while
writers continue would lose events. This preparation must not be described as an
atomic, lossless provider cutover. [Firebase function management](https://firebase.google.com/docs/functions/manage-functions?gen=1st).

The exact release sequence, after its separate approval, is:

1. Retain the current four deployment specifications, runtime identities,
   regions, source revision and rollback package. Prove idempotency of every
   selected handler, including landing-page creation, link creation and rewards;
   approval-event schedule creation already has a deterministic event identity.
2. Enumerate every content writer: authenticated clients and operator tools,
   Render, separate Cloud Run applications, media workers, metrics/recovery
   services, scheduled jobs and existing Functions. A server flag alone does not
   fence direct Firestore or other application writes.
3. Choose a window without due/in-flight publications and media operations that
   must commit content. Preserve all queue items and due timestamps. Establish
   and verify a content-writer barrier across the enumerated producers. Do not
   suspend publication or accept-and-discard user actions. If a complete barrier
   cannot be established, implement and qualify a durable transactional event
   journal at every relevant writer before proceeding.
4. Record the barrier time and last accepted event identities. Drain all old
   deliveries and outstanding side effects. Reconcile producer journal entries
   to successful handler receipts. Provider metric zero alone is insufficient
   proof of drainage because metrics are delayed and callbacks can swallow
   errors. Legitimate intents must remain recorded for recovery.
5. While the verified barrier holds, retire only `handleLandingPageIntent`,
   `handleSmartLinkIntent` and `autoRewardCreators`. Confirm their triggers are
   absent. The old approval trigger remains; there is no differently named new
   trigger and no concurrent old/new fan-out.
6. Deploy only the in-place survivor `createPromotionOnApproval`, retaining its
   region, document path and update event type. Verify its deployment/source
   identity and that the other three remain absent. Do not deploy the whole
   Functions collection or touch unrelated platform integrations.
7. Replay/drain the retained legitimate journal events through the same router
   under the barrier, with per-handler idempotency. Verify no missing/duplicate
   schedules, pages, links or reward liabilities. An unchanged retention update
   selects no handlers. Test legitimate events using an approved bounded test
   scope; a new production invocation is not implicitly authorized here.
8. Release the writer barrier, confirm accepted events reach their intended
   side effects once, and monitor update deliveries, failures and expense. Keep
   the journal and rollback evidence until the observation window is complete.

Rollback also requires the barrier: restore the old approval implementation and
the other three old triggers, verify them, reconcile the journal, then resume
writers. Never restore redundant triggers alongside a live consolidated router.

Remaining blockers are concrete: a complete writer barrier or transactional
producer journal, successful drainage receipts, and all-handler side-effect
idempotency. The feature branch's local selection and actual Functions-SDK tests
do not prove those operational conditions. They are intentionally not bypassed
to claim this cutover can safely happen now.
