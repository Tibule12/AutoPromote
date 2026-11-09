# AutoPromote — start here in the next chat

Permanent Studio source of truth: read [STUDIO-COMPLETION-CONTRACT.md](STUDIO-COMPLETION-CONTRACT.md), [STUDIO-PRODUCT-READINESS.md](STUDIO-PRODUCT-READINESS.md), and the capability/combination/parity matrices they link **first**. The October 8 repair checkpoint below is preserved execution evidence, not the current completion classification. Continue the shared-system backlog from the readiness file.

Latest continuation: read [HANDOFF-studio-reliability-repair-20261008.md](HANDOFF-studio-reliability-repair-20261008.md) first for the current shutdown state, real NVIDIA QA, fixes and readiness. The remainder is preserved historical context; do not restart creative/logo work or paid jobs merely from these notes.


Checkpoint: 7 October 2026, Africa/Johannesburg (SAST).
This is the latest handoff and supersedes older active-task/process notes.

## Stop state and authorization

The user's last operational instruction was **“just fucken stop shit”**.
Work was stopped. The subsequent request authorizes this handoff only.
**Do not resume implementation, generation or rendering merely because this
file exists. Wait for the user's new instruction.**

The existing Brev instance `autopromote-l40s-staging`, ID `xgh6wcu74`, is
**STOPPED**, independently rechecked with `brev ls` while preparing this
handoff. Its latest authorized window ended at **16:00 SAST on 7 October**.
Earlier 22:02 SAST / 14:00 SAST cutoffs and extensions are historical; they
do not grant a new GPU window. Do not restart paid GPU work without a newly
authorized window. Retain the stopped instance, disks and model caches.

The local process check found no running Blender renders, Content Factory
workers, screenplay workers or previous review/Studio preview processes.
The former links on ports **3096 and 5009 are currently offline**; old PIDs
145403 and 148363 are historical. Generated files remain on disk.

## Workspace and preservation

- Repository: `/home/tibule12/Projects/AutoPromte/AutoPromote-staging-browser-20261004`
- Branch: `agent/director-analysis-staging-browser-v1`
- HEAD: `7f7530ad746050c094bfc78d0921190da98d2098`
- The worktree has extensive staged, unstaged and untracked changes, including
  prior user work. **Do not reset, clean, discard, overwrite or bulk-stage it.**
- No commit, push, merge, deployment or public release was performed by this
  continuation. Keep the Content Factory founder/admin-only and disabled by
  default. Preserve CPU fallbacks and existing renderer/Director contracts.
- Current GPU work uses only the existing NVIDIA instance. No new machine,
  external generation API or cloud credential upload is authorized. No Google
  action is authorized by this handoff. A separate earlier RTX qualification
  report exists; it is not proof that this new Factory/movie pipeline was
  tested on RTX PRO 6000.
- Never add CAPTCHA bypass, stealth, fingerprint spoofing or fake identities.
- No subagents were used. Current instructions require explicit delegation
  authorization before spawning them.

## Product and creative requirements to preserve

AutoPromote competes with its own finished results, not feature parity with
CapCut/Premiere/DaVinci/After Effects. Ordinary raw material or just a brief
must become a compelling story: stop viewers, build interest, reach a payoff,
and make them ask how it was made. Every effect must advance the story.
Technical success is not creative acceptance.

Every piece needs explicit `about`, `whyCare`, `hook`, `beginning`,
`development`, `tension`, `payoff`, `ending`, `withheld`, `amplify`, `remove`.
Inspect actual output, identify boring/confusing decisions, correct them,
then rerender. Do not spend on repeated seeds without a specific correction.

The paper-boat showcase must be **one continuous world/material/scale
transformation into a full-size yacht at sea**, not paper footage followed
by a cut to yacht footage. Geometry, water, light, camera and sound should
make the transition itself the creative event.

The movie goal is **screenplay-to-film**, not requiring users to provide
multicam footage or adding more manual controls. It includes scene/character/
location/prop understanding, generated shots/audio, continuity, assembly,
sound/VFX/music, self-review and final rendering.

The founder is disappointed with both creative results and GPU spending.
Do not respond with inflated readiness claims, another static placeholder,
or a feature list. Provide honest finished work and bounded corrections.

## Implemented and verified — with explicit limits

