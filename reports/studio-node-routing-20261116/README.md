# Node Flow routing follow-through — 16 November 2026

This continuation closes the ordinary projected-media/title grade-mask gaps left by the preceding bounded completion. The earlier use of “completed” was too broad. The native App now routes projected alpha and static/animated title pixels into the existing main/timed Finish Rack path, and Restore All recovers authored node controls rather than only graph flags.

## Changes

- Projected masks use the existing compositor’s separate alpha stream. Preview rasterises the same homography, including source-region UVs; grade-mask validation accepts the projected branch.
- Static and animated title masks reuse the bundled Inter layout/unit decisions and the existing CPU title renderer, with native animation, timing, anchors, opacity and soft effects. Rigs without pixels remain non-pixel nodes; they are not a useful grade-mask source.
- Both source and mask streams resolve to the same programme frame rate and timestamp base. A real test exposed “only first frame graded” with the dual-stream projected intermediate; this is corrected and multi-frame tests pass.
- Connected-mask inversion now inverts the actual connected alpha, independently of the legacy ellipse power window. The same operation is compiled, previewed and rendered.
- Restore All restores canonical control/key recovery values. Invalid palette actions, such as attaching a keyer to a title, now display a refused-operation message instead of throwing an unhandled event error.

## Verification

115 frontend cases across eleven suites and 243 CPU/pixel/actual-FFmpeg cases pass. The worker set includes projected alpha across frames, its inversion, static and animated title masks, existing composition/track-matte, keyer/optical/warp/defocus, perspective and typography cases. Four actual Chromium pixel checks verify projected, inverted projected, static-title and animated-title coverage. These are scoped tests; strict whole-document picture/audio parity is not inferred.

The ordinary signed-in Studio run uploaded the owner’s Glass Current footage from Videos and its image, trimmed through the native timeline, added Corner Pin, routed its output into the primary grade, added a NODE title and routed it into a timed adjustment. Native Restore All, visible invalid-keyer refusal, Undo/Redo, backup and semantic cold reopen pass. One normal approved local CPU export completed, its native download exactly matches worker bytes, full FFmpeg decode passes, and the finished four-second movie plays to its end with sound and 96 decoded frames.

Native download SHA-256: `d8c620cacdf0316114daef74498d6174832ff2dcc8e3ec6bacaf8d25a7fdefb4`.

`private/render-binding.json` confirms the exact worker request contains the projected CornerPin mask and title Transform mask. `private/native` preserves the editable backup, actual Studio action recording, complete finished playback, separate movie and save-state records. Final desktop/phone guard and welcome/help checks are retained privately. The prior strict mixed-operator lint failure, first projected timestamp tests and first native inversion-save failure remain retained; none is reclassified as a pass. That save failure exposed advanced-colour projection dropping the source/inversion fields; they now survive qualifier/colour edits and the final native save check passes. Three separate logo/graphics files changed concurrently. Their changes were read for documentation impact to satisfy the repository source-lock gate, preserved without editing, and excluded from Node runtime qualification. The immutable tested build and its 37 served JavaScript/CSS assets remain bound separately.

## Limits and continuity

The two previously refused ordinary mask-source families are now implemented. Null rigs have no image pixels; using one as a grade image remains invalid. Model-generated SubjectMatte services remain a distinct owned-artifact workflow. This session does not establish every combination, continuous whole-programme colour/edge/audio parity, unrestricted real-time throughput, physical 3D camera behaviour, human creative/listening approval or production qualification. The prior strict typography colour/edge 13/16 failures and shared S02/S04/S03 remain. Counts stay 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY. Next: broader native picture/audio/edge and performance conformance across combinations, retaining these routing and state fixes.

All work stays in the active local Studio tree. Prior files and all earlier evidence remain. Execution used owned local emulators, headless muted Chromium and the canonical local CPU worker; no production writes, paid/GPU/provider job, publication/schedule, push, merge or deployment occurred. Complete Auth/Firestore/Storage/worker snapshots preserve the one terminal succeeded local operation; both wallets have zero held/active work and the unrelated empty wallet is unchanged.
