# Source loading and imported-cue continuation — 11 October 2026

The existing speed-ramp film and fully editable Studio timeline remain delivered. This continuation fixes three shared preview defects; the whole Studio is still not ready. No new film, render, model or GPU job was requested.

The unchanged project is `viral-project-1e5e9c20-64d3-4935-be19-9c1607e75c67`, canonical SHA256 `f81122e0ba2dc635bd174f17637a4236fa533a1be24bfbd6d31ab848dd574f2d`. Its source edits, final movie, music and seventeen editable cues are preserved.

## Changes and actual evidence

- Play accepts either the usable decoded song or the usable native audio decoder, rather than waiting for both. An unavailable song still returns a bounded error; no silent fallback grants qualification. Pending readiness listeners are cancelled when the other route wins.
- A refreshed private access URL reuses already decoded PCM only for the exact project/owner/storage-path/content-hash identity. Missing identity and changed project, owner, path or hash cannot grant reuse. Actual runs show two song decodes before this repair and one afterward.
- Imported SFX resume at their current canonical programme offset. The old continuous-play180ms drift allowance no longer applies to a paused cue. Continuous playback still has that allowance and is not fully qualified.

[Machine summary and exact runs](proof/launch-template/cycling-recovery-20261011/source-audio-loading-summary.json) retain the successful and failing measurements. Final unrecorded native source playback takes21.097s from playing, with two waits, versus a19.385s authored delivery. Play intent to playing is214.8ms:106.3ms before the real click and108.5ms from that click to playing. Earlier whole preparation measurements included waiting for the disabled Play button during owned-media refresh. Another isolated run retained15.971s overall preparation despite only one song decode; startup remains variable. The33.146s run overlaps compilation/testing and cannot establish isolated performance.

[Actual final native mix and timeline](proof/launch-template/cycling-recovery-20261011/live-audio-loading-final/native-preview-mix.json) captures25.749s through the real last source trim, with zero capture errors. All17 cue identities are observed, no unmatched callbacks, no first callbacks over one24fps frame and zero callback/offset position difference. These are callback/source-clock observations, not audible-onset or waveform approval. The earlier imported resume differed by92.611ms. The same unchanged full-mix/music checks still fail: observed-clock bed windows range approximately0.378–0.999. Original wall-clock failures, pauses and their raw PCM are retained. Music is present in the actual post-gain meter; the failures are not reclassified as passes.

## Verification and remaining work

26 helper checks plus six distinct component checks pass; the complete component suite was not run. The optimized normal App build passes. One intermediate build failed on an incorrectly named project-state variable; it was corrected and rebuilt, and the failing log remains. No renderer change or new export is implied. Real authentication is retained privately; no auth/route/render mocks or new login are used.

Continue S02 into owned-link startup, live buffering/cuts and full sound signal conformance, then live picture/staging. S03 global composition follows; the founder's After Effects timeline requirement remains a subsequent S04 professional timeline task on the same canonical graph. Full soundtrack listening, creative/public acceptance, model-runtime normal-account lifecycle and production qualification remain open. No frontend redesign, Cam Combiner change, production deployment or main merge.
