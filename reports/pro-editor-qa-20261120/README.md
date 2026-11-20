# Professional editor verification

20 November 2026. Local QA of the Viral Clip Studio professional-editor worktree at `11052f818`, with `main` at `dd4b80a6a` as the comparison. The IDE's AI Product Demo Studio worktree is a separate app flow.

## Correction pass

Recent Projects now queries the signed-in owner on entry and retry. Backup restore verifies each media path and writes a new owned record atomically. The frontend regression covers switching accounts and hiding the previous account’s projects.

Final delivery now validates the requested picture codec. The real CPU sequence renderer produced ProRes 422 HQ in MOV with 10-bit 4:2:2 video and PCM sound in both the ordinary and caption-review paths. Both files decoded end to end. Owned-output service tests cover QuickTime storage, hashing, and download naming. Studio keeps the editable preview active for the mezzanine download.

The mobile monitor now reserves enough room for the picture and transport. At 390 × 844, the browser measured a 77.6 × 138 picture and the transport fully within the monitor. The corrective pass passed 48 frontend cases, 44 API and storage cases, 32 worker cases, and two focused integrated editor cases. All 17 browser interaction checks passed, including 390 × 844 and 844 × 390. The fresh signed-in run stopped at emulator startup because the installed Firestore emulator requires Java 21. Deployment remains open. The findings below are evidence from the original run.

## What the tests cover

The frontend sweep includes the timeline and transport, occurrence editing, group operations, authored caption timing, grade and scopes, Director, 3D controls, audio and stems, output settings, interchange and saved-project handling. The server sweep covers Studio media ownership and authorization, worker dispatch and receipts, Director replay, help, and related camera and workspace paths. The worker sweep runs real CPU FFmpeg checks for captions, color, retiming, audio, delivery specs, stems and the shared renderer.

The backend passed 444 tests in 41 suites. The team-workspace emulator passed 31 cases, and a separate Firestore check preserved a frame-anchored review and denied an outsider. The Cam-adjacent frontend sweep passed 60 cases. The combined Studio and Viral worker sweeps confirmed 293 passes after the four retries described below. The production-mode build, Studio contract, Director replay, and product-knowledge checks passed.

The broad frontend run reported 174 passing suites and two failing suites outside the integrated editor. The integrated editor covered 189 distinct cases across six shards and four focused cases. The first results were 173 passes and 16 failures. All 16 passed on focused reruns. The slow monolithic process was stopped once the shards reported every case. The combined frontend run remains red on the two assertions detailed below.

## Signed-in browser evidence

The professional worktree was built in production mode and opened headless with audio muted. In isolated Auth, Firestore and Storage, the editor imported a 60.060-second 23.976 fps source, trimmed and split it, added B-roll, a title and music, approved four subtitle cues, and authored 1.25× speed. Native forward and reverse shuttle and K preserved the authored speed and speed keys once the decoder settled. Jumping to ten-second SMPTE landed at 10.010 seconds.

Studio downloaded SRT, VTT, OTIO, CMX 3600 EDL, an audio stems ZIP, and a native project backup. OpenTimelineIO 0.18.1 reopened both timeline formats at 1,114 picture frames. The ZIP contained three non-silent dialogue, B-roll and music buses. Each file had 2,229,504 samples per channel at 48 kHz, stereo, 16-bit PCM, and all came from the same 46.448-second clock.

The ordinary CPU render delivered a 46.463-second portrait H.264 movie with 1,114 frames at 24000/1001 fps and stereo AAC. Full media decode and whole-movie playback in the Studio monitor passed. Eight anonymous welcome comparisons and three signed-in help questions passed with zero browser errors.

An independent authenticated status request recovered the exact movie by SHA-256 with zero new render submissions. The final mix measured −13.8 LUFS integrated and −1.0 dBTP. Five paused 372 × 660 frame pairs measured mean absolute 8-bit channel differences of 2.282–5.961 and 95th-percentile differences of 5–11. These samples cover the selected fixture. Continuous picture and audio conformance still need verification.

Local source-bound Director created a six-second storyboard, then committed eight editable layers and 129 motion keys. Undo and Redo restored the preceding and applied layer counts. The result exercises local choreography. Model-backed planning was offline in the sandbox.

The H.264 dual-master action completed two separate approved jobs. Both files downloaded and passed full decode. Sampled caption-window frames differ between the two masters and their picture frame counts and durations match. The clean job required its own approval in the isolated quote flow.

## Failures and limits

- **Recent Projects loses the entry after reload.** The signed-in editor saved the project in IndexedDB with its owner ID. After full reload the dashboard displayed zero recent projects. Its list, retry and backup-restore calls omit the owner scope that the store now uses to select owned projects. The standalone finished movie had already downloaded and passed full playback. [Dashboard calls](../../frontend/src/UserDashboardTabs/ViralClipStudioPanel.js#L141) · [Project store](../../frontend/src/components/viralStudioProjectStore.js#L23)
- **ProRes cannot complete the ordinary delivery path.** The serial browser attempt was admitted, then failed at the worker with `rendered media is not H.264`. FFmpeg reached the ProRes output step and the shared media verifier rejected the selected codec. The second master was never submitted for that attempt. Standalone ProRes encode tests qualify the encoder itself. [Final delivery validation](../../python_media_worker/main_media_server.py#L686) · [Codec check](../../python_media_worker/motion_sculpture.py#L244)
- The ColorCorrector test expects Camera CST to be stored as a creative LUT. The project document test rejects any `words` key, including authored caption word metadata. Both assertions fail identically on the tested `main` baseline. The separate color pixel comparison and word-timing suites exercise the new representations.
- Two standalone browser fixtures fail on both revisions. In the sequence fixture, the active decoder advances into the second video, but the test times out waiting for the outgoing decoder's precise EOF event sequence. The responsive fixture passes at 768, 820, 1,000 and 1,440 pixels and reports a collapsed programme picture at 390 × 844.
- The integrated editor has timing-sensitive cases. One diagnostic rerun gave the scheduled sound-effect case a 120-second timeout. The sound-effect and saved raster cases then both passed again under the original timeout. The separate Playwright spec registered its 16 cases in discovery. The signed-in workflows and standalone browser fixtures above are the executed browser coverage for this report.
- Four worker executions needed follow-up. The color harness had to bundle imported frontend color modules, the delivery timing test required package-qualified invocation, and the title test required SciPy in isolated scratch. The same checks passed on rerun. Live NVENC was unavailable on the loopback CPU runtime.
- The first native take used a malformed test subtitle file. A corrected take subsequently hit a reverse-shuttle timeout after K. The final take waited for the decoder to settle and verified both directions. The first explicitly approved ProRes attempt received the local capacity guard while the longer render was active and was retried after it finished.

Resolve relinking, live model inference, actual hardware NVENC, and complete moving preview and audio parity remain outside the qualified results. All five admitted CPU operations settled with zero outstanding local credit holds.

[Verification and evidence index](verification.json)
