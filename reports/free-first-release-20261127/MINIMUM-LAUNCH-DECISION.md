# Minimum funded Free/Plus launch decision — 27 November 2026

Decision: launch the subscription architecture around the creative workflows
already served by AutoPromote. Do not wait for registry cleanup, content-trigger
consolidation, infrastructure re-audits, new models, broader Studio readiness or
new 3D capabilities. Do not remove a currently working tool from one tier.

The requested configuration stays fixed:

| Plan | Price | Renewable allowance | Rolling 30-day ceiling |
| --- | --- | --- | --- |
| Free | USD 0 | 100 tokens every 144 hours | 500 tokens |
| Plus | USD 4.99/month | 500 tokens every 24 hours | 2,000 tokens |

Both plans use the same production-ready creative tools and output settings.
Local editing, project save/reopen and browser preview do not spend processing
tokens. A paid cloud operation requires an explicit quote and confirmation.

## Approved funding — current authority

The owner approved the USD5 cloud ceiling, one USD4.99 live checkout, creation/
activation of the single monthly plan after security qualification, and staged
production deployment after qualification. Recurring limits are USD10/month,
USD2/day, USD0.05/day external AI and one paid execution. Sandbox credentials are
not required: the owner explicitly chose automated payment tests followed by the
single live checkout. Both exact private YouTube uploads are already approved.
See `../free-first-launch-20261127/approval-and-status.json`. No paid run, checkout,
plan creation or subscription deployment has occurred. The resource envelopes
below must still be enforced before spending; funding approval does not make
unqualified workers safe. Remaining delay is implementation/qualification, not
missing owner approval. Registry cleanup and unrelated Studio work are deferred.

## Original funding calculation (now approved)

Propose **USD 5.00 maximum incremental cloud qualification expenditure**, plus
**one USD 4.99 live subscription checkout**, for a **USD 9.99 one-off approval
envelope**. Sandbox setup is waived by the subsequent owner instruction. No refund is assumed when
budgeting the live charge; merchant fees reduce its proceeds and are not added
to that USD 4.99 again. Confirm any buyer FX/tax before the checkout; refuse if
the approved USD maximum would be exceeded.

Expected cloud test consumption is approximately USD 0.50–1.00. These are
planning/reference estimates, not cloud invoices or measurements of these new
production runs. CPU expectations reuse retained actual local workflows. GPU
and cold-start expectations remain estimates.

**The current deployment does not establish a hard USD 5 invoice cap.** The
maximum column below is a proposed, bounded test envelope, contingent on the
preflight controls below. The 250-second startup/shutdown allowance is a budget
assumption, not a documented universal Jobs startup guarantee. It must be
covered by a verified total-lifetime bound or recomputed before any paid run.
Do not label a task timeout, HTTP timeout, cancellation attempt, alert budget or
qualification boolean as that proof. If the bounds cannot be established inside
USD 5, stop before paid execution and present a revised maximum for approval.
Approval of this plan never authorizes an unbounded fallback or unlimited retries.

## Exact funded qualification set

These are financial/output delivery qualifications of existing workflows, not a
new creative feature-development programme. Reuse retained approved sources and
one finished MP4 for publication; do not render a separate movie per platform.

| ID | Exact workflow | Execution profile and task runtime limits | Planning estimate USD | Proposed test ceiling USD |
| --- | --- | --- | ---: | ---: |
| Q1 | Register a fresh ordinary verified Free user; import/edit/save/cold-reopen a 60s film; generate word-timed captions; apply existing effects and a keyed title; export/download at existing 1080p30 quality. | One ASR task: 2 vCPU/4 GiB, 360s; one canonical native export: 4 vCPU/8 GiB, 600s. | 0.04–0.08 | 0.16 |
| Q2 | Find clips in the retained 184s source, choose a 45s result and export/download it. | One analysis task: 4 vCPU/8 GiB, 600s; one export task: 4 vCPU/8 GiB, 360s. | 0.03–0.06 | 0.18 |
| Q3 | Replay a normal two-camera/external-audio Cam workflow, with existing automatic speaker/reaction settings and a 60s final. Preserve sync/drift/output checks. | One clone of the current Cam GPU job image: 20 vCPU/80 GiB/one RTX PRO 6000, 900s. No CPU optimization is a prerequisite. | 0.10–0.30 | 1.07 |
| Q4 | Replay the existing accelerated native export with current supported GPU effects. Reuse already-prepared assets; first-use experimental segmentation and new 3D/model work are deferred. | One current native GPU-image task: 20 vCPU/80 GiB/one RTX PRO 6000, 600s. | 0.10–0.30; timing assumption | 0.81 |
| Q5 | Generate one real existing social caption/hashtag response, proving API reservation/usage settlement. This is distinct from Q1 speech transcription. | Existing gpt-4o-mini path only if available; at most 2,000 total input and 500 output tokens; one request, zero retries/tools/paid fallback. | 0.0006 provider tokens, plus small control overhead | 0.01 |
| Q6 | Publish the retained finished film once and schedule it once through the ordinary durable queue; confirm both provider receipts and financial settlement. | Two bounded publisher executions, 2 vCPU/4 GiB, 120s each; one already-connected private test destination. Reuse historical working integration evidence and local route/transport tests for other providers. | 0.01–0.03 | 0.14 |
| Q7 | Start one real native CPU execution, terminate the qualification execution deliberately, replay the same request and reconcile from a fresh controller process. | One 4 vCPU/8 GiB task, 360s bound; duplicate submission/reconciliation must create zero additional executions. | 0.01–0.03 | 0.06 |
| | **Combined proposed workflow ceilings** | **9 Cloud Run task executions and one AI request** | **approximately 0.50–1.00 total** | **2.43** |

