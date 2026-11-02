# Footage-led opening templates

The shared Studio template catalogue now contains six authored hook families.
They create ordinary source occurrences, editable text/caption layers, framing
keys and audio decisions through `instantiateStudioCreativeTemplate`. They use
the existing Studio compiler and final renderer. They do not import an already
composited marketing movie or introduce another editing engine.

| Family | Opening structure | Footage roles | Nominal length |
| --- | --- | --- | --- |
| Podcast — Before the punchline | Guest statement → genuine reaction → the question beneath it | Statement, reaction, question | 12s |
| Interview — The question underneath | Complete question → selected answer; alternate starts with the answer | Question, answer | 16s |
| Cinematic — One more round | Action flash-forward → wider context → escalating conflict → open question | Action, wide, conflict | 14s |
| Story — Tomorrow might be kinder | Glimpse of hope → struggle → movement forward → decision | Struggle, journey, payoff; optional narration and closing words | 16s |
| Motion type — One more, then another | Five word accents drive an actual movement/counter-angle edit | Action, detail; exactly five editable words | 10s |
| Creator — Make the cut mean something | Show the unstructured source, then demonstrate preparation/context/result | Before, context, result | 14s |

Each has a second authored cut arrangement. Optional music stays optional. The
spoken templates preserve original sound. A reaction must be selected from
appropriate footage; the template cannot know whether unrelated material is a
truthful reaction or whether an answer preserves the speaker's intent.

In Studio, open **Hook → Browse story-driven hooks**, or the template library
in the media/project rail. Opening the library reserves readable desktop rail
space and wraps its labels; closing it restores the usual editor layout. Select a template and arrangement, bind the saved or
newly uploaded source media and set each source in-point. Spoken roles also
accept a source out-point: downstream cut, title, framing and sound times move
with the selected sentence rather than time-stretching it or chopping it to a
fixed preset. Each selected duration resolves once to the nearest 24 fps frame,
avoiding accumulated rounding at the final picture. Source ranges are bounded to 0.25–30s and the assembled hook to
90s. Aspect choices are 9:16 and 16:9. Subject framing is explicit and editable;
it does not claim automatic face, reaction or semantic analysis.

Use **Source framing and captions** to choose source focus X/Y and zoom. Zoom
is materialized as ordinary main-video scale keys at its cuts. Caption JSON is
an array, or an object containing `segments`, with `start`, `end` and `text`
using source seconds. Optional `speaker`, `language`, `textReviewed` and
`translatedToEnglish` retain the supplied review/translation provenance. Unknown
voices or language and unreviewed words keep the normal caption review gate.
Reopening retains source captions once per bound asset. Replacing a source clears
its imported caption draft, preventing unrelated speech from moving to new footage.
Caption words are supplied by the creator, not inferred
by this template. The existing source/occurrence projection follows reordered
footage. It supports up to 500 cues per role and 1000 per hook; imported text and
source timing are validated. Captions remain editable in the normal inspector.

**Apply hook template** replaces the editable composition. Ordinary Undo/Redo,
source trims, captions, graphics, motion, sound, Save, project backup and export
remain available. **Director: prepare hook** builds the same graph as an explicit
reviewable selection; it does not apply itself or start analysis/generation.
Definitions include audience, narrative promise and recommendation signals for
future footage analysis. Actual automatic style recommendation is not claimed.

Current audience observations inform creative testing: real storytelling and
emotion on Instagram/Facebook, motion type and story experiments on TikTok,
and practical visual editing value on YouTube. These are working hypotheses,
not platform rules or algorithm guarantees. This work does not access Publisher,
Queue, subscriptions, credits or advertising, and creates no schedules.

These are private authored templates pending review of the actual moving films
and their soundtrack. `draft` and unapproved creative status remain explicit;
passing a build, technical decode or a subset of geometry checks is not a
professional creative or complete preview/final qualification. The shared S02
picture/audio/colour/edge/low-alpha and broader media gates remain authoritative.
For a conversation that already contains camera changes, select each occurrence
and use **Reframe → Follow existing camera cuts**. Review the detected subject
and every cut. This reuses the existing CPU camera analysis; fixed focus values
alone do not follow a changing camera. Analysis renews owned source access before
reading saved media.

GPU execution is unnecessary for the authored examples; all their cuts, frames,
text and sound use the existing CPU path. Model-backed extraction or effects
can be added through existing Studio capabilities when meaningful and separately
requested.

[Native examples, recordings and verification](../reports/studio-hook-templates-20261026/README.md).
