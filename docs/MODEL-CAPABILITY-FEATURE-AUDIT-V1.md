# Studio / Director model feature audit

Studio/Director AI-dependent controls, private generation paths, advertised adjacent capabilities and deterministic paths that could be confused with AI.

Baseline: `2aaec02b`. Classification describes implementation, separately from formal Studio readiness.

| Feature | Classification | Runtime capability | Current implementation / gap |
|---|---|---|---|
| Director split/trim/reframe execution | `DETERMINISTIC_REAL` | `CPU / deterministic` | Shared 90k-clock command kernel, revision replay, review guards; FFmpeg final execution. A Director label does not establish scene perception. |
| Director visual semantics and source selection | `PARTIAL` | `understand_video` | Private content-factory Qwen3-VL director/critic; general Studio source-shot analysis uses cuts and face observations. Private Qwen inference is real, but no universal scene-understanding service/continuous semantic coverage at baseline. |
| Screenplay scene grounding/coverage/continuity | `PARTIAL` | `understand_video` | Contracts, source assertions and grounded private scene plans exist. Model assertions require verified artifacts and temporal coverage; whole-movie planning remains incomplete. |
| Speaker/face detection | `AI_REAL` | `detect_object` | YuNet ONNX + optional MediaPipe; cascade fallback. Only faces; cannot substitute for arbitrary text-conditioned object detection. |
| Speaker reframing and sampled face tracking | `AI_REAL` | `track_object` | Source-bound detected-face paths, shot-cut handling, missing intervals. Sampled observations, not universal point/object correspondence or re-identification. |
| Shot-boundary evidence | `DETERMINISTIC_REAL` | `understand_video` | OpenCV/FFmpeg image differences and scene thresholds. Detects picture boundaries, not semantic scene identity. |
| Open-vocabulary object/subject selection | `MISSING_BACKEND` | `detect_object` | No Grounding DINO production adapter at baseline. The new pinned adapter must produce real detections before model-output qualification. |
| Reusable subject segmentation and video mask propagation | `AI_REAL` | `segment_subject` | Pinned SAM2.1 tiny private L40S masks; immutable mask PNG cache consumed by VFX compositor. Prior model path is per-feature/private worker, single subject, explicit cut prompts, no hair-matte guarantee. |
| Mask-derived subject position/callout attachment | `AI_REAL` | `track_object` | SAM2 mask centroids drive source-bound callouts. Mask centroid is not a tracked physical point and confidence is not calibrated. |
| Long-range arbitrary point tracking and occlusion re-detection | `MISSING_BACKEND` | `track_object` | TAPNext++ absent at baseline; public checkpoint now locked separately. TAP adapter and qualification still required; do not silently substitute centroids for points. |
| General image/video overlay motion tracking | `PARTIAL` | `track_object` | Manual/keyframe/face-coordinate paths and tracked subject callout subset. No general arbitrary-object/planar tracking service across edits and cuts. |
| Geometric masks and rounded cards | `DETERMINISTIC_REAL` | `CPU / deterministic` | Analytic alpha masks and normal compositing. These shapes must never be called learned segmentation. |
| Text behind a real segmented subject | `AI_REAL` | `segment_subject` | SAM mask occlusion + deterministic text placement. Segmentation quality/occlusion boundaries require actual frame review. |
| Subject rim glow/particles/background grade | `AI_REAL` | `segment_subject` | SAM subject masks followed by deterministic glow/particles/color composition. Effects themselves are deterministic; broader modes are not generative editing. |
| Background parallax and foreground occlusion | `PARTIAL` | `segment_subject` | Real SAM segmentation with small mask-derived 2.5D displacement. No dense/metric depth model, no disoccluded scene reconstruction. |
| Dense or metric scene depth and true 3D-aware editing | `MISSING_BACKEND` | `estimate_depth` | No learned dense depth runtime/artifact contract at baseline. Future Depth Anything/metric depth integration needs its own contract and license review. |
| CPU person/background separation in Motion Sculpture/Reality Break | `AI_REAL` | `segment_subject` | MediaPipe Selfie Segmentation on CPU. Restricted person model; environment/skin refinement is heuristic, not learned semantic object editing. |
| Presenter/face polish | `PARTIAL` | `segment_subject` | Mask-guided smoothing, color/skin heuristics, source-preserving filtering. Not neural face restoration, identity-preserving generation or learned beauty retouch. |
| Reality Break source/transcript-grounded scene brief | `PARTIAL` | `understand_video` | Actual configured OpenAI multimodal call with source frames and literal transcript evidence. Requires API credentials; uncertain transcript/brief output must not become human-verified fact. |
| Generated environment images and empty studio background edits | `PARTIAL` | `generate_image` | Configured gpt-image generation/edit API and private SDXL adapter. General normal Studio generated-image/raw asset lifecycle is unimplemented; availability is configuration-dependent. |
| Reality/story still-plate camera drift labelled as motion | `PROXY_ONLY` | `CPU / deterministic` | _animate_story_plate applies deterministic warps, motes and drift to one still. No independently generated temporal content. Preserve it as a still effect only. |
| Real moving stock/video B-roll retrieval | `DETERMINISTIC_REAL` | `CPU / deterministic` | Pexels source retrieval and native moving clips. Stock selection/placement is distinct from AI video generation. |
| Source-grounded generated moving B-roll | `PARTIAL` | `generate_video` | Actual private Wan2.2 5B on L40S; reviewed/hash-bound generated illustration imported into Studio. Existing feature-owned SSH/deadline runtime; not common scale-to-zero execution or broad production qualification. |
| General editable image-to-video/text-to-video raw takes | `PARTIAL` | `generate_video` | Private Wan provider/checkpoint scripts and factory imports are real. Ordinary Studio generated raw UI/backend release is missing; new runtime proof is separate from broad readiness. |
| Masked video generation/editing, VACE/FLF/refinement | `PARTIAL` | `edit_video` | Pinned private Wan VACE/FLF/refinement scripts exist. No common Studio artifact capability/release; larger-model/RTX paths remain unqualified. |
| Planar display/portal replacement | `PARTIAL` | `track_object` | OpenCV perspective warp using source-grounded/static surface quad. This is planar composition, not persistent learned surface tracking across all frames. |
| Watermark region detection/tracking/cleanup | `DETERMINISTIC_REAL` | `CPU / deterministic` | Region scores/template tracking and FFmpeg blur/delogo cleanup. No generative inpainting; cannot restore unknown original pixels. |
| Automatic speech transcription/word timing/language | `AI_REAL` | `transcribe_audio` | Whisper/faster-whisper, Swivuriso and optional OpenAI diarized transcription. Real model execution, but representative multilingual source is BROKEN for wording quality and remains review-required. |
| Speaker/language diarization | `PARTIAL` | `diarize_audio` | Optional OpenAI gpt-4o-transcribe-diarize path, language classification; fallback transcript labels. No universal calibrated speaker identity; language/diarization unavailable without configured provider. |
| Manual/edited captions, title typography and timing | `DETERMINISTIC_REAL` | `CPU / deterministic` | Canonical source-timed captions, deterministic glyph layout/final render. Caption rendering quality does not imply transcript accuracy. |
| Dialogue denoise, de-esser, loudness, EQ, compression | `DETERMINISTIC_REAL` | `CPU / deterministic` | Validated FFmpeg DSP filter chain. Deterministic restoration, not neural source separation. |
| Voice isolation control | `PROXY_ONLY` | `separate_audio` | voice_isolation selects stronger afftdn plus filtering. UI wording exceeds implementation: no learned vocal/instrument/background separation. |
| Silence, beats, ducking, audio-reactive visuals | `DETERMINISTIC_REAL` | `CPU / deterministic` | Decoded waveform/energy/FFT, FFmpeg silence detection, deterministic envelope ducking. No neural rhythm/semantic audio understanding or generated audio implied. |
| AI instrumental/music generation | `PARTIAL` | `generate_audio` | Pinned private ACE-Step generation adapter and audio artifacts. Normal Studio common audio-AI capability, source/music licensing metadata and listening qualification remain. |
| AI narration/TTS | `PARTIAL` | `synthesize_speech` | Kokoro private model adapter; browser/recorded voiceover also exists. Normal source-bound waveform lifecycle uses imported/recorded audio; no generic model runtime TTS contract yet. |
| Generative lip sync or face reenactment | `MISSING_BACKEND` | `edit_video` | multicam_lipsync_repair is clock alignment, not generated mouth motion. No neural lip-sync/reenactment capability. Preserve source face and sync authority. |
| Cam Combiner alignment/master audio/final synchronization | `DETERMINISTIC_REAL` | `CPU / deterministic` | Authoritative synchronization and deterministic render. Explicitly preserved; model results never overwrite synchronization. |
| Kinetic typography, transitions, light effects and speed | `DETERMINISTIC_REAL` | `CPU / deterministic` | Existing authored/keyframed native motion and FFmpeg final composition. Browser preview approximations are not learned generation. |
| Authored 3D logo/title/scene render | `DETERMINISTIC_REAL` | `CPU / deterministic` | Blender/OptiX and ordinary authored scene parameters. A native 3D renderer is not a text-to-3D model; broad Studio 3D parity remains partial. |
| Advanced 3D audio-reactive field | `PROXY_ONLY` | `CPU / deterministic` | Browser reactive controls previously ignored by native final paths; unsupported controls disabled. Do not qualify as AI or as functioning final-render reactivity. |
| AI mesh/scene/rig/material generation | `MISSING_BACKEND` | `generate_3d` | No learned 3D-generation worker. Future worker class only; authored Blender assets must retain deterministic classification. |
| Learned video super-resolution/frame interpolation | `MISSING_BACKEND` | `enhance_video` | Current resolution/frame-rate delivery paths resize/resample deterministically. No neural upscaler/interpolator worker; output 4K alone is not AI enhancement. |

Exact source paths and hashes: `reports/model-capability-runtime-v1-20261009/feature-audit.json`.

Source audit plus retained historical evidence. New runtime models are recorded in execution receipts; CPU mocks do not qualify model output.
