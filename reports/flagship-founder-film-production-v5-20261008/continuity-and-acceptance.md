# The Small Boat — private shot continuity and acceptance gate

The viewer must believe one boat and one stretch of sea change scale. The transformation is the event, not a before/after edit. No asset below is approved merely because it rendered.

## Picture grammar

- Hold the bow's direction screen-right from the paper boat through the yacht. The paper's navy side facets map to the yacht's navy hull; its white centre fold maps to the cream sail. Do not introduce a second hull or detached sail.
- The waterline remains visible during growth. The same swell lifts the boat and then breaks against the full-size hull. A camera arc may reveal the port side and horizon; it must be motivated by the rising vessel, not act as a hidden cut.
- Start close enough to read paper fibres and folded edges. Give the full yacht a clean wider hold, with wake and sail mechanics readable. Use the warm exposure change at the crest as earned reveal rather than a flash wipe.
- Human action follows scale: one Black woman sailor in a navy/cream weather jacket braces, hauls a taut mainsheet through a visible block, then feels the sail fill and steers into clear water. Additional crew may appear naturally in the wide shot, but no duplicate protagonist, unexplained costume change, extra limbs or disconnected rope.
- Sound carries the physical event: paper texture and small water lap; swell and low-frequency pressure; rising canvas/rigging tension; an impact at the first full-size hull; then credible wind, wake and a brief release in the score. The impact must not cover a visible continuity failure.

## Source inspection (8 October)

| Candidate | Observed strength | Defect / use |
| --- | --- | --- |
| `creative-v2/origami-ocean-d/image.png` | One clear white-and-navy paper boat; fold and bow can map to cream sail and dark hull. | Water is smooth and graphic, with no horizon. Use only as first-frame conditioning for a moving test. It is not final footage. |
| `creative-v2/origami-ocean-c/image.png` | More natural horizon and water depth. | All-navy paper has a weaker white sail match and a different perspective. Reserve as alternate source. |
| `generated/real-voyage-v6.mp4` in the existing Content Factory report | Moving full-size yacht, wake, sail and outdoor light read as photographic. | Crew change/disappear across the five-second take; the sail dominates/crops the frame. Consider only a reviewed stable interval, never the entire take by default. |
| `creative-v2/sailor-haul-a/image.png` | On-deck posture and wardrobe direction. | Two people, action does not show a readable mainsheet haul; still only. |
| `creative-v2/sailor-haul-b/image.png` | Stronger effort and rope/deck detail. | Stray second arm, clothing mismatch; still only. |

The two prior VACE attempts failed: edge control gave two vessels and full-RGB control gave a synthetic miniature and abrupt endpoint. Neither may enter the edit. The prepared 14B first/last-frame experiment tests whether a larger model can preserve one vessel and photographic water. It is bounded to one 65-frame take. Do not treat a good first or last frame as success; the middle frames are the test.

## Review after NVIDIA generation

1. Decode at least every fourth frame and inspect at normal speed. Record the frame of first visible material change, first yacht-scale frame, and any duplicate/vanishing hull, sail, mast or person.
2. Check that boat silhouette and direction progress across consecutive frames and the horizon/water perspective evolves instead of replacing the background in one frame.
3. Compare first and last five frames with their references. A technically pinned endpoint with broken intermediate motion fails.
4. Accept a shot only if it reads as a physical continuous change without explanation. If it fails, record exactly where and why, then change the source/geometry/conditioning method rather than seed-hunting.
5. Generate human movement only from a source with visible connected rigging, then check action frame by frame. A timed still container is never an action shot.

The 22:00 SAST paid NVIDIA cutoff is a hard bound. The Studio QA session currently owns the shared L40S lock; this experiment waits for a free lock or an explicit change of priority. The CPU render path and all existing work remain preserved.
# 20:10 SAST: endpoint task correction

The completed Wan2.2 I2V two-endpoint take is rejected: frame 34 replaces the
paper/ocean world with the yacht world. Review the entire decoded sequence in
`morph-i2v-review/all-65-frames.jpg`, not only its matching endpoints. The new
explicit `flf2v` profile uses the official trained first/last-frame Wan2.1 model,
pinned to revision `17c30769b1e0b5dcaa1799b117bf20a9c31f59d7`. Its preparation
and all local hashes are verified, but creative capability remains unproven.

The preview must show visible fold/edge development, a continuous attached mast
and hull, moving water and a coherent camera/scale change. A matched endpoint,
dissolve, concealed cut, photographic surface or completed CUDA job cannot pass
that gate. Only an accepted preview bound to its exact video hash authorizes
the runner's full-resolution mode. The original I2V defaults and CPU final
renderer remain available.
