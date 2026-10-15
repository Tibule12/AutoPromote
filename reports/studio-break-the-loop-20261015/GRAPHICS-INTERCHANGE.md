# Graphics composition interchange v1

Open Graphics → Import animated graphics and choose a JSON file. The programme aspect must match; all imported timing must fit the current programme. The import adds graphics above existing layers. Undo removes it in one action. Titles remain text; static SVG artwork becomes an ordinary raster image with editable transforms and keys.

The file contains `format: "autopromote-graphics"`, `version: 1`, `name`, `width`, `height`, `duration`, `layers` and `groups`. All times are programme seconds, normalized to the existing 90 kHz clock. Dimensions describe the aspect. Layers are listed from back to front. IDs are local references and are replaced with new project IDs on every import.

Each layer contains `id`, `name`, `type`, `startTime`, `duration`, `x`, `y`, `scale`, `rotation`, `opacity`, `width`, and optional `keys`. Position and width are programme percentages, scale is 0.1–5, rotation is −270–270 degrees, and opacity is 0–1. Text layers use `type: "text"`, `text`, six-digit `color`, Inter `fontWeight` (400/600/700/800/900), and `textAlign` (left/center/right). Ordinary Studio title sizing is 36px at 720 programme units multiplied by scale. Artwork layers use `type: "artwork"`, inline static `svg` and percentage `height`. They pass the existing sanitizer and rasterizer, with a 2048px longest-side limit.

Keys contain `property` (x/y/scale/rotation/opacity), `time`, `value` and `easing` (linear/hold/ease_in/ease_out/ease_in_out/bezier). Custom curves also contain `curve: [x1,y1,x2,y2]`, with X in 0–1 and Y in −2–2. Interpolation belongs to the arriving key, matching the rest of Studio. A property may have one key at each clock tick.

Groups contain `id`, `name`, `layerIds`, `startTime`, `duration`, and optional `keys`. Members must be contiguous ordinary layers, each with one parent. Group timing contains all its children. Group X/Y use translation percentages (−100–100), scale 0.1–2, rotation −180–180, opacity 0–1. Group animation uses the existing canonical property keys.

Limits: 128 total graphic layers, 32 imported groups, 256 keys per layer/group, 8192 imported keys, 200000 SVG characters per artwork, 2,097,152 total SVG source characters and 4MiB total file size. Unknown fields and remote media fields are rejected. Invalid imports change no project state.

[The authored example](assets/break-the-loop.graphics.json) contains the complete editable motion sequence. Run `node scripts/studio-professional/author-break-loop.js` to reproduce its authoring file; use the normal UI to import it.
