# Security and CI repairs — 22 October2026

The main branch has20 open CodeQL source findings and119 Dependabot alerts at investigation time. Do not dismiss alerts to make checks pass.

## Source boundaries

- Worker GET/media/DELETE use a server-configured origin, validated8–128 character job identity, relative encoded path, disallowed redirects and whitelisted read options. Local HTTP tests prove hostile paths/options and redirect targets receive no request or secret.
- Model validation rejects excessive depth/width/cycles before serialization or AJV, disables all-errors traversal, and explicitly dispatches the five known input/output capabilities. Prototype method names cannot select a validator.
- Studio speech, filmstrip, template, subject and Publisher previews use the shared safe source sink; video posters use the same URL validation and encoded attribute sink.
- Four local preview hosts enforce600requests/minute; dynamic job identity is a structured log field, and Markdown diagnostic cells escape HTML and delimiters.

## Dependencies

Update all four npm manifests/locks and Python media requirements to published patched releases, including axios1.20, Hono4.13.11, proxy-addr2.0.8, busboy3.2.2, DOMPurify3.4.16, selector-parser7.1.6, and Pillow13.0. Pillow13 requires Python3.11+, so the affected Python3.10 CPU images move to3.11. Other model image pins are updated without launching paid workers.

The unpatched upstream node-forge nested DigestAlgorithm verification advisory and braces recursion advisory remain tracked. The later audit also identifies basic-ftp's directory-list parser and older OpenTelemetry propagation in the tooling graph. basic-ftp is now updated to6.2.3. Version-bound installation guards reject extra nested RSA DigestAlgorithm elements, cap brace parser/AST depth and cycles, and bound tooling baggage headers before allocation. Positive and exploit regressions pass; the original versions and scanner findings remain visible. Do not describe an absent upstream release as a completed upgrade. Exact final scan results belong below.

## CI recovery

Port the specific CI repairs into main's current implementation: file-input disambiguation, real transport/frame seeking, Web Audio gain assertions, updated Firebase/readiness mocks, manual-caption clock guards, stable empty monitor identity and Director frame enablement. Keep main's existing functional motion-key updates. Restore progress reporting and preserve failed emulator results instead of rerunning the entire suite. No tests are skipped or expected assertions weakened.

## Evidence

-45 model/transport Node tests passed, including hostile identities and redirect targets.
-24 source-security Jest tests passed.
-5 real CPU speech-preview tests passed with Pillow13.
-7 emulator runner tests passed.
-16 Python handler/render/finish checks passed with Pillow13 and requests2.34.2. An initial command referenced a nonexistent speech test module; the corrected retained run passes all16 existing checks.
-The optimized frontend build passed with the updated dependency installation. Full Studio unit/browser runs and GitHub security reanalysis are still running.
-The prior media worker repair is deployed: [run39717028880](https://github.com/Tibule12/AutoPromote/actions/runs/39717028880), revision`media-worker-v1-00115-cus`, real candidate render and production health passed,100%traffic.

Studio readiness remains17FUNCTIONAL,9PARTIAL,1BROKEN,2UNIMPLEMENTED,0PRO-READY and0PRODUCTION-READY. S02 continuous live picture/sound, S03 ownership and S04 depth retain their existing qualification gaps. No native/creative/showroom qualification or paid model/GPU execution is claimed.

## Branch verification update

[PR493](https://github.com/Tibule12/AutoPromote/pull/493): CodeQL and Semgrep pass. The CodeQL alert API reports zero open findings on `refs/pull/493/merge`, covering the20 reported source findings. Main is rechecked after merge. All known patched lock versions are verified against the119 initial alert ranges;5 upstream-version findings (node-forge in3manifests, braces in2) remain visible with the installation guards above.

The real voice-over, native motion/transport/persistence, all-caption-style, focused Motion, logo layer and3D-logo browser workflows pass locally. The logo check found and now verifies a real fix: animated inspector property edits update the key at the playhead and display its evaluated value, preserving the base transform. The actual exported0.4s key contains the enteredX58 and rotation6.

Three dependency exploit/positive checks and four HTTP worker regressions pass. The source-only/frontend unit and remaining browser CI failures are being resolved separately from security reanalysis. No alert is dismissed and no production/creative readiness classification changes.

## Installation and regression closure

A fresh standard `npm ci` (1350packages,28s) runs the guard hook successfully. Its copied normal security command passes all7positive/exploit/HTTP tests. The canonical guard ships inside the Functions package so its production install does not need the parent repository. Root/frontend/mobile use that same implementation. Scanner versions remain unchanged for node-forge/braces; no forged patched version or alert dismissal is used.

All10previous local Studio unit failures pass across targeted reruns. Correct the fixtures to acknowledge native decoder readiness/play/pause, address the actual compact timeline and saved-project disclosure, and model the declared speech interval2–6s with real silence on either side. No speech coverage gate is removed. The multi-action podcast integration keeps its assertions and a bounded60s timeout. Use the actual Studio transport for Motion Sculpture; direct `video.play()` incorrectly bypassed the preview intent controller.

## Full branch qualification

- [Emulator run39722011081](https://github.com/Tibule12/AutoPromote/actions/runs/39722011081):1484passed,5existing skips,258passed suites/4skipped suites,663.235s. The runner exits0after recording all1489cases; it does not repeat the suite.
- [Playwright run39722011102](https://github.com/Tibule12/AutoPromote/actions/runs/39722011102):30passed/17existing skips. All12local media-dependent Studio checks also pass across the retained targeted runs.
- Both full workflows verify production source`1fbda085`. The only change in`d5caaf65` strengthens the RSA regression key from1024to2048bits; its seven security tests and [CodeQL run39722583379](https://github.com/Tibule12/AutoPromote/actions/runs/39722583379) pass, with zero open PR-ref findings. The temporary test-key finding1188 is fixed, not dismissed.
- Backend tests, main CI/integration tests, optimized frontend verification, both emulator smoke workflows, Semgrep, Studio authority validation and secret checks pass. The following evidence-only commit changes these records and no production or test implementation.

Main deployment continues through the existing immutable worker image, real render/health checks and production traffic gate. The prior verified duration fix remains recorded above. Native Studio/creative/readiness qualification is unchanged; next shared work remains S02, S03 and S04.
