# Four-minute background qualification — 2 November 2026

The actual continuous first **240 seconds** of the 34m27s podcast is rendered, with both speakers, original speech and 51 registered camera intervals. **The four-minute creative gate fails.** A separately corrected 115–117s movement test repairs the forehead wall fragment, lost boom rails/couch segment and fixed rectangle; fine prop/plant boundaries remain unacceptable and that correction has not been propagated across all cuts.

[Actual source/review/short repair, masks and Studio movies](/home/tibule12/Videos/AutoPromote%20Background%20Replacement%20-%202026-11-01/Four-minute%20movement%20test/Review.html) · [structured validation](four-minute-validation.json).

## Actual findings and fixes

- A legacy 0.38–0.525 x / 0.59–0.71 y holdout protected an original-room rectangle. Removing it alone exposed weak boom masks. A detailed 1024-pixel separate equipment ROI restores actual rails, while separately re-evaluated chair guidance retains the newly revealed blue chair.
- Whole-scene 512-pixel SAM tracking alone loses striped/pale clothing and thin hardware. Independent recurrent person evidence recovers clothing, but can itself retain a small original-wall wedge beside the forehead. A reviewed background point at source-normalized `(485/1430, .225)` plus restricting recurrent support to the body removes this wedge in the short test. All 48 decoded frames were inspected through the hand/body movement. This correction is private review orchestration, not a newly shipped native artifact API.
- Weak SAM logits outside a selected person previously made broad original-room panels unknown to ViTMatte. The integrated trimap now bounds weak person evidence to a small silhouette neighbourhood; independently selected fine object evidence remains possible. A global tightening of object evidence removed legitimate fine foliage and was rejected. Fine leaves/springs retain mixed old-TV colour and unreliable opacity; merely increasing feather cannot distinguish the omitted object from background.
- Existing native colour exclusions and explicit source-specific garbage paths remove selected TV remnants in the short test. They are not automatic universal masks, physical relighting or a claim that every plant/stand edge is repaired.
- Per-frame photographed RGB always decodes anew. Source DIS flow propagates mask evidence/colour residuals only; camera cuts reset tracking. All 5,760 source camera IDs agree with the 4Hz registration, including baked zooms. Small registration error and opacity changes can still cause apparent background movement.

## Code and model boundaries

The ordinary component tracker is refactored into `ComponentVideoTracker`; the artifact adapter reuses it. Explicit CUDA is only a local review option; registered CPU transports remain default. Three actual GPU union outputs and all 21 component planes are byte-identical to the pre-refactor implementation.

`VfxFrameRenderer` reuses per-frame HSV/hue/grayscale preparation, skips identity cleanup and confines after-holdout exclusions to their authored boxes where exactly equivalent. Two original-camera foreground/effective-alpha pairs and two regional before/after comparisons are byte-identical. The threaded proof's 18-frame picture/alpha comparison is also byte-identical to its sequential path. No new editing engine or Studio redesign.

Pinned SAM2.1 and ViTMatte weights are Apache-2.0; existing PyMatting 1.1.16 is MIT. Cached [RVM](https://github.com/PeterL1n/RobustVideoMatting/blob/master/LICENSE) weights are GPL-3.0 and used only for private local person-guidance evaluation, not added to the product registry or distributed. Stand-alone RVM ghosted hands/mics; closed-form head refinement produced blocky cap edges; gated recurrent/SAM combinations lost clothes. All rejected candidates remain. The selected long pass uses 512-pixel SAM plus recurrent body/person evidence and source-resolution head/equipment ViTMatte, while the later short correction uses 1024-pixel tracking. None of this is a professional-quality promotion.

## Native verification, with its actual limit

The four-minute review was imported through normal signed-in Studio authoring. Native Save → cold reopen → 1080p/24fps/master CPU export passes with exact canonical document persistence. Export SHA-256: `714714417f709bae565870df20b211c2be54e9f7f498aa2bbe4354ef95c3015f`. All 5,760 final frames fully decode. Thirteen actual source-fit/native-export pairs are retained; encoding differences are measured, not called pixel identity. Eight 30s audio windows correlate 0.9917–0.9961 at zero offset; original speech is present, but no subjective listening approval is claimed.

Complete actual 240s Studio playback with the editable timeline is retained, plus the separate final movie. The recording captures 2,208 screen frames and uses the exact exported sound at its observed display epoch. Browser decoding reports 134 dropped frames, so smoothness is unqualified. The timeline contains the **flattened review movie**: these checks do **not** prove editable native long-form segmentation/matting artifacts or their correction propagation. Previous six-second native artifact qualification remains separate and preserved.

Only the explicit loopback `STUDIO_BACKGROUND_LONG_DEMO=true` harness accepts <=240s / <=512MiB and a 900s CPU/wall ceiling. Normal defaults remain 30s input/50MiB, 120s render, 20MiB output. Analysis/delivery keep their prior bounds. The local wallet reserves the full 900-unit symbolic exposure for that render; no production pricing changes. Storage emulator transfer is adapted locally to send the actual full owned file rather than its first 16MiB chunk. DevTools large-upload serialization failures and the remaining source-duration/quote-ceiling failures are retained; they occurred before execution and were corrected within the isolated harness. No production upload or payment claim follows.

## Checks

**83 distinct scoped tests pass**: 12 temporal-alpha, four source-edge, 58 worker regressions, four explicit local-review bounds and five existing HTTP checks. Repeated reruns are not summed. Native upload/export/reopen/playback and the viewer's 32 actual movie seeks/comparison loads are real local browser checks. Syntax, source/documentation checks, contract validator and diff checks are recorded separately. Formal readiness counts remain 2 UNIMPLEMENTED / 1 BROKEN / 9 PARTIAL / 17 FUNCTIONAL / 0 PRO / 0 production.

## Disk incident

Installing an isolated CUDA 11 runtime for the laptop's older Quadro M1200 added about 4.7GiB and briefly exhausted disk. It never replaced the application environment. The runtime was moved to RAM, used for local inference, and removed after no process mapped it. Disposable CUDA wheels, Babel/ESLint/Jest/pip caches, Chrome's optional downloaded on-device model and cached extension/component installers were cleaned. Peak recovered free space was 11.37GiB before new proof/native outputs and concurrent work. Actual free space at this report is in validation; it is not still 11.37GiB. `private/long-podcast-r7/disk-cleanup.json` records paths/bytes. No footage, projects, previous renders, installed extensions, AutoPromote model weights or production data were deleted. Sudo apt cleanup was not applied because it requires a password.

The user connected AC power; local GPU clock recovered from battery throttling. No paid cloud inference, production operation, deployment, merge or unrelated worktree edits. Local demo remains available for review. Private files include signed local capabilities/configuration and must not be published. No success claim is made for the uncompleted long-form visual/native-model qualification.
