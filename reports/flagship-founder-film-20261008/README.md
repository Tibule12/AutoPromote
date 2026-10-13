# One Edit — private founder-film delivery

Open http://127.0.0.1:3098/review.html and play with sound. The founder rejected this cut. It is retained as failed production evidence, not an approved flagship release. Read `final-self-review.md` for the creative failures that remain.

| Requested item | Delivered artifact |
| --- | --- |
| Story treatment | `story-treatment.md` — intended creative treatment; fulfillment assessed in the viewer review |
| Final script | `script-final.md` |
| Final storyboard | `storyboard-final.json` — 53.75-second editorial plan |
| Actual asset list and provenance | `asset-requirements.json`, `accepted-asset-library.json`, `evidence/source-index.json` |
| Generated/reusable takes | `assets/` — videos, narration, score/cues, native Blender scenes and generation receipts |
| Rejected rough | `outputs/rough-v1/one-edit-hero/final.mp4` — 66 seconds |
| Hero review export | `outputs/final-v2/one-edit-hero/final.mp4` — actual 53.833333 seconds |
| Cutdown | `outputs/final-v2/one-edit-cutdown/final.mp4` — 27 seconds |
| Teaser | `outputs/final-v2/one-edit-teaser/final.mp4` — 10 seconds |
| Welcome-page recommendation | `welcome-page-recommendation.md` |
| Generated versus edited disclosure | `production-disclosure.md` |
| Viewer review / remaining weaknesses | `final-self-review.md`, `final-self-review.json` |
| Technical delivery evidence | Per-output `render-receipt.json`, `browser-review/receipt.json`, `audio-layout-audit.json` |
| Current GPU state | `gpu-final-state.json` — stopped |

Each final output also retains its canonical Studio document, Director command batch, intelligence, renderer request and editorial plan. Accepted bytes are checked before compilation. Asset acceptance means eligible for private assembly; it does not mean creatively approved for public release.

The final ident uses `assets/ident-final/video.mp4`, `scene.blend` and `template.json`. Original vector artwork is in `assets/brand/autopromote-original-v1/`. The prior `ident` and `ident-premium` takes are rejected alternatives, retained only as review evidence. The final 5-second take contains 118 NVIDIA-rendered frames and a two-frame editorial hold of the clean lockup. A post-cutoff resume attempt refused to render; no additional GPU frames are claimed.

The production is editable inside the existing AutoPromote backend/Studio Blender environment. Native scenes use relative texture paths and some absolute `/film/textures/` paths; mount this package's report root at `/film` when opening them in that environment. Required textures, source-frame sequence and typography license are included. Scripts are retained under `production-scripts/` in the archive and in `scripts/content-factory/founder-film/` in the repository. The ident template records the actual final parameters; it is a private authored template, not a fully registered general content-generation provider. Some controls remain native-scene edits rather than fully parameterized request fields. Do not resume frame caches without binding them to the exact scene/settings hash.

The archive is an artifact and source pack for the current repository/environment, not a standalone customer application or a claim that every screenplay workflow works. Do not run GPU scripts without checking jobs and establishing a new authorized cutoff; the original production cutoff has expired. CPU export fallbacks remain available.
