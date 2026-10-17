# Security alert remediation — 17 October 2026

This isolated fix branch is based on `origin/main` commit `858d538b51879c718d49f9b4a233a75daaf29348`. It preserves the separate uncommitted creative-template workspace, saved login, source movies and project state. No GPU jobs, production deployment or main merge are authorized or performed.

## CodeQL scope

All 20 requested alerts (#1164–#1183) were confirmed open on main through the GitHub API. The source corrections are implemented; current PR CodeQL and CI evidence is recorded in [PR #488](https://github.com/Tibule12/AutoPromote/pull/488). Main alerts cannot be reported closed before a reviewed merge and main analysis.

| Alerts | Correction |
|---|---|
| #1167, #1168 | Worker reads/cancellation accept validated job IDs instead of arbitrary URLs. Axios uses a server-configured base URL, encoded relative job paths, fixed authentication, no proxy and no redirects. Callers cannot override the destination or transport policy. GET connection recovery still retries once; cancellation never retries. |
| #1182, #1183 | First-error AJV validation, bounded iterative JSON preflight before serialization/schema traversal, and explicit calls to statically named capability validators prevent prototype-name dispatch and excessive nesting. Getters, custom serializers, non-JSON objects and nonfinite numbers are rejected. |
| #1174–#1181 | All four local acceptance/preview hosts register express-rate-limit before file access, proxying or authorization. The two local app listeners are independently bounded. |
| #1165, #1166, #1169, #1170 | Media source/poster values pass through the shared protocol validator and attribute URL encoder. Existing signed URL encoding is preserved. |
| #1171, #1172 | Decoder loading/cleanup invokes the native HTMLMediaElement prototype method explicitly, preserving media behavior without a dynamic HTML-loading method call. |
| #1173 | Markdown report escaping handles existing backslashes before pipe escaping, and normalizes both CR/LF. |
| #1164 | Refund reconciliation logging uses a literal format string and separate job/error values. |

## Dependency scope

The attached list contains 25 still-open dependency alerts across root, frontend, TodoApp and Functions lockfiles. All installed occurrences of the following requested packages are pinned at or above their advisory's published fixed version, using normal lockfile resolution:

| Package | Selected version |
|---|---|
| axios | 1.20.0 |
| compression | 1.8.2 |
| proxy-addr | 2.0.8 |
| @fastify/busboy | 3.2.3 |
| shell-quote | 1.12.0 |
| source-map-js | 1.2.2 |

These upgrades cover 20 of the 25 listed dependency alerts. Five alerts have **no published fixed npm version**: node-forge #713/#720/#751 ([GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)) and braces #714/#729 ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)). Their vulnerable version numbers remain visible; no advisory is dismissed or disguised with an invented release.

A shared hash-checked installer at `autopromote-functions/security/apply-dependency-patches.cjs` mitigates those five alerts in all four package install paths, including standalone Functions installs:

- node-forge 1.4.0 receives the exact nested DigestAlgorithm element-count check from [upstream PR1152](https://github.com/digitalbazaar/forge/pull/1152), head `ceba34402e329f0365134f23fe19898756527d65`.
- braces 3.0.3 bounds real parser nesting at 100, including parentheses, and guards direct recursive AST walker entry points against excessive depth/nodes and cycles. This follows the [upstream issue70 mitigation](https://github.com/micromatch/braces/issues/70).
- Every modified dependency file must match its expected original or patched SHA256; unknown contents fail installation. Atomic replacement avoids modifying shared hardlinked files. Repeated installation is idempotent. Installs that explicitly skip lifecycle scripts must run this installer separately; CI does so.

Replace these temporary mitigations with published fixed releases when available, regenerate all affected locks and rerun the regressions. Those five GitHub version alerts may remain open despite the tested mitigations.

The Functions package is also added to Dependabot's configured update directories. The reported inactivity pause still requires a Dependabot PR merge to resume; no merge or disabling of alerts is performed here.

## Validation

- 34 backend cases: worker transport/SSRF, hostile contract inputs and the existing model lifecycle.
- 18 owned subject-render service cases.
- 35 UI cases: media URLs, native decoder lifetime, voiceover, subject controls and release workflow.
- 2 additional security cases: actual local-host HTTP rate enforcement and real malformed RSA/brace regressions. The dependency regression passes with both unpatched and already-mitigated installations.
- All four package manifests/lock dependency maps agree; every requested package occurrence meets its patched minimum where a release exists.
- The shared Director replay bundle matches its source. Studio contract validation passes with unchanged readiness counts (2UNIMPLEMENTED/1BROKEN/9PARTIAL/17FUNCTIONAL/0PRO/0PRODUCTION). No new visual or product-readiness qualification is claimed.

Local preview and worker tests use ephemeral loopback servers; no actual model/GPU/provider operation or user-project mutation is executed. The [PR security CI](https://github.com/Tibule12/AutoPromote/actions/runs/39052973155) passes all 89 focused checks, shared replay and Studio validation on commit `a2e93477`. Frontend build, backend CI, Semgrep and emulator smoke checks also pass. The first CodeQL scan identified a related dynamic-call flow through the Map lookup; a follow-up replaces all such dispatch with an explicit switch over the five statically named validators. The 36 Node backend/adversarial cases pass again after that correction. Latest CodeQL findings and remote commit verification are recorded in the PR, so the evidence follows the final pushed revision.
