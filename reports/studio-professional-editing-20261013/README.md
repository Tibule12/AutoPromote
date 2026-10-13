# Professional property editing — 13 October 2026

Individual transform properties are editable directly in the shared Studio timeline. Unanimated visual layers appear in the property list. Expand a layer to inspect its evaluated position, scale, rotation and opacity; source/image/video layers also expose crop. Numeric edits commit once on Enter/blur; Escape cancels. An unanimated value changes its base transform; an animated value writes one key at the current playhead. Each property has add/remove and previous/next-key controls. Owning-track locks prevent mutation while allowing selection/navigation. Half-frame matching preserves adjacent 50/60fps keys, including speed-adjusted authoring clocks. Group pose capture now uses the evaluated transform rather than resetting animation to the base values.

These controls use the existing canonical transform/keyframe state, history, project store, interpolation and render compiler. There is no new editing/render engine or schema. The isolated branch `agent/studio-professional-editing-v1` preserves the inherited workspace foundation separately from this increment; the original working tree is retained.

The real authenticated App imported a private three-second grid and transparent marker. An ordinary unanimated image layer received a base X change, then only two X keys: 25 at 0s and 75 at 2s. The midpoint evaluates to 50. Undo/redo, key removal/undo, save and normal cold reopen retain the exact canonical decisions. Export uses the normal API, owned media uploads and local CPU worker. The downloaded 720×1280 H.264/AAC movie has all 72 frames at 24fps and independently decodes completely. Its bytes match the owned completed-job hash. Final playback reaches 3s/ended in Studio beside the editable timeline. Screen recording contains the exact export soundtrack; the QA browser was headless and muted.

- [Actual final movie](proof/property-animation/final.mp4)
- [Actual Studio recording with property controls and complete final playback](proof/property-animation/edited-in-studio.mp4)
- [Native editable property controls](proof/native-properties.png)
- [Paired marker measurement](proof/paired-property-measurement.json)
- [Checkpoint and qualification limits](checkpoint.json)

Four independently captured live-preview positions versus decoded final frames at 0.5, 1, 1.5 and 2.5s agree within **0.5 display pixel per axis**, below the declared two-display-pixel bound. The same project and unchanged individual motion keys bind the comparison; export materializes the local image into owned media. This measures one X/ease-in-out animation. It does not qualify whole-picture/audio parity, every property/easing, global order, nesting or After Effects equivalence. The diagnostic is private test media and has no creative/public approval.

Changed implementation: `StudioProTimeline.js`, `StudioTimeline.css`, `ViralClipStudio.js` and new `studioMotionProperties.js`. Meaningful regression checks live in `StudioProTimeline.test.js`; the isolated build/server/native lifecycle/measurement scripts are under `scripts/studio-professional/`. Completion/readiness and all three matrices retain their existing readiness states.

Validation: 37 focused tests across timeline, automation and render-compiler suites pass; the strict ordinary App build passes. The full `ViralClipStudio.test.js` attempt was interrupted after five minutes without a result and is not claimed passing. The requested CI repair was independently pushed as `41994b33`: the exact capped TikTok browser test and 60 focused media-service tests pass, and media routes import in Firebase bypass mode.

QA failures are retained honestly: the first selector used the wrong capitalization; JSON browser-session copying discarded local File bytes; querying a persistent profile before visiting its origin hid its actual saved stores. The successful rerun preserves real IndexedDB in a private persistent profile. General creative proofs retain their 5GiB guard; this exact three-second CPU proof has a process-local 1GiB headroom check and 64MiB recording cap. None of these harness corrections replaces product auth, routes, media or workers.

GPU usage: **zero jobs, zero paid GPU runtime, zero GPU cost**. One real local CPU final render completed. Ordinary-account charging remains unqualified. Own local services are stopped after evidence is finalized; the other track’s app/API/worker and all original projects remain untouched.

Remaining defects: shared S02 full mapped stage/raster/matte/audio conformance; S03 canonical global ordering and nesting; remaining S04 controls; ordinary-account model lifecycle, durability and billing qualification. Next leverage: continue bounded S02 moving-picture/matte/audio pairs, then S03 composition/nesting. No PRO/production, creative/public or main-merge promotion.