| Area | Implemented/tested | What this does not establish |
| --- | --- | --- |
| Private Content Factory | Founder allowlist, private disabled-by-default routes, owner-scoped durable jobs, idempotency/leases, brief/story/script/assets, immutable attempts, provenance and reusable references, review/reject/retry, existing intelligence/Director/compiler/renderer integration | Reliable unattended premium content from arbitrary briefs is not achieved |
| Screenplay foundations | Exact source hashes and Unicode/CRLF offsets, bounded Fountain/plain-text scene/dialogue parsing, grounded entity references, scene/shot plans, planned continuity, Factory child jobs and ordered reviewed-scene assembly preparation | Finished autonomous movies, persistent characters, aligned spoken dialogue and full continuity are not qualified |
| Creative plan rejection | Hash-bound `reviewScenePlan`, private CLI review, rejection guards before queue/inference/render/assembly including already queued children | Creative model reasoning and autonomous corrected replanning are not reliable |
| Browser agent | Standalone observe/reason/act/verify/recover loop, screenshot/semantic state, durable intent, changed DOM/modal recovery, outcome/evidence handling, duplicate consequential-action protection, restart-safe download size/SHA receipts | Arbitrary-site/authenticated/canvas interaction quality has not been broadly qualified |
| Studio interactions | Source clock/load/seek/play-intent fixes, source switching/EOF/loop, trim/scrub/undo/redo/storage and responsive controls, actual renderer requests | All Studio features and creative results are not release-qualified; timeline aesthetics remain disputed |
| VFX/media engineering | Prior export timing repair, source-bound SAM2 tracking with shot resets, subject VFX and preview/final pixel checks, CPU fallbacks, actual Blender OptiX and FFmpeg NVIDIA qualification | Production-quality hair edges, automatic planar tracking and complete Director/server VFX integration remain outstanding |
| New original logo | Original two-part AP vector mark plus outlined AutoPromote wordmark, light/dark/monochrome SVG+PNG exports and 24–256 px app icons | It is static artwork for founder review, not an approved brand rollout or finished cinematic ident |

### Latest recorded test evidence

These are existing results, not tests rerun during handoff preparation:

- `reports/content-factory-20261007/factory-screenplay-tests-final.json`:
  **53 passes, five suites, zero failures**. Suites: `contentFactory`,
  `adminContentFactoryRoutes`, `contentFactoryArtifactAccess`,
  `screenplayProduction`, `screenplayGroundingSchema`.
- `reports/content-factory-20261007/browser-agent-tests-recovered-final.log`:
  **13 actual Playwright/browser checks pass**, including download restart and
  byte-tamper handling. Earlier failed runs remain separate.
- `studio-host-v2/receipt.json`: 17 actual component/native-media checks.
- `studio-sequence-final-v2/browser.json`: eight additional Studio checks.
- `studio-transformation-v22.json`: actual new-source playback and three
  verified semantic pause/play/pause actions, not full trim/export requalification.
- Timeline evidence: `reports/studio-timeline-readability-20261007/receipt.json`.
  Passing interaction/layout checks do not mean the founder liked the look.
- Original-logo export verification:
  `assets/brand/autopromote-original-v1/verification.json` verifies 16 SVG/PNG
  artifact hashes, transparent exports and requested app-icon dimensions.

Mocked generation tests establish contracts, not film quality. Headless muted
playback, audio measurements and ASR do not substitute for human listening.

## Existing films and creative failures

All paths below are relative to `reports/content-factory-20261007`.

### Latest assembled prototype, not approved marketing

`outputs/local-cpu/transformation-prototype/v21/final.mp4`

- 11.583 seconds, 1920×1080 upscale, H.264/AAC stereo.
- SHA-256: `10b7a0377e61e73ce01cbf1299dbf597c617bca48e0dcd48fb25908803db46e3`.
- Actual generated transformation → moving yacht continuation → old cinematic
  wordmark ident, with music, narration and fold/water/rise/impact sound.
- Compiled/rendered through existing Director/canonical/main Python renderer
  on local CPU. Full decode, duration, stereo/no-clipping, browser playback,
  seeking, ranges, exact download SHA and journal-restart checks passed.
- **Not approved for public marketing.** Early mast appears before coherent
  joining; desk-to-ocean change is rushed; spray hides hull material change;
  continuation light/composition shifts; narration overlaps ident opening.
  Native generated video is 832×480. Founder rejects the old logo treatment.
