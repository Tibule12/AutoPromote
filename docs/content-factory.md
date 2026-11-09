# Private AutoPromote Content Factory

This is a founder/admin backend workflow. It is disabled by default and has no
customer UI, public generation endpoint, publishing integration or subscription
change. A brief describes the story; the factory owns raw material, editorial
assembly and private review. A successful render alone never marks a film ready.

## Entry points

`/api/admin/content-factory` uses the existing authentication and admin middleware,
then requires `CONTENT_FACTORY_ENABLED=true` and an explicit UID in
`CONTENT_FACTORY_ADMIN_UIDS`. Jobs and founder reviews are scoped to that UID.

- `POST /jobs`: `{requestId, brief, targets?, maxAssetAttempts?}`.
- `GET /jobs/:jobId`: direction, attempts, provenance, evidence and outputs.
- `POST /jobs/:jobId/cancel` or `/retry`: durable cancellation/recovery.
- `POST /jobs/:jobId/outputs/:outputId/review`:
  `{artifactSha256, accepted, note}` binds founder review to the latest bytes.
- `POST /screenplays`: `{requestId, title?, format, text}` imports a private
  Fountain/plain-text screenplay with exact source hashes and scene offsets.
- `GET /screenplays/:productionId`: owner-scoped screenplay breakdown and plans.

HTTP submission only queues work. Run `scripts/run-content-factory.js` separately
with the explicit owner UID, artifact root, existing NVIDIA SSH host/private data
root and authorized GPU deadline. `--firestore` uses the same queue as the API;
the default local store is private, atomic and useful for founder development.
`--worker` processes only the configured owner's queued jobs. `--job` resumes a
job; `--retry` requeues a failed/rejected job within its bounded retry allowance.
`--brief-file` and `--request` create an idempotent request. `--direction` accepts
a supplied creative direction for deliberate founder-directed campaigns.

Required worker configuration:

```sh
CONTENT_FACTORY_ENABLED=true
CONTENT_FACTORY_ADMIN_UIDS=<founder-uid>
CONTENT_FACTORY_NVIDIA_SSH_HOST=<existing-authorized-instance>
CONTENT_FACTORY_NVIDIA_ROOT=/data/<private-factory-root>
CONTENT_FACTORY_PYTHON=<python-with-Pillow-numpy>
```

Use `--gpu-window <receipt.json>` containing `deadline_epoch`, or configure
`CONTENT_FACTORY_GPU_DEADLINE_EPOCH`. Provider configuration is administrator
configuration, never brief-supplied shell code, host, URL or model endpoint.
The GPU must be idle and an actual NVIDIA L40S before inference. GPU jobs share
an exclusive lock, have named containers, bounded execution and cancellation.
Closing SSH does not count as stopping a GPU job. Offline inference containers
have no network. Generation never uses Google or an external generation API.

## Story and assets

Direction explicitly defines about, why care, hook, beginning, development,
tension, payoff, ending, withheld information, amplification and removal.
The planner stages story/script, raw requirements and edits separately. Exact
asset IDs from the requirements constrain the edit planner. Source trims and
programme positions have separate meanings; an unambiguous cumulative-position
mistake is repaired with a recorded contract repair. Other invalid ranges fail.

Each generation attempt keeps its brief/hash, direction/hash, prompt, model and
revision, settings, seed, artifact SHA, native references, machine review and
used-in output references. Rejected attempts survive regeneration. Failed critics
resume the saved bytes. Accepted material feeds the existing project intelligence,
Director `trim_clip` command kernel, canonical document/compiler and main Python
renderer. No separate editor or compositing stack was created.

Providers are modular: Wan text/image-conditioned video tooling, SDXL native
images plus honestly labelled timed stills, bounded Blender scenes, actual local
Studio UI capture, existing Studio motion graphics, Kokoro synthetic brand
narration and original procedural sound. CPU narration, motion, audio and encoding
explicitly hide NVIDIA devices. Existing Studio CPU fallbacks remain available.
The factory's remote worker still requires its configured instance to be running;
it does not provision or restart infrastructure itself.

