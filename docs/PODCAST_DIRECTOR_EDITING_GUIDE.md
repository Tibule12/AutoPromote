# Podcast Director editing guide

This is the required edit grammar for turning an already edited landscape podcast into a clean 9:16 Studio export.

## The finished look

- A solo speaker fills one rounded portrait frame.
- Speaker changes use direct cuts between the two reviewed solo crops.
- A Director split shows synchronized speaker feeds in separate rounded cards.
- Either speaker may lead the split. Card order follows the conversation and may reverse later.
- Captions stay inside the active speaker's card during a split.
- The complete portrait composition sits on the Studio black background with a rounded outer frame.
- The rounded outer frame is locked for every After view and every export. **Fit full** and **Fill canvas** only change how the source video fits inside that same frame.

## Studio workflow

1. Open **Creator** and load the full programme.
2. Select **Reframe**, choose **Solo Speaker**, and use **Follow existing camera cuts**.
3. Studio detects the source camera cuts, follows the dominant full-size face, measures baked picture padding per shot, applies the smallest fill that removes it, moves automatic captions away from the face, applies **Studio Natural**, and locks the 10% rounded outer frame. If a very short source cut has no usable face, Studio holds a nearby clean full-size reaction picture while keeping the original audio clock. These results are regular editable timeline cuts and framing points.
4. Scrub every detected cut. Keep the face, shoulders, microphone, and useful hand gestures in frame. Add a framing correction where a detected crop changes after the source camera cut. Use **Picture fill for this camera shot** only when the automatic fill needs correction.
5. Studio suggests **Show Everyone** only when both full-size speakers are visible in the same source moment. Nearby shots from a flattened programme are cutaway candidates, not synchronized second feeds.
6. If no safe split is suggested, leave the shot solo or add the separate camera recordings. Studio never promotes a small reaction window or an earlier shot into a live split panel.
7. Use **Speaker 1 on top** or **Speaker 2 on top** at the playhead to record the card order. Change the order later when the other composition reads better.
8. Return to **Solo Speaker** at the split exit. A typical split lasts about 0.8 to 1.2 seconds.
9. Open **Captions**. Use the compact boxed style and set a split caption to **Custom** placement. Put it in the lower part of the active speaker card. Move it with the speaker when card order changes.
10. Open **Color**, apply the natural Studio grade, and inspect skin, the cream sweatshirt, the blue striped shirt, and the red monitor together.
11. Open **Export**, select **Reels**, keep source audio enabled, disable the signature when the job requires a clean master, and review the full timeline before rendering.

The recorded Studio pass plays the real source with synchronized sound while splitting around an unwanted section, deleting it, and closing the timeline gap: [Studio timeline-cleaning recording](../proof/viral-clip-studio/ten-minute-director/frontend-studio-showcase-v2-social-landscape.mp4). A [vertical social version](../proof/viral-clip-studio/ten-minute-director/frontend-studio-showcase-v2-social-vertical.mp4) is available for Reels, Shorts, or TikTok. The [recording receipt](../proof/viral-clip-studio/ten-minute-director/frontend-studio-showcase-v2-social-receipt.json) verifies the edit, live alternate angle, and shared audio/video clock. The [audio/video sync receipt](../proof/viral-clip-studio/ten-minute-director/frontend-studio-showcase-v2-av-sync-receipt.json) measures the first Director cut at 40.9 ms, within the 80 ms review threshold. The [button audit receipt](../proof/viral-clip-studio/ten-minute-director/frontend-studio-button-audit.json) verifies that comparison, framing, layout, and timeline controls work while playback continues.

## Keep only the parts you want

1. Move the playhead to the start of an unwanted section and select **Split**.
2. Move to the end of that section and select **Split** again.
3. Select the new middle clip and choose **Delete this clip**.
4. Studio closes the gap and retimes linked captions, framing, graphics, and sound. Use **Undo** to restore the removed section.
5. Use **Trim start to here** or **Trim end to here** when everything before or after the playhead should be removed.

## Record a synchronized product demo

1. Open `/#/internal/demo-editor` as an administrator or in local development.
2. Select **Record Screen + Tab Audio**.
3. In the browser share dialog, choose the application tab and enable **Share tab audio**.
4. Perform the demo and select **Stop Recording**.
5. Open the captured file in the Demo Workspace, remove pauses or mistakes, and export 9:16, 1:1, or landscape.

The browser records screen and tab audio in one `MediaRecorder` stream. This keeps them on the same clock and prevents the lip-sync error caused by joining separately started screen and system-audio recordings.

## Framing rules

### Solo shots

- Choose the rounded frame once. Keep the same inset and radius through the full programme.
- Use **Fit full** to retain the entire source or **Fill canvas** to crop inside the frame; neither option may change the rounded outer shape.
- Keep visible space above caps and hair.
- If the source already contains a rounded image with bars above and below it, fill that specific camera shot inside the Studio frame. Do not change the outer inset or radius to hide the bars.
- Keep both shoulders when the source allows it.
- Leave room in front of the speaker's gaze and gestures.
- Change the crop on the same frame as the source camera cut.
- Avoid slow automatic drift across a hard source edit.

### Director splits

