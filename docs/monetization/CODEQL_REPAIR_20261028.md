# Unified-credit demo CodeQL repair

28 October 2026 · Local repair of alerts **#1193–#1203**. Nothing was pushed,
merged, deployed or dismissed on GitHub during this repair.

**All eleven findings reproduce before the patch and are absent afterward in
the affected files using local CodeQL. All 88 isolated credit tests pass.**
GitHub must scan an approved published revision before its alert status can change.

| Alerts | Prepared change |
| --- | --- |
| #1193–#1195: worker path expressions | Resolve execution directories beneath a canonical scratch root; retain exact 64-character hexadecimal IDs; reject directory symlinks and receipt/artifact real paths outside their execution directory. Download capabilities must match the entire expected format, be unexpired and pass a constant-time MAC comparison. Missing artifacts return 404. |
| #1196–#1197: Google sample file serving | Apply a 120-request/minute IP limit before sample HTML and assets. No wallet or ad activation is added. |
| #1198–#1199: actual application demo | Apply a 1,200-request/minute IP limit before Auth, signed object reads, static files and the SPA fallback. Existing tighter credit admission limits remain. |
| #1200–#1201: local worker | Apply a 240-request/minute IP limit before every handler, plus a 20-request/minute authenticated worker POST limit. Excess requests return 429 before filesystem/process work. |
| #1202–#1203: test harness | Apply separate 1,000-request/minute limits to both Express fixture servers before their handlers. |

These are per-process memory limits for explicitly local servers, which bind to
loopback and do not trust forwarded IP headers. They are not a proposed distributed
production limiter. The production server does not mount these script entry points.
The original worker already validated hexadecimal IDs; the scanner output alone
does not demonstrate a production traversal exploit. The repair adds explicit
normalised-path and symlink bounds rather than suppressing the findings.

## Verification

- Read-only GitHub inspection confirmed all eleven alerts open in analysis
  `2042162402` at `71f9cabb050776f5ddc9fe15c157a3523ae7ce25`. The four alerted files
  are byte-identical to local checkpoint `1e9855af` before this repair.
- **CodeQL 2.27.3**, `codeql/javascript-queries@2.4.8`, matching the reported tool
  versions: both `js/path-injection` and `js/missing-rate-limiting` ran against
  the four files and their 183-file relative-import closure. Before: **three path
  and eight rate-limit findings** in the four files. After: **zero**. This is a
  focused two-query analysis, not a clean full-repository security certification.
- **88 tests passed**, 12 suites, no failures/skips/cancellations, in a fresh owned
  Firestore emulator. Five new HTTP regressions cover actual 429 responses, worker
  dispatch throttling before execution, legitimate receipt/artifact access,
  traversal, trailing input, directory/file symlinks, malformed/expired/forged
  capabilities and Google sample throttling. Test files/receipts are explicitly
  fixtures and cannot prove provider execution.
- A separately launched actual application host with fresh Auth/Firestore/Storage
  emulators returned 429 and `Retry-After` for excess page, SPA and object requests.
  The retained frontend build was reused without modification; no browser ad,
  worker process or paid workload was started by this check. The owned host and
  emulators were stopped afterward.
- Changed-file ESLint, JavaScript syntax and whitespace checks passed. Firestore
  and Storage Rules, Auth authority, payment/subscription files, workflow YAML,
  wallet accounting, canonical renderer and frontend source are unchanged.

[Machine-readable evidence](evidence/20261028/codeql-repair-validation.json)
records source hashes, alert locations, analysis results and log/SARIF hashes.
Raw local analysis is retained at `/tmp/autopromote-codeql-20261028/`.

Reproduce the HTTP regressions without ads, worker execution or cloud access:

```sh
node --test test/unified-credits/http-boundaries.test.cjs
```

Run the complete suite with the existing Java 21/dependency setup:

```sh
CREDITS_JAVA_BIN=/path/to/java21/bin/java npm run test:credits
```

Publication/merge/deployment still require approval. No pricing, free-plan policy,
subscriber balance, migration or live reward decision is made here. Cloud pilot,
Google verification and historical security incident blockers in the
[application report](../../APPLICATION_WORKFLOWS_20261027.md) remain open.
