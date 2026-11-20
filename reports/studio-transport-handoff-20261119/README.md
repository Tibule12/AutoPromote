# Studio transport and desktop handoff

19 November 2026 · Professional Studio working tree based on `81e4b791`.

## Changes

- Trimmed, saved clips now pass their current source in/out points and duration to the SRT/VTT mapper, including clips recorded with the older `startRequest` and `endRequest` fields.
- Match Source reads the original picture stream’s average rate from the owned first source. Timeline SMPTE, frame stepping, finished playback seeks and desktop handoff consume the verified rate. If the rate is unavailable, the editor can choose a fixed rate for frame navigation and timeline handoff.
- Shift+J and Shift+L scan the existing preview at 1×, 2× or 4×. K stops the scan. The existing J-cut and L-cut actions keep their unmodified keys. Shuttle uses the output clock and leaves pacing, speed keys and export settings alone.
- OTIO preserves the fractional rate, exact retimed picture and dialogue ranges, separate cutaway and music tracks, and the translation checklist. The primary-cut EDL uses the same delivery frame grid to write record points.

## Native rehearsal

The signed-in headless browser imported a 60.060-second 23.976 fps dialogue fixture, trimmed and split it, added a cutaway and animated title, imported and approved four caption cues, and added a music bed. It authored a 1.25× edit. Forward and reverse shuttle moved the native playhead, K stopped it, and the before/after project saves retained the same speed and speed keys.

Studio downloaded SRT, VTT, OTIO, CMX 3600 EDL and a native backup from its normal controls. The OpenTimelineIO 0.18.1 readers reopened both timelines. Each primary picture track carries two clips totalling 1,114 frames at 24000/1001 fps. OTIO also carried a separate cutaway, dialogue and music. The EDL carries the primary cuts and linked source audio. A 10-second SMPTE jump positioned the programme at 10.010 seconds. [OpenTimelineIO schema reference](https://opentimelineio.readthedocs.io/en/v0.18.1/tutorials/otio-serialized-schema.html)

The ordinary render produced a 46.463-second 720 × 1280 H.264 movie with 1,114 frames at 24000/1001 fps and stereo AAC. It played to the end in Studio and passed a complete picture and audio decode. The finished movie and the two handoff timelines agree on the picture frame count. One sandbox job completed, and the checkpoint confirmed zero open credit holds.

The final mixed audio measured −13.8 LUFS integrated, −1.0 dBTP, and 2.5 LU of loudness range with FFmpeg. Those readings describe the downloaded mix. Five paused 372 × 660 preview samples had mean absolute 8-bit channel differences from 2.369 to 5.983 against their corresponding output frames. The largest 95th-percentile channel difference was 11. These are sampled measurements for the rehearsal. The same source clip was repeated to create the longer fixture.

## Review package

The private Videos folder **AutoPromote - Studio Timeline Handoff - 2026-11-19** contains the standalone movie, the complete 153-second editor recording, draft timeline SRT/VTT, the original OTIO and EDL, and the native backup. A second OTIO resolves six local media references against the packaged source, cutaway and music files. It has been reopened with the SDK. The raw Studio handoff and backup retain their original source references alongside the private local Auth, Firestore and Storage snapshot.

The browser recording is muted. The standalone movie carries the dialogue and music mix. Earlier proof takes are retained, including the original OTIO duration mismatch and the 30-second default sandbox that declined the longer source before render admission.

Focused checks passed for timeline and format handling, the integrated editor handoff, source authorization and preview decoding, and the regenerated Director replay bundle. Eight anonymous welcome comparisons and three signed-in help questions passed with zero browser errors. [Verification and checksums](verification.json)

## Remaining work

The source-rate inspector shares the existing 128 MiB owned-file preview cache. A fixed delivery rate remains available for sources outside that preview limit. Resolve import and media relinking, variable-speed interchange, client listening review, full-programme picture/audio parity and broad production qualification remain open. The service and recording ran on an isolated CPU sandbox. This working tree awaits release integration.
