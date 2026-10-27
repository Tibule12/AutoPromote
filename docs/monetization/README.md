# Rewarded ads and unified credits

Current branch: `feat/rewarded-credits-continuation-20261027`, based on the deployed
security and ownership-verification release `593bbcdf`. Read the
[27 October continuation report](../../MONETIZATION_CONTINUATION_20261027.md),
[current Google setup](GOOGLE_SETUP_20261027.md) and
[cost measurement procedure](COST_MEASUREMENT_20261027.md).

This continues the original 26 October foundation. All new behaviour is isolated
from production and requires a local demo Firestore emulator. Existing subscriptions,
balances, payment handlers, worker dispatchers and Cam Combiner remain unchanged.

Historical foundation references (26 October): [audit](RESEARCH_AND_AUDIT.md),
[credit model](CREDIT_MODEL_AND_ROLLOUT.md), [Google research](GOOGLE_SETUP.md),
[economics](ECONOMICS.md), [36-test baseline](VALIDATION.md).
Current production security and the expanded 59-test evidence supersede their old
status statements. The original checkout and its complete delivery report remain
preserved separately.

## Run the local preview

Use Node 20+ and Java 21+ with the existing installed dependencies. If necessary,
download the official emulator with `npx firebase setup:emulators:firestore`.
No Google advertising credentials or production Firebase credentials are needed.

Terminal 1, from the repository root:

```sh
npx firebase emulators:start --only firestore \
  --project demo-autopromote-credits \
  --config test/unified-credits/firebase.json
```

Terminal 2:

```sh
UNIFIED_CREDITS_SANDBOX=true \
UNIFIED_CREDITS_PROJECT_ID=demo-autopromote-credits \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8188 \
npm run credits:sandbox
```

Open `http://127.0.0.1:8190`. Choose Starter or the simulated Creator subscriber.
Watch/skip/complete a mock ad, review a cost, consume credits, test failure/refund,
and save notes even at zero credits. Only the demo project is written. The preview
does not access real projects, authenticate production users, process media or take
payments. Stop both local processes when finished.

To supply a different reviewed test policy, set `UNIFIED_CREDITS_CONFIG` to a JSON
file based on `config/unified-credits.sandbox.example.json`. Server restarts preserve
existing wallets and kill switches; they do not overwrite balances or tiers.

## Verify

```sh
npm run test:credits
npm run test:credits:browser
npm run credits:economics
npm run credits:readiness
python3 -m unittest discover -s test/unified-credits -p cost_observer_test.py -v
```

The test runner owns a fresh ephemeral emulator and cleans it up. It does not use
the configured production project or delete an existing emulator's data. It expects
the cached v1.22.0 emulator by default; `CREDITS_FIRESTORE_JAR` selects another local
jar. `CREDITS_JAVA_BIN` can select a Java 21+ executable without changing system Java.
Browser checks require an installed Playwright Chromium (`npx playwright install chromium`).

Security/financial tests cover real concurrent Firestore transactions, duplicate
reservation/dispatch/settlement, overspending, nonpositive and unsafe inputs, stale
quotes, cross-user events, forged/tampered rewards, monthly caps, expiry, renewals,
cross-cycle jobs, refund abuse, global/per-user budgets, issuance farming, wallet
headroom, kill switches, demo HTTP auth/origin boundaries and client-write denial.
Browser checks cover opt-in, skip, reward, consumption/refund, zero-credit saving,
paid ad-free state, mobile layout and absence of external network requests.

The additional tests cover transactional outbox intents, execution binding/crash
reconciliation, metadata-derived source-bound quotes, Queue handoff, all operations
in one day, no-fill and cost-evidence validation. Current result: 59 passed.

## Separate Google sample

```sh
GOOGLE_REWARDED_TEST_ONLY=true npm run credits:google-test
```

Open `http://127.0.0.1:8191`. This opt-in origin uses only Google's official sample
unit and has no Firebase, wallet or API connection. Browser grants never earn credits.
`npm run test:credits:google -- --display` exercises it headlessly with muted audio;
this separate test contacts Google. The normal wallet preview blocks external requests.

## Status and approvals

Implemented: emulator wallet/ledger, pricing, renewal, reservations/settlement,
mock verification, caps, spending controls, source-bound admission, durable intents,
fixture execution reconciliation, local UX, Google sample lifecycle and tests.
The repaired production Rules and backend authority policy were verified separately
and are unchanged. Historical balance/session risks remain open.

Owner-reported Google status: ownership verified, site awaiting approval. Eligible
account demand, a signed GPT web completion protocol, complete per-operation invoice
costs and live-origin consent/header compatibility remain unresolved. Legacy financial
reconciliation, real worker/payment/subscription bindings and automatic dispatch/recovery
remain engineering gates. Local tests do not qualify production integration.

No production credits were awarded; no live ads, subscriptions, prices, cloud settings
or billing behaviour were changed. No production deployment, merge or push was done.
Real ads, production migration/grants, live price changes, deployment and merging
require your explicit approval after review of a concrete rollout proposal.
