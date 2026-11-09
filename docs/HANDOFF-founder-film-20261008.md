# AutoPromote founder film — 8 October 2026

Read `../reports/flagship-founder-film-20261008/README.md`, `production-state.json` and `final-self-review.md` first. This handoff concerns the flagship founder-film task; preserve the separate Studio stability work and its handoff. Do not confuse rendered exports with premium creative acceptance or customer product readiness.

## Actual current result

**The founder explicitly rejected these rendered cuts. Three private review exports exist; the public flagship creative gate fails.** The film remains too dependent on repeated source panels/cards and its ident is not the premium studio reveal requested. Root did not obtain founder approval, publish, change the public welcome page, commit or deploy anything.

Private gallery: http://127.0.0.1:3098/review.html . The loopback-only Range-capable server was launched with `setsid` and Chromium verified actual playback, seeking and exact-byte downloads. Private JSON, source brief, native scenes and textures are excluded from its HTTP surface. If the process has ended, start `python3 scripts/content-factory/serve-review.py --root reports/flagship-founder-film-20261008 --port 3098`. Check for an existing listener first.

Artifacts are under `reports/flagship-founder-film-20261008/`:

- Original founder brief: `source-brief.txt`; SHA256 `b880815288204a91cc71d2c125e5eccc6444fe68c07085c21e76e4fc7e797c7c`.
- Treatment, original and final script/storyboard, initial and completed asset requirements.
- Eleven raw NVIDIA Blender takes, final revised ident, ten CPU Kokoro narration takes, editable authored score and cues, receipts and exact source hashes.
- `outputs/rough-v1/one-edit-hero/final.mp4`: rejected 66-second rough.
- `outputs/final-v2/one-edit-hero/final.mp4`: actual **53.833333s**, 1920×1080, 24fps, H.264/AAC; SHA256 `d6ae987aed7bed591ba9dcf685e86aedc4c855a3c632a6a249f89718b937b07a`.
- `outputs/final-v2/one-edit-cutdown/final.mp4`: **27s**; SHA256 `507fdc4a42642d5e47cf4c5c476a703158865781c4c301013142e52bde4ab364`.
- `outputs/final-v2/one-edit-teaser/final.mp4`: **10s**; SHA256 `5b9f84402e60c8e4b31c4db17d0314869928b52f1b23b5c452d00f3323dea97f`.
- Each final folder retains canonical project/document, Director batch/preview, intelligence, render request, edit plan and actual renderer receipt.
- Viewer evidence, rejected preview/rough reviews, `final-self-review.md/json`, `browser-review/receipt.json`, `audio-layout-audit.json`, provenance/disclosure and welcome-page recommendation.
- Artifact archive `autopromote-one-edit-private-source-pack.zip`; `source-pack-manifest.json` binds its entries to exact bytes. It is an editable artifact pack for the existing environment, not a standalone product.

## GPU — stopped, no remaining authorization under this cutoff

Instance `autopromote-l40s-staging`, ID `xgh6wcu74`, NVIDIA L40S 48GB. Fresh `brev ls` after a successful `brev stop` reported **STOPPED**. Do not start it merely to continue reading this handoff.

The founder asked to work quickly without taking hours. Root bounded this film's GPU work to one hour from the first actual preview launch, **06:50:53–07:50:53 UTC / 08:50:53–09:50:53 SAST** (epochs 1791442253–1791445853). All film GPU rendering ended at that cutoff. Other historical chat windows are expired, not current authorization.

The final ident rendered 118 of 120 planned frames before the stop. A resume attempt after the deadline refused before rendering. The VM was recovered only to CPU-encode/copy the existing frames and native scene, with a two-frame editorial hold of the clean lockup, then stopped again. No post-cutoff NVIDIA rendering is claimed. Models and native work remain retained.

Shared `autopromote-studio-qa-media` was preserved. Initial jobs used its shared lease; later bounded ident work followed fresh GPU process inspection while that QA service was idle. Do not claim an exclusive lease for the later pass. Check processes, memory and current cloud state before any newly authorized launch; another chat may change them after this handoff.

## Story and truth boundaries

“One Edit”: an out-of-sync conversation exposes audio/render/caption/format problems, failure and zero capacity, then a real grant opens creative assembly; the film states “The film you just watched was created by AutoPromote.”

This is **assistant-directed** bespoke story/template production using actual AutoPromote generation runtime, Director kernel, canonical document, intelligence and renderer. It does not prove independent arbitrary-brief conception, screenplay-to-film autonomy, released customer generation or full After Effects parity. The renderer's optional `studio_plan` audit remains `legacy_request_without_plan`; canonical-document/Director validation is recorded separately. Do not present that optional audit as passed.

The yacht is retained actual Wan 14B I2V footage from 7 October (`real-voyage-v6.mp4`, SHA256 `54e4102b5fa6df99491cee642dac927732fcd1860a119b213a3ffa97650e61bb`), not newly generated footage in this session. Original source is 832×480; most new spatial scenes are 1280×720 delivered at 1080p. The final ident is rendered at 1920×1080. Conversation/UI images are retained development material, not a filmed reenactment of founder life. New narration is standard Kokoro `af_heart`, not a cloned founder voice.

