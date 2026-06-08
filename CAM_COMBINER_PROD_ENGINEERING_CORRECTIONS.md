# Cam Combiner Prod Engineering Corrections

Date: 2026-06-08

## Current Publish Candidate

Episode 1 publish candidate:

`/home/tibule12/Downloads/AutoPromote-final-episode-proof/final-drift-repair-37m35/final-stitched/episode1_publish_sync_fixed_color_safe_0s_2537s.mp4`

Current proof state:

- Duration: `42:17.04`
- Late drift repair window: `37:35` to end
- Late repair post-render sync audit: `good`
- Late repair usable sync samples: `69 / 70`
- Late repair max sync residual: `0.026s`
- Late repair final quality gate: `passed`
- Final full stitch video tags: `yuv420p`, `bt709`
- Bad warm/red tonemapped render was removed from the final folder.

Worker correction made after the color mismatch:

- HDR/HLG sources now preserve the decoded pixel look by default and normalize output tagging to BT709.
- The old Hable tonemap path is now opt-in only through `MULTICAM_HDR_NORMALIZATION_MODE=tonemap`.
- Segment encodes now write BT709 color metadata.
- Regression tests cover the default HDR preserve path and legacy opt-in path.
- Focused worker tests passed: `57` tests.

Server production guard added:

- `/api/media/render-multicam` no longer has to charge immediately in production.
- When `MULTICAM_SERVER_PROOF_REQUIRED=true` or production runtime defaults it on, the route checks the user's credit balance but queues the job without deducting credits.
- The background job runs a server-side worker plan/proof gate first.
- Credits are deducted only after server proof passes.
- If server proof fails, the job fails safely before paid full render starts.
- Firestore records `serverProof`, `proof_passed`, `chargedAfterServerProof`, and the post-proof credit receipt.

## Non-Negotiable Product Gates

Cam Combiner is not production-ready unless all of these pass on the actual rendered video:

1. Sync is proven at start, middle, late, and final windows for both cameras.
2. Active speaker owns the main frame on both cameras, with no active speaker trapped in reaction.
3. Reaction PiP remains mandatory, but it must sit away from the active speaker.
4. Shared moment / show-everyone layouts only appear when they improve the edit.
5. Premium render path keeps color matching and grading active.
6. Full render time is economically safe for Cloud Run and for users.

Logs alone are not proof. The proof must include playable rendered video windows and a QA report.

## Corrections Already Made

1. Reaction side is now source-specific, not camera-id-specific.
   - Old bad rule: cam1/cam2 identity implied physical side.
   - New rule: `reaction_side` / `reactionSide` can explicitly set `left` or `right`.
   - For this episode:
     - Camera 1 primary: reaction on `right`
     - Camera 2 primary: reaction on `left`

2. Local proof CLI can pass reaction side hints.
   - `--camera1-reaction-side right`
   - `--camera2-reaction-side left`

3. Full-plan QA windows now slice the real 42-minute edit plan correctly.
   - The proof verifier now clips absolute timeline segments into start/mid/late/final windows.
   - This prevents false mid/late proof from accidentally reading the wrong part of the plan.

4. Active-speaker and layout gates were tightened.
   - Active speaker must be primary/full frame.
   - Active speaker in reaction is a hard layout failure.
   - Director latency repair catches delayed joins where a camera starts speaking and gets the room too late.

5. Late drift protection was tightened.
   - High sync anchors that are rejected or uncorrected now fail the final quality gate.
   - Accepted high correction anchors are allowed only when dense post-render sync passes.

6. HDR color handling was corrected.
   - Default source normalization no longer uses destructive Hable tonemap.
   - Output segments are tagged BT709 so VLC/prod players do not reinterpret the tail differently.

7. Tests were updated.
   - Focused worker tests pass: `57` tests.
   - Python compile checks pass.

## Critical Production Blocker

The next blocker is not one more visual tweak. It is production reliability and cost control.

Prod must not let a user wait through an expensive full render and only then discover:

- sync drift,
- active speaker stuck in reaction,
- wrong reaction placement,
- bad color conversion,
- failed captions,
- or a render that is too slow/expensive for the job price.

The worker must prove these things before the expensive final render whenever possible, and it must fail closed when proof is unsafe.

## Required Engineering Fixes Before Prod

1. Make playable proof windows a first-class product path.
   - Render start/mid/late/final proof windows first.
   - Lower resolution or bitrate is acceptable for proof.
   - Must still use the same director plan, sync offsets, channel mapping, and PiP placement.
   - Full render only starts after proof is safe or after an internal/admin override.
   - Current status: server-side plan/proof gate is implemented before charge; playable rendered proof windows still need the dedicated product route/UI.

2. Stop rebuilding full-length premium visual caches when only proof windows are needed.
   - Window proof should cache only the requested window plus small handles.
   - Never normalize all 42 minutes just to prove 30 seconds.

