# Team workspace continuation — 4 November 2026

Implementation checkpoint: branch `feat/team-workspace-permissions-20261104`, based on main `8edaf4e2`. The original local verification performed no push, merge, deployment, live post, payment, balance migration, IAM change or production record modification. The original `.env` and other worktrees remain untouched.

Publication follow-up: the owner subsequently approved pushing the other saved updates. Team/Billing are now in [draft PR #520](https://github.com/Tibule12/AutoPromote/pull/520), separate from the approved Studio release. A CI follow-up bounds dispatch by the server's eight-platform catalogue and revalidates stored destination shapes (CodeQL #1226), with a forged-length regression. The emulator suite now passes **31 cases**. The fake-API Rules-publisher tests use a private synthetic reviewed fixture and add rejection of a changed source before any network/credential call: **five passed**. The real historical approval manifest and guarded publisher remain unchanged; this does not approve or enable publication of the new Team Rules. Remote rerun results belong to the PR. An earlier branch-push CI job also timed out downloading the CPU prerequisites; that is separate from the corrected test/source failures.

The separate Billing contrast correction is checkpoint `81f6b128`; its [report](../billing-contrast-20261104/README.md) records 780 actual App text checks at six widths, minimum 5.49:1. It can be reviewed independently of Team.

## Implemented

- Preserve the authenticated human identity. Workspace resource ownership and billing context are explicit fields rather than impersonating the owner. Membership is checked on every scoped request; unknown/inactive roles are denied.
- Content and Queue reads distinguish personal, selected-team and other-team records. Personal dashboard loading no longer automatically activates an owned team. A persistent workspace label and personal switch make the context visible. The Publisher source picker can additionally show only the acting user's own personal media; submitting explicitly shares it for review.
- Owners explicitly share platform connections. Editors cannot add/change the owner's grants. Member connection summaries and Telegram/Discord destination lists honour those grants.
- The actual Publisher submits one-time Team releases for review without scheduling or spending. Owner/Admin review covers a version, immutable Storage object generation, source owner, media metadata, exact copy, selected destinations/settings and delivery time. Editors can revise; revisions invalidate approval. Viewers can comment within their entire workspace; this is not a project-restricted client portal.
- Approving and scheduling are distinct actions. Dispatch rechecks membership, the approver's current authority, source generation, shared connections, current owner plan/usage and provider destination authority. A transaction creates the ordinary content/schedule records and attributable history once, including under concurrent retries. It records the owner's existing upload usage once; it does not issue, migrate or deduct a new wallet balance. A missed delivery time requires a new reviewed time.
- The existing Queue scheduler, task worker, provider integrations and receipts deliver approved Team records. The worker reconstructs the reviewed payload, refreshes only the pinned generation URL and suppresses automatic hashtag rewriting. Other historical content IDs and ordinary publishing retain their previous paths.
- Native Studio backup sharing reuses the existing project format and validator. Private content-addressed archives, twelve retained version references, 30-minute checkout and optimistic revision checks protect updates. Taking a copy creates a new personal project identity and owned copies of its referenced media, preserving the original. Invalid or nonportable server-job/model references fail explicitly. Existing Studio code, renderer, local project database and personal projects are unchanged.
- Firestore denies direct browser changes to workspace authority, shared Team content, review state and schedules. Ordinary profile preference edits and personal Clip Studio content creation remain allowed; financial/role/subscription writes remain denied. Both deployed-source candidates (`firestore.rules` and the owner-scoped security copy) agree. A composite Queue index is prepared.

## Limits and release gates

This is a local review candidate. Live Cloud Storage signing/copy/IAM behaviour and retention still need qualification in a named nonproduction environment. Archive records do not guarantee the continued availability of original source objects; deleted/expired/replaced originals are reported, never silently substituted. Already issued short-lived preview links cannot be recalled by removing membership.

Shared projects use explicit native-backup exchange and private working copies. They do not provide simultaneous editing, complete cross-device project synchronisation, automatic edit-session heartbeat renewal or a per-project client portal. A checkout expires after thirty minutes; saves after expiry are rejected without deleting the local work. Unsupported generated jobs/assets are retained in the original personal project and cannot be ported by this first implementation.

**Paid Studio/Find Viral Clips execution remains on existing personal billing paths. Delegating an owner's shared rendering balance to another member has not been implemented in this continuation.** This implementation shares reviewed publishing, not all paid compute entitlements. An owner can take an editable copy and export through the existing owner account. Do not market this as a fully pooled Team credit product. Per-member spending delegation and durable payer-bound worker/refund receipts are the next financial integration gate; do not implement them by replacing the authenticated UID or falling back between wallets.

Only once-only Team releases with one delivery time and one immutable movie/image are admitted. Recurring schedules, per-destination times and swapping source media require separate qualification. Existing personal scheduling remains available. Approved Team copy/timing cannot be altered through legacy Queue controls; pause is restricted to Owner/Admin. Resume/reschedule/cancel UX for Team needs a dedicated reviewed transition before broad rollout. Existing schedules are not cancelled or rewritten by this change.

Existing workspace ownership/membership records also need read-only validation because the earlier rule permitted broader workspace-field updates; this local repair is not evidence that historical records are legitimate.

Deploying Team requires coordinated review of frontend, backend, stricter Firestore rules and the new index. Rebuild/verify any serving Functions bundle rather than leaving an older owner-impersonating Team API reachable. Do not publish the frontend alone. Stage multi-user role-removal, source-copy, render-payer/refund and existing subscriber regressions before rollout. Rules rollback must retain repaired profile/financial authority and must not restore direct browser scheduling or workspace-owner mutation.

No test result resolves the separately tracked historical balance/session incident or seven production test documents. No advertisements, new credit system, Cam Combiner changes, subscription prices or balances were introduced. [Source preservation](evidence/preservation.json).

## Validation

**229 distinct automated tests passed**, plus the actual App browser workflows. Repeated runs are not counted twice.

| Check | Result |
| --- | --- |
| Team Firestore emulator suite | 30 passed: roles, generation binding, approval invalidation, removed members, idempotency, concurrent final allowance, native project checkout/version/copy and create-only Storage request contract. |
| Existing security regressions | 99 passed across four suites; repaired authority/financial rules remain protected. |
| Existing server regressions | 15 passed across four suites. |
| Existing community publishing emulator | 42 passed; provider delivery is controlled. |
| Frontend | 43 distinct cases passed; final Publisher/Team rerun passed all 17 cases. Existing React act warnings remain. |
| Actual signed-in App | Owner creates workspace/invites; independently verified Editor joins and submits in Publisher; changed copy clears approval; Owner approves/schedules; ordinary Queue worker delivers the reviewed copy once; personal Queue remains separate. |
| Actual Studio recovery | Normal file controls share a native backup, check out/save version two, take a private working copy and restore it in the ordinary editor. Rename, save and cold reopen passed. Source metadata/archive/Storage copying are controlled fixtures; rendering and predictive picture parity are not qualified by this flow. |
| Production frontend build | Passed into a separate private directory; welcome assets and 47 public entry pages verified by the normal build. The running user's build was not replaced. |
| Static checks | Targeted lint, syntax, `git diff --check` and Studio contract record validation passed. Formal Studio readiness counts remain unchanged. |

[Validation](evidence/validation.json) and [sanitised browser results](evidence/application-browser.json) record the boundaries. Tests use fresh owned loopback demo emulators; external providers/storage are controlled fixtures. They do not represent real platform delivery, live Cloud Storage qualification or a paid render. Initial failures and corrected runs are retained privately under `/tmp`; credentials, login state and signed capabilities are excluded from this report. Final visual inspection also corrected Team delivery wording: submission requests review, rather than promising immediate publication.

Private-copy implementation uses explicit source generation and destination `ifGenerationMatch=0` on the Storage rewrite request, including continuation requests. This follows Google's [rewrite API](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/rewrite) and [precondition semantics](https://docs.cloud.google.com/storage/docs/request-preconditions). Tests inspect the request contract; they do not establish live IAM or billing behaviour.

For local replay, use the existing shared Node dependencies and cached Firestore emulator with Java 21+. No production credential is needed:

```sh
SECURITY_JAVA_BIN=/path/to/java21/bin/java node scripts/test-team-workspace.cjs
SECURITY_JAVA_BIN=/path/to/java21/bin/java TEAM_WORKSPACE_QA=true npm run test:community:browser
```

The browser harness builds the actual frontend into its own private directory and starts fresh loopback Auth/Firestore emulators. Keep its private files out of Git. Shared dependency resolution may require `NODE_PATH` pointing at the existing backend dependency directories; do not reinstall over another worktree's shared dependencies.
