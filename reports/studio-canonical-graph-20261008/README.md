# Canonical Studio graph: first stabilization slice

8 October 2026. S01 is **PARTIAL**, and Studio remains **not ready**. This is
implemented and tested state infrastructure, not finished creative work or new
real-user/GPU qualification. The historical 29-capability results are unchanged.

The existing document, manual command kernel and Director replay now retain the
complete normalized 3D scene settings, asset storage path/name and HQ job/revision
references. Timed audio cues retain their owned media reference, gain, fades,
enabled state and built-in sound identity. Music/remix/restoration settings and
additional overlay/motion parameters use the same versioned editable projection.
Signed URLs and File/Blob payloads stay outside the migrated decision fields.

The production editor uses this projection when taking snapshots, reopening
projects and preparing overlay/motion/3D/audio export inputs. Older documents
without the projection version keep their saved legacy state and upgrade through
the existing reconciler. Uploads now retain owned storage paths for still layers,
music, SFX and voice-over instead of retaining only an expiring playback link.

| Failure / risk | Underlying correction | Retest evidence |
|---|---|---|
| 3D camera/asset/HQ and audio gain/fade/media decisions disappeared in the canonical adapter | Expanded explicit parameter contracts and cue payloads; regenerated the shared server kernel | [Preserved adapter versus current adapter](baseline-loss-reproduction.json); 13 canonical-media guards |
| Canonical edits could be overridden by a stale legacy copy on reopening/export | Shared versioned projection drives hydration and export | Production component reopen → control → normal export-action regression |
| Replaced footage/still/3D media could retain old access/preview links | Compare owned storage/hash/source identity before retaining transport; invalidate changed HQ bindings | Replacement guards; matching fresh links still retain the same revision |
| Restored nested keyframes could mutate saved state by shared object references | Copy nested decisions at capture and projection boundaries, including audio routing and subject scene state | Recovered-key/route mutation guard; trim/undo/reconcile guards |
| Migrated speed points lost IDs used by per-point editing controls | Preserve optional speed IDs in canonical keys/projection and server validation | Two-point identity/edit regression and browser/server replay equivalence |
| Audio uploads retained only URLs | Preserve storage paths in actual upload/export state updates, including VO helper | VO upload/payload regression; custom SFX export component regression |

Final automated results: **60 model/helper guards + 35 server guards + 5 selected
production-component checks = 100 passed**. The component suite skipped 95 other
cases; it uses simulated media/auth/uploads and is **not** browser E2E evidence.
No actual media render, listening check, visual parity measurement, app window,
browser launch or paid GPU job was started by this slice.

- [Model/helper log](model-tests.log)
- [Production component log](component-tests.log)
- [Server log](server-tests.log)
- [Initial projection failures](projection-initial-failures.log)
- [Initial component failures](component-initial-failures.log), [same failures in the saved pre-change component](component-baseline-failures.log), [intermediate media-fixture correction](component-fixture-intermediate.log)
- [Initial server fixture failure](server-fixture-initial.log): its speed point was inside removed time; the retained-point fixture was corrected and rerun.

The two older component tests did not simulate a loaded native video/current
source. The production source-clock guard correctly rejected their events. Their
fixture now provides metadata, loaded data, ready state and current source; the
original playhead/trim/undo assertions remain. This is a test setup correction,
not a new claim about real playback behavior.

Run the meaningful slice again from the frontend with:

```sh
CI=true npm test -- --watch=false --runInBand --runTestsByPath src/components/__tests__/studioCanonicalMedia.test.js src/components/__tests__/studioProjectDocument.test.js src/components/__tests__/studioCommands.test.js src/components/__tests__/studioRenderCompiler.test.js src/components/__tests__/studioVoiceover.test.js src/components/threeD/studio3DModel.test.js
CI=true npm test -- --watch=false --runInBand --runTestsByPath src/components/__tests__/ViralClipStudio.test.js --testNamePattern='initial saved-project hydration|reopened canonical audio|places and edits built-in sound effects|uploads a custom sound effect|quick trim retimes motion'
```

From the repository, run the three server suites with the existing Jest
installation and `node scripts/build-studio-director-replay.js --check`. The
bundle check passed: Node Director uses the same pure browser command model.

Remaining S01 work: authoritative finish/main-transform, full caption styling,
reframe/camera settings, transitions/hooks, masks/analysis references and all
remaining render-affecting state need explicit field contracts and coverage.
The composition still has separate worker stages. Media expiry/rebinding,
full cloud persistence and all-feature undo/reopen are unqualified. Nine ignored
3D renderer fields remain ignored; storing them does not wire their renderers.
Full pre-final pixel/audio parity and requested real combinations remain open.

Next: extend this same versioned graph/projection to finish/main-transform,
caption/reframe/camera decisions. Do not create another engine or promote a
capability from these automated state checks.