3. Make full render reuse verified source caches.
   - If a source has already been normalized with the same:
     - input path/cache key
     - offset/sync rate
     - render tier
     - color profile
     - resolution/aspect
   - Then reuse it instead of rebuilding.

4. Split render stages for cost control.
   - Stage A: source ingest + sync proof.
   - Stage B: director plan + layout proof.
   - Stage C: full premium render.
   - Users should only pay/consume heavy render credits at Stage C.
   - Current status: render credits are now deducted after server proof passes when server proof is required.

5. Add hard render budget guards.
   - Estimate wall time before full render starts.
   - Block or warn if estimated cost is too high.
   - Record estimated vs actual runtime in the job summary.

6. Add automatic full-render QA gates.
   - After full render, automatically audit start/mid/late/final output sync.
   - Also audit active-speaker-in-reaction, active-speaker primary ownership, PiP side safety, stream color tags, duration, and audio stream presence.
   - If the full output fails QA, mark the job unsafe and do not present it as a finished success.

7. Persist director proof metadata.
   - `director_channel_camera_ids`
   - `reaction_side` per source
   - active-speaker mismatch count
   - active-speaker-in-reaction count
   - layout summary
   - sync residuals by window

8. Keep reaction mandatory but controlled.
   - Do not remove reaction PiP.
   - Reaction PiP must follow the active speaker layout:
     - active speaker main frame
     - non-active / reacting camera PiP
     - PiP placed away from the active speaker

9. Lock active-speaker rules before polish tuning.
   - No color/premium polish work matters if active speaker, switching, or sync is wrong.
   - The director must fail closed before creating a beautiful wrong edit.

10. Make production fast enough for the product price.

- Use faster-whisper by default for captions.
- Avoid repeated caption passes.
- Cache transcription, sync audio, color receipts, director plans, and source proxies by content hash.
- Use windowed CFR/proxy cache for proof.
- Use GPU/NVENC where Cloud Run hardware supports it; otherwise use predictable x264 settings with lower proof bitrate.
- Add a render tier that disables thumbnail/captions/watermark during proof.

11. Add a user-safe failure state.

- If proof fails, the user should see "needs review / cannot prove sync" instead of receiving a bad finished video.
- Credits should not be charged for a job blocked before expensive render.
- Internal logs should include exact failed window, camera, residual, layout issue, and source file identity.

## Production Rollout Plan

### Phase 1 - Publish Safety

- Do not touch the Episode 1 publish candidate unless a new failure is found.
- Keep the color-safe file as the only full publish candidate in its folder.
- Use the current Episode 1 as a golden regression case for sync, director, PiP, and color.

### Phase 2 - Worker Gates

- Add a `proofOnly` / `planOnly + proofWindows` route for prod.
- Run proof windows automatically before full render:
  - `0-60s`
  - around `25-30%`
  - around `50%`
  - around `75%`
  - final `2-3min`
- Gate must fail if any window has:
  - sync residual above threshold,
  - active speaker in reaction,
  - active speaker not primary when reliable,
  - delayed active-speaker join above allowed latency,
  - reaction PiP placed on top of the active subject,
  - unexpected HDR/color metadata transition.

### Phase 3 - Speed And Cost

- Produce a cost estimate before render:
  - source duration,
  - camera count,
  - expected proof time,
  - expected full render time,
  - expected Cloud Run cost band.
- Add job timeout and max-cost guards.
- Reuse proof artifacts in full render instead of recomputing sync/channel/color plans.
- Keep full render under a target ratio before prod:
  - proof: much faster than realtime,
  - full render: target near realtime or better for 2 cams / 20 minutes,
  - no hidden multi-hour preprocessing.

### Phase 4 - Prod UI Readiness

- UI must show:
  - proof running,
  - proof passed,
  - full render running,
  - QA passed,
  - unsafe render blocked.
- UI must expose the important receipt:
  - sync status by window,
  - active speaker mismatch count,
  - active speaker in reaction count,
  - reaction side used per camera,
  - render time and estimated cost class.

### Phase 5 - Real User Launch Gate

Do not call Cam Combiner prod-ready until these pass:

- Episode 1 golden case passes from the UI path.
- Episode 2 raw files pass proof mode before full render.
- At least one different podcast setup passes:
  - different room,
  - different camera placement,
  - different external audio start offset.
- A failed/bad sync case blocks before full render.
- A failed/bad director case blocks before full render.
- Render time and Cloud Run cost are inside the business limit.

## Do Not Do

- Do not call the cam combiner fixed from logs only.
- Do not deploy this as fixed until proof videos and QA report pass.
- Do not remove reaction to hide mismatches.
- Do not start expensive full renders before proof windows pass.
- Do not rely on cam1/cam2 identity as physical left/right placement.
- Do not ask users to manually fix sync as the normal product path.
- Do not run full prod renders before proof windows pass.
- Do not present unsafe renders to users as successful.
