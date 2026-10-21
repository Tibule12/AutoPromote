# Logo Workshop controls and consumers

The workshop is an **authoring operation**, not another document or renderer.
Creation drafts are local form state. Add logo materializes ordinary
`overlays[].vectorShape`, base transforms, `compoundClips[]` group membership and
optional `motionKeyframes[]`. There is no hidden live binding from outlined
letters back to a brand-name string. The accepted canonical project owns the edit.

| Control | Values / default | Accepted decision and consumers |
| --- | --- | --- |
| Start a logo design | One bundled eight-second 1280×720/24fps canvas | Existing entitlement and owned `studio_source` upload; ordinary source metadata/clip and Studio entry. No generation API. |
| Brand name | 1–32 A–Z/a–z, digits, space, &, period, hyphen; AutoPromote | Exact bundled glyph contours become ordinary vector layers; names label their provenance. No font/image reference in SVG masters. |
| Symbol family | flow / orbit / facet; flow | Authored cubic geometry becomes separate `vectorShape` layers. |
| Layout | horizontal / stacked / symbol; horizontal | Ordinary `x`, `y`, `width`, `height` percentages on programme coordinates. |
| Lettering | bundled Inter 600 / 900; 900 | Versioned exact font contours, normalised into bounded editable square geometry. |
| Letter spacing | −2…12 design pixels; 1 | Changes authored glyph advances/base positions. Signed drafts commit on Enter/blur and cancel on Escape or lock. |
| Symbol size | 0.6…1.4; 1 | Changes symbol layer base dimensions and lockup layout. |
| Primary / accent / lettering | six-digit hexadecimal; #763bff / #00c8ef / #eef2ff | `vectorShape.fill` solid or linear paint; same SVG preview, master exporter and worker geometry. |
| Gradient symbol | boolean; true | Symbol `fill.kind`, endpoint colours, percentage start/end. |
| Assemble pieces | boolean; false | Eight ordinary opacity/scale/rotation/Y keys per layer. Normal programme time, key easing/value editing and history. |
| Add logo | one graphic group and bounded layers | Existing Graphics import materializes geometry, ordinary cached asset refs, group and keys in one history operation. Graphics/image track lock, 128-layer budget and concurrent-project guard apply. |
| Export logo group | current flat Logo group | Reads current native member order and geometry. Missing/nested/non-vector members reject before download. |
| Colour version | colour / light / dark; colour | Temporary export paint projection; source project remains unchanged. |
| Download SVG / PNG | transparent full artboard | Current vector shapes, anchor/base transform, fit, opacity, static group transform and base stroke trim. Before motion; ignores no active composition effects—unsupported masks/crops/filters/rounded frames/blends reject explicitly. PNG rasterizes the same SVG, up to the existing 2048px artwork bound. |
| Vector contour | one of 1–8 native contours | Selection is transient; point/tangent edits replace only that contour in version-two geometry and use normal history. Version-one documents remain unchanged. |

`vectorShape.version: 2` uses `contours: [{closed, nodes}]` instead of the old
root `closed/nodes`. Fill/stroke retain version-one semantics. One to eight
contours, 2–64 nodes each (three for a closed contour), at most 256 total. Each
anchor is 0–100%; endpoint-relative tangents are ±200%. Even-odd fill XORs closed
overlap masks; ordinary start/end/offset samples each contour independently.
No artificial connecting strokes, inferred image tracing or contour morph keys.

The same geometry is consumed by native SVG images, the project adapter and
validator, shared compiler/Director replay, transparent master SVGs, and the
existing worker image compositor. Cached raster source bytes are transport
assets; edited `vectorShape` remains authoritative for preview and export.
Save/reopen/backup preserves geometry and ordinary asset ownership references.
Rebuilding the glyph data uses the exact bundled licensed font bytes and records
those hashes. No runtime font download is required.

Native conformance includes signed input, alternate family/layout drafts without
project mutation, design creation and counter-edit Undo/Redo, track lock, exact
cold reopen, six transparent downloads, a native 14-layer/112-key movie, three
settled geometry pairs, complete matching playback and independent backup
restore with byte-identical PNG re-exports. Whole low-alpha/colour/live-sound,
parent/mask/retime combinations and professional/creative qualification remain
separate.