The private `wan_i2v_a14b` profile uses pinned official Wan2.2 I2V-A14B weights
(`596658fd9ca6b7b71d5057529bbf319ecbc61d74`) at 832×480, 16 fps and 40 steps.
The default `wan_ti2v_5b` profile is preserved. Larger generation requires an
earlier accepted `referenceAssetId`; `referenceTime` selects its decoded frame.
Optional `lastReferenceAssetId`/`lastReferenceTime` condition the ending from
another earlier accepted source. Both input SHA values, source SHA values and
source times are retained. Ending-frame conditioning is unavailable on the
default 5B profile. Optional `negativePrompt` is bounded prompt data.

The 14B profile produces 81 frames (5.0625 s), or 121 frames (7.5625 s) when
the requested duration exceeds 5.0625 s. Launch requires 30 or 45 authorized
minutes respectively; an exclusive GPU lock and deadline checks still apply.
Native generation resolution and the final renderer's upscaled output
resolution remain distinct. Matched endpoints do not establish a continuous
transformation: October 7 take v7 still inserted a hard cut and was rejected.

`ace_step` is a private NVIDIA instrumental audio provider, limited to 10–60
seconds. It uses official ACE-Step v1 3.5B weights pinned to
`82cd0d7b6322bd28cd4e830fe675ddb6180ce36c`, Apache-2.0, with separate pinned
runtime code and native/normalized WAV artifacts. It does not call a hosted
music service. The procedural `original_audio` provider remains the CPU
fallback. Generated music remains pending listening review even when its
sample measurements pass.

`blender` can select the bounded `blenderScene: "paper_to_yacht"` template
for 4–8 second `three_d` assets. Its native scene retains hull/sail shape keys,
paper-to-timber/canvas material animation, mast/rigging growth, ocean expansion,
wave depth, workbench descent, reflection lighting, camera animation and
fibre-to-spray trajectories. This is an authored private template, not arbitrary
Blender execution or a released customer semantic-morph feature. The existing
paper/ocean template and renderer fallbacks are preserved.

`wan_video_refine` is an experimental full-video conditioning provider using
the retained 5B weights. It requires an earlier reviewed video/3D/motion guide,
`referenceVideoAssetId`, and `refinementStrength` between 0.2 and 0.85. Reference
SHA, uniformly sampled frame hashes, native output and actual model/settings are
retained. It is bounded to 121 frames at 1280×704, 24 fps. October 7 strengths
0.5 and 0.8 preserved the connected motion but retained miniature CGI and flat
water; both were rejected for the requested cinematic transformation. The
separate experimental `refine-conditioned-video.py` combines 14B photographic
endpoints with noised whole-video VAE latents at a matching UniPC flow sigma;
it remains a founder experiment rather than a qualified automatic provider.

## Script-to-film foundations

The movie direction is screenplay → grounded scene breakdown → character,
location and prop bible → motivated shots → generated assets → continuity and
sound review → automatic editorial assembly → final movie review. Recorded or
multicamera footage is not required. These foundations do not add manual
multicamera controls or a customer feature.

`scripts/run-screenplay-production.js` uses the same founder allowlist and
private durable store. `--screenplay <file> --request <id> --format fountain`
imports on CPU. `--production <id> --plan-scenes` uses pinned NVIDIA Qwen3-VL
with source quotes, a stable entity bible, previous-scene context and all eleven
story fields. Invalid source evidence or dialogue assignment is rejected and a
retry receives the specific failure. Source offsets use UTF-16 code units in
the unmodified string; SHA uses its exact UTF-8 bytes. Unicode and CRLF are
covered by qualification tests. The parser supports scene headings, standard
character cues/parentheticals and multiline notes; it is not a complete parser
for every screenplay format. PDF, FDX and unsupported Fountain structures need
their own import adapters and review.

`--queue-scene <sceneId>` makes an idempotent ordinary Factory job from the
validated plan. `--process-scene <sceneId>` runs that job through the existing
generation/review/Director/canonical-render workflow. Parent ownership, source
hash and exact compiled direction are checked. Generated asset provenance and
project-intelligence dependencies retain screenplay, plan and bible hashes.
One-shot scenes do not need invented extra cuts to satisfy a marketing format.
Character designs and planned material/wardrobe states remain intended
requirements, with `requires_visual_verification`; planning never establishes
pixel-level continuity.

