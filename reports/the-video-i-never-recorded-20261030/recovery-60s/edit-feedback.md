# Native motion edit — delivered footage and candid findings

30 October 2026. The two new presenter takes now have an actual **16-second AutoPromote motion edit**, saved directly in [Videos](</home/tibule12/Videos/The Video I Never Recorded - Motion Edit.mp4>). [Complete review folder](</home/tibule12/Videos/The Video I Never Recorded - Motion Edit/>) contains the raw source assembly, both untouched provider originals, synchronized comparison, native editing recording, complete matching Studio playback, editable project and screenshots. This is the available footage edited now; the requested 60-second cinematic opening remains unfinished.

## Where the editing happened

The actual updated Studio frontend ran at `http://127.0.0.1:42231`, built from `/home/tibule12/Projects/AutoPromte/AutoPromote-monetization-continuation-20261027`, branch `feat/rewarded-credits-continuation-20261027`. [Actual frontend screenshot](../proof/recovery-edit/actual-studio-frontend.png), [full matching Studio recording](../proof/recovery-edit/opening/edited-in-studio.mp4), [verified frontend bundle](../proof/recovery-edit/isolated-build.json) and [backend/worker manifest](../proof/recovery-edit/repaired-runtime-manifest.json) provide evidence. Bundle `main.666c917c.js` was built against the fresh `demo-autopromote-credits` emulators and loopback API. Normal demo sign-in was used; no production authentication was imported. Browser and worker outbound access were restricted to local services. No production deployment, production user-data write, new generation or paid GPU run occurred during this edit.

Graphics composition import created ordinary native layers and keys through the Studio UI. Motion controls authored the main-video moves; native Undo/Redo and independent backup restore passed. Studio's ordinary Export and owned download produced the movie through the canonical CPU renderer. The delivered project has **23 graphics layers and 160 motion keys**, including 56 main-video keys. SVG artwork was rasterized by the existing native importer; it is not editable vector contour artwork.

## What the edit does

It opens on the unobstructed presenter with a small 08:42 annotation. At “video,” native camera keys shrink and reposition the picture into a recording frame. Word choreography emphasizes “NEVER SAID.” The second take introduces FACE, VOICE and ROOM on their measured spoken cues, followed by the return to the full presenter. A measured source-audio envelope has a native animated time cursor; this is not an audio-reactive effect. The envelope and frame are static artwork; their timing, opacity and cursor movement are native Studio decisions.

No clock appears. These two takes end before the clock dialogue. Adding either reading here would contradict the spoken scene. The retained longer script still uses fabricated **02:17** versus the real clock stopped at **11:06**.

## Creative verdict

**A useful native motion edit of the available clips; insufficient for approval of the cinematic minute.**

| Requested quality | Observed result |
|---|---|
| Curiosity in the first ten seconds | The opening line supplies a clear mystery; the recording move and “NEVER SAID” give it visual emphasis. The source remains the main strength. |
| Believable presenter | Sampled frames show direct gaze. Take 2 still has harder skin texture and edge contrast. Voice identity, acting and perceptual lip sync need listening review; signal correlation does not establish them. |
| Convincing depth | Not achieved. This is a 2D recording layout. It does not demonstrate a perspective-correct video plane or sophisticated lighting. |
| Spoken clock reveal and understandable contradiction | Not present in the available source, so neither is claimed. |
| Smooth polished motion | The export contains all 384 frames with no identical adjacent decoded frames. Actual Studio display drops frames; smooth real-time preview is not qualified. Main words are readable; secondary evidence labels are too small for confident small-screen reading. |
| Substantially more compelling than raw | The semantic emphasis and composition improve the excerpt, but the flat layout does not meet the requested cinematic standard. Full-production approval is not justified. |

The existing native-perspective repair proposal remains necessary for the intended reconstruction sequence. It has not been implemented or concealed with externally rendered effects.

## Technical findings

