# Cam Combiner Prod Sync Handoff

Last updated: 2026-06-03

## Current Situation

We are testing AutoPromote Cam Combiner on production with two iPhone camera files plus external Behringer/Audacity clean audio.

The main issue today was that production sync was showing "high confidence" while visual lips and external clean audio were still mismatched. The user correctly rejected any workflow that depends on users manually nudging offsets. Cam Combiner must automatically sync camera visuals to the external clean audio, protect start/mid/late drift zones, and block render before credits are spent if sync cannot be proven.

## Product Rule

Manual offset adjustment is only an emergency/debug escape hatch.

Normal user flow must be automatic:

1. User uploads cameras and external clean audio.
2. Worker calculates provisional sync.
3. Before render, export runs automatic start/middle/end preflight verification against the actual uploaded render-window media.
4. If preflight proves all cameras, render starts.
5. If preflight cannot prove all cameras, render is blocked before paid render begins.

Do not ask users to manually nudge/lock offsets as the product solution.

## Deployed Changes

### Commit `b9631c34` - `Fix automatic multicam sync verification`

Key changes:

- Frontend render/export path now runs automatic preflight sync for external clean audio before calling the paid render endpoint.
- Preflight no longer skips fast upload proxy media.
- Export creates a render-window clean-audio copy and passes its true timeline offset to preflight.
- If start/middle/end preflight cannot verify all camera sources, export throws before render begins.
- Backend forwards `external_audio_offset_seconds` to the worker.
- Python worker offset sign was corrected:
  - Old logic could convert a positive detected camera delay into a negative UI offset, which advanced the camera visually.
  - New logic applies `external_audio_base_offset + detected_delta`.
  - Intercam rescue path was corrected the same way.

Files touched:

- `frontend/src/components/MultiCamCombiner.js`
- `src/mediaRoutes.js`
- `src/services/videoEditingService.js`
- `python_media_worker/main_media_server.py`

Verified locally:

- `npm --prefix frontend run build`
- `npm run test:routes`
- `python3 -m py_compile python_media_worker/main_media_server.py`

### Commit `a34576e2` - `Clarify automatic multicam sync proof`

Key changes:

- Removed normal-flow UI language that told users to "nudge" or "Lock Offset" before export.
- New UI says machine sync is provisional and export will automatically verify start/middle/end sync before rendering.
- Renamed visible manual button from `Lock Offset` to `Mark Reviewed` to make it clear this is not the core automatic product flow.

## Production Deploy State

Frontend:

- Live `autopromote.org` bundle verified after deploy: `main.e6536e1d.js`
- Live bundle contains:
  - `Machine sync calculated. Export will automatically verify start/middle/end sync before any render starts.`
  - `Automatic export proof pending`
  - `Preflight proved start/middle/end sync`
  - `external_audio_offset_seconds`
- Old normal-flow strings like `nudge any lip mismatch` and `Lock Offset` were not present in the live grep result.

Worker:

- Service: `cam-combiner-worker`
- URL: `https://cam-combiner-worker-341498038874.us-central1.run.app`
- Revision: `cam-combiner-worker-00008-szj`
- Health check returned OK:
  - `status: ok`
  - `service: python_media_worker`
  - `worker_state.status: idle`
  - `whisperReady: true`

## Credit State

Bad sync test charges were refunded earlier.

Important policy going forward:

- Render credits should not be charged if automatic preflight fails before render.
- If sync/preflight fails, debug the preflight job and payload first. Do not start a full render.

## Known User Test Files / Scenario

The user is testing with:

- Camera file example: `IMG_4199.MOV`
- External clean audio: `UNMUTED.wav`
- Clean audio size shown in browser: about `426.9MB`
- Camera files can be very large, including about `7.75GB`
- The cameras were started before Audacity/Behringer clean audio, so sync cannot assume a clap or aligned file starts.
- Local testing had previously passed start/mid/late drift windows, but production had mismatches due to prod upload/preflight differences and offset sign/origin issues.

## What To Test Next

Do not start with a full paid render.

Next safe prod test:

1. Hard refresh `autopromote.org`.
2. Load the same two camera files and `UNMUTED.wav`.
3. Let clean-audio sync finish.
4. Start export only to trigger automatic preflight.
5. Confirm one of these outcomes:
   - Good: `Preflight proved start/middle/end sync. Rendering with verified offsets.`
   - Bad but safe: export blocks before render because preflight cannot verify sync.
6. If it renders, spot-check:
   - first 4 minutes
   - middle
   - final 2 minutes
   - both camera angles against external audio

If Program Output still looks wrong before export, remember that Program Output may show provisional machine sync. The hard gate is now export preflight. If export preflight says success but output is wrong, that is a bug in preflight verification and must be debugged with the exact payload, uploaded proxy media, offset origin, and detected candidates.

## Debug Checklist If Prod Still Fails

If prod returns high confidence but visual lips are wrong, inspect:

- Browser bundle version.
- Worker revision.
- Exact `/multicam/preflight-sync` payload.
- `external_audio_offset_seconds`.
- Camera upload proxy `trimStart`.
- Render window start/duration.
- Per-camera `upload_trim_start`.
- Camera file duration and audio stream info.
- Detected sync candidates at start/middle/end.
- Whether the worker offset sign is being applied consistently.
- Whether preflight is comparing camera audio to the correct clean-audio window.

Do not render video while debugging this. Only debug sync/preflight first.
