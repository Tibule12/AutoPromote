# Dependabot repair — 28 October 2026

Owner-authorised dependency repairs and publication to `main`, based on `1e9855af`.
GitHub reported **53 open alerts** across the backend, frontend, Functions and TodoApp
lockfiles. **49 now resolve outside their advisory ranges.** The four remaining
`deepmerge` alerts have a tested installation-time backport; their published version
and scanner visibility are retained. No alert was dismissed or suppressed.

## Dependency changes

| Dependency           | Resolved fixed versions / scope                                                     |
| -------------------- | ----------------------------------------------------------------------------------- |
| undici               | 7.30.1; 6.29.1 for consumers requiring version 6                                    |
| body-parser          | 2.4.0 with Express 5; 1.20.9 with Express 4                                         |
| qs                   | 6.16.2                                                                              |
| multer               | 2.5.0                                                                               |
| nodemailer           | 10.2.1                                                                              |
| fast-uri             | 3.1.9                                                                               |
| serialize-javascript | 7.1.4                                                                               |
| node-forge           | 1.4.2; the malformed RSA signature regression passes without the old 1.4.0 backport |
| ip-address           | 10.7.4; additional npm-audit finding                                                |
| zod                  | 4.6.6; additional npm-audit finding                                                 |

Compatible release lines and existing peer-dependency policy are preserved. All five
application manifests/lockfiles, including the nested TodoApp file dependency, were
regenerated with npm. No forced audit downgrade or blanket major upgrade was used.

## Unreleased upstream fix

[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
currently has no published patched `deepmerge` release. The shared postinstall guard
filters `__proto__` from both source and target keys, including recursive merges,
null-prototype targets and poisoned target objects. It patches the CJS and UMD
runtime distributions and the source entry. Exact source matching fails installation
if an expected patch no longer applies. Normal arrays, nested values and symbol
keys are preserved. The patch is idempotent.

Actual installed CJS/UMD copies in all four dependency graphs passed the exploit and
repeated-install checks. Root, frontend, Functions and TodoApp lifecycle hooks apply
the same guard. The four upstream alerts may remain open until a fixed release is
published; they are not represented as version upgrades or manually closed.

The pre-existing OpenTelemetry 1.30.1 bounded-baggage guard remains tested and visible
in npm audit. Upgrading that SDK to version 2 would change its API contract and is
not required by the 53 open alerts. Final backend npm audit contains no high or
critical findings; remaining low/moderate results are the guarded deepmerge and
OpenTelemetry advisories and their dependency-chain entries. Frontend, Functions
and TodoApp audits contain the guarded deepmerge advisory and its chain entries.

## Verification

- 92 isolated profile/Auth/Firestore/packaging security tests passed.
- 83 real Firestore credit tests passed.
- 52 server/payment/publishing/Studio regressions passed across ten suites.
- Eight dependency/worker-read security tests passed, including the new prototype
  poisoning regression and existing RSA, recursive-glob and baggage cases.
- Production frontend build passed, including all 19 versioned welcome assets.
- Fresh backend/frontend/Functions/TodoApp dependency installations completed;
  frontend ran its lifecycle hooks normally. Other graphs also ran their explicit
  project postinstall hooks after installing with dependency scripts disabled.
- Functions packaging/postinstall completed; the offline Expo CLI starts.
- Studio contract validation passed with readiness counts unchanged.

One existing Functions-copy test still assumed that unified-credit source files
could not exist, an assumption invalidated by the preceding application integration.
It now verifies byte-identical packaging of the required helpers and confirms their
production/hosted runtime rejection. No packaging runtime or credit gate was relaxed.

The initial failed Java selection and stale packaging assertion were corrected before
the passing security run. Detailed logs are local under `/tmp/autopromote-dependabot-*`.
The advisory-range verification is retained in
[DEPENDABOT_LOCK_VERIFICATION_20261028.json](DEPENDABOT_LOCK_VERIFICATION_20261028.json).
