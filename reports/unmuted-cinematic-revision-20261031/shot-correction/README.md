1 November follow-up: two source-matched single-frame proofs also fail visual review. Source pixel audits corrected misplaced foreground points on the TV illustration, and float conversion fixed an 8-bit colour-filter overflow. Fine foliage/support masks and believable room/camera/light matching remain unresolved. No new motion render or replacement movie is delivered; originals and failed stills remain private. A 2D foreground does not make fixed-angle background replacement impossible. Correct source-bound roto/trimaps and coherent scene matching are still required before motion rendering.

**1 November: owner rejected the latest Shot Review.** The person still reads as a cutout, the scene match is unconvincing and reframing the mic stand did not repair it. All previous movies/projects remain preserved; no visual/professional pass is claimed.

Latest follow-up: [moving-shot repair, actual frame audits and explicit stand/framing limit](motion-revision.md). The earlier detail take is owner-rejected for motion/equipment defects.

Latest follow-up: [source-detail refinement and verified local Composite fixes](detail-refinement.md). Earlier failures below remain preserved and rejected.

# Rejected podcast shot — bounded correction, 31 October 2026

**Visual gate: not passed.** This is a materially corrected three-second shot,
with exact remaining defects below. It is not an approved cinematic finish.
Engine expansion remains stopped. No application, template, renderer, UI or
production configuration was changed in this correction session.

## Exact shot and evidence

The baseline is the owner's rejected `UNMUTED - Cinematic Set Revision.mp4`,
SHA256 `4d2c8d510c0e36d4d2b3e2ad7c9aa461ccf6f3a50ba21e5aba04f608add6eb4f`.
The correction isolates programme **4.000–7.000 seconds**, corresponding to
source **22.458333–25.458333 seconds** in `cam-combiner-60sec.mp4`.
Only **72 frames at 24fps**, 1280×720, were rendered. The original source,
rejected film, projects and previous failures remain intact.

Actual decoded frames were inspected at the start, middle and end, with
additional rendered frames across the gesture and enlarged head-edge checks.
The comparison images are extracted from the actual encoded before/after
movies, without retouching; their times are matched. Complete short playback
was verified in the existing Studio with live monitor audio capture.

Files are in `/home/tibule12/Videos/Unmuted - Shot Correction - 20261031/`:

- `Corrected Shot - 3 seconds.mp4`: actual Blender output, H.264/AAC.
- `Before - same 3 seconds.mp4`: the exact rejected interval.
- `Before and After - actual frames.png`: matched frames at 0, 1.5 and 2.958s.
- `Before - actual frame.png` / `After - actual frame.png`: full-size first pair.
- `Studio Shot Playback with Sound.mp4`: real timeline and complete short playback.

The modified native scene is `private/Corrected shot.blend`; it references the
retained local `private/presenter/` PNG sequence. It remains editable in Blender,
but is not a portable package or a newly integrated native Studio preset.

## Visible defects and result

