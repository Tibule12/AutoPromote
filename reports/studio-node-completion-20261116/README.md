# Node Flow completion — 16 November 2026

The previously disconnected media-node controls now change native preview pixels and the canonical CPU export. The changes are in the active Studio source tree. This is local functional verification, with the supported boundaries below; it is not a production or creative approval.

## Implemented and repaired

- **Keyer:** Chroma, luminance and hue/saturation screen keying now produce real alpha, with edge smoothing, spill suppression, signed choke and inversion. Luma mode disables irrelevant screen-colour/spill inputs. The old clean-plate label was corrected to describe the actual hue/saturation operation.
- **Optics and displacement:** highlight halation, horizontal streaks and programme-clock displacement now run in the existing media compositor. Warp-only/streak-only branches retain their FX node and bypass. The preview and worker implement the same versioned pixel equations; positive and negative choke use bounded linear-time morphology.
- **Depth and defocus:** Z changes the shared perspective scale by `1 / (1 - Z / 200)`; Z40 therefore compiles to 1.25×. Associated-alpha defocus preserves bright soft edges. Canonical save/restore, parent changes and export baking retain these fields. The UI describes Depth & Defocus rather than advertising an unimplemented physical camera/rack-focus system.
- **Masks:** grade connections now reference actual branch alpha or geometry instead of silently creating a generic ellipse. Main and timed adjustment grades use the selected image/video branch on the programme clock. Prepared global LUT/qualifier filters remain in the masked path. Transform masks retain their actual stencil. Union, subtract, intersect and XOR secondary masks now render in both browser SVG and CPU composition; stacks are bounded to eight. Inverted feathered grade masks apply inversion after feathering.
- **Viewers and layout:** A/B viewers show native source/grade/branch/programme pictures, replacing schematic tokens. The wipe clips two aligned pictures. Each branch has enough default layout space for keyer/FX/transform/pin/mask nodes; saved manual positions remain. Expanded workspace, inspector viewer buttons, keyboard wipe/Escape, focus and responsive desktop layouts are retained.
- **Lifecycle:** expression links, depth and defocus neutralise with Transform bypass; lens blur neutralises with Finish FX bypass. Older bypass flags migrate into canonical controls with recovery values. Overlapping MediaIn/Merge bypasses restore the original opacity in either order. Deletion detaches vanished effect-mask sources. New node values and references validate before a graph transaction or render.

## Evidence

107 frontend tests across ten suites and 208 CPU/pixel/real-FFmpeg cases pass. These include canonical node compilation, persistence/history/locks, depth parenting, legacy/overlapping bypass, mask geometry and actual masked-grade movies. Browser/worker pixel equations match within one channel value for all three key modes, choke, warp, defocus, optics and combined cases. Four real Chromium boolean-alpha checks and an inverted-feather edge check pass. An additional 52 product-knowledge/help tests pass. The strict production frontend build passes.

Real signed-in Studio actions cover source upload from Videos, an ordinary imported green-screen test plate, keyer bypass/restore, optics/warp/depth/defocus edits, actual A/B pictures, all four boolean operators, history, native backup, semantic cold reopen and normal approved CPU export. The final three desktop viewports are 1600, 1280 and 1024px; the existing 390px desktop-only guard remains and offers no unrelated credit purchase. Final anonymous welcome comparisons and signed-in help checks are retained privately.

The corrected native movie is **4 seconds, 720×1280, 24fps, H.264 with stereo AAC**. Its normal native download matches the worker bytes exactly, fully decodes and plays to the end (96 decoded frames). The exact worker request contains the enabled keyer, halation/streak, warp, Z40/defocus2, 1.25× baked pose and keyed grade-mask reference; see `private/final-render-binding.json`.

SHA-256: `031c3df5b94fd9f91dceb9d8b52a0309acaecc43c1e480b3c9518be89820aabc`.

The separate movie, project backup, native action recording and full finished playback are retained in `private/final-native`. The first completed draft is retained in `private/native`: it exposed depth/defocus missing from canonical fields and is superseded. The first final-UI take failed before export because overlapping nodes blocked a viewer button; its recording/failure remains. The initial strict lint failure and masked-grade colour-format/contain-box failures remain with their corrections. No failed take is relabelled as a pass. Two distinct approved local renders succeeded; the final job was not resubmitted.

## Supported boundaries and remaining shared work

These operators act on ordinary image/video layers. Non-pixel rigs, text or generated subject-service nodes cannot supply an ordinary grade mask; unsupported references are refused. A grade mask after Corner Pin is refused; use an earlier branch or the existing track-matte workflow. Text retains its native typography/glow/blur path. Depth is a 2.5D perspective-scale control, and defocus is a layer blur, not a physical 3D camera simulation.

This does not qualify every combination, unrestricted real-time throughput, whole moving-picture/audio/colour parity, human listening/creative quality or a deployed production account. Shared S02/S04/S03, the earlier strict typography colour/edge 13/16 failures and formal readiness remain unchanged: 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY. Next shared work is broader native picture/audio/edge and throughput qualification, preserving these completed node consumers.

All execution used owned local emulators, headless muted Chromium and the existing CPU worker. No paid model/GPU call, production write, publishing/scheduling, push, merge or deployment occurred. Complete Auth/Firestore/Storage metadata and worker/request/receipt snapshots are retained; both local operations are terminal, all wallets have zero held/active work and the unrelated empty wallet is unchanged. Existing original files and prior fixes remain preserved.
