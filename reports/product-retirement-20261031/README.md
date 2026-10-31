# Product retirement — 31 October 2026

Implemented locally on `feat/product-retirement-20261031`, based on Motion & Flow checkpoint `3911af6c59989b92cd97036715841fe22f290456` (which includes current main). Other development worktrees and their uncommitted work are preserved. **No push, merge, deployment, production data operation or paid cloud execution.**

## Removed

- Standalone Analytics, Smart Promo and Idea-to-Video panels, dashboard/Overview/mobile entries, contextual legacy-editor launches, components, imports, styles and exclusive tests.
- Marketing feature selectors, Analytics showcase and the obsolete four-part product-tour entry. Its historical media/provenance files are retained; the old film is no longer advertised as the current product.
- Analytics pricing descriptions/capabilities and retired generation-cost entries; old subscription payloads cannot restore these offers or permissions. Support categories, login/onboarding, tester invitations and administrator tester copy now describe active products.
- Retired capabilities from the active help catalogue, assistance topic routing, inventory and generated public Markdown/search/graph data. Existing Studio readiness remains unchanged.
- Idea-to-Video's Node generation controller and exclusive Python generation/TTS helpers. Smart Promo creation/estimate/dispatch and its standalone monitor are removed. Old requests return **410 `FEATURE_RETIRED` before database access, charging or dispatch**. The shared clip worker rejects retired workflow IDs, Promo job IDs and standalone campaign/visual-edit requests.
- Three unused Analytics dashboard/export stubs and an unmounted legacy Analytics controller. Functions packaging now rebuilds its generated source tree so a deleted route cannot survive an older package. This operates on generated source, not user records; the packaging regression uses a temporary fixture.

Nine old path aliases, including `/metrics`, `/analytics`, `/smart-promo` and `/idea-to-video`, redirect to Queue or Studio. Static entry HTML works on hosts without an SPA rewrite. Hash links and old tab intents select active workspaces, retaining the destination through normal sign-in. Root team invitations and provider callbacks retain their existing handling.

## Preserved

Studio, Motion & Flow, AI Director, Find Viral Clips, Publisher, Queue, Calendar, Cam Combiner, shared AI/media/render services, saved-project/media schemas, historical generated-source classifications, owned historical job results, purchase/credit records and publishing receipts remain supported. Legacy result finalisation/refund compatibility stays available for already-started work; no retired job is automatically rerun.

Operational platform statistics, workflow events, clip cache/learning, delivery diagnostics, administration, monitoring and billing records remain. Rewards progress has an owned read-only endpoint separate from the retired customer dashboard. Recovery Lab's existing server access restriction is retained independently of the removed Analytics entitlement; it is not newly advertised.

Plan IDs and historical `basic` alias, prices **$0 / $14.99 / $34.99 / $99.99**, monthly credits **15 / 150 / 500 / 2,000**, top-up packs and active-product limits remain unchanged. No user balance or subscription is rewritten. The public AdSense ownership tag remains; no advertising is activated.

[Source preservation](preservation.json) verifies repaired Rules/authority and protected application sources. [Worker preservation](worker-preservation.json) verifies **513 unchanged functions/classes**, including the canonical renderers, analysis and Cam Combiner; only shared automatic-clip admission changes. Dedicated retired generation functions are removed.

## Verification

