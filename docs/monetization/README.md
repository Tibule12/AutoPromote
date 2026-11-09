# Ad-supported unified credits foundation

For every deliverable in one file, including the full implementation and test source,
read [the complete delivery report](../../AUTOPROMOTE_MONETIZATION_DELIVERABLES.md).

Branch: `feat/unified-credits-foundation-20261026`. All new behaviour is isolated
from production and requires a local demo Firestore emulator. Existing subscriptions,
balances, payment handlers, worker dispatchers and Cam Combiner remain unchanged.

- [Google research and architecture audit](RESEARCH_AND_AUDIT.md)
- [Credit model, implementation contract and migration gates](CREDIT_MODEL_AND_ROLLOUT.md)
- [Google actions you must perform](GOOGLE_SETUP.md)
- [Cost evidence, calculator and financial recommendations](ECONOMICS.md)
- [Test results and validation limits](VALIDATION.md)

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

## Status and approvals

Implemented: emulator-only wallet/ledger, pricing, renewal, reservations/settlement,
source reporting, mock verification, caps, spending controls, local UX and tests.
Unverified: Google account/site approval, live demand/revenue, a signed web completion
protocol, real per-operation runtime/invoice cost and browser headers on the live origin.
Remaining before rollout: production rules repair, legacy reconciliation/cutover,
trusted worker/payment/subscription adapters, durable dispatch recovery and live-provider
verification. Those are explicit migration gates, not completed integrations.

No production credits were awarded; no live ads, subscriptions, prices, cloud settings
or billing behaviour were changed. No production deployment, merge or push was done.
Real ads, production migration/grants, live price changes, deployment and merging
require your explicit approval after review of a concrete rollout proposal.
