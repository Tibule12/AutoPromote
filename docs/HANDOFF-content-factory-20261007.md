# AutoPromote private Content Factory handoff — 7 October 2026

**Latest checkpoint:** read `HANDOFF-START-HERE-20261007.md` first. The user
explicitly stopped all work after the original-logo delivery. The original
logo ident is unfinished, NVIDIA is stopped, and the former preview processes
are no longer running. This document retains detailed earlier evidence.

## Current state

The NVIDIA L40S session is **stopped**. The user extended the previous 14:00
SAST cutoff to 16:00 SAST. The detached watchdog called `brev stop` at its
scheduled deadline, and an independent subsequent `brev ls` reports STOPPED.
No inference was active at cutoff. See
`reports/content-factory-20261007/gpu-shutdown-receipt.json` and
`gpu-final-provider-status.log`. Do not restart paid GPU work without a new
authorized window. No different machine, GPU or external generation API was used.

Earlier local preview addresses (currently offline; old PIDs are historical):

- Private viewing room: http://127.0.0.1:3096/review.html — former PID 145403.
- Actual signed-out Studio fixture: http://127.0.0.1:5009/?fixture=factory — former PID 148363.

All existing/staged changes, CPU fallbacks, rejected takes and native artifacts
remain intact. Nothing was committed, pushed, deployed or publicly released.

## New film to inspect

`reports/content-factory-20261007/outputs/local-cpu/transformation-prototype/v21/final.mp4`
is the viewing-room hero: 11.583 seconds, 1920×1080 upscale, H.264/AAC stereo.
SHA-256: `10b7a0377e61e73ce01cbf1299dbf597c617bca48e0dcd48fb25908803db46e3`.

It contains actual VACE-generated paper-to-yacht transformation, a matching
moving yacht continuation and the editable cinematic ident. Generated music,
CPU standard-voice narration and separately editable fold/water/rise/impact
sound are mixed by the existing canonical renderer. The material impact is
timed at 2.35 seconds. Story decisions are explicit in
`transformation-direction-v21.json`; accepted private assembly sources are
bound to their reviewed hashes in `transformation-selection-v21.json`.

This is a **private prototype with real progress**, not approved premium or
public marketing. The early mast/sail appears before the paper form clearly
joins it, the desk-to-ocean change is rushed, spray obscures part of the hull
material change, and continuation lighting/composition changes. Narration
overlaps the opening of the ident. Native generated video is 832×480. Human
listening and founder creative approval remain pending.

Root inspected sixteen actual source frames and twelve final frames. Full
decode, duration, stereo audibility and no-clipping checks passed. The actual
browser played/sought the film, verified 206 byte ranges and downloaded exact
matching bytes. A fresh browser operator reopened its journal and reverified
the retained film without another download. See:

- `controlled-transform-creative-review-v17.json`
- `transformation-prototype-creative-review-v21.json`
- `browser-agent-private-film-v21/verified-film.json`
- `browser-agent-private-film-v21/verified-restart.json`
- `outputs/local-cpu/transformation-prototype/v21/render-receipt.json`

The earlier Studio/source assembly film remains available separately at
`outputs/local-cpu/footage-proof/v20/final.mp4`. The actual Studio fixture was
rebuilt from the new transformation and yacht sources using selection v22,
with canonical document hash
`feff45c2170e0f8cb345340f9b619a02b17503a5b652e8c959efe3208387b4ee`.
Open its saved project from the library for the complete two-source assembly.
The earlier v17 UI capture belongs to its earlier assembly and must not be
presented as a capture of the new transformation. `studio-transformation-v22.json` records actual new-source playback and verified semantic pause/play/pause actions. An earlier smoke guessed a combined label that did not exist; recovery inspected the actual state-dependent labels and succeeded.

## What changed the footage result

Earlier first/last-frame 14B takes hard-cut or duplicated vessels. Whole-video
5B and 14B SDEdit adaptations retained miniature CGI/disc water; all remain
rejected. Repeating those seeds/strength adjustments is not a creative repair.

The new private experiment uses the trained control stream of official
`Wan-AI/Wan2.1-VACE-1.3B-diffusers`, revision
`ec4d2cb062b548996b179d493fdd05340de702a1`. Its official component bytes were
verified; retained 5B text-encoder tensors are byte-identical to the official
VACE component. Preparation and receipts are preserved in
`vace-model-receipt.json` and `vace-model-preparation.log`.

CPU-evaluated geometry from the editable connected v12 `.blend` masks Canny
control maps to the boat, removing the disc/workbench background edges. The
offline NVIDIA run uses photographic first/last conditions, reactive middle
control frames and a yacht reference. It completed in 390.9 seconds on L40S;
source SHA is
`0bdd08d05b04d6977bd6fa766e8d92346693750c264349d4ee43001fc2d09bb8`.
See `assets/founder-control-transform-v17/receipt.json` and the scripts
`project-motion-guide.py`, `prepare-structural-guide.py`, and
`generate-controlled-video.py`. This adapter is experimental and is not a
qualified/default production provider.