| Check | Result |
| --- | --- |
| Production-mode application build and normal postbuild | Passed; 47 static entry pages; all 19 canonical welcome assets verified. |
| Frontend regressions | 118 tests passed across 19 suites, including authentication, marketing, plan compatibility, Studio projects, Motion & Flow, Director review, clip discovery, Cam Combiner and Publisher/schedules. |
| Backend regressions | 88 distinct tests passed: retirement boundaries, historical results, subscriber/payment/media compatibility, owned metrics, scheduling and Functions packaging. |
| Documentation, assistance, source classification and schedule ownership | 55 tests passed; generated documentation matches the reviewed catalogue. |
| Shared-wallet application integration | 12 tests passed against a fresh loopback Firestore emulator. |
| Existing HTTP/path/limiting checks | Five passed; no Google advertisement requested. |
| Real worker admission and local resource bounds | Four Python tests passed without importing cloud/model runtimes. |
| Actual dashboard/public browser | 23 checks passed on the final release build: normal sign-in, desktop/mobile navigation, all nine aliases, onboarding, features, pricing and help; zero browser exceptions. |
| Studio | Native upload → saved project → reopen → CPU export/download; native headline edit → second CPU export. Both three-second H.264/AAC movies and their complete Studio recordings are retained privately. Edited export fully decodes at 1080×1920. |
| Recovery/Motion & Flow | Native backup download, cold reopen and Motion & Flow opening passed. Independent, normally signed-in browser restore and subsequent native Save passed. |
| Publisher/Queue | Actual Content → Destinations → Customize → Delivery → Review, followed by an owned paused Queue destination → Resume, verified through the existing local delivery adapter and wallet settlement. External Facebook delivery is explicitly simulated. |
| Find Viral Clips | Passed: native Analyse → quote/consent → real CPU Whisper/scene analysis → one visible 0–3 second suggested window → settlement, 13 available / zero held. The final source has locally generated English speech. |
| Static and security checks | Targeted backend lint, JavaScript/Python syntax, Studio contract validation and `git diff --check` pass. |

**282 automated tests pass**, excluding browser checks and repeated reruns. Payment/provider boundaries in unit tests are mocked; no live payment, provider publication, GPU execution, whole Studio parity or creative readiness is claimed. The production-mode build retains one inherited `studioSequenceEdits.js` `no-loop-func` warning; existing React `act` warnings remain in unit tests. No tests are skipped or assertions weakened.

[Validation summary](validation.json) · [final browser checks](browser-release.json) · [clip analysis](clip-analysis.json) · [independent project restore](project-recovery.json) · [desktop](dashboard-desktop.png) · [mobile](dashboard-mobile.png).

Initial local analysis attempts were confirmed terminated with SIGKILL; inspection found separate 120-second wall and CPU ceilings in the local harness. Signed terminal evidence justified one refund per failure. The local adapter now permits an explicitly bounded **240-second wall/CPU** analysis demonstration, with a maximum accepted configuration of 300 seconds. Render limits remain 120 seconds. Production worker limits, credit prices and financial policy are unchanged. Local timings are not cloud pricing evidence. Three failed tone-only-source attempts and the final spoken-source rerun are retained. The successful run used 77.46 wall seconds / 76.43 CPU-seconds; this is a local test, not a cloud price or representative creative/speech qualification. UI notification/health endpoints outside this isolated harness remain unavailable; they are not production regressions.

An initial optional backup check targeted a button inside a closed native menu, and a concurrent harness state-file overwrite obscured the saved project in another attempt. Corrected checks open the real menu and preserve the recorded project state; no product project/backup code was changed. Initial logs, recordings and failures remain private.

## Review and release boundary

The retirement is prepared for review; production still uses its deployed product scope. Before an approved release, inventory/drain already-running retired jobs, retain their records/artifacts and existing financial reconciliation, then publish the API/worker retirement responses and frontend together. Do not delete historical media or change balances as part of that release. Existing Cloud Run/Render/Firebase infrastructure and security permissions were not changed by this task.

This branch includes its committed Motion & Flow parent. Review the retirement diff against `3911af6c`; integration into main must account for that parent and other ongoing work. Existing Studio S02/S04/S03 and security-incident follow-up remain separate; no professional/production-readiness promotion is made.

Reproduce using existing dependencies and a fresh `demo-autopromote-credits` Auth/Firestore/Storage application demo. `scripts/product-retirement/browser-check.cjs PRIVATE_DIRECTORY` tests retirement/navigation; the existing `scripts/monetization/application-browser.cjs` phases `studio-save`, `studio`, `studio-edit`, `scan`, `publisher`, `queue` test ordinary controls. `scripts/product-retirement/restore-project.cjs PRIVATE_DIRECTORY` imports the native downloaded backup in an independent, normally signed-in browser. All browser QA is headless, muted and limited to loopback traffic. No cloud-seeding workflow is run.