API-response loss/controller restart is also injected while Q1/Q3 is running;
it does not justify an additional job. Exhausted allowance, cross-owner access,
reset, rolling limit, oversized input, new-account abuse and budget rejection are
verified locally and by production refusals that must not start paid tasks.
No public marketing posts or previously held schedules are released. The exact Q6 private destination/media are now explicitly approved; do not substitute another channel or film.
If a genuinely new, previously unserved GPU/model path is discovered, exclude it
from the subscription rollout scope rather than turning it into a new launch gate.
Every currently served paid execution path still needs financial coverage.

One bounded API/worker failure test and the already-tested ledger state machine
suffice for this initial launch; multi-user load certification, hardware disaster
exercises, new art direction and general feature perfection are separate work.
Do not claim these tests prove those broader properties.

## Cost calculation and preflight

Reference default on-demand us-central1 Jobs rates, without free-tier credits:

- vCPU: USD 0.000018/vCPU-second; memory: USD 0.000002/GiB-second.
- RTX PRO 6000 without zonal redundancy: USD 0.00036522/GPU-second.
- CPU 2/4: USD 0.000044/second; CPU 4/8: USD 0.000088/second.
- GPU 20/80/one RTX: USD 0.00088522/second.
- Include the one-minute minimum, all started child tasks and shutdown billing.
- The numerical model adds 250 seconds per task for startup/shutdown, subject to
  the lifetime-bound condition above. It is not a measured startup percentile.

Noncompute maximum allocations are USD 0.05 per successful media workflow,
USD 0.10 for Q6's two deliveries, and USD 0.005 for Q7 with no delivered output.
These allocations already include the capped media storage, DB/request/log and
network costs; do not add those costs again. Q5's all-in allocation is USD 0.01.
The successful media-workflow allocation assumes at most 1 GiB of new temporary
objects for six days and 128 MiB of metered Internet delivery at a conservative
USD 0.30/GiB, plus bounded requests/logging. Q6 allows 256 MiB total delivery.
Use exact source generations, no repeated source upload, same-region internal
transfers and a metered delivery mechanism. An ordinary reusable signed URL by
itself does not enforce a download-byte maximum.

USD 2.43 workflow ceilings + USD 0.50 packaging/new-image/control overhead
allowance + USD 2.07 unspent contingency = **USD 5.00**. The contingency is not
authorization to rerun failed workloads. Use local/GitHub builds and reused image
layers; no paid Cloud Build job is authorized by default. Refuse packaging if its
maximum cannot fit its allocation. Existing Render/database/registry baseline
rent is excluded from incremental qualification cost, not hidden or counted twice.
Ongoing operating costs are separate from this one-off test authorization.

Required before paid execution:

1. Immutable image digests and approved request/source hashes, one task per
   execution, one globally active task, no parallel children, maxRetries=0,
   no CPU startup boost, no GPU/service/provider fallback, no automatic rerun.
2. New scoped qualification profiles use the current algorithms/images. The
   900s Cam limit applies to this bounded 60s qualification request, not an
   unproven reduction of the production four-hour limit. Stop if it cannot finish.
3. Bound full billable lifecycle, every input/intermediate/output byte, model
   dependency, API request/token count, storage duration and delivered byte.
   Task/HTTP deadlines alone do not enforce this. No arbitrary browser URLs,
   user-controlled model names or hidden child executions.
4. Dedicated worker identity cannot grant tokens, approve its own qualification,
   edit financial evidence or dispatch new jobs. Only the dispatcher can spend;
   a separate independent reconciler can cancel the test execution.