A future corrective test should address premature yacht/mast conditioning
and give the environment/material change more time. The extra full-yacht
reference is a plausible cause of early mast appearance; that is an inference,
not established evidence. Inspect the actual control maps and endpoint images
before changing conditioning. Do not hide the defects with more effects.

## Private backend and screenplay foundations

The implemented path is screenplay understanding and generated scenes, not
more manual multicamera controls. New contracts preserve exact source bytes,
UTF-16 offsets, scene/dialogue references, stable entity IDs, planned continuity
and provenance. Character-reference consistency and dialogue alignment remain
explicit execution blockers rather than silently dropping script material.
Scene jobs reuse the ordinary Factory, intelligence, Director/canonical
compiler and renderer. Ordered scene assembly retains reviewed scene audio;
assembly preparation is CPU-only and does not claim a finished movie.

Actual NVIDIA planning of `screenplays/one-sheet.fountain` ran. Two initial
source-grounding failures were rejected. Paired prop-name/source-quote grammar
then produced two source-contract-valid plans. Root creatively rejected them
for invented memory/lost-dreams backstory, weak prop/coreference identities and
separate shots hiding the continuous transformation. No scene inference was
launched from those plans. `screenplay-creative-review-v3.json` records both
plan hashes and actual generation rejection.

`reviewScenePlan` and CLI `--review-plan` persist hash-bound written-plan
reviews. Rejection blocks queueing, inherited later planning and assembly;
the ordinary worker rechecks before inference/rendering, including previously
queued work. Full plan-version rollback, prop aliases/coreference, autonomous
creative replanning and whole-film generation still need qualification.
Use a corrected new production request instead of overwriting the failed bible.

Private founder/allowlist/disabled-by-default API gates remain. No customer
frontend was added. See `docs/content-factory.md` and
`docs/movie-production-direction.md` for current executable entry points.

## Browser agent and verification

The standalone agent remains under `scripts/browser-agent`: screenshot and
semantic/context observation, reasoned single actions, explicit outcome
verification, durable intent, layout/DOM recovery, modals/redirects/errors and
failure evidence. It has no CAPTCHA bypass, stealth, fingerprint spoofing or
fake human identity behavior.

New durable download receipts contain filename, path, byte count and SHA.
Restart rechecks actual retained bytes; changed/missing bytes cannot establish
success, and unresolved authorized actions are not repeated. Observation IDs
continue across restart. Thirteen actual browser checks pass, including the
new restart/tamper test; earlier real NVIDIA navigation evidence remains under
`reports/browser-agent-nvidia-20261006`. Today's gallery actions are manually
reasoned controller runs, not claimed as new model-driven navigation.

`factory-screenplay-tests-final.json` records 53 passing backend tests across
five suites. Actual CPU media verification, route guards, source/dialogue/
continuity contracts, creative rejection and queued-work guards are covered.
These tests do not establish movie-quality generation. Earlier actual Studio
17+8 interaction checks and timeline qualification remain separately recorded;
the production bundle was preserved.

## Transport and CPU render notes

The instance unexpectedly reported STOPPED at about 15:19 SAST before the
watchdog ran; cause is unknown. It resumed within the existing authorization.
Its Brev proxy then refused SSH before authentication despite RUNNING/READY.
The existing host connection on port 22 recovered access and confirmed idle
NVIDIA L40S and intact retained models. `CONTENT_FACTORY_NVIDIA_SSH_PORT`
now consistently supports SSH, SCP and owned-container cleanup. Do not reset
the instance or discard caches to solve a transport failure.

New final renders were entirely local CPU via the unchanged main Python
renderer. `/tmp/autopromote-private-cpu-render-20261007/worker` contains copied
Python code only; no env/credentials were copied. The invocation uses an empty
environment plus CPU/status flags and substitutes local artifact transport.
No parallel editor or alternate compositing implementation was introduced.
The earlier temporary Python runtime was `/tmp/autopromote-studio-vfx-20261007`.
It and the earlier isolated CPU renderer copy are missing in the current
environment; do not assume those historical runtime paths remain usable.

Read `reports/content-factory-20261007/README.md` for the evidence index.

## Subsequent original-logo request

The founder rejected the existing wordmark ident and then explicitly requested
a new AutoPromote logo from scratch. The first corrective attempt selected an
older rocket image without establishing the approved current asset; it was
stopped and remains unintegrated. See `idents/logo-correction-paused.json`.
Two new preparation scripts and its raster-specific scene are unfinished;
do not present them as the delivered brand or a qualified Factory template.

The subsequent original logo is in `assets/brand/autopromote-original-v1`:
an authored two-part AP symbol, outlined AutoPromote wordmark, transparent
light/dark/monochrome SVG and PNG variants, and app icons at 24–256 pixels.
The R-like first study was rejected for ambiguous initials; the final source
reads AP in colour and monochrome. Source geometry, story decisions, hashes,
typography license and export verification are included. The generator is
`scripts/content-factory/create-original-brand.py`; it uses CPU vector/raster
preparation, no image-generation API and no GPU. NVIDIA was again observed
STOPPED. No public app branding was changed.

The new SVG/Bézier source still needs a qualified backend ident adapter and
actual animation/sound review. The older rocket adapter hardcodes thirteen
raster components and must not be used for this two-part vector logo.
