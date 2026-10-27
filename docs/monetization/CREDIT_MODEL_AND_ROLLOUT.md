> Historical foundation snapshot — 26 October 2026. Current security, account status, implementation and test evidence are in the [27 October continuation report](../../MONETIZATION_CONTINUATION_20261027.md). This file does not describe the current deployed security state or an approved commercial credit policy.

# Credit model and staged implementation

## Proposed model

One available balance determines affordability across Queue, Publisher, Studio and
Find Viral Clips. Reserving work removes credits from the available balance and
holds them until a trusted worker outcome. Saving, editing and project recovery
never require a reservation. Cam Combiner stays on its existing implementation.

Keep the existing monthly allocations for the first measured pilot:

| Plan    | Monthly credits | Rewarded ads                                                  | Existing benefits |
| ------- | --------------: | ------------------------------------------------------------- | ----------------- |
| Starter |              15 | Optional; proposed test reward 1 credit, maximum 20 per cycle | Preserved         |
| Creator |             150 | Ad-free                                                       | Preserved         |
| Studio  |             500 | Ad-free                                                       | Preserved         |
| Agency  |            2000 | Ad-free                                                       | Preserved         |

These are a proposal and **sandbox settings**, not an approved commercial reward
rate. Paid prices and existing billing behaviour have not changed. The 1-credit
reward has no assumed advertising revenue; a real pilot needs a funded subsidy or
validated economics. All allocations, caps, resource prices, wallet capacity and
financial ceilings come from server configuration. The example reuses allocations
from `subscriptionPlans.js` unless explicitly overridden by the sandbox config.

Renew at 00:00 UTC on the first calendar day each month, matching the existing
editing-credit calendar rather than silently moving users to PayPal billing dates.
Renewal is lazy and transactional. Issue only the current month's allowance after
inactivity, never a backlog. Unspent monthly grants and earned ad credits expire;
purchased/opening credits persist. Spend expiring credits first. A reservation
remains held over renewal; a confirmed failure of started work after its original
month yields persistent compensation credits so the failed operation does not erase
the refund. Cancelling work that never started returns its purchased portion; an
already expired allowance portion expires. Queuing and cancelling across renewal
cannot turn a monthly allowance into permanent credits.

The wallet has a configurable total holding cap, including outstanding reservations
and pending rewards. Renewal grants only the room available under that cap; no
later catch-up during that cycle. The UI discloses capacity. Purchases exceeding
capacity are rejected before issuance. The legacy purchase routes are not wired
to this policy and must be reviewed before migration.

There are no feature-specific monthly usage quotas in the new wallet. Credits can
be spent in one day. Safety controls limit global/per-user infrastructure spending,
concurrent work, input size and worst-case runtime; these do not grant separate
feature allowances. Preserve external platform API constraints and plan benefits.

## Implemented foundation

`src/services/unifiedCredits/wallet.js` uses real Firestore transactions. Each user's
`credits_v2_wallets` document is the authority for available and reserved credits.
`expiring` and `permanent` are internal provenance, checked against `balance`; they
are not independent feature wallets. Every credit amount is a nonnegative safe
integer. Monetary budgets use integer USD microdollars. Nothing trusts browser
prices, balances, tiers or a completion boolean.

The immutable ledger distinguishes opening balances, granted credits, earned ad
credits, purchased credits, reservations, consumption, releases and expiry. Lifetime
totals separate gross successful consumption, refunds and expirations. A reservation
release is not a new earned or granted credit. Financial budget documents preserve
the operation's original month. A global control document tracks outstanding work
across calendar boundaries and provides spending/reward/issuance kill switches.

| Transition                     | Credits                            | Infrastructure budget                                    |
| ------------------------------ | ---------------------------------- | -------------------------------------------------------- |
| Reserve                        | Move available credits into a hold | Reserve worst-case configured resource cost              |
| Start                          | Hold remains                       | Hold remains; one caller can acquire dispatch permission |
| Success                        | Consume held credits once          | Account full configured resource ceiling as spent        |
| Cancel before start            | Release once                       | Release cost reservation                                 |
| Confirmed failed worker        | Refund once                        | Keep resource ceiling as spent                           |
| Timeout / unknown worker state | Keep held                          | Keep held until reconciliation proves terminal outcome   |

`reserve` requires a stable request ID plus the approved credit price and configuration
digest. Reusing an ID for a different operation/workload is rejected. `start` succeeds
only once; a redelivery must not repeat processing. `settle` is idempotent and rejects
contradictory outcomes. Call these from trusted job orchestration, not browser routes.
Actual dispatch and the `running` transition are not one atomic distributed operation:
a crash between them requires reconciliation. Never automatically rerun or refund a
job merely because its HTTP request timed out.