| Category | Rejected shot | Correction and remaining judgment |
| --- | --- | --- |
| Subject isolation | Old room rectangle remains beside the arm; shoulder/ear fringes; source crop visible. | Rebuilt only this shot's matte from the same existing private local RVM model, with source-specific masks, a temporal warm-up, opaque shirt/torso protection, ear tracking and edge-colour recovery. Large room rectangle and torso holes are absent in reviewed final frames. Ear/earring edges remain soft and uneven; matte qualification fails there. |
| Equipment masks | Rails terminate at a rectangular crop; old coloured monitor contaminates hardware; gaps can retain backing pixels. | Wider original crop retains the actual boom elbow. Source-specific rail selection removes the monitor gaps and neutralises contaminated dark hardware. A short existing-tool Blender support repair replaces the plant-occluded post. Boom/support now read as continuous, though the source-derived rail edges remain softer than the 3D post. |
| Perspective | Seated source is treated as a person standing behind a disconnected desk; side orbit exposes the image plane. | Existing fake console, clamp and foreground columns removed; real chair retained. Camera stays on the source-facing axis with a 12cm push. This supports the source angle but cannot provide a genuine new side view of the presenter. |
| Scale/composition | Presenter is small; enormous repetitive slats and desk dominate; type/equipment overlap. | Presenter enlarged; darker, narrower fins and shallower depth of field reduce wall competition. Brand/type reduced and moved clear of the stand; oversized title bars reduced. Shot reads more clearly, but the set remains visually repetitive and graphics remain simple. |
| Lighting/colour | Bright, warm/magenta baked source lighting does not match the set; emission-only subject cannot respond to scene lights. | Set lights/materials adjusted toward the source's warm light, strip intensity reduced, hardware colour repaired. Pink source rim remains unexplained by the visible set. Source lighting has not been physically removed/reconstructed. This remains a visible integration defect. |
| Shadows/contact | Desk floats relative to pose; no coherent seated support; no physically meaningful person shadow. | Disconnected desk removed; photographed chair supplies existing person/chair contact. Existing Blender set still shades normally. Feet/floor contact are outside the new framing; this is not a demonstration of repaired full-body grounding. The emission/alpha presenter still supplies no trustworthy volumetric body shadow. |
| Movement | Large lateral drift/return changes the apparent angle of a flat person; weak relationship to speech; title rails leave lines while collapsed. | One restrained axial push replaces orbit/return. Original three word cues retained, now shot-relative. Children are explicitly hidden before their cue, removing collapsed residual lines. Hands/shirt remain intact across reviewed gesture frames. Boundary motion at the ear remains imperfect. |
| Composite texture | Crisp set versus soft compressed person, pale edge halos and over-bright practicals expose layering. | Background defocus, reduced practical intensity and local edge recovery reduce the mismatch. Underlying source softness/compression and the remaining ear edge still reveal the composite at full size. No blanket sharpness or cinematic-quality claim. |

## Exact remaining limitation

The corrected scene still uses **one alpha/emission video plane for the person**.
Its colour already contains source lighting, and it has neither person geometry,
surface normals nor reliable depth. Moving Blender lights therefore cannot
relight the recorded face/body, restore hidden surfaces or produce a correct
volumetric body shadow. An orbital camera would again expose the limitation.
The restricted axial push avoids that exposure; it does not solve it.

The specific matte failure is the ear/earring boundary: the existing person prior
loses thin jewellery/ear pixels and blends some edge RGB with the old room.
The source-specific tracked skin correction repairs the opaque ear interior,
but does not fully reconstruct thin jewellery and clean moving edge colours.
That needs finer tracked manual roto/foreground recovery. The baked magenta rim
also needs a successful foreground lighting correction or a coherently motivated
matching set light. Neither is demonstrated in this candidate.

**Therefore this shot is not accepted as the requested convincing cinematic
scene.** Successful render/decode/playback is technical evidence only. No further
engine expansion or whole-video render was undertaken.

## Verification and scope

- Both before/after movies fully decode, with 72 frames, 24fps, 1280×720 and audio.
  The soundtrack is the existing rejected programme's same 4–7s interval; no new
  sound/voice generation or sound-design qualification is claimed.
- Actual Studio playback: 78 timestamped UI frames, all 72 movie frames reached
  (maximum media time 2.959609s), 3.6384s capture, live `captureStream` audio.
  Headless, muted device, zero page exceptions, zero external requests.
  The existing local media/bootstrap adapter supplies the movie as one flattened
  source; native checkpoint and playback are real. No native 3D-edit/export parity
  or normal-account application workflow is claimed by that recording.
- Sixteen protected existing implementation/source hashes match the session
  baseline. Existing feature code, original podcast bytes and earlier edits are
  unchanged. Studio contract validation and `git diff --check` are recorded below.
- Initial matte/still candidates were rejected after inspecting actual pixels;
  retained privately. The first animation wrapper received SIGTERM after 70 frames;
  originating cause is unestablished. Only missing frames 71–72 were resumed from
  the same saved `.blend`; no frame duplication, held tail or whole-video rerender.
- First recording command could not resolve the already-installed Playwright
  dependency. Explicit resolution to the existing main workspace dependency
  succeeded; no package/model/browser installation was needed.
- Existing local hardware only, no paid generation, credentials, production data,
  cloud job, branch merge, deployment, publishing or unrelated worktree mutation.

Receipts: [delivery](delivery.json), [source selection](source-selection.json),
[playback](studio-playback.json), [preservation](preservation.json),
[render interruption](render-interruption.json), [validation](validation.json).
