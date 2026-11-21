# Studio production visibility audit — 21 November 2026

The signed-in live Studio hides its timeline footer below the viewport at common desktop sizes. This is a layout regression, not a subscription restriction. The candidate restores the dock's flex column, lets the timeline occupy the remaining height after its tabs and resize handle, and raises the resize minimum from 148px to 180px to leave room for tools, timecode and tracks.

The exact candidate stylesheet passes against the real production bundle at 1366×768, 1920×900 and 1280×720: timecode, jump input and Go are inside the dock and viewport and receive pointer hits. The same regression helper rejects the original live layout. Menus retain overflow visibility. The isolated final production build also passes these checks, expanded/minimum dock resizing (minimum now 180px), and More actions pointer access. Eight anonymous welcome comparisons, 19 asset hashes and 47 static entry pages pass. This candidate has not been deployed. [Geometry and panel evidence](verification.json).

| Useful feature | Live status | Where to find it / remaining work |
| --- | --- | --- |
| SMPTE display and Go to timecode | Present, clipped below the window | Candidate layout fix prepared locally; release remains pending. |
| Precision exposure, Lift/Gamma/Gain/Tint, curves, HSL, LUT import and scopes | Present in the signed-in live UI | Color panel; scroll to Precision RGB grade and Video scopes. |
| Dialogue repair, isolation, EQ, loudness and volume automation | Present in the signed-in live UI | Sound → Voice repair & automation. Some processing is explicitly finalized on export; visibility does not qualify predictive audio parity. |
| ProRes 422 HQ MOV, H.265, source size and source frame rate | Present in the signed-in live UI | Export → Codec / Resolution / Frame rate. No new render was submitted by this audit. |
| OTIO/EDL, SRT/VTT and aligned WAV stems | Present behind collapsed disclosure | Export → Desktop NLE handoff (.otio / .edl) & caption sidecars. WAV stem download performs processing; this audit only opened the disclosure. |
| Roll, Slip, Slide, linked edits, snapping and layer keyframes | Present in production bundle and timeline UI | Timeline toolbar, Sequence tracks / Composition layers and Keyframes. Presence does not newly qualify every editing operation. |
| Node Flow, Composite, Motion, Director and Comp & Rig | Present in production | Tool rail and timeline workspace tabs; some controls depend on the selected layer or editing workspace. |
| Event Story · Reveal, People, Payoff | Local, absent from production bundle and live Director template list | Existing uncommitted festival work in the owner worktree. Separate qualification/release needed; it is not a semantic storytelling guarantee. |
| Prepared original-dialogue preview | Cohort-gated local implementation; not established as a general production feature | Requires both the build flag and explicit UID cohort, plus an eligible bounded edit. Do not globally enable it merely to expose a control. |
| Full desktop editing controls on a phone | Desktop timeline absent at 390×844 | Separate responsive product limitation; this fix does not add a mobile editor. |

The public app and Render frontend returned the same `main.da576d47.js` bundle. The audit used the owner's existing authentication in a fresh, headless, muted context, restored an owned project backup normally and permitted reads only. Opening panels produced no page errors or blocked mutations. Original login/project stores were not overwritten. No render, publishing, scheduling, paid allocation, merge or deployment occurred in this visibility audit.

## Remaining blockers and next task

Release and verify the footer fix on production, including normal editing menus and resized dock layouts. Separately qualify/release Event Story. General audio/picture predictive parity, shared S02/S04/S03 work and historical typography failures remain open; this audit does not promote feature readiness. Formal counts remain 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY.

## Concurrent podcast delivery

The exact four-minute original podcast was authored through Studio's ordinary colour controls. Its first production render failed the picture-duration quality gate and refunded 5 app credits. That failed job remains failed. An isolated local run of the same canonical renderer, consuming the same UI export request and verified owned source bytes, subsequently passed unchanged final duration, picture timing, audio and black-frame checks. This proves a local delivery, not production worker recovery. The native project, separate movie and actual Studio action/playback recording are delivered privately in Videos; source/audio identity, full playback and owner listening/picture approval remain distinct from production qualification.

The first isolated build could not reuse the original login because the checked-in production Firebase public key differs from the active local configuration. That build is retained privately; the final candidate uses the active account configuration. No authentication file or deployment secret was changed.
