# Detail refinement of the same podcast shot — 31 October 2026

**Rejected on moving review.** The owner identified person-motion errors and a
broken microphone stand. All-frame inspection confirms the real stand was
masked out and replaced by incompatible single-post geometry; a retained
television-bezel fragment also terminated in air. The earlier sampled-frame
assessment below was insufficient. This movie is preserved and does not pass
the visual gate. The bounded follow-up is recorded in `motion-revision.md`.

The latest owner direction authorizes necessary code/tool installation for clean
background replacement. Work remains isolated on `feat/studio-podcast-revision-20261031`.
Only the original rejected film's 4–7s interval is rendered: **72 frames, three
seconds, 24fps, 1280×720**. Prior failures and all original media remain intact.

## Actual implementation changes

- `python_media_worker/studio_vfx_plan.py`: fine alpha's erosion could leave a
  selected thin rail or jewellery with **no foreground seed**, allowing the
  solver to erase it. The new source-matte-constrained medial seeds protect
  confident centres of selected thin details. They cannot add an unselected
  object. Radius-zero colour recovery retains its existing alpha semantics.
- Regression reproduces the old failure: a selected two-pixel rail falls to
  **10/255 alpha**. The repaired renderer preserves the rail and most of the
  selected ring while keeping its hole clear, solid interiors unchanged and
  the immutable matte untouched. The full existing pixel suite passes.
- `StudioSubjectVfxPanel.js` now identifies the missing saved-mask step before
  submitting a new replacement render. Existing saved-preview recovery remains
  supported. The backend rejects the same missing-mask case **before** worker
  configuration, source access or job creation, preserving its 422 response.
  Background selection alone never starts inference or a render.

No Studio redesign, new cinematic preset, authentication bypass, changed rules,
worker image deployment, automatic paid fallback or account/billing change.

## Tools and actual pixels

- Installed **pymatting 1.1.16** and its dependencies in this report's ignored
  `private/native-edge-deps/` only. Existing application/system environments
  were not modified. Actual resolved versions are retained in `tool-environment.json`.
- Reused the cached native **ViTMatte small** checkpoint, SHA256
  `bda9289db1bb6762d978b42d1c62ae3f34daf7497171a347a1d09657efd788cb`.
  No weights were downloaded. Actual CPU Torch runtime is 2.12.0+cu130; this is
  a host evaluation, not attestation of a deployed worker image.
- Restored the original **1110×1000 RGB crop**, replacing the earlier reduced
  texture. The existing source-bound matte retains the seated body/chair and
  selected equipment. Source-colour refinement repairs the head/ear outline;
  cached ViTMatte refines the reviewed head/earring region at source resolution.
  Existing Composite foreground-colour recovery then removes photographed
  old-room RGB from the soft edges. Recorded skin/clothing remains source media.
- Whole-head affine manual roto was visually rejected: it displaced the ear
  contours and cut the collar. Native two-pixel fine-alpha samples were also
  rejected for thin-detail loss. Those attempts remain private.
- An actual DOF-on/off still comparison exposed extra softening on the blended
  source surface. Adjusting focus alone was insufficient. The saved Blender
  scene now uses its ordinary compositor: a sharp foreground scene over the
  defocused physical set, with the repaired support in the foreground pass.
- Existing set lighting/materials are adjusted to motivate the photographed
  rose rim and warm key. The fixed-angle source uses a restrained axial push.
  This is source colour matching, not reconstruction of person geometry/normals.

## Visual review and limits

Actual rendered frames through the gesture and actual encoded first/middle/last
frames were inspected. The old-room rectangle and torso holes are absent in
those reviewed frames; both earrings remain visible, the mic joins its support,
and the set has a visible practical matching the photographed rim. The sharp
foreground pass avoids the previously added optical blur. These are observable
shot-specific improvements, not certification of professional creative quality.

Source compression still limits face/jewellery/rail detail; the architectural
set and simple typography remain visibly designed. The real chair supplies
photographed contact, while feet/floor are outside frame. No full-body shadow
repair, source-camera calibration or true new viewing angle is demonstrated.
A 2D foreground can support a fixed-angle composite; its lack of person geometry
does not itself prove such a shot impossible. It does prevent claiming genuine
side views or physical body relighting from this source.

No owner approval, whole-video cinematic completion, professional readiness,
whole predictive preview/final parity or broad arbitrary-footage qualification
is claimed. Cinematic-engine expansion remains stopped.

## Native controls and exact execution boundary

The owner's Composite path is confirmed in actual headless Studio: select the
three-second source under **Add effects to a clip…**, and **Background
replacement / Background choice** appear. Person-point authoring also works.
The isolated build disables Firebase and has no owned uploader/storage binding;
its normal render guard therefore stops before dispatch. No auth was simulated
and no production upload/job was started. See `native-composite-controls.json`.

This shot uses the real existing native model/foreground renderer **locally**,
plus the editable Blender scene. It is not an authenticated Studio mask request
or proof of the full ordinary-account upload → mask → native-preview flow.
The Studio recording shows the actual completed movie imported as one flattened
source, checkpointed and played beside its timeline with real monitor audio.
It does not present that recording as native 3D/subject authoring or export.

## Delivery and verification

Directory: `/home/tibule12/Videos/Unmuted - Shot Correction - 20261031/`

- `Background Replacement - Detail Refinement.mp4`
- `Rejected Original vs Detail Refinement - actual frames.png`
- `Detail Refinement - actual frame.png`
- `Studio Detail Refinement Playback with Sound.mp4`

Native scene: `private/head-model/Final shot.blend`, with its retained local
`presenter/` sequence. This is editable locally, not a portable media package.
Original rejected interval, earlier candidates and complete prior recordings
remain available. The latest movie reuses the preceding shot's exact AAC bytes;
no new speech or sound generation, or fresh listening approval, is claimed.

**91 focused tests pass:** 43 real compositor pixel/identity cases, 24 mounted
Composite-panel cases and 24 service cases. The service run retains its inherited
duplicate-package Haste warning. No full application suite or deployment test
was run. Full movie and Studio recording decode, frame counts, hashes, source
preservation, syntax, whitespace and Studio contract results are retained in
`detail-validation.json`. Existing formal capability counts remain unchanged.

No merge, push, deployment, production data access, cloud execution, paid model
call, scheduling change or modification of unrelated worktrees. Application
changes remain local for review; releasing them requires approval.
