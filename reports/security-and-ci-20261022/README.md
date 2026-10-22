# Security and CI repairs — 22 October2026

The main branch has20 open CodeQL source findings and119 Dependabot alerts at investigation time. Do not dismiss alerts to make checks pass.

## Source boundaries

- Worker GET/media/DELETE use a server-configured origin, validated8–128 character job identity, relative encoded path, disallowed redirects and whitelisted read options. Local HTTP tests prove hostile paths/options and redirect targets receive no request or secret.
- Model validation rejects excessive depth/width/cycles before serialization or AJV, disables all-errors traversal, and explicitly dispatches the five known input/output capabilities. Prototype method names cannot select a validator.
- Studio speech, filmstrip, template, subject and Publisher previews use the shared safe source sink; video posters use the same URL validation and encoded attribute sink.
- Four local preview hosts enforce600requests/minute; dynamic job identity is a structured log field, and Markdown diagnostic cells escape HTML and delimiters.

## Dependencies

Update all four npm manifests/locks and Python media requirements to published patched releases, including axios1.20, Hono4.13.11, proxy-addr2.0.8, busboy3.2.2, DOMPurify3.4.16, selector-parser7.1.6, and Pillow13.0. Pillow13 requires Python3.11+, so the affected Python3.10 CPU images move to3.11. Other model image pins are updated without launching paid workers.

The unpatched upstream node-forge nested DigestAlgorithm verification advisory and braces recursion advisory remain tracked. npm audit also identifies basic-ftp's unpatched directory-list parser and older OpenTelemetry propagation in the tooling graph. Do not describe an absent upstream release as a completed upgrade. Exact final scan results belong below.

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
