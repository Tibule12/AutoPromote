# Studio Live Edit remix clarity repair

8 November 2026 · `fix/studio-remix-clarity-20261108` · local continuation of `f0665ee3`. No push, merge or deployment. The preceding Director work stays intact.

The original live FFT pitch remapper produced metallic hop-rate sidebands and reduced the voice level, most noticeably at the Chipmunk octave. Live Edit now uses a pinned Signalsmith Stretch 1.3.2 stereo WASM processor in the same Remix graph. Slowed + Reverb, Deep Voice and the other presets retain their existing values. Native picture speed, projects, manual controls and canonical Rubber Band export mastering are preserved.

The binary compiles before the audio node is created. Startup/seek warmup retains dry speech, preset/bypass changes crossfade, and seeking clears old-position audio. Unsupported or failed module loading keeps ordinary sound connected and exposes the existing pitch fallback message. Assets are local static resources; no CDN, provider call, new subscription, schema migration or new editor is needed.

The actual browser check also found a transport bug: a range thumb could retain a Home seek forever because the advancing decoder had already passed its exact target tick. It now resumes following the verified playing decoder. Paused rapid frame stepping still retains the pending target, and replaced/seeking/errored media cannot qualify as advancing.

## Evidence

[Validation and measurements](evidence/validation.json) records **83 targeted tests passed**: 68 audio/clock cases, four selected editor cases and eleven actual CPU-worker regressions. The remaining 174 editor cases were skipped, not claimed as passing. The strict isolated frontend build passes; the user's active build remains untouched. Lint has no new errors/warnings; the existing test-only no-loop-func warning remains.

On a deterministic six-harmonic 173 Hz reference, unwanted energy outside ±10 Hz harmonic bands falls by **58.05 dB for Chipmunk**, **26.26 dB at the Slowed + Reverb pitch** and **25.36 dB at the Deep Voice pitch**. Neutral audio remains sample-exact. These are diagnostic signal results, not perceived quality scores. Original and revised speech comparisons, actual native PCM captures and failed trials are retained privately.

A separate real browser audio-thread check survives 1,680 ms of main-thread work in 40 ms bursts during its bounded run, without silent blocks or nonfinite samples. The pitch node reports **96 ms latency at 48 kHz**. This is not full picture/sound or lip-sync qualification; final mastering remains a distinct chain.

The signed-in App is served from an isolated loopback build. Disposable contexts copy the already authorised login; normal native backup controls restore the existing source project. The private QA transport forwards authenticated source/account reads and blocks financial, upload, render, analysis and other production mutations. Its CORS forwarding is a test adapter, not product code. Audio is captured from the actual post-effect graph with the browser muted and headless. No provider analysis or paid/cloud job runs.

The final native run exits successfully: all eleven presets produce finite, non-silent speech with **zero silent 128-sample blocks** in each retained capture. The requested three presets have four-second samples; others use 1.2-second samples. Source and visible output controls advance, Before and Keep Pitch clear the live pitch, and the complete saved document/settings match after cold reopen. Captured peaks remain below full scale for this speech source. This is a bounded real source-voice workflow, not target-isolation or human listening acceptance. A prior completed run failed only during in-flight read cleanup; its evidence remains alongside the corrected complete run.

The vendored [MIT licence](../../frontend/public/vendor/signalsmith/LICENSE.txt) and [exact provenance](../../frontend/public/vendor/signalsmith/provenance.json) record the upstream revision, release-module derivation and identical extracted WASM digest. The [official Web release](https://github.com/Signalsmith-Audio/signalsmith-stretch/blob/88061fd4eda56a2353c5d65c74aa3f4ccf76f9da/web/release/README.md) documents the processor. The local wrapper retains Studio's existing node API; the vendor factory accepts an optional precompiled module for audio-thread instantiation. DSP/WASM bytes are unchanged.

## Preservation and limits

Rules, authentication, media APIs, canonical workers, preset defaults, billing/subscriptions and saved-login bytes match the local base. No production project, balance, subscription, publication or advertising setting changed. Cam Combiner and Director are untouched. Existing historical security/balance/session follow-up remains open.

Live EQ/reverb/dynamics and some target-isolation combinations remain approximate. This repair does not qualify continuous preview/final PCM, human listening acceptance, all material/devices or whole-Studio readiness. Formal counts remain 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY. Before release, review an audio-only candidate against current main: this development branch also contains earlier local Director commits, which are not silently authorised for deployment by this repair. Fresh live qualification follows an explicitly approved release.