5. A finite owner-approved qualification grant names Q1–Q7, source fingerprints,
   maximum execution counts and the USD 5 total. It is separate from the later
   production-qualified record; never falsify approval/proof booleans to bootstrap.
6. Full worst-case cash is atomically held before dispatch. Ambiguous work keeps
   its cash hold until authoritative termination; failed work retains platform
   expense. A lost HTTP response never authorizes another paid submission.
7. Do not modify existing balances, delete existing resources or interrupt normal
   publications. Any temporary-asset retention/cleanup is limited to an explicitly
   approved new qualification prefix; preserve the final proof/receipts privately.

## Minimum application work before launch

These are the remaining subscription changes, not infrastructure-audit extensions:

1. Merge current main, preserving both released cost/security patches, public
   Education and existing creative/publishing code. Resolve the feature branch's
   remaining CI failures before release; do not require unrelated readiness work.
2. Generalize production accounting beyond manual Cam: canonical media analysis,
   transcription, render/effects and existing GPU jobs; bounded external AI;
   immediate Publisher; delayed Scheduler. Every live dispatch/transport/fallback
   must enter the same cash admission control, including legacy-funded queued
   obligations. Do not make those obligations acquire another charge.
3. Separate the user token quote/reservation/history from the platform's worst-case
   cash reservation/history. Current quote/rolling math couples them through
   TOKEN_MICROS=1000. A USD 1.07 cash hold would currently demand 1,070 Free tokens.
   Preserve 100/500 and 500/2,000 user allowances; never use that coupling to make
   an allegedly shared tool unusable for Free. Tokens are operation capacity;
   they are not a purchased-credit conversion or a promise of cash reimbursement.
4. Explicitly separate free authoring/project/metadata/preview routes from cloud
   jobs. Current guard's broad /api/media POST catch-all and demo-only exceptions
   must not break real Free editing. Preserve resource/transfer abuse controls;
   do not silently launch an unreserved cloud preview job.
5. Bind new uploads/deliveries and queued dispatch to durable reservations. Seed
   new accounting from a read-only storage baseline; do not reset or delete old
   user media, balances or financial history. Scheduled processing must not rely
   on an HTTP AsyncLocalStorage context surviving until its due time.
6. Finish the Plus-specific lifecycle: verified payment/renewal, failed collection,
   cancellation through paid-through time, suspension/expiry and verified refund/
   reversal revocation/reconciliation. Current webhook lacks explicit SALE.REFUNDED,
   SALE.REVERSED and SUBSCRIPTION.PAYMENT.FAILED handlers. Verify return/cancel
   origins rather than accepting browser-supplied destinations unchecked.
7. Keep per-plan creative availability identical. Treat existing 20/80 upload and
   30/150 promotion counts only as explicit capacity allowances, not feature locks.
   Local editing is available after either user allowance or global cash exhaustion.
8. Run Q1–Q7 after approval. Acceptance requires real outputs/downloads, exactly
   one native/provider execution per admitted request, matching ledger receipts,
   no legacy-wallet changes, working sign-out/reopen and free local editing.
   At least one complete 60s edit/caption/export/publish must fit 100 tokens.
   Fix the exact failure without automatically increasing budget or rerunning.

## Initial public-launch expenditure limits

There is no population-independent mathematical minimum. For the present low-
traffic soft launch, propose the following **incremental creative-processing**
controls. They are not a cap on the whole existing Render/Firebase bill.

| Control | Proposed limit |
| --- | ---: |
| Global settled cost plus outstanding cash holds, per UTC calendar day | USD 2.00 |
| Global settled cost plus outstanding cash holds, per UTC calendar month | USD 10.00 |
| Free daily cash sub-limit | USD 2.00, within the same global limit |
| External AI daily cash sub-limit | USD 0.05, within the same global limit |
| Concurrent paid executions, all plans | 1 |
| Concurrent paid executions per user | 1 |

Why not retain the current USD 0.25 Free sub-limit? It would permanently refuse
some required GPU workflows at their conservative cash reservation. The maximum
combined workflow envelope above is USD 1.07, so USD 2.00 is a practical minimum
rounded daily starting limit. Qualification uses its separate finite USD 5 grant;
count its actual expenditure against the first month's USD 10 if launching that
month, rather than adding the same spend twice. The subsequent owner approval also authorizes the recurring USD10/month, USD2/day and USD0.05/day external-AI limits.

Queue or refuse new cloud work before dispatch when funds are exhausted. Retain
projects, local editing, paid entitlement history and every running liability.
Show shared capacity exhaustion honestly; stop new Plus purchases if there is
no funded capacity to serve them. These controls fund a small launch, not unlimited
registrations using every allowance in full. Increase capacity only with an
explicit funded budget decision or verified net revenue; never increase prices
or introduce feature locks to cover it.

