# Free-first qualification and safe production releases — 27 November 2026

The owner authorized pushing and deploying tested updates, then asked that work
continue unattended with Firestore waste as the priority. This supersedes the
previous deployment hold for the tested release only. PayPal activation, paid
creative processing, production resource deletion and customer balance changes
remain excluded. No subscription prices or six-day Free reset were changed.

## Released independently

[PR560](https://github.com/Tibule12/AutoPromote/pull/560) is merged and serves
`2c92c8c978acac837dfa97f7082c9a08dd964539` on both API origins. It removes
unchanged retention writes, batches sparse dependency queries, coalesces
nonfinancial counters and diagnostics, pauses hidden diagnostic polling/listeners
and excludes passive account polling from optional background demand. Publisher,
Scheduler and creative processing are preserved. The existing payment path now
checks ownership, provider plan identity, paid state, currency and event replay;
unverified upgrade grants are refused and deferred processing refunds cannot
credit the legacy wallet after request context ends.

The financial-only Firestore delta was published after the backend was verified.
Its receipt records both ruleset identities and source hashes. It preserves the
previously live workspace/content policy, blocks forged financial evidence even
through the broad client-admin override, and leaves trusted IAM accounting intact.
No Storage rules, indexes, database data or balances were changed.

Evidence: [live versions/client markers](production-after.json),
[Rules publication](firestore-rules-release.json),
[deployment pipeline request](render-deploy-request.json). The two original
review branches remain separate: `release/free-first-infrastructure-20261127`
and `release/free-first-payment-security-20261127`.

## Firestore: live evidence and the follow-up

The initial live maintenance cycle confirms fewer queries but exposes the limit
of batching: the old dependency signature issued 776 equality queries; the first
new cycle issued 126 queries (76 IN, 50 equality). No later content-retention
writes or associated executions of the four update Functions appeared in that
observed interval. However, the full three-minute project read count was3,896 before versus4,913
after (not a reduction); writes were156 versus3 and four-trigger executions616
versus zero observed. See [complete-cycle comparison](production-first-release-comparison.json).
Several thousand historical documents were still read. A smaller number of requests is not an equivalent document-read saving.

[PR561](https://github.com/Tibule12/AutoPromote/pull/561) addresses that remaining
read amplification with a bounded process-local cache of decisions that retain
media. Content changes invalidate the cache; future known publication deadlines
expire entries precisely. Dry runs refresh, errors and incomplete scans are not
cached, and deletion always retains fresh transactional/ownership/generation
checks. Dependency-only changes may postpone cleanup by at most one hour.
Publishing and scheduling do not use this cache. See the staged checklist for
its exact release status.

[Six actual emulator maintenance cycles](retention-cache-local.json) read 558
versus143 documents (74.37% fewer), with zero writes and no media deletion.
Five new safety cases pass alongside seven independent financial/infrastructure
cases and21 existing upload/scheduling/background regressions. These local
results do not establish a reduced invoice. The bounded live Monitoring and
sanitized query samples are retained; delayed/missing points are not zero usage.

The reported $20 consumed by Firestore is owner-reported, not a provider invoice.
The historical32,255,320 reads,831,804 writes and1,984,647 executions are retained
in the earlier audit. Complete endpoint/application attribution across shared
Admin credentials remains unavailable; the opt-in attribution facility stays off
rather than enabling extra production writes. Database metadata confirms
STANDARD Firestore in us-central1 with point-in-time recovery disabled.

## Render and operating economics

[One real hosted process observation](render-runtime-first-observation.json)
shows193.12MiB RSS,208.45MiB peak, a512MiB memory cgroup and0.5vCPU quota.
The process had accumulated5.303CPU-seconds after254.7seconds uptime. The
single authenticated diagnostic request took747ms including auth/network.
This is not a concurrency or API latency distribution. It provides no evidence
for increasing hosting capacity. Render invoices/service-level bandwidth,
scaling/disk charges and a merchant fee statement remain unavailable.

The [full operating model](../free-first-optimization-20261126/OPERATING-ENVIRONMENT.md)
retains fixed monthly, registered-user, active-Free, paying-user and processing
costs separately. Processing expenses already included in tokens are not added
again as fixed worker rent. All new creative workload expenditure in this
qualification was zero; read-only metadata/Monitoring are not attributed
operation invoices. No estimate is relabelled as actual billing.

## Qualification completed locally; activation still blocked

The renewable Cloud Run adapter is implemented behind disabled flags. It checks
an immutable job image/digest/resource/timeout/retry/parallelism contract and an
expiring qualification record before reservation/dispatch. A durable nonce and
canonical request fingerprint bind the native job to one dispatch; an ambiguous
run response is recovered by GET without repeating POST. Only authoritative
terminal execution/output evidence settles; uncertain work retains its liability.
Failed started work retains platform expense even when user tokens are refunded.
Native worker admission checks ownership, nonce, canonical request and attempt0.

Four real-Firestore accounting cases use a **mock provider transport**: unqualified
requests issue no run POST, duplicates/lost responses do not run twice, failures
retain liability, allocation drift is refused, and unsupported long/automatic/
caption Cam scope is rejected before admission. The only proposed Cam profile
scope is manual two-camera60s. This is not a qualified production worker. Broad
worker IAM, true host loss, queue/startup tails, network/storage worst cases,
independent camera drift, active speakers and reactions still require evidence.
No production qualification document, job, image or enabling flag was created.

Authenticated UI tests cover authoritative percentages/reset times, exhausted
rolling allowance, pending-payment retry, sign-out owner isolation and hidden-tab
polling. Account-status GETs no longer rewrite an unchanged financial account;
30 real-emulator polls preserve updateTime, and a due reset writes once. Plus
activation refuses an old payment as evidence of a new monthly billing cycle;
repeated verified events preserve existing entitlement receipts. These remain on
the feature branch. The public catalog still uses the existing legacy plans.

The Functions migration uses the existing approval trigger as an in-place
survivor, never a differently named additive trigger. The complete
[cutover procedure](CONTENT-TRIGGER-CUTOVER.md) still requires a verified writer
barrier or transactional producer journal, drained deliveries and all-handler
idempotency. None of the four production triggers was deleted or redeployed.

## Registry inventory

The fully paginated inventory covers216 images,1,443 provider files, all retained
Cloud Run revisions/Jobs/executions,45 Gen1 Function build records and the entire
OCI manifest/index/subject graph. Managed Functions repositories remain protected.
211 images are retained. [Five exact conditional candidates](registry-cleanup-candidates.csv)
have7,697,487,832 unique candidate-set bytes (7.169GiB) after subtracting all files
reachable from kept images. This is not the sum of image sizes or160GiB reclaimable.
Render/external ownership is not completely verified, so confirmed reclaimable
bytes remain unknown and zero images are deletion-eligible. No deletion occurred.

## Meaningful operations and provisional allowances

The retained real signed-in60s edit/title/save/cold-reopen/export completed with
24 local CPU-reference tokens consumed after a30-token reservation, unchanged
legacy balances and full final-film playback. That exact accounting can admit
**three identical exports** per fresh100-token window:28tokens left after three
cannot reserve a fourth30-token operation. That is local evidence, not validated
all-in cloud capacity. The new safe-release browser check only replays an8s
stream-copy excerpt and does not count as another full Free workflow.

[Allowance qualification](allowance-qualification.json) and the
[prior complete cost/resource table](../free-first-optimization-20261126/README.md)
retain current/optimized reference costs, measured local CPU/RSS, output bytes,
tokens, reservation-aware Free/Plus capacities and modeled savings. Conditional
Free counts are4 basic60s worker exports,8 caption operations,1 longer-footage
Finder+export,1 manual Cam edit,1 effects/keyed-title film, or3 all-in60s App
exports. They are alternatives under different reference tariffs, not a bundle
of simultaneous promises. Plus renewal and rolling ceilings are both enforced;
2,000 rolling tokens do not imply500 every day for a month.

Actual all-tool production capacity remains **unqualified**. Independent-camera
synchronization/drift/speaker/reaction workflows, full first-use background/3D,
normal authenticated effects and all six provider publications still lack a
matching complete production-accounted workflow. No false zero-cost capacity is
assigned to Publisher/Scheduler.100 Free tokens, USD4.99 Plus and the six-day
reset remain proposed/unchanged; numerical allowances are not finalized.

The [inactive PayPal drafts](../../config/free-first-release) and
[migration procedure](PAYPAL-MIGRATION.md) are prepared and offline-validated.
No product/plan was created or activated. Merchant-backed activation, renewals,
refund/reversal and failed-collection scenarios remain required.

## Evidence boundaries and next release

Initial independent release:7 focused emulator cases,99 authority/profile cases,
48 payment/publishing/retention regressions,14 idle/background cases,8 frontend
polling cases,7 resumable cases and3 guarded publisher cases pass. Strict build,
8 ordinary welcome comparisons and actual local sign-in/Studio/help pass. The
Studio smoke uses a fresh local account with an existing entitlement; it does
not claim that the excluded migration has made legacy Studio gates Free.

Full feature qualification before the final retention addition:68 emulator/native/
economics cases,4 billing UI cases,2 native-admission and8 Cam retry cases pass.
Provider transports/fixtures are identified as such; no merchant test or cloud
creative execution is inferred. Failed dependency-path/earlier UI attempts stay
retained alongside corrected logs. Final combined results and local shutdown are
recorded in the staged checklist/checkpoint.

[Exact staged checklist](STAGED-RELEASE.md) separates deployed safe changes from
blocked activation. Existing projects, held publications, customer balances and
all prior movies/login remain preserved. Studio17 FUNCTIONAL/9 PARTIAL/1 BROKEN/
2 UNIMPLEMENTED/0 PRO/0 PRODUCTION, typography13/16 and S02/S04/S03 remain unchanged.
Technical validation is not owner creative/listening approval.

Raw source media, movies and browser recordings stay local/private. Git contains
reviewable code, sanitized measurements and hash manifests; portable before
sources are pinned under `test/free-first/baselines`. To rerun the actual-output
transfer case, supply the retained SHA256-matching60s film at its documented local
report path. A shallow checkout alone does not contain that private test source.
