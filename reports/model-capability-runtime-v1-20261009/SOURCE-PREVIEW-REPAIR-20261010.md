# Raw-source preview repair and existing-film native download

10 October 2026. Scoped local native Studio verification; creative approval and whole-Studio readiness remain open.

The cycling edit now plays 19.5 programme seconds in **21.07 and 21.30 wall seconds**, with **one waiting event** per run. The same edit in the retained intermediate single-decoder build took **27.20 and 33.37 seconds**, with **twelve waiting events** each. These are repeated actual headless Chrome153 measurements on the same saved duplicate at 1600×1000, without screencast. Each clock begins after readyState ≥3 and no pending seek. Network/cache/software scheduling are not controlled laboratory conditions; some overhead and frame drops remain. This does not qualify universally smooth playback.

| Build/run | Programme seconds | Wall seconds | Waiting events | Active decoder frame callbacks |
| --- | ---: | ---: | ---: | ---: |
| Intermediate single decoder 1 | 19.5 | 27.1984 | 12 | 452 |
| Intermediate single decoder 2 | 19.5 | 33.3718 | 12 | 451 |
| Final two decoders 1 | 19.5 | 21.0706 | 1 | 426 |
| Final two decoders 2 | 19.5 | 21.2968 | 1 | 433 |

**Comparison correction:** the folder `unrepaired-warm` contains an intermediate build already equipped with frame-boundary checks and next-source prewarming, not the original unmodified build. Its main bundle is `main.68a716c4.js`, SHA256 `6de16252d1f3cd8de113496de7efb1fecbcf553b0c23306a3bfe3e033698885e`. Final repaired bundle `main.684678bf.js` has SHA256 `d4834911cf8b9b0528964ec8ad2644ca5befdd9ac6342c2fffd6c28218d3b137`. The initial original-build 41.64-second trial includes cold decoder loading; it is retained as diagnostic evidence and excluded from this ready-start comparison.

## What changed

`ViralClipStudio.js` retains two native programme decoders for ordinary multi-clip raw edits. While the active decoder plays, the paused/muted standby prepares the next owned source at its existing in-point. A native video-frame boundary callback triggers the existing cut handler without a React update on every frame. Old source metadata seek handlers are removed and guard the currently active decoder/occurrence; this prevents late callbacks from restarting an inactive decoder. Existing rendering, canonical project state, canvas staging and source ownership remain authoritative. Live speaker-stack/Director modes, audio remix and speech ducking retain their established decoder synchronization.

There is no timeline/layout/Cam Combiner redesign, separate marketing film, new model execution or new render submission in this session. The original 13-clip, 16-graphic, 17-sound-cue cycling edit is unchanged.

Native Duplicate/rename/save/cold entry created `VELO — preview switching · 20261010`, project `viral-project-ed5c7f62-d197-401b-a234-68325490629a`. Its canonical hash is `b3999bdc503369988968610cf6cc46b9f17b6bf286f93038f9fa776dd1414e38`. All four measured runs assert before/after hash equality. The original `VELO — cycling rhythm · 20261010`, project `viral-project-892775d1-71f0-4532-9e3d-0539899ec01b`, retains canonical hash `22910c97897bd99c0c61459820f0607adf473a2a21137399a2968427ecd180d8`.

## Actual Studio download

The real Studio Download button successfully delivered all **10,250,144 bytes** in bundled headless Chromium **147.0.7727.15**, following cold recovery of the original owned completed job `viral_a58ad44e995ec9fd470ecf2c67e12d21a385f4e2f1ba4955768709200ce09152`. The downloaded SHA256 is `58575b9dee1fe995d8aa6f89df278d501faece0d0403071aa6bbc3045f37f234`, matching both the server receipt and the earlier original film. Complete independent picture/audio decode passes: 20 seconds, 720×1280, 24fps, 480 frames, stereo 48kHz AAC. This reuses the completed output; no render was submitted.

Authentication was faithfully reused with standard Playwright `storageState` from the existing real authenticated localhost QA browser, including Firebase IndexedDB. Real owner-bound APIs resolved the retained project and job. No fabricated user/token, auth bypass, route/worker mocks or project fixture were used. This proves persisted-session use, not fresh login/onboarding. Copying the Chrome153 profile directly into Chromium147 did not retain sign-in and was an unsuccessful diagnostic attempt.