- Use two clean full-frame speaker views.
- Do not enlarge a small reaction inset or picture-in-picture window.
- Keep both faces comfortably inside their cards.
- Use a narrow center gap so the two rounded cards fill the portrait canvas.
- Remove baked black source padding before framing each card. Otherwise the visible picture can start with a square line inside a rounded mask.
- Alternate top and bottom order when the conversation or shot balance calls for it.
- Return to solo framing before the split becomes visually static.

Reviewed geometry for this proof:

| Setting            | Value |
| ------------------ | ----: |
| Outer frame inset  |  2.5% |
| Outer frame radius |   10% |
| Split card inset   |  2.5% |
| Split card gap     |  2.5% |
| Split card radius  |    8% |

## Caption rules

- Use a compact black box with white text and a yellow active phrase.
- Keep each caption to one or two balanced lines.
- During solo shots, use the lower safe area without covering the mouth or microphone.
- During a split, attach the caption to the active card. Use about **40% vertical** for the top card and **91% vertical** for the bottom card in this layout.
- Move the caption when the active speaker changes cards.
- Keep captions out of the center gap and away from rounded corners.
- Review wording, speaker, and language flags before the final render.

## Grade rules

Use the `studio_natural` starting point with restrained contrast and saturation. Protect the cream sweatshirt from yellow contamination, keep skin neutral, and prevent the red display from clipping. The preview and worker export must use the same precision grade values.

## Required quality check

Review these before starting a long render:

- Every source camera cut and its crop change are frame aligned.
- No face, cap, or head touches the rounded card edge.
- Both split views come from clean full-frame material.
- Split entry, card order change, and split exit have no flash frames.
- The active speaker caption moves with the active card.
- Captions do not cover faces and do not float in the center gap.
- Preview and local export have the same framing, card gap, radius, captions, and grade.
- Fit full, Fill canvas, solo, and split views all keep the approved rounded outer frame.
- Source audio is present and the unwanted signature is disabled.

Proofs for this edit:

- [Rejected ten-minute proof with four visibly square split edges](../proof/viral-clip-studio/productized-podcast-analysis/full-auto-v4/0-600-review.mp4)
- [Earlier visible-edge audit, which checked the outer mask but missed inner square picture edges](../proof/viral-clip-studio/productized-podcast-analysis/full-auto-v4/picture-fill-audit.json)
- [Four short local split renders with corrected visible corners](../proof/viral-clip-studio/productized-podcast-analysis/rounded-split-review-20260924/four-splits.png)
- [Three corrected solo shots immediately after split exits](../proof/viral-clip-studio/productized-podcast-analysis/rounded-split-review-20260924/three-exits.png)
- [Final face-edge candidate audit](../proof/viral-clip-studio/productized-podcast-analysis/full-auto-v4/face-edge-audit.json)
- [Rejected source cut and obscured-face visual review](../proof/viral-clip-studio/productized-podcast-analysis/full-auto-v4/overview/rejected-cut-and-obscured-face.jpg)
- [All four Director split transitions](../proof/viral-clip-studio/productized-podcast-analysis/full-auto-v4/overview/director-splits.jpg)
- [All automated face-edge candidates](../proof/viral-clip-studio/productized-podcast-analysis/full-auto-v4/overview/face-edge-candidates.jpg)
- [Two reviewed detector misses](../proof/viral-clip-studio/productized-podcast-analysis/full-auto-v4/overview/face-not-detected.jpg)

The product path does not read the proof scripts or their timestamp tables. `studio_face_tracking.py` creates an editable plan from uploaded source pixels. Studio passes the measured visible picture window to both preview and export, and the worker crops baked source padding before rounding split cards. The worker preflight blocks missing rounded framing, invalid cut times, missing split views, suspicious split crops above 3×, and a time-shifted second view from one edited source.

Reusable local evidence:

- [Detected 60-second edit plan](../proof/viral-clip-studio/productized-podcast-analysis/real-podcast-60s-plan.json)
- [Clean five-second render from that detected plan](../proof/viral-clip-studio/productized-podcast-analysis/short-render-v3/39-44-review.mp4)
- [Unrelated reaction-podcast plan, with zero reaction-derived splits](../proof/viral-clip-studio/productized-podcast-analysis/unrelated-reaction-podcast-30s-plan.json)
- [Full ten-minute detected edit plan](../proof/viral-clip-studio/productized-podcast-analysis/ten-minute-auto-plan.json)
- [Short render from the full ten-minute detected plan](../proof/viral-clip-studio/productized-podcast-analysis/ten-minute-plan-short-render-v2/172.5-177-review.mp4)
- [Rejected ten-minute render](../proof/viral-clip-studio/productized-podcast-analysis/full-auto-v4/0-600-review.mp4)
- [Studio tour using the detected ten-minute plan, with synchronized sound](../proof/viral-clip-studio/ten-minute-director/frontend-studio-live-edit-tour.mp4)
- [Studio tour receipt](../proof/viral-clip-studio/ten-minute-director/frontend-studio-live-edit-tour-receipt.json)

The earlier audit sampled all 226 camera shots but skipped the split windows and only checked the outer frame. A frame-by-frame recheck found a straight visible picture edge in all 150 split frames and 42 solo frames immediately after split exits: 192 affected frames. The four corrected local split samples show rounded visible edges with a 2.5% gap, and three short exit renders restore the measured picture fill. They are geometry proofs only: the flattened source lacks synchronized separate camera feeds, so the ten-minute split edit is still not a publishable proof. No Cloud Run job was used for these checks.
