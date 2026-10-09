# Actual logo motion delivery; runtime product integration remains partial

[Watch the logo cut with sound](proof/logo-ident/final/final.mp4).
[Watch the masked source, actual Wan video and logo together](proof/logo-ident/combined/final.mp4).

The logo cut is 1280×720, 24 fps, 102 frames / 4.25 seconds. Separate layers of the repository's editable AP monogram converge in depth, the camera settles, and a moving light filament passes around the geometry before a cut to the readable AutoPromote lockup. This is authored deterministic 3D animation. It is not labelled as AI-generated footage, and it does not demonstrate the entire reference catalog or reference-level creative quality across Studio.

Both selected movies use the existing AutoPromote `RenderViralRequest → render_viral_clip_impl` path, with local media transport and explicit CPU final encoding. The combined output has 283 frames / 11.791667 seconds and retains the actual SAM mask treatment and actual moving Wan shot from the earlier proof. Full decoded picture sequences and headless, muted playback were inspected; both played to the end with zero reported dropped frames. Audio has 48 kHz stereo, nonzero measured signal and zero full-scale clipped samples. Listening and founder creative approval remain unverified. The encoded audio tails exceed picture by approximately 17 ms / 27 ms respectively; exact sample-aligned delivery is not claimed.

The owned native source was persisted with an immutable generation and byte hash. A separate immutable artifact records the original executed geometry/implementation, parameters, source clock, output hashes, creation time and software runtime. A versioned review excludes the bad lettering entrance rather than rewriting the retained source's provenance. The same canonical project retains three media assets and five AI-artifact references, with four timeline occurrences. The render document is revision 5. The existing signed-out Studio component normalizes and saves it as revision 6; media, timeline and artifact references survive save/reopen exactly. This does not establish full graph/pixel parity or the normal authenticated lifecycle.

Actual delivery SHA-256:

- Logo: `d01e727e620aa2c6f2d4a3051b97b586c31bfacd6be66fa0b8b31dcd864dbbd8`.
- Combined: `8c72931f83ad1495fa4dba47d026fe76b51d1cdb280830e4aa66a63e849dae89`.
- Native source: `e26616d0a5ff29ef56997da8a955e46211916bffc9598da0433fe3b365e752d0`.
- Native artifact: `20d772cde53574b9bc7258aa35f2540e49155213e21c338199d543daf474e7f7`.

Real faults were handled before delivery. The first camera view was upside down and was corrected. Blender's module import error was hidden by its successful process exit; the packaged module path, explicit Python failure exit and complete-frame-sequence guard fix that boundary. Decoded review rejected source 2.25–4.00 seconds because the lettering stretched vertically. The canonical edit uses source 0–2.25 and 4–6 seconds. Uniform glyph scaling is also fixed for subsequent renders and was verified with one actual corrected frame; a complete corrected six-second take has not been executed. The retained take is not relabelled as that later implementation.

Execution accounting:

| Operation | Device | Measured wall time |
|---|---|---:|
| Actual six-second native source, 144 frames | EEVEE, explicitly forced local software rendering, 8 samples | 794.51 s |
| Corrected glyph entrance frame | Local software rendering | 4.72 s |
| First unselected final | Local Quadro M1200 4 GiB for NVENC; other stages CPU | 6.55 s total pipeline; GPU-only time not instrumented |
| Selected logo final | CPU / libx264 | 7.00 s |
| Selected combined final | CPU / libx264 | 14.55 s |

The first final used the existing automatic hardware encoder because `libx264` is not the policy value for CPU. It is retained separately. Both selected outputs were rerendered with the supported `cpu` policy. No additional paid GPU infrastructure or neural-model execution occurred. Fresh regional inventory records zero active Cloud Run GPU executions and zero GPU services. The earlier actual Qwen3-VL, Grounding DINO, SAM2.1 and Wan2.2 executions and their accounting remain in [the nine-part runtime report](README.md).

Shared implementation changes are in the existing 3D template/worker packaging and fail-closed render boundary. No frontend layout, Cam Combiner path, production application/rules deployment or main merge changed. The branch remains `agent/model-capability-runtime-v1`. Twenty-six Python 3D contract checks and 35 existing service/transport checks passed. The Studio contract validator passes; no readiness promotion follows from these private checks.

Safe receipts are in [logo-motion-evidence](logo-motion-evidence). Private raw media, project snapshots and immutable artifact/review files are under `proof/logo-ident`; signed render inputs stay private. The original fixture project is restored after the browser check.

The remaining task is still the authenticated capability request, review/import, edit/save/reopen and preview/export lifecycle through the existing Studio controls. The saved private sign-in is available; the user does not need to supply another brief or credentials. Image-only source binding, broader preview/render conformance, staged deployment/IAM qualification and TAP point tracking also remain. Next integration work should finish that authenticated workflow with the four already executed models. TAPNext++ is the subsequent candidate for actual point correspondence and long-range tracking. Whole-Studio readiness remains unchanged.
