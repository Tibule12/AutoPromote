# Original AutoPromote logo — founder review

An original two-part AP monogram and AutoPromote wordmark. The lavender A
overlaps a violet P; its diagonal edge creates a visible structural join.
The two open counters keep the initials legible in monochrome. An earlier
R-like study is retained as development material, not the selected mark.

The artwork was authored as vector paths on CPU. No GPU, generation API or
older logo asset was used. The app's current branding has not been replaced.

- `brand-preview.png`: dark presentation with monochrome and app-icon versions.
- `autopromote-logo-dark.svg` / `.png`: transparent lockup with an ivory wordmark.
- `autopromote-logo-light.svg` / `.png`: transparent lockup with an ink wordmark.
- `autopromote-logo-white.svg` and `autopromote-logo-black.svg`: single-colour lockups.
- `autopromote-symbol.svg` / `.png`: standalone transparent symbol.
- `autopromote-app-icon.svg` / `.png`: icon on the rounded ink background.
- `app-icon-{24,32,48,64,128,256}.png`: actual exported icon sizes.
- `logo-geometry.json`: original component paths, outlined wordmark glyphs and
  affine transforms. Retain the uniform scale, spacing and hole geometry.
- `brand-asset.json`: source brief, design decisions, settings and artifact hashes.
- `verification.json`: exported byte hashes, dimensions and transparency checks.

The wordmark uses Ubuntu Sans at weight 620, converted to paths. The SVGs are
self-contained and need no installed fonts, remote resources or scripts.
Typography attribution/license information is in `typography-license.txt`.

Reproduce using `scripts/content-factory/create-original-brand.py`; preparation
requires fonttools, cairosvg and Pillow plus the source font path. Paths remain
editable in vector editors. This source is suitable for an independently staged
geometry reveal; no finished 3D ident or Factory provider integration is claimed.

The rejected older rocket experiment remains separate under the reports tree.
Its raster-specific renderer expects thirteen components and must not consume
this new two-part symbol through a count/shape shortcut. A future backend ident
adapter must preserve these Bézier paths and their counters, then qualify actual
renders and sound before integrating the new brand.
