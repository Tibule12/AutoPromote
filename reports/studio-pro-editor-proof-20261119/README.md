# Still Trying · Viral Clip Studio editor proof

**19 November 2026 · Local signed-in Studio**

The 8.5-second portrait edit puts a full-screen cutaway and an editable title over the original dialogue. The editor split the source at 4.500 seconds, imported four timed subtitle lines, approved them in Captions and changed the title to **STILL TRYING**. Undo, Redo and a full reload retained two source occurrences, the three-second cutaway, the title and four reviewed lines. A fresh browser restored the downloaded backup under the same local account and matched the complete programme time map without submitting another render. The normal export approval submitted one CPU job for the corrected edit.

## What the comparison found

The initial download played and decoded, but its caption highlight advanced to **up** on frame 107 while the editable preview still highlighted **stood**. Splitting the source had sent two copies of the same line to the renderer with shortened timing. The caption mapper now preserves one cue when the edit continues the same source at the adjoining time. A source jump, transition or split-audio offset at that boundary keeps the cues separate.

The corrected request carries the entire caption as one 2.620–4.920-second cue. The paused pre-render monitor and the downloaded file both highlight **stood** at frame 107 and **up** at 108. The cutaway begins on frame 108 in both captures, and the title entrance is visible in both at frame 109. The comparison sheet retains the remaining outline, contrast and image differences. At the observed 372×660 monitor size, six paired samples gave mean absolute channel errors of 2.693–4.499 on an 8-bit scale and p95 errors of 4–8. The comparison resizes the exported frame to the exact screenshot raster with no fitted position or time. It covers sampled paused pictures. The standalone movie carries the actual mix for listening.

## Delivery settings and evidence

The Export panel shows **MP4 · Rec.709 SDR · AAC** and retains working resolution, frame rate, video codec, quality and AAC bitrate choices. Existing projects retain older export values in their saved state and show a notice when those values are outside the current profile. The render request uses the supported controls. Master audio remix now receives the same AAC bitrate as the main encode.

| Download check | Result |
| --- | --- |
| Duration and frames | 8.500 s with all 204 frames at 24 fps |
| Video | 720×1280 H.264 with BT.709 primaries, transfer and matrix |
| Audio | Stereo AAC at 48 kHz, average 127.583 kbps against selected 128 kbps |
| File | 1,925,944 bytes with SHA-256 `fddbeed3a92052638060599736d1e477597cdb7d3a0e5f301a01f5b31121f880` |
| Playback | Full independent decode, matching completed-job hash, and native Finished Video playback to its ended event |
| Wallet | One succeeded job, two symbolic test credits, zero outstanding reservations in the isolated emulator |

The local package is in `~/Videos/AutoPromote - Professional Editor Proof - 2026-11-19/`. It includes the downloaded film, the actual editing and playback recording, the editable timeline still, paired frames and the native project backup. The recording comes from a headless muted browser. The backup’s owned media require the isolated demo context. A private Auth, Firestore and Storage checkpoint retains that context and the exact media. Public evidence in [verification.json](verification.json) omits private project and access records.

The first rehearsal was correctly blocked because imported lines still needed speaker and language review. The first approved render disclosed the caption timing mismatch. The corrected result comes from a new isolated app build and its own ordinary consent and render. Focused checks cover the mapper and compiler, export controls, audio delivery and Rec.709. The anonymous welcome comparison covers four viewport sizes on each of the two builds.

The result qualifies this edit and its selected delivery. Broader work remains open for paired moving picture and sound, scaled caption appearance, audio edits and retiming across discontinuities, media recovery under interruption, and client handoff formats. S02 remains the next shared task. The readiness register remains 17 functional, 9 partial, 1 broken and 2 unimplemented.