The dated L4 September denial and RTX October grant are distinct. Regional **3000 milliGPU** means allocation capacity, not 3000 GPUs. The RTX proof is bounded 2-second NVDEC/NVENC qualification, not movie/model-generation qualification. Cards are art-directed archive summaries, never fabricated cloud emails. No credentials were copied to the film runtime.

## Code added/changed by this film task

`scripts/content-factory/founder-film/` contains CPU source preparation, editable Blender scenes (`scene.py`, final `scene-refined.py`), audio synthesis/arrangements, evidence sheets, encoding/collection, reviewed-asset compiler, private CPU renderer runner, browser verification and GPU watchdog. The final standalone `brand-ident-template.json` now matches `ident-final-request.json`; `assets/ident-final/template.json` retains the same parameters.

`compile.js` refuses changed/unreviewed source bytes and reuses `contentFactoryIntelligenceAdapter`, `contentFactoryStudioAdapter`, the Director kernel and canonical export contract. Native references now point to each actual source folder, including `assets/ident-final/scene.blend`. Fixing those references did not change renderer request bytes or output hashes.

`scripts/content-factory/render-existing-studio.py` substitutes only local artifact transport, initializes inert Firebase project metadata to avoid workspace credential discovery and disables cloud status writes. It independently checks complete decoding, timing and non-silent/unclipped actual audio. The audio measurement was corrected to use the encoded channel layout; prior forced stereo measurements were preserved and explicitly superseded, not silently represented as genuine stereo delivery.

`python_media_worker/main_media_server.py`: this task added narrowly bounded `planned_black_ranges` to `RenderViralRequest` and final quality validation. Intentional dark ident anticipation is accepted only inside a declared range; invalid, overbroad, prolonged or other black gaps still fail. Maximum 8 ranges, each ≤2 seconds, total ≤6 seconds, finite times and nonempty reason. Defaults preserve the existing accidental-black rejection. The file contains substantial changes from other chats: do not revert or attribute the whole diff to this task.

`python_media_worker/test_studio_delivery_timing.py` was extended with planned-ident acceptance and accidental/overbroad blackout rejection. It also contained earlier tests from other work. Preserve them.

Native scenes use relative texture paths and some absolute `/film/textures/` paths; mount the report root at `/film` in the retained Studio Blender environment. The archive includes external textures, font and original outlined logo/license. It does not make every template field fully request-editable: several remain native-scene controls. `scene-refined.py` resume skips existing cached frames without input-identity binding; **fix that before using it as a registered reusable provider**, and render into a new directory when changing scene/settings.

## Completed verification

- 9/9 delivery timing/black-range unit tests passed.
- 29/29 Factory and private artifact-access Jest tests passed; log in the report.
- All three complete outputs independently decode, pass the existing final quality gate, contain non-silent/unclipped audio and retain source/request hashes.
- Real Chromium picture playback/seek/download passed for all three, including exact SHA256, HTTP 206 Range and private-file exclusions. Semantic BrowserOperator observation/action verification was used for the downloads; this is not proof of an autonomous general browser planner.
- Actual picture samples and ident frames were inspected; complete human sound/creative acceptance was not claimed.

## Not complete — next creative work

Do not publish the current cut. Read `final-self-review.md` and fix the whole film before polishing a tiny effect.

1. Replace yacht-in-repeating-frames with a physically coherent transformation that changes the visible world and earns a distinct payoff.
2. Replace repeated stills and engineering paragraphs with visible consequences and personal stakes; each fix should change the scene. Preserve historical accuracy.
3. Show a grounded creative decision actually altering a shot/assembly; qualify the exact backend action before implying it works for users.
4. Redesign ident staging: reflection environment, grazing light/material detail and motivated occlusion. The present extruded/glowing mark fails the premium bar. Cycles already supports the required rendering; increasing glow is not a capability fix. Three accepted metallic/glass, AI-energy and minimal directions, plus creator-energy if pursued, remain outstanding.
5. Fix stereo preservation through Studio music materialization and SFX buses with actual distinct-channel regression evidence. **Current final AAC is mono**. Listen to the finished mix and align impact to the actual geometry resolve.
6. Tighten per-segment frame rounding: current 53.75-second plan exports at 53.833333. Portrait exports and a sound-independent clean loop are not delivered.
7. Register/harden the reusable generation provider only after cache identity, fully editable parameters and whole-output quality gates work. The private compiler path is not a completed arbitrary-brief agent.

Current customer Studio readiness is a separate effort. `HANDOFF-studio-stability-gpu-20261008.md` currently reports **20 PASS / 1 FAIL / 8 BLOCKED**, not ready; those scoped PASS results are not blanket product qualification. Browser agent, private Factory, script-to-film foundations, timeline and VFX work from prior chats remain in the workspace; this film run did not establish that all their long-term goals are complete.

Repository: `/home/tibule12/Projects/AutoPromte/AutoPromote-staging-browser-20261004`, branch `agent/director-analysis-staging-browser-v1`, HEAD `7f7530ad746050c094bfc78d0921190da98d2098`. Preserve the extensive existing dirty state, CPU fallbacks and other chat changes. No destructive reset, public release or automatic GPU restart.