- Evidence: `transformation-prototype-creative-review-v21.json`,
  `transformation-direction-v21.json`, `transformation-selection-v21.json`,
  `browser-agent-private-film-v21/verified-film.json`, `verified-restart.json`.

### Best raw transformation experiment

`assets/founder-control-transform-v17/video.mp4`

- 5.0625 seconds, 81 frames at 16 fps, 832×480.
- SHA-256: `0bdd08d05b04d6977bd6fa766e8d92346693750c264349d4ee43001fc2d09bb8`.
- Official Wan VACE 1.3B, pinned revision
  `ec4d2cb062b548996b179d493fdd05340de702a1`, trained control pipeline on
  NVIDIA L40S. 390.9-second run; controls/first-last photos/settings retained.
- Actual continuous paper/water/sail/hull/world development improved on earlier
  flat-disc CGI. Accepted **only for private prototype assembly**.
- Experimental `generate-controlled-video.py` is **not registered or qualified
  as a default production provider**.
- Next plausible correction: more time for world/material expansion and less
  premature full-yacht/mast conditioning. The extra yacht reference being a
  cause is an inference, not proven. Inspect controls before changing them.

`generated/real-voyage-v6.mp4` is usable moving full-size mahogany yacht footage;
it does not satisfy the requested wide aerial pullback. The earlier Studio
proof is `outputs/local-cpu/footage-proof/v20/final.mp4`.
`ui/studio-source-assembly-v17/video.mp4` captures the historical earlier
assembly; do not claim it shows the current transformation project.

Earlier first/last 14B v7/v8, 5B whole-guide v13/v14, and 14B SDEdit v16
are rejected for cuts/duplicate vessels/miniature CGI/disc water. Connected
editable 3D v12 is a **motion guide only**, not approved realistic footage.
Do not repeat these failed recipes as though more seeds will fix them.

## Logo and ident — exact last point

1. Four older rendered directions remain at
   `reports/content-factory-20261007/idents/{cinematic-v2,compute,minimal,creator}`.
   They have native `.blend`, sound and receipts, but **the founder rejected
   the creative quality**. The cinematic version mostly sweeps light across
   already-visible text; it fails the requested studio ident.
2. A corrective attempt chose the old rocket raster without establishing it
   as the approved logo. The founder challenged that choice and it was stopped.
   `idents/logo-correction-paused.json` records the stop. Its preview scene and
   `scripts/content-factory/{prepare-logo-geometry,make-layered-brand-ident}.py`
   are unfinished experiments, not delivered/qualified templates.
3. The founder then explicitly requested a **new logo from scratch**. Files are
   in `assets/brand/autopromote-original-v1`:
   `brand-preview.png`, `autopromote-logo-dark.svg/.png`, light/monochrome
   variants, standalone symbol and app-icon exports, `logo-geometry.json`,
   `brand-asset.json`, license/verification/README. Generator:
   `scripts/content-factory/create-original-brand.py`.
   This was authored vector artwork, CPU only; no image-generation tool/API ran.
   The first R-like study was rejected; the latest draft reads AP. **No founder
   approval or public app branding replacement occurred.**
4. The user asked what to do with the static asset. The assistant said it would
   finish the reusable animated ident and three playable sound-bearing versions.
   **That promise was not fulfilled.** Only read-only inspection occurred after
   that message; no new AP ident scene, animation, sound or provider integration
   was produced. The user then explicitly stopped all work.

If the user resumes ident work, the missing next implementation is an exact
SVG/Bézier-to-native-3D adapter for the new source, retaining both symbol parts,
outlined glyphs, original spacing and hole geometry. The old rocket adapter
hardcodes thirteen raster components and must not be repurposed by pretending
the new two-part AP logo has that topology.

The required new ident is 3–6 seconds: dark opening, anticipation, layered
geometry/material emergence, controlled push/parallax, premium reflections,
purposeful energy only, sound rise/impact synced to full logo lockup, clean
readable hold. Test cinematic metallic/glass, AI/data-energy and premium minimal
light-sweep directions. Timing, camera, materials, lights, particles and sound
must be editable backend template controls. A fade plus glow fails.
Do not call a static vector draft or successful `.blend` save a finished ident.

## Screenplay and production blockers

Actual pinned Qwen3-VL planning of `screenplays/one-sheet.fountain` ran. Initial
source/prop grounding failures were rejected. Paired prop/quote grammar then
produced source-contract-valid plans, but they were **creatively rejected**:
invented memory/lost-dreams backstory, action fragments treated as props,
unresolved paper-boat coreference, premature yacht reveal and separate shots
concealing the continuous transformation. No scene inference ran from them.
See `screenplay-creative-review-v3.json`.