Written creative rejections are also executable: `--review-plan <json-file>`
records `{sceneId, planHash, review: {accepted, reason, reviewer}}` on CPU.
A stale plan hash is rejected. Rejected plans cannot queue scenes, seed later
planning or enter final assembly; the ordinary Factory worker checks again
before inference/rendering, including for previously queued scene jobs.
This is a written-plan review, not pixel or listening evidence. Rejected plans
remain intact; plan-version rollback and automatic creative replanning are
still unqualified. Use a corrected new production request for now.

`CONTENT_FACTORY_NVIDIA_SSH_PORT` optionally configures a validated SSH port
for the administrator's existing authorized host. It applies consistently to
SSH, file transfer and owned-container cleanup. The default SSH configuration
remains unchanged; changing transport does not authorize a different GPU.

The initial executable scene profile is characterless and dialogue-free.
Character scenes explicitly require stable visual-reference qualification;
dialogue scenes explicitly require generated speech/alignment qualification.
The script and assigned dialogue are preserved, not dropped to force a render.
Those stages, convincing continuity across generated scenes, and whole-movie
automated creative quality are outstanding product work. The baseline CPU
procedural scene score is editable fallback material, not a claim of premium
movie sound design.

`--prepare-assembly` verifies accepted scene-output bytes/reviews and assembles
them in screenplay order through the existing canonical compiler, preserving
their embedded scene mixes. This step needs no GPU configuration. Its result
is `prepared_for_existing_renderer`, not a rendered or approved movie. Final
render, whole-film review and founder approval remain required. Current limits
include 256 KB source text, 180 scenes, bounded shots and an 850 KB durable job
record; longer productions need partitioned scene-plan storage.

`--asset-library <private-catalogue.json>` enables owner-scoped reuse of accepted
raw assets. The catalogue has `ownerUid` and `assets` in the factory asset format.
Hash verification, immutable attempt copies and a fresh assigned-role review are
required. Original model, seed, settings and source brief remain in parent
provenance; reuse never pretends that a new inference generated those bytes.
The current library planner selects only catalogue material; ordinary generation
planning runs when no library is configured.

## Brand idents

`brand_ident` requirements specify `identStyle` as `cinematic`, `compute`,
`minimal` or `creator`, type `three_d`/`motion`, and duration 2–6 seconds.
`make-brand-ident.py` uses the existing Blender device selector and retained
Blender runtime. Native `.blend` files retain editable text, extrusion, materials,
lights, camera animation, data/edit-fragment trajectories and glow compositor.
Original sound has a separate WAV and receipt with impact/resolution timing.
The ident can be an opening, ending or social sting and is a reusable source in
the existing edit pipeline. Embedded ident sound is preserved when used there.
These are authored bounded templates, not a general arbitrary Blender-code API.

## Review limits and delivery

Raw/final visual critics inspect actual sampled frames with pinned NVIDIA
Qwen3-VL; their receipts bind the evidence hash and model revision. Final review
includes the story, edit clock and decoded audio measurements. Audio technical
review checks audibility, stereo, sample rate, duration and clipping; it refuses
unsupported emotional or listening criteria. Offline CPU ASR can verify the
rendered words, but neither a contact sheet nor ASR substitutes for listening.

Critics now receive individual time-ordered frames and verify each frame SHA,
rather than relying on a small montage. Raw assets normally use six frames;
first/last-conditioned transformations use sixteen and final films use twelve.
Raw review concerns only that asset's assigned role. Reuse rejection stops for
replacement rather than copying the same rejected bytes into another attempt.

`render-transformation.js` assembles deliberately selected founder campaign
takes through the same Director/compiler/renderer contracts. Every selected
asset requires a separate accepted review bound to its exact SHA. This helper
does not prove unattended quality from an arbitrary brief, and cannot turn a
generation receipt or successful encode into creative acceptance.

Failed final edits need concrete corrections and changed shot choices/timing
before rerender. Founder rejection uses the founder's note for the next revision,
while preserving the rejected film. Output directories are job-scoped, preventing
same-name films from different owners from overwriting each other. Passing machine
review leaves `awaiting_founder_review`; only explicit founder review can mark
approval. Nothing is published automatically.

The October 7 qualification assets and actual creative failures are under
`reports/content-factory-20261007`. Session-specific success/failure evidence and
the strongest review candidate are recorded there; do not infer that every
available provider or general brief has been creatively qualified from unit tests.
