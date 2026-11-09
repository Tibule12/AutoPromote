# Grounded doubles — final review, 8 November 2026

**Publication held.** The exact six-second movie and editable project pass file, decoding and native binding checks. The corner reconstruction, subject boundaries and audio headroom do not meet the requested clean finish. This review has not changed the movie, submitted a new render, scheduled it or published it.

Reviewed movie: `Grounded doubles.mp4`, SHA256 `b047ad2171665b41242451ad8468b8fd0d4d031a37df099698726e72eb339966`. Native job: `viral_87018777759d0e861bf3fb87a616645d328309195f39bd8b879a4e4cd5eab28e`.

## Picture and sound findings

| Area | Observation | Required correction or limit |
| --- | --- | --- |
| Cleaned corner | The enlarged decoded frames show rectangular, softened backdrop/floor texture and temporal changes. Near 5.75–5.96s the reconstruction intersects the moving shoe boundary and leaves a red smear. Similar texture transitions are visible earlier. | Improve the temporal reconstruction and protect the moving silhouette. The original watermark covers some detail, so exact recovery cannot be verified. [Original/export comparison](Corner%20comparison.png). |
| Subject echoes | The two delayed copies retain clothing/face detail, but soft silhouette edges and imperfect floor contact still reveal the composite at 1.2–5.4s. | Refine source-dependent alpha/contact before claiming realistic duplication. The contact ellipses are authored cues, not solved lighting. |
| Audio | Exact six-second PCM intervals measure **−7.1 LUFS / +0.7 dBTP** in the final, versus **−6.1 LUFS / +1.9 dBTP** in the source. 125 decoded final channel samples reach or exceed full scale. | The source already overshoots; the final remains above full scale. Set conservative native output headroom and remeasure the encoded result. This is clipping risk, not proof of audible distortion. Human listening remains unqualified. |
| Ending | Opening and ending poses differ. | Do not describe it as a seamless loop. |
| Colour metadata | Source declares a BT.709 matrix; final retains BT.709 primaries/transfer but has no explicit matrix tag. | Verify consistent tagging and cross-player appearance. Missing metadata alone does not prove a visible shift. |

All 144 decoded frames are represented in inspected full-frame, faces/hands, feet and corner contact sheets. Those magnified sheets are diagnostic packaging; the original movie is intact. The final remains 576×1024, 9:16, 24fps, H.264/yuv420p with stereo 48kHz AAC. This is a source-resolution export, not 1080p.

## Native and timing checks

All 36 files in the retained delivery hash manifest match. Full movie decoding passes; all 144 video timestamps follow 24fps, with no identical consecutive frames in the downscaled check. Original music from source 8–14s remains at normal speed: waveform correlation is 0.9953 and measured lag is zero at 48kHz. That verifies signal alignment, not subjective sound quality.

The native backup, compiler composition/finish, submitted request, worker request/receipt and delivered movie bind to the same job and bytes. Fresh normal sign-in, exact independent project restore, complete Live Edit playback and finished-file playback passed in the isolated demo, with zero browser exceptions. No new rendering or billing operation was requested.

The fresh silent Studio recordings are retained with the review. Live capture recorded 66 images over 6.085s (~10.85fps); finished capture recorded 160 over 6.09s (~26.27fps). These are capture rates, not proof of smooth native 24fps display. Finished-file playback is separate from live-preview parity. The live cleanup controls show placement guides rather than the final reconstructed pixels, and some paused samples include those handles. Strict source-frame, colour, alpha, edge and audio preview/export equality remains unqualified.

## Copy accuracy

**Title:** One Clip. Three Moments at Once.

**Hook:** Watch what happens behind the dancers.

**Description:** The dancers move forward. Earlier versions stay behind. A dance edit exploring colour, timing and motion echoes in AutoPromote Studio.

Would you try this on your footage?

`#AutoPromote #MotionGraphics #DanceEdit #VideoEditing`

The title accurately describes the lead plus two delayed time states while the effect is active. The hook is proposed post-caption opening text; it is not currently burned into the picture or spoken. The Studio statement refers to actual editable layer/keyframe compositing and canonical CPU export. Foreground/alpha were separately prepared inputs. Do not add claims of one-click or autonomous isolation, photoreal duplication, seamless looping or exact live/export parity. The original carries a creator badge; source/music ownership and publication permissions are not established by this technical review, and the edit must not be described as original filming by AutoPromote.

Destination-specific crops, provider transcoding, a selected thumbnail and actual published-page appearance have not been reviewed. No publication approval is inferred from successful export or the user's approval of draft wording.

Machine findings: [final-review.json](final-review.json), [technical-audit.json](technical-audit.json). The next work is the native corner/body-boundary and audio correction, followed by inspection/listening of the exact new bytes and thumbnail. Earlier rejected movies and valid technical evidence remain preserved; shared S02/S04/S03, typography 13/16 failures and formal readiness counts are unchanged.