Outstanding: better screenplay creative reasoning, entity aliases/coreference,
safe plan-version/bible rollback, character reference consistency, dialogue
generation/alignment, autonomous sound/music decisions, long-film partitioned
storage, whole-film review and complete screenplay-to-film qualification.
Current character/dialogue execution guards must remain; do not omit words or
silently execute unsupported plans. Existing plans cannot be overwritten as
though their downstream continuity hashes were unchanged.

## Where the implementation lives

- Factory: `src/services/contentFactory{Contract,Service,Store,Providers,Schemas,ArtifactAccess,IntelligenceAdapter,StudioAdapter}.js`.
- Private routes: `src/routes/adminContentFactoryRoutes.js`.
- Movie foundations: `src/services/screenplay{ProductionContract,ProductionService,ProductionSchemas,GroundingSchema}.js`.
- Entry points: `scripts/run-content-factory.js`, `scripts/run-screenplay-production.js`.
- Standalone browser operator/planners: `scripts/browser-agent/`,
  `scripts/run-browser-agent.js`, `scripts/run-nvidia-browser-planner.py`.
- Studio current-state playback fixes: `frontend/src/components/ViralClipStudio.js`.
- Contracts/usage: `docs/content-factory.md`, `docs/movie-production-direction.md`,
  `docs/browser-agent.md`, `docs/autopromote-creative-objective.md`.
- Earlier VFX limits/evidence: `reports/vfx-l40s-20261006/README.md` and
  `docs/HANDOFF-l40s-vfx-20261006.md`. Their active-process notes are historical.
- Detailed October 7 generation evidence:
  `docs/HANDOFF-content-factory-20261007.md`, `reports/content-factory-20261007/README.md`.

## Environment and GPU transport facts

- Brev binary: `/home/tibule12/.local/bin/brev`.
- Remote private root: `/data/autopromote-content-factory-20261007`.
- Retained original models: `/data/autopromote-l40s-20261006/models`.
- Before future authorized GPU launch, check current `brev ls`, actual
  `nvidia-smi` compute apps and Docker jobs; use the exclusive
  `/data/autopromote-l40s-20261006/content-factory-gpu.lock`.
- Preserve models/runtime images. A proxy failure was recovered with the
  **same instance's** host SSH alias `autopromote-l40s-staging-host`, port 22.
  Optional `CONTENT_FACTORY_NVIDIA_SSH_PORT=22` is wired consistently for SSH,
  SCP and cleanup. Do not reset the instance to fix transport.
- Node dependencies remain at
  `/home/tibule12/Projects/AutoPromte/AutoPromote/node_modules` (`NODE_PATH`).
- The old `/tmp/autopromote-studio-vfx-20261007` Python and isolated movie
  renderer copy **are missing in the current environment**. Recreate only if
  needed after an explicit resume; do not assume older runtime paths work.
- Current CPU logo-design venv:
  `/tmp/autopromote-logo-design-20261007/bin/python` (fonttools/CairoSVG/Pillow).
- Current local official Blender 4.5.3:
  `/tmp/autopromote-ident-cpu-20261007/blender-4.5.3-linux-x64/blender`.
  Official download checksum verified; receipt at
  `reports/content-factory-20261007/idents/local-blender-runtime-receipt.json`.
  This is a CPU local runtime, not the remote 4.5.9 OPTIX runtime.
- Local Blender CPU previews were slow. A forced Mesa llvmpipe test was a
  software-rendered single-frame experiment, not NVIDIA, not a final ident,
  and not a qualified backend path. Do not claim it solved performance.

### If explicitly asked to view preserved films

The private gallery can be restored, after checking port availability, using
`python3 scripts/content-factory/serve-review.py --root reports/content-factory-20261007 --port 3096`.
It binds loopback, supports byte ranges and blocks private JSON/native files.
It needs no GPU. A process must actually be kept alive and the URL verified
before sharing it. The saved Studio fixture descriptor is
`reports/content-factory-20261007/studio-fixture-project.json`; follow the
existing preview scripts rather than inventing a second editor.

**Nothing in this handoff authorizes restarting stopped work or spending on
another GPU session.** The next chat should read it, acknowledge the actual
state, and follow the user's new instruction.
