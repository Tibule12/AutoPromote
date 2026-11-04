# Studio sound transport and disk cleanup — 4 November 2026

Local branch `fix/studio-audio-transport-20261104`, based on production/main `8edaf4e2`. No push, merge, deployment, production record change, paid cloud request or new credit/billing system. Team and Billing commits `2ff7eabd` / `81f6b128` remain separate and unchanged. The user's `.env`, existing media/projects and active App build were not modified.

## Repaired

- Sound preset, Before and loop actions now use Studio's existing playback preparation and transport intention. They no longer start only a native element while the Play control/timeline remains paused.
- Selecting a sound edit leaves an old finished movie and auditions the editable source. Existing completed outputs remain preserved.
- Remix no longer disables the bounded multi-cut decoder pool. A preset change keeps the active source and its listeners rather than silently switching decoder slots.
- Independent pitch now reaches a bounded stereo audio-thread processor in the existing Remix graph. Chipmunk, Deep Voice and other pitch presets retain the authored picture speed; pitch/intensity/Keep Pitch follow the existing settings contract. A seek clears buffered old speech. The canonical worker/export mastering source is unchanged.
- Preset/Before races cannot install a stale pitch node after its module finishes loading. Unsupported/failed live pitch leaves ordinary sound available and displays a useful fallback message; the existing explicit mastered-preview option remains.
- Meter readings update only the Sound panel, rather than redrawing the entire editor approximately twelve times per second. Leaving Studio cancels meter callbacks/listeners and closes its decoder audio contexts, including pending pitch setup.

## Verification

**69 distinct focused tests passed:** 50 audio/meter/clock/DSP cases, eight selected full-editor cases and eleven existing canonical CPU-worker cases. The complete 161-case editor suite was not run. JavaScript lint/syntax, whitespace and Studio record validation passed.

A normal verified sign-in against fresh loopback demo Auth/Firestore emulators opened the actual built React App. The new demo account received an explicitly local editing-plan fixture; real customers, subscriptions and balances were untouched. A generated thirty-second moving 440 Hz reference was restored through ordinary native-backup controls. Storage metadata and signed reads were controlled fixtures; the real authenticated resolver was used. No session/project state was injected into the browser.

All eleven presets produced measurable non-silent audio at the expected voice frequency, retained their picture speed and advanced the actual source and visible timeline during separate 1.2-second samples on the second shot. Chipmunk, normal Pause/Resume, Before, Pacing/Motion/Sound switches, native save/backup, audio-context release and cold reopen passed. The final audition samples contained two long tasks, maximum **54 ms**. This is a bounded simple-project observation, not a promise that every large Studio project is free of stalls.

The production frontend build passed into a private directory, including the new worklet asset, nineteen existing welcome assets and 47 public entry pages. The active user build was not replaced. [Validation](evidence/validation.json), [browser measurements](evidence/browser.json), [preserved sources](evidence/preservation.json).

Initial browser attempts failed because the fixture lacked the existing editing-plan entitlement and owned-media manifest. Those fixture omissions were corrected without bypassing production checks. A later pitch measurement retained previous FFT data because its test analyser used smoothing; disabling measurement smoothing resolved that false failure. Failure screenshots/logs and corrected measurements remain private. The first worker command lacked dependencies; all eleven worker tests subsequently passed in the existing CPU Python environment, without installing dependencies.

## Remaining limits

Live FFT pitch audition is distinct from final Rubber Band mastering. The 2048-sample analysis window adds bounded preview latency; full waveform, transient, stereo/listening and whole-mix parity are not qualified. This run covers source-voice presets, not every recorded-voice/music/SFX routing combination. The explicit worker-mastered preview remains separate and was not invoked against cloud infrastructure.

Module loading and parameter delivery follow the official [Web Audio specification](https://www.w3.org/TR/webaudio/). That API contract does not establish perceptual equivalence to the worker's mastering algorithm.

Dense motion/3D projects, high-resolution/long source pools, low-memory devices and broader S02 presentation/colour/edge issues still need their own profiles. No capability is promoted to PRO or production readiness and no creative/listening acceptance is inferred. Preserve the shared S02/S04/S03 backlog. Next: profile a representative large project while retaining its exact native backup and source versions.

## Disk space

The local root filesystem had about **1.1 GiB available on a 233 GiB disk**, reporting 100% use. Removed only **22 redundant generated browser-test build directories**, approximately **1.9 GiB allocated**, retaining final validated builds, every parent test directory, screenshots, logs, native backups and generated reference media. Removed build files have SHA-256 manifests beside their retained evidence. No worktree, branch, source, model weight, installed dependency, user video or project was deleted. Available space after testing was about **3.1 GiB**; the disk is still tight. [Exact cleanup inventory](evidence/disk-cleanup.json).

Largest observed local groups were Projects about 70 GiB, Android 13 GiB, Codex state 13 GiB, snap 7.1 GiB, AI environment 7 GiB, caches 6.7 GiB and Videos 5.5 GiB. These are disk usage observations, not permission to remove them. Unrelated browsers and other worktree processes were left running.

## Reproduce

Use the existing shared Node dependencies, cached Firestore emulator and Java 21. No production Firebase credential is needed. Browser QA remains headless and muted; network is restricted to loopback and the controlled demo transport.

```sh
STUDIO_AUDIO_QA=true SECURITY_JAVA_BIN=/path/to/java21/bin/java npm run test:community:browser
```

For worker regressions, use the existing CPU Python environment with `python_media_worker` on `PYTHONPATH` and run `unittest discover -s python_media_worker -p test_viral_audio_remix.py`. No paid worker execution is authorised or required by this local check.