**Remaining browser limit:** installed Chrome153 reproducibly exits with actual `SIGSEGV` after the same native Download button starts transfer. Both `allowAndName` and `allow` trials crashed; changing download naming did not repair it. Root cause remains unresolved. The successful bundled-browser delivery does not establish a product-side Chrome153 fix.

## Evidence and changed files

- [Final repeated raw-source playback](proof/launch-template/source-switch-20261010/dual-native-r3/dual-native-r3-playback.json), [repeat](proof/launch-template/source-switch-20261010/dual-native-r3/dual-native-r3-repeat-playback.json).
- [Intermediate single-decoder comparison](proof/launch-template/source-switch-20261010/unrepaired-warm/unrepaired-warm-playback.json), [repeat](proof/launch-template/source-switch-20261010/unrepaired-warm/unrepaired-warm-repeat-playback.json).
- [Actual native downloaded film](proof/launch-template/source-switch-20261010/download-bundled/native-download.mp4), [download and complete-decode receipt](proof/launch-template/source-switch-20261010/download-bundled/native-download.json), [redacted browser process exits](proof/launch-template/source-switch-20261010/chrome153-download-crashes.txt).
- [Existing full edited film playing inside Studio with timeline](proof/launch-template/cycling-rhythm-20261010/cycling/edited-in-studio.mp4). This earlier recording is retained evidence; it is not the source-preview benchmark. Its sound comes from the exact finished film, not a qualification of live predictive-preview audio.
- Product files: `frontend/src/components/ViralClipStudio.js`, new `studioSourcePreview.js`, new `__tests__/studioSourcePreview.test.js`. An existing four-camera test source fixture now includes its required owned `storagePath`; camera production behavior/assertions are unchanged.
- QA files: new `scripts/creative-templates/source-preview-proof.js`; optional diagnostic build override in `run-local-app.js`. Readiness, three matrices and this report record the scoped result without capability promotion.

Thirteen focused component/helper guards pass (two suites; 99 unrelated tests skipped); the optimized normal App build passes. [Retained guards](proof/launch-template/source-switch-20261010/source-component-guards.log), [build log](proof/launch-template/source-switch-20261010/optimized-app-build.log). Director kernel, record validator, syntax and whitespace checks are recorded in the checkpoint after final verification. No new GPU, model or renderer job was started. Local workers were not started. Muted/headless QA does not provide a fresh human soundtrack review.

## Remaining blockers and next work

Raw playback still has approximately 1.6–1.8 seconds overhead in the short measured edit. Broader long/mixed/speed/mask/camera/audio testing remains unqualified. Installed Chrome153 download crashes remain open. Whole-stage predictive preview/export picture, mapped cuts, titles and sound require paired comparison. Full moving-film/sound creative review and founder acceptance remain pending. Normal-account model lifecycle, production template/publication adapters and pinned authentication showroom handoff remain incomplete. No public release, hero qualification or PRO/PRODUCTION-ready promotion occurs.

Continue shared **S02**: compare mapped preview/final cuts, framing, titles and sound on this retained cycling project, repair exercised differences, then revise the shared creative edit after full-film/sound review. Do not populate the welcome showroom before the films pass creative acceptance.

Final checks: record validator, Director replay kernel, QA script syntax and whitespace PASS. Five actual paused raw-source frames across the programme and the full timeline were visually inspected in the repaired App; source footage/typography remained visible and the canonical hash was unchanged. The selected final-card transform handles in the last preview are ordinary editing controls, not final movie content. [Repaired full timeline](proof/launch-template/source-switch-20261010/visual-inspection/repaired-timeline.png), [Studio workspace](proof/launch-template/source-switch-20261010/visual-inspection/repaired-studio.png), [mapped-frame receipt](proof/launch-template/source-switch-20261010/visual-inspection/visual-inspection.json). The owned browser was closed, temporary copied authentication state removed and owned local App/API shutdown initiated. Original QA profile and all project/film evidence remain preserved.
