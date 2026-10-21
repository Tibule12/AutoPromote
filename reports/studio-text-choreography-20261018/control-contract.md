# Editable text choreography contract

Text choreography is an optional version-one decision on an ordinary title.
Existing titles with no animator retain their current rendering path.

`overlays[].textAnimator` stores unit (letter/word), four deterministic ordering
modes, stagger (0–95%), selector range (0–100%), starting X/Y travel (±4 em),
scale (0–2.5), rotation (±360°), opacity (0–1), spread (−1 to 1) and settling
curve (linear, ease out, ease in/out, overshoot). The input remains one editable
copy field. Spaces retain their measured advance and do not consume stagger
slots. Wrapped rows share one ordering sequence. The range selects unit centers;
empty/crossed ranges leave all units settled. Center/edge ties resolve in source
order. There is no randomness or wall-clock state.
One selected unit uses the full progress window; no stagger time is reserved
when there is no second unit to offset.

`textProgress` is a normal numeric motion property from zero to 100. Zero shows
the starting arrangement; 100 settles selected units. Each unit receives the
same progress window with its rank-dependent stagger. Travel, spread, rotation
and scale use the selected settling curve. Opacity follows clamped linear unit
progress, avoiding negative alpha during overshoot. Ordinary progress keys can
reverse, hold or loop the choreography and use the existing value/velocity graph.
All ordinary title transforms, layer timing, masks and stack ordering remain
outside this local text arrangement.

Graphics → Titles → Text choreography enables a title and creates two linear
progress keys over at most its first 1.8 seconds. Rebuild entrance keys replaces
only that title's progress keys. Remove text animator removes its settings/base
progress/progress keys atomically. Settings and motion use normal history and
the Graphics track lock. Numeric drafts commit on blur/Enter; Escape or locking
discards drafts. The key inspector uses the current programme playhead.

The ordinary Graphics JSON import accepts the same title settings/progress keys;
it immediately remaps them to ordinary editable IDs. No retained source package
or separate renderer controls the result. Canonical layer serialization,
document validation, compiler, Director replay and backup preserve these fields.
Orphan progress keys and unsupported targets/values fail explicitly.

Layout uses a versioned, byte-identical browser/worker glyph-advance table derived
from the exact bundled Inter fonts at 36 logical pixels per 720 programme units.
Explicit glyph placement disables platform shaping and kerning. The supported
scope is 180 composed Latin characters, numbers and bundled punctuation, four
Inter weights, up to twelve wrapped rows. A word that cannot fit requires a wider
box or an explicit internal break. Complex scripts, combining sequences, emoji,
arbitrary fonts and editable glyph outlines are outside this first contract.

Preview uses local SVG text groups inside the normal title layer. Export uses
immutable per-unit text patches inside the existing title/image compositor,
evaluating progress on the programme clock after output speed mapping. Travel
padding is excluded from native mask/anchor geometry. Derived title bitmap boxes
can exceed the canvas; image/video width bounds are unchanged. Held still reuse
includes progress in its identity, so a repeated outer pose cannot freeze moving
letters. Decoded video keeps its existing independent path.

Whole predictive picture/audio, complex shaping, broad parent/retime/mask
combinations, smoothness and professional/production/creative acceptance need
their own evidence. The one-minute film is a private review candidate.

Unfiltered animated titles project the same local bitmap and anchor directly into
the bounded output canvas, avoiding a padded square hundreds of MB in size.
Title filters, geometric masks and crops keep the existing grouped compositor.
A real RGBA reference comparison checks four rotations with unchanged geometry
thresholds. Existing non-animated titles and media retain their existing path.
Unsupported animated copy or incompatible style edits are rejected before
mutating the title, preserving its saved valid decisions.

The older separate-layer kinetic builder rejects a title with Text choreography
enabled. Remove that animator before separating the copy into independently
editable title layers, so an enabled rig cannot be silently cloned into every
fragment. Its prior ordinary-title behavior remains covered by regression tests.
