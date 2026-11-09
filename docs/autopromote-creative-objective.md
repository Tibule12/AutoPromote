# AutoPromote creative objective — 7 October 2026

This direction supersedes the earlier feature-led showcase brief. Preserve the
existing editing tools and CPU fallbacks; use them to serve the piece.

AutoPromote competes with its previous work. Feature parity with CapCut,
Premiere, Resolve or After Effects is not the objective. The target is ordinary
raw material turned into a finished story that makes a stranger stop, watch,
understand, reach a payoff, and ask how it was made. AutoPromote's outputs must
earn attention as its marketing engine.

## Before generating a piece

Write a specific creative brief against the available footage and audio:

1. **About:** the actual subject, event, change or idea; source evidence.
2. **Reason to care:** the stakes or curiosity for a stranger, and intended audience.
3. **Opening/hook:** the first picture, sound or spoken line and the question it raises.
4. **Beginning:** the minimum context needed to follow the story.
5. **Development/escalation:** what changes, and how each beat advances it.
6. **Tension/problem/question:** what the viewer is waiting to resolve.
7. **Reveal/payoff:** the source-backed answer, discovery, consequence or transformation.
8. **Ending:** the final emotional or visual beat; resolve the promise before branding.
9. **Withheld information:** precisely what appears later and why the delay matters.
10. **Amplification:** which emotional or visual moments deserve emphasis.
11. **Removal:** which lines, shots and treatments do not advance the story.

For every shot choice, cut, caption, sound, transition, generation, VFX, 3D
object, mask, tracking effect or motion graphic, name its beat, its narrative
purpose, and the simpler treatment considered. Preserve the speaker's meaning.
Do not invent a transcript, implication, event or payoff to rescue missing
source context. Generated illustrations must not be represented as documentary
evidence. Uncertain language stays uncertain until the audio is understood.

## The creative loop

Observe the source → reason about the story → plan editable source-bound
decisions → render → inspect the whole piece with sound → critique as a viewer
→ change the creative decision → rerender and inspect again.

Each review records the exact confusing, boring, premature or distracting
moment with an output time range; what the viewer knows and expects there;
the underlying creative mistake; and the next edit that will address it.
Watch the opening without explanation, then the entire story. Check that the
payoff actually answers the opening promise and that the ending lands. Inspect
framing, readable captions, original audio, transitions and effects in context.

A successful job, valid checksum, matching preview, or large effect count
cannot pass this review. A weak story, random decoration, poor pacing or absent
payoff is a failed creative result. Never call an automated self-score proof of
audience retention. Final marketing use requires a creatively accepted master;
existing publishing and caption-review gates remain in force.

## Current material and candid review

The existing 13-second `autopromote-vfx-review.mp4` is a rejected marketing
candidate under this objective. Its technical qualification remains useful.

| Output range | What fails for a viewer | Creative correction |
| --- | --- | --- |
| 0–1.8 s | Abstract lens and “MAKE IT MOVE” provide no concrete subject, stakes or question. | Open on a source-backed moment that raises the piece's actual question. |
| 1.8–7.8 s | Speaker, title, callout, background and particles compete; six seconds of conversation have no established beginning or payoff. The existing mux replaces speaker audio with a synthesized bed. | Understand the spoken story first. Preserve original speech. Keep only treatments that make a specific dramatic or visual moment clearer or stronger. |
| 7.8–10 s | A Studio shot interrupts the conversation before a resolution. | Let the story resolve. Product evidence can follow the finished result when the marketing format needs it. |
| 10–13 s | A brand close ends the render but resolves no narrative promise. | End on the story's payoff; use a brief brand mark after it if appropriate. |

The saved 46-second TMT excerpt has an unreviewed multilingual transcript:
0–16.08 seconds contains flagged repetitions, and the excerpt ends mid-sentence
(the draft ends with “but I feel like”). It is insufficient evidence for a
complete spoken story or a faithful translation. Do not fabricate a narrative
from this ASR draft. Seek the longer original recording and understand its audio
before choosing the first complete story. This source review is still pending.

`scripts/render-vfx-editorial.py` now preserves speaker audio in the podcast
chapter, but that change has not been rerendered and does not solve the rejected
creative structure. The 36-second software walkthrough is retained as a
walkthrough; it is not evidence of an autonomous, compelling finished story.

The current Director still supports reviewed split/trim commands. Full
autonomous story planning, audiovisual critique and iterative creative
orchestration are not implemented or qualified by the new VFX integration.
Do not relabel renderer controls or a keyword B-roll helper as that agent.

The original GPU window ended and the instance was stopped. On 7 October the
founder explicitly authorized a fresh **three-hour Content Factory session**:
05:50:59–08:50:59 UTC / 07:50:59–10:50:59 SAST. A local stop watchdog is scheduled
30 seconds before that cutoff. The existing NVIDIA L40S is in use; original
model storage remains. Check running jobs before any GPU launch. This new
authorization does not authorize a new machine, Google jobs or production deployment.

The private Content Factory now extends the existing project-intelligence
contract through a server-only generated-provenance option. Customer registration
still rejects that origin. The worker executes released Director trim commands,
compiles the actual Studio document and invokes the existing Python renderer.
Current raw shots and model-assisted review are **candidates**, not evidence of
audience retention. Session artifacts and the GPU cutoff are under
`reports/content-factory-20261007/`.
