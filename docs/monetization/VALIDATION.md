> Historical foundation snapshot — 26 October 2026. Current security, account status, implementation and test evidence are in the [27 October continuation report](../../MONETIZATION_CONTINUATION_20261027.md). This file does not describe the current deployed security state or an approved commercial credit policy.

# Validation evidence

Validated locally on 26 October 2026, on branch
`feat/unified-credits-foundation-20261026`.

| Check                                                       | Result                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| Fresh real Firestore emulator suite                         | 36 tests passed; 0 failed, skipped or cancelled                           |
| Concurrent overspend, duplicate dispatch/settlement/rewards | Passed with real transaction conflicts and retries                        |
| Financial limits and failure/refund abuse                   | Passed                                                                    |
| Firebase client security rules                              | Passed; expected `PERMISSION_DENIED` output proves client-write rejection |
| Chromium desktop/mobile flow                                | Passed at 1280px and 390px widths, no horizontal overflow                 |
| Browser network isolation                                   | No external requests observed                                             |
| Zero-credit editing/save                                    | Notes saved and survived reload; processing remained disabled             |
| Paid subscriber preview                                     | Larger balance and ad-free state passed                                   |
| Targeted ESLint `no-undef` / `no-unused-vars`               | Passed for new backend, scripts, tests and browser JavaScript             |
| JavaScript syntax                                           | All 12 new `.js` / `.cjs` files passed `node --check`                     |
| Formatting / whitespace                                     | Prettier and `git diff --check` passed                                    |
| Existing repository sanity tests                            | `npm run test:unit` passed                                                |

Command used for the complete suite and browser checks:

```sh
CREDITS_JAVA_BIN=/tmp/autopromote-credits-java21/jdk-21.0.13+9-jre/bin/java \
npm run test:credits:browser
```

The installed system Java was version 17. A temporary Temurin Java 21 runtime was
downloaded to `/tmp` to run the cached Firestore emulator; system Java was unchanged.
The emulator used the demo project and a fresh ephemeral loopback port, then shut
down and removed its temporary data. Production Firebase Admin was never imported.

Desktop and mobile screenshots were inspected at
`/tmp/autopromote-credits-desktop.png` and `/tmp/autopromote-credits-mobile.png`.
They are temporary local evidence, not committed product assets.

`npm run credits:economics` also passed. With the explicitly hypothetical example's
zero revenue and zero verified completions it returned zero revenue-funded reward
credits, $35 maximum processing exposure and $20 unfunded exposure for 1000 users
against a $15 subsidy. These are scenario calculations, not revenue forecasts.

Limits of this validation: no live Google ads or real provider callbacks, production
auth/payment/worker integrations, migration, live-origin CSP/CMP compatibility,
actual billing invoices, load/throughput qualification or production deployment was
tested. The isolated demo's passing rules do not validate the existing production
ruleset, which still needs a separate repair and deployment review.
