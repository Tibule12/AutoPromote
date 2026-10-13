# Studio S02 continuation and diagnostic follow-up — 13 October

Branch: `agent/product-knowledge-system-v1`. No deployment, main merge, paid GPU/model job or new final render. The normal signed-in App and existing canonical project/render path remain authoritative.

## Assistance follow-up completed

Knowledge patch **1.0.2** maps six actual legacy 3D/caption messages and two actual publishing reason codes. These paths emit text/reasons rather than invented stable error IDs. The 3D guidance explains missing, stale/foreign and aspect-mismatched owned HQ output. Captions stay **BROKEN**; flagged-line guidance is explicitly a manually reviewed phrase workaround. Publishing explains unsupported destinations and disabled TikTok dispatch. Unknown messages still generate documentation gaps. Safe context accepts bounded product prose and excludes private paths, URLs, credentials and multiline traces.

All three new diagnostic cases pass in the actual signed-in help drawer. [Actual transcripts](proof/product-assistance-v1/diagnostics.private.json), [3D](proof/product-assistance-v1/diagnostic-3d.png), [captions](proof/product-assistance-v1/diagnostic-captions.png), [publishing](proof/product-assistance-v1/diagnostic-provider.png). Feature/control/task counts and readiness remain unchanged. No catalogue expansion or action-taking support was added.

## Concrete Studio backend repair

The optional Redis listener is absent on this workstation. Previously, the distributed limiter queued requests while its client connected/retried, then admitted them without the local fallback after failure. It now immediately uses the existing local token bucket when Redis is not ready; ready-client failures also use that bounded fallback. Healthy distributed allowance/rejection and Retry-After remain authoritative. Normal authentication, owner checks, entitlements and CPU preview limits remain in their existing paths. An unsigned source-frame request still returns **401**.

Five meaningful middleware tests cover offline/reconnecting clients without queued evals, local rejection, healthy distributed rejection, recovery, ready-client failure and user isolation. No optional cache was installed or enabled.

Actual Studio source-frame observations after repair: **4,381ms** cold fetch, **990/981ms** warm requests and another **4,101ms** source fetch. One before-change response was **4,971ms**; the complete before latency distribution was not retained. This demonstrates removal of the offline-cache wait, not a guarantee that cold cloud downloads are fast. The three repeated preview PNGs are byte-identical and the canonical document is unchanged. [Latency/picture evidence](proof/launch-template/voiceover-ducking-20261012/s02-live-conformance-20261013/after-cache-fallback/latency-and-picture-evidence.json).

## Actual S02 picture and sound evidence

The existing **VELO — prepared speech edit · 20261012 r2** project was opened through normal saved-project controls. Live Edit was selected explicitly; completed-video playback was excluded from the measurements. An initial picture harness run omitted that selection and failed rather than substituting final playback. The corrected capture is retained beside the failure. No edit decisions or source bindings changed.

The complete measured native live replay took **19.413s**, with one music start, one prepared voice start, all 18 cues and zero observed waits. All eight populated lanes were visible. The same owned CPU voice-bus projection used the renderer's trim/fade/retime/automation and compressor helpers; preparation took approximately **0.884s**. This is deterministic CPU preview processing, not a model/GPU render.

Fourteen raw stereo PCM windows match the existing final-mixer helper reference at minimum mix correlation **0.999969792**, maximum relative RMS error **0.778%** and effectively zero sample-phase residual. Music-only minimum correlation is **0.999969385**. The decoded AAC export differs from raw PCM (minimum correlation **0.972977444**, maximum relative RMS error **23.112%**); these encoding differences and human listening remain explicitly unqualified. Raw waveform agreement does not certify creative quality.

Eight actual paused pictures at 2.1, 3.5, 6.7, 7.2, 8.4, 10.2, 13.5 and 17s match source geometry against the exact existing export at the unchanged **2px** threshold: eight passes, zero failures, p95 displacement **0.560–0.948px**. Three frames repeat after the backend repair with identical PNG bytes and three geometry passes. The end-card green title extent differs by at most **1px**, while its strict color-mask overlap is **0.616**; complete glyph/color/alpha parity remains unqualified. Both actual paired picture sheets were visually inspected: word content, line breaks and representative placements agree. This is representative paused evidence, not full moving-raster or matte qualification.

[Native mix receipt](proof/launch-template/voiceover-ducking-20261012/s02-live-conformance-20261013/native-preview-mix.json), [PCM audit](proof/launch-template/voiceover-ducking-20261012/s02-live-conformance-20261013/audio-audit/audio-stage-audit.json), [eight picture comparisons](proof/launch-template/voiceover-ducking-20261012/s02-live-conformance-20261013/paired-geometry.json), [editable timeline](proof/launch-template/voiceover-ducking-20261012/s02-live-conformance-20261013/timeline.png), [actual paired frames](proof/launch-template/voiceover-ducking-20261012/s02-live-conformance-20261013/paired-0.jpg).

The same existing corrected [final film](proof/launch-template/voiceover-ducking-20261012/native-prepared-voice-edit-r2/picture-clock/final.mp4) and [full Studio recording with all eight editable lanes](proof/launch-template/voiceover-ducking-20261012/native-prepared-voice-edit-r2/picture-clock/edited-in-studio.mp4) remain bound to the canonical project. They contain private diagnostic speech and are excluded from publishing. This turn creates no new customer edit or public creative film. Existing six-post scheduling is preserved; no publishing action was submitted.

## Validation, files and remaining work

**28 assistance + 17 knowledge + 5 rate-limiter checks = 50 scoped passes.** No frontend changed in this continuation, so the previously passing optimized App build is reused. Record validation and generated knowledge checks pass. Harness environment failures (missing packages in system Python and missing NODE_PATH) were corrected by using the existing installed worker environment; no dependencies were installed and no product failure was relabelled as a pass.

Implementation changes: `src/productAssistance/index.js`, existing knowledge catalogue/impact/source-review lock and generated docs; `src/middlewares/distributedRateLimiter.js`; diagnostic and rate-limiter tests. Session continuity records link this report. Proof storage is about65MiB; existing media, models, projects and saved authentication are preserved.

Next shared task remains **S02**: full text/alpha/matte/grade and effect-order conformance, continuous-picture and broader media/cold-preparation coverage, plus human sound review. Then S03 global composition/nesting and remaining S04/AE controls. Ordinary-account model lifecycle and showroom/public qualification remain incomplete. No readiness, creative or public-release promotion.