The mock reward protocol binds user, session, global event ID and completion time
with a local HMAC. It verifies signature, ownership, TTL, cycle, caps and replay.
One session can be pending per account; a session holds its reward liability and
wallet space before the reward is promised. Skip/expiry close the session and release
the financial hold. A promised valid completion is honoured even if new reward
issuance has been paused. This is **not Google verification**.

Expired sessions are recovered explicitly by closing/dismissing them. An API caller
can resume/dismiss the pending mock ad after reloading. No scheduler automatically
releases uncertain processing jobs. A future operator reconciler must inspect worker
execution IDs, verify termination, and call the existing settlement methods.

The local UI demonstrates reward disclosure, optional ad display, skipping, balance,
cost quotes, insufficient credits, failure/refund, ad-free paid accounts, activity and
notes saved at zero balance. It has no Google SDK, external creative, payment SDK,
production Firebase client or disruptive editor toast. No exported media is touched.
These tools are **simulated in the preview**; the live Queue/Publisher/Studio/clips
dispatch paths still use their existing billing and entitlements.

## Isolation and testing

No new code is mounted by `src/server.js`, imported by production billing or copied
manually into the generated Functions server. Every wallet entry point requires:

- `UNIFIED_CREDITS_SANDBOX=true`;
- project ID exactly `demo-autopromote-credits`;
- a literal `127.0.0.1:PORT` Firestore emulator;
- a Firestore client explicitly configured for that host with TLS disabled;
- no production, Cloud Run, Cloud Functions or Render runtime marker.

The standalone HTTP preview also binds to loopback, enforces same-origin requests,
limits request sizes and rates, and accepts only explicit demo identities. The mock
completion endpoint intentionally simulates completion; it is not a live-ad security
boundary. The application does not accept arbitrary identities or production tokens.

`test/unified-credits/firestore.rules` denies client financial writes, including
forged admin claims. It allows only the owner to get their wallet. It is a separate
emulator ruleset, **not a remediation of the existing deployed rules**. Tests run
against a fresh emulator with real transaction conflicts and Firebase rule checks,
not the repository's non-transactional in-memory Admin stub.

## Migration and production gates

1. Review and repair production rules and backend role/tier trust. Protect credit,
   subscription, tester, billing and admin fields; test real application onboarding,
   profile editing and every financial collection. Do not merge the sandbox rules
   into permissive production catch-alls and assume access is restricted.
2. Inventory every writer to all legacy balances and payment fulfilment paths. Produce
   a read-only per-user reconciliation: monthly allocation, `fromMonthly` usage,
   purchased balance, mirrored balances, tester access and existing reservations.
   Investigate discrepancies; do not add mirrors together or select their maximum.
   `openingBalance` in the demo is an explicit input, not an automatic migration.
3. Snapshot and reconcile users under a maintenance/transactional cutover plan. Stop
   or redirect **all** old financial writers for an enrolled user. Match payment
   callbacks to a stored owner/order/package/currency/amount and unique provider event.
   Record a signed-off opening entry once. Never dual-charge or dual-grant a cohort.
4. Bind verified subscription events and effective plan benefits to the new authority.
   Make monthly grant amounts stable within a cycle; explicitly review upgrade,
   downgrade, cancellation, refunds and founding tester conversion. No subscription
   price, paid benefit or billing-date migration is part of this foundation.
5. Wire each supported operation through a trusted dispatcher: derive resource ceilings
   from validated server metadata, compare the user's approved quote, reserve, acquire
   dispatch once, persist execution ID and settle only a trusted terminal outcome.
   Implement a durable outbox/reconciler for the dispatch crash window. Aggregate
   retries, output storage and third-party calls into the cost ceiling. Remove redundant
   feature quotas only for the migrated cohort; keep platform/API/size constraints.
6. Harden Auth/App Check, account-farming controls, worker IAM and global spending
   limits before free access can create real infrastructure jobs. Private workers must
   reject calls that bypass admission. Enforce maximum runtime, task count and retries
   at the worker; a quote alone cannot cap a cloud bill.
7. Resolve Google's account approval, ad demand, consent/header compatibility and
   trustworthy completion channel. Implement a separately reviewed live verifier;
   never reuse the mock issuer. Observe final revenue and measured costs by cohort.
8. After explicit approval, deploy to a nonproduction project, exercise provider sandbox
   payments and worker failure/recovery, then propose a limited production cohort.

Rollback before cutover is simply leaving the isolated code unmounted. After cutover,
rollback must reconcile the ledger back into the old authority without replaying
grants/payments or resurrecting a stale mirror. Never switch stores on a transient error.

**Not performed:** production grants, legacy migration, Google signup/configuration,
live ads, live payment changes, production deployment, a merge or a remote push.