- **Movie:** H.264, 1280×720, 24fps, exactly 384 pictures / 16 seconds; AAC source speech retained. Full decode passes. Both original 1080p provider-file hashes remain unchanged. The Studio source is a plainly disclosed 1080p recompressed assembly of those originals, not a new performance or an externally edited motion film.
- **Audio:** measured zero relative offset, correlation **0.998066**, gain **0.986338** against the exact working source. These verify signal preservation, not mouth synchronization or voice acceptance.
- **Preview/export:** eight actual paused Studio frames are paired with exported frames. The decoder reaches a settled, non-seeking state. The live seeks are fractional seconds; export samples use the preceding 24fps frame. Differences remain, and exact decoded-PTS/pixel parity is not claimed. After export, the only creative-document changes apart from revision/history are storage paths on four uploaded artwork layers.
- **Real-time playback:** corrected, unscreencast checks complete the finished file and one live-edit loop. Finished playback reports **380 decoded / 74 dropped** display frames; live edit reports **382 decoded / 62 dropped**. Both take about 16 seconds. Studio naturally loops the live edit; the first observer incorrectly waited for a permanent ended state. That observer failure is retained, and is not evidence of a live-preview stall. Full playback recording captures **18.06 screen frames/second** and therefore does not prove smooth 24fps display.
- **Clock readback:** during decoded-frame callbacks, live UI playhead readback differs from media time by median **0.1667s**, 95th percentile **0.3333s**. This measures the displayed playhead, not every composited pixel. Ordinary overlay poses consume `previewTimelineTime` derived from `videoTime`; the smallest proposed follow-up is to drive overlay/playhead evaluation from the existing decoded programme clock and profile per-frame editor work. Do not claim whole moving-picture parity before that repair and paired validation.
- **Bounded renderer repair:** the sequence-normalization and reframe intermediates ignored a smaller selected delivery resolution. Two initial file-limit failures and one subsequent finish-stage CPU failure are retained. The local canonical worker now downsizes those working canvases when delivery explicitly requests a smaller size; source-sized and larger requests preserve existing intermediate dimensions. Resource limits remain unchanged. The successful native render finishes in **104.93 wall seconds**. The downloaded SHA-256 exactly matches the local worker artifact: `f3bebb22e269046a55953c9d195a02500bcb3c51a02fe1a14d4482d8ac8cda85`.
- **Checks:** 29 focused worker tests and seven subtests pass using pytest's importlib mode, including real fit/letterboxing and authored-duration checks. The first default-mode invocation had one package-relative-import error; it is retained. Studio continuity validation passes without readiness promotion.

[Verification and file hashes](../proof/recovery-edit/verification.json) · [Live/finished observations](../proof/recovery-edit/live-and-finished-playback.json) · [Worker executions](../proof/recovery-edit/local-executions.json) · [Regression result](../proof/recovery-edit/worker-regression-importlib.log).

## Files and reopening

`01 - AutoPromote Native Motion Edit.mp4` is the native final. `02 - Raw Source Assembly.mp4` is its exact unedited working proxy; `Original Take 1.mp4` and `Original Take 2.mp4` preserve the provider bytes. `03 - Raw vs Native Edit.mp4` uses a utility side-by-side assembly solely for synchronized comparison. All evaluated motion remains in the separate native final and editable project.

`04 - Editing in Studio.mp4` records actual authoring; `05 - Complete Studio Playback.mp4` shows the whole matching film and timeline. The latter recording's soundtrack is muxed from the verified native final at the measured playback offset because browser QA is muted.

`Editable Project.autopromote.json` is the native pre-export backup with its four artwork files embedded. Its creative decisions match the final; native artwork upload adds storage references during export. The video itself is linked, not embedded by Studio's backup format. Keep `02 - Raw Source Assembly.mp4` beside it. In a new isolated Studio session, restore the backup, import that source through Media and use **Replace selected clip** on the existing single 16-second clip if the old demo link is unavailable. This keeps the clip's duration and effects. `Export-linked Project.autopromote.json` is retained as export provenance; its emulator URLs are temporary. No portable, cloud-independent restore after re-upload has been qualified here.

Next engineering work is the moving preview clock/display-rate repair and shared ordinary-layer perspective, followed by the full clock narration once suitable source and its spending are authorized. No further provider request is part of this delivery.

The owned isolated demo services were stopped after delivery. The existing unrelated application services were left running. The URL above identifies the verified editing session; use the saved movie and Studio recording for review.