Cloud Billing alerts and even spend-cap budgets can be delayed and do not cover
all services/in-flight/fixed usage. Do not configure a project-wide pause that
breaks scheduled publishing. The application admission/worker/transfer bounds,
not a billing alert alone, enforce the funded execution policy.

## Exact PayPal setup and owner actions

Free registration requires Firebase Authentication, never a PayPal subscription.
Use the existing merchant app if suitable; no second app is required.

1. Confirm the Business merchant account accepts the intended USD recurring
   subscription, settlement/FX/fee terms and tax treatment. Keep the customer-
   visible monthly total at USD 4.99; no setup fee, trial or added surprise tax.
   Existing valid credentials stay in provider secret storage, not chat/Git.
2. Create one SERVICE/SOFTWARE product and one **CREATED**, inactive plan from the
   retained draft: MONTH interval_count=1, REGULAR, sequence=1, total_cycles=0,
   fixed_price USD 4.99, setup USD 0, auto_bill_outstanding=false,
   setup_fee_failure_action=CANCEL, payment_failure_threshold=2.
3. Register https://api.autopromote.org/api/paypal/webhook on that same live app.
   Required events: PAYMENT.SALE.COMPLETED, PAYMENT.SALE.REFUNDED,
   PAYMENT.SALE.REVERSED; BILLING.SUBSCRIPTION.ACTIVATED, UPDATED, CANCELLED,
   SUSPENDED, EXPIRED and PAYMENT.FAILED. Store the exact returned webhook ID.
4. Configure backend PAYPAL_MODE=live, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET,
   PAYPAL_PLUS_PLAN_ID, PAYPAL_WEBHOOK_ID,
   REQUIRE_PAYPAL_WEBHOOK_VERIFICATION=true and FRONTEND_URL=https://autopromote.org.
   Keep PLUS_PURCHASES_ENABLED=false while preparing. Allow only the intended
   same-origin /pricing return/cancel URL. The current client uses backend
   approval-URL redirects, so a new browser PayPal secret or SDK is unnecessary.
5. Sandbox setup is explicitly waived. Complete automated payment security,
   renewal, pending/failed payment, cancellation, refund/reversal and duplicate/
   reordered-event tests, then use the single authorized live checkout. Verify
   provider transactions and current agreement state. A fixture is not a real
   monthly renewal; observe renewals after launch without delaying launch a month.
6. Existing owner approval covers activating the single USD4.99 plan and one
   USD4.99 live checkout after security qualification. After the remaining gates,
   activate exactly that plan with /v1/billing/plans/{id}/activate;
   read it back, verify ACTIVE plus exact monthly USD 4.99 terms. No extra plan
   or new legacy purchase option. Preserve existing legacy agreement IDs/prices,
   paid periods, renewals and purchased/promotional balances.
7. Verify one approved live buyer transaction, correct account binding, webhook
   signature, Plus allowance, cancellation and retained paid-through behavior.
   Approval redirect/ACTIVE alone must not grant capacity. Observe real monthly
   renewals after launch; failures retain a conservative entitlement policy.

## Exact production cutover

Deploy reviewed indexes/rules/adapters/backend with new admission and checkout
closed. Keep the catalog gated so an intermediate deploy cannot advertise a new
Free plan with an old, unusable dispatcher. Configure the initial cash limits,
identical creative entitlements and exact renewable periods; register only the
actually qualified immutable profiles. Run the approved proof under the test
grant and retain receipts. Enable normal free registration and budgeted processing;
release the matching pricing/account UI with percentages, local reset times,
rolling-exhaustion and global-capacity behavior. Activate/enable the sole Plus
purchase path only after the merchant steps. Verify an ordinary browser session.

Rollback closes new cloud admission and Plus checkout, preserves all liabilities,
agreements, projects and balances, and continues reconciliation/scheduled funded
obligations. Do not disable the usage flag in a way that reopens legacy unbudgeted
processing. No registry deletion or four-trigger migration belongs to this cutover.

Sources (targeted verification, not a restarted audit):

- https://cloud.google.com/run/pricing
- https://docs.cloud.google.com/run/docs/configuring/task-timeout
- https://docs.cloud.google.com/run/docs/container-contract
- https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps
- https://developer.paypal.com/api/subscriptions/v1
- https://developer.paypal.com/subscriptions/webhooks
- https://developers.openai.com/api/docs/models/compare?model=gpt-4o-mini

No paid qualification, PayPal object creation/activation or production change was
executed to prepare this decision. Historical infrastructure and Studio audits
remain historical; their broader tasks are not new subscription launch gates.
