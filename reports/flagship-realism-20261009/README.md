# Private AutoPromote sailing realism checkpoint — 9 October 2026

**A private sailing scene is rendered and playable. The requested flagship film is unfinished.** Both picture sources are generated. No welcome-page insertion, public release or product-readiness promotion occurred.

[Play the private review with sound](http://127.0.0.1:3096/review.html) · [Download the scene](outputs/038e7daeafb0f79f83d602ee/private-real-world-scene/v30/final.mp4) · [Native yacht source](assets/yacht/video.mp4) · [Native sailor source](assets/helm/video.mp4)

The review server binds only to `127.0.0.1:3096` and remains running for founder inspection. It serves the review page and media, with JSON receipts, authentication material and directory listings excluded. Its [process record](review-server.json) and [actual playback receipt](playback/receipt.json) identify this transport. Restart it with `python3 scripts/content-factory/serve-review.py --root reports/flagship-realism-20261009 --port 3096` only after checking that the port is free.

## What is complete

| Result | Evidence and limits |
| --- | --- |
| One new native 1280×720 sailing take | [Receipt](assets/yacht/receipt.json), [all 49 frames](yacht-review/all-frames.jpg), [verdict](yacht-review/creative-verdict.json). Wan2.2 I2V A14B on the existing NVIDIA L40S; 49 frames at 16fps, 30 steps. Original 1344×768 photographic yacht reference retained. Hull, sail and crew persist; rolling water and bow spray develop. Camera creeps forward and clips the stern near the tail. **Only source 0–2.25s accepted for private use.** Wide framing cannot certify facial identity, fingers or every rigging contact. |
| Private 3.75s scene comparison with sea sound | Wide source 0–1.5s → sailor 0–1.5s → wide 1.5–2.25s. Excludes the clipped stern and later orange canopy. Existing Factory → Director → canonical document/intelligence adapter → `RenderViralRequest/render_viral_clip_impl`; [edit](transformation-edit-v30.json), [render receipt](outputs/038e7daeafb0f79f83d602ee/private-real-world-scene/v30/render-receipt.json). Final encode is NVIDIA NVENC. Existing worker CPU preparation remains; this is not an all-GPU processing claim. Delivery is 1080p/24fps resampling of native720/16fps assets. No native1080 or generated24fps claim. |
| Sound provenance and technical review | [Recorded sources/CC0 provenance](audio/sources/provenance.json), [safe sea bed](audio/sea-bed-safe.receipt.json), [technical measurements](audio/sea-bed-safe.technical-review.json). Recorded-source identity, creator, licence, parent hash, source trim and gain survive compilation. A clipped intermediate was retained and rejected; the corrected floating-point gain before PCM encoding has zero clipped samples. Final stereo AAC is present, peak 0.179/RMS 0.0228, no clipped samples. Human listening and emotional sound approval remain pending. |
| Actual output inspection and playback | All 90 final picture frames decoded: [sheet](scene-review/all-frames.jpg), [decode receipt](scene-review/decode-receipt.json), [creative verdict](scene-review/creative-verdict.json). Headless muted Chromium played all three files at 1x to completion, verified expected dimensions/durations and HTTP 206 byte ranges, and rejected private metadata requests. This proves playback, not predictive Studio preview or human listening. |

Native yacht SHA256: `9a779712e28e5c2252c5b4eafd4099236d59a538c92894d54a36a339de921fa6`.

Scene SHA256: `0a45991d499bda0ffff3159f3a9debeea5625c87b6c48842ef2dc987d9171708`.

The new yacht model loaded in 365.83s; shot inference took 1,721.12s. The shared scene render itself took 6.28s. These are observed single-run times, not future estimates. The source takes, models, partial-generation protection and CPU fallbacks are preserved.

## Creative judgment and failed work

The scene makes vessel weight and a sailor's response readable. As a film, it fails: no ordinary starting idea, unfolding event, escalation or earned transformation payoff appears. It cannot demonstrate the promised autonomous creative transformation. Deck/wardrobe/light continuity and whether the close sailor is one of the distant crew remain unproven. The [story treatment](scene-treatment.md) and [scene direction](scene-direction.json) retain this scope; calling the shots accepted does not establish their continuity.

Four inexpensive NVIDIA still candidates were generated and inspected before any further transformation video. Both reference-conditioned candidates retained the rejected front-facing orientation. The fresh prompt-only candidates produced two paper vessels on a tabletop, or a cream fold on cloth-like material. **All four rejected; zero extra transformation video takes launched.** [Catalogue](rejected-source-catalog.json) retains every original PNG, timed-still wrapper, model/revision/settings/seed, source brief and exact rejection. Those wrappers are editor inputs, not generated motion.

The earlier [v5 checkpoint](../flagship-founder-film-production-v5-20261008/README.md) remains historical. Its endpoint/FLF/VACE transformation failures and editable ident candidate are preserved. Earlier trained FLF already began on water; this session's attempted change was matching side orientation and world geometry, not claiming that moving the starting boat onto water was a new fix.

## Backend hardening and verification

- [Conditioned-video adapter](../../scripts/content-factory/generate-conditioned-video.py): optional aspect-preserving reference fit preserves existing defaults. Before loading large models, protect every existing take, including partial raw/latent outputs, check both endpoint paths/hashes and reject duplicate shot IDs. [Five original input guards](input-guards.json) and [four paired-input guards](paired-input-guards.json) use actual native PNG bytes without inference.
- [Shared private assembly](../../scripts/content-factory/render-transformation.js): preserve explicit source origin and licence/parent provenance; enforce the reviewed usable source interval on every sequence occurrence before writing or dispatching. [Three actual-source compilation guards](assembly-guards.json) include rejection of the unstable yacht tail without replacing the edit. CPU compilation remains usable without a paid GPU window.
- [Bounded review helper](../../scripts/content-factory/prepare-asset-review.py): retain every decoded frame, native keyframes and detail-region sheets; never infer creative acceptance from decoding. Applied to actual yacht, sailor and final scene media.

No ordinary signed-in Studio generation/import/review path, undo/save/reopen coverage or predictive-preview parity was qualified by this private CLI work. The final worker still reports `legacy_request_without_plan`; successful private assembly does not complete canonical plan migration. Permanent Studio classifications remain unchanged.

## GPU state and exact remaining work

No instance was started. Current explicit retained-session authorization is **11:00 SAST, 9 October**, epoch `1791536400`, from the [active podcast session extension](../podcast-two-minute-20261009/session.json). Historical October 8 windows are expired. The independent cutoff process remains active. All launches checked jobs first and acquired the shared GPU lock. The first export lost the lock to an existing creative job and stopped; [failed attempt](borrowed-render-receipt-attempt1.json) is retained. After that job completed, [export recovery](borrowed-render-receipt.json) reused the exact generated sources and completed; it did not repeat video generation or stop the other job. The existing idle media API was restored after each film stage. Preserve that API and the foreign session's watchdog; do not shut down their active work prematurely.

The [09:31 SAST read-only job check](gpu-state-final.json) finds the existing `factory-wan-br-a82eea94732201512193-shot-1` B-roll job at 100% NVIDIA utilization. No owned film job remains active. That job and its cutoff supervisor are preserved; do not launch a competing job or restart its temporarily unavailable media API. The private review URL returns HTTP 200.

Remaining: an accepted continuous single-vessel transformation; a usable spatially matched paper endpoint; explicit persistent hull/sail deformation and material handoff into photographic yacht pixels; continuous camera/water/depth; same-human/deck/light continuity; complete-film pacing and human sound review; approved ident integration; final hero/cutdown/teaser and welcome-page placement. The 3.75s review satisfies none of these whole-film gates.

Next private task: match **evaluated connected native geometry, camera and vessel regions** to the photographic endpoint, then inspect representative middle frames before another bounded video take. Earlier geometry controls do not match the photographic endpoint closely enough, and prompts do not enforce that match. This capability is still missing; no implementation success is claimed. Reuse the existing editable scene/control providers and Factory/Director/renderer. The shared Studio backlog remains **S02**, then S03. No paid job may outlive the current independently supervised cutoff.
