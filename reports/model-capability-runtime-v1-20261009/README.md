# Model Capability Runtime V1 — private vertical proof complete

Branch: `agent/model-capability-runtime-v1`. Assessment: 2026-10-09T14:20:21.874199+00:00.

The common runtime executed Qwen3-VL, Grounding DINO, SAM2.1 and Wan2.2, persisted immutable source-bound artifacts, loaded five references and two video assets into one canonical Studio project, and rendered the actual masked source plus actual moving generated B-roll through the existing AutoPromote renderer. The corrected 1080p/24fps final contains 181 frames / 7.541667 seconds. Actual decoded pixels and muted native playback were inspected. No frontend redesign, Cam Combiner change, production application/rules deployment or main merge occurred.

**Review the movie:** [final.mp4](proof/final/final.mp4). [Final decoded frames](proof/qa/final-decoded-frames.png). [Visual review](proof/visual-review.json).

## 1. Feature audit

42 features across 50 baseline source files: {'DETERMINISTIC_REAL': 11, 'PARTIAL': 14, 'AI_REAL': 8, 'MISSING_BACKEND': 6, 'PROXY_ONLY': 3}. [Full feature table](../../docs/MODEL-CAPABILITY-FEATURE-AUDIT-V1.md), [exact baseline hashes](feature-audit.json). The baseline classification is distinct from this new private runtime proof. Voice-isolation DSP, still-plate drift and other proxies remain explicitly classified; no unsupported neural capability is inferred.

## 2. Capability map and 4. Models actually executed

| Capability | Actual model / implementation | Exact revision | Accepted worker seconds | Peak VRAM GiB |
|---|---|---|---:|---:|
| `understand_video` | Qwen/Qwen3-VL-4B-Instruct | `ebb281ec70b05090aa6165b016eac8ec08e71b17` | 216.12 | 9.14 |
| `detect_object` | IDEA-Research/grounding-dino-tiny | `a2bb814dd30d776dcf7e30523b00659f4f141c71` | 43.41 | 1.90 |
| `segment_subject` | facebook/sam2.1-hiera-small | `ee5bba1d82bb8749febdf90f45e84b687142ba03` | 47.45 | 0.82 |
| `track_object` | CPU geometry of verified SAM masks; no TAP inference | `ee5bba1d82bb8749febdf90f45e84b687142ba03` | 0.64 | 0.00 |
| `generate_video` | Wan-AI/Wan2.2-TI2V-5B-Diffusers | `b8fff7315c768468a5333511427288870b2e9635` | 764.48 | 28.39 |

Pinned licenses, commercial-use status, weight SHA-256 locks, runtime/device/VRAM planning, schemas, retries/fallback and versions are in [registry](../../config/model-runtime/registry.v1.json) and [source locks](../../config/model-runtime/sources.v1.json). [Resolved image digests](proof/resolved-registry.json) and each [immutable artifact](proof/artifacts) retain actual execution provenance. TAPNext++ was not downloaded or executed. Static rollout availability labels are unqualified release metadata; private execution evidence is recorded here.

## 3. Files changed

[Architecture and runbook](../../docs/MODEL-CAPABILITY-RUNTIME-V1.md). The full 62-source-file change list is in [completion.json](completion.json). Changes below are relative to inherited baseline `2aaec02b`; the original staging workspace was preserved.

- `config/model-runtime/deployment.proof.v1.json`
- `config/model-runtime/registry.v1.json`
- `config/model-runtime/sources.v1.json`
- `contracts/model-capabilities-v1.json`
- `docs/MODEL-CAPABILITY-FEATURE-AUDIT-V1.md`
- `docs/MODEL-CAPABILITY-RUNTIME-V1.md`
- `firestore.rules`
- `frontend/src/components/studioModelArtifactReference.js`
- `frontend/src/components/studioProjectDocument.js`
- `model_workers/Dockerfile.base`
- `model_workers/Dockerfile.segmentation`
- `model_workers/Dockerfile.tracking-cpu`
- `model_workers/Dockerfile.video`
- `model_workers/Dockerfile.vision`
- `model_workers/adapters/segmentation.py`
- `model_workers/adapters/video.py`
- `model_workers/adapters/vision.py`
- `model_workers/common.py`
- `model_workers/main.py`
- `package-lock.json`
- `package.json`
- `scripts/content-factory/render-existing-studio.py`
- `scripts/model-runtime/assemble_proof.js`
- `scripts/model-runtime/audit_features.py`
- `scripts/model-runtime/build_cloud.py`
- `scripts/model-runtime/collect_executions.py`
- `scripts/model-runtime/compose_proof.py`
- `scripts/model-runtime/configure_proof_jobs.py`
- `scripts/model-runtime/inspect_gpu_capacity.py`
- `scripts/model-runtime/inspect_player.js`
- `scripts/model-runtime/inspect_proof.py`
- `scripts/model-runtime/inspect_studio.js`
- `scripts/model-runtime/prepare_cloud.py`
- `scripts/model-runtime/prepare_model.py`
- `scripts/model-runtime/proof.js`
- `scripts/run-model-capability-worker.js`
- `scripts/studio-director-replay-entry.js`
- `src/generated/studioDirectorReplayKernel.cjs`
- `src/mediaRoutes.js`
- `src/modelRuntime/artifacts.js`
- `src/modelRuntime/cloudRunWorker.js`
- `src/modelRuntime/contract.js`
- `src/modelRuntime/importGenerated.js`
- `src/modelRuntime/router.js`
- `src/modelRuntime/stores.js`
- `src/modelRuntime/studioAdapter.js`
- `src/services/studioModelCapabilityService.js`
- `src/services/studioProjectIntelligenceContract.js`
- `src/services/studioProjectIntelligenceService.js`
- `src/services/studioProjectRevisionService.js`
- `storage.rules`
- `test/model-runtime/cloudWorker.test.js`
- `test/model-runtime/importGenerated.test.js`
- `test/model-runtime/runtime.test.js`
- `test/model-runtime/runtimeFirestore.emulator.js`
- `test/model-runtime/securityRules.emulator.js`
- `test/model-runtime/studioAdapter.test.js`
- `test/model-runtime/workerCpu.py`

## 5. GPU and runtime

One RTX PRO 6000 Blackwell GPU per neural job, one at a time. Nine GPU executions, including failed/cancelled attempts, total 3205.37 seconds / 53.42 minutes of measured Cloud Run execution wall time. This includes provisioning and is **not a billing estimate**. Two deterministic tracking jobs used CPU only. [All executions](proof/execution-accounting.json). [Final regional inventory](gpu-after-proof.json): zero active GPU executions and zero GPU services; idle job definitions remain, with no warm GPU allocation.

Wan accepted artifact processing: 764.48s, including 568.60s checkpoint transport and 191.32s inference/model loading. The selected first source is a real 3s/72-frame podcast excerpt; it is hash/generation bound, not a synthetic visual fixture.

## 6. Artifacts produced

- `understand_video`: `580976c7453a4410642219ca8299e8b406be8381f0f96ee3e1b08ef25781bbec` — immutable files with owned project/source hash, model/checkpoint revision, parameters, source range, creation/status, confidence where meaningful and measured runtime/GPU provenance.
- `detect_object`: `bfabe2f7a0dbcac1516c95ecd566791d16dc169108a0f63368b5b17cbf14f9b5` — immutable files with owned project/source hash, model/checkpoint revision, parameters, source range, creation/status, confidence where meaningful and measured runtime/GPU provenance.
- `segment_subject`: `91399a80c757d52f360868c0373123feee364b7b9535e0e63ae7b0ed443d5ba7` — immutable files with owned project/source hash, model/checkpoint revision, parameters, source range, creation/status, confidence where meaningful and measured runtime/GPU provenance.
- `track_object`: `21c54d4e659ebc4860b88b862f911c5d37fed602204949d1fe8555fc5d202e6b` — immutable files with owned project/source hash, model/checkpoint revision, parameters, source range, creation/status, confidence where meaningful and measured runtime/GPU provenance.
- `generate_video`: `8a7a8579d3d967f9239b0e05115b7b419fb72b115ace58214ed124b5059ed7c4` — immutable files with owned project/source hash, model/checkpoint revision, parameters, source range, creation/status, confidence where meaningful and measured runtime/GPU provenance.

The proof retains scene understanding, detections, all 72 masks, a 72-sample tracking path, the full 121-frame generated shot, the ordinary owned generated-source import, the canonical document/snapshot and both rejected and corrected renders. Mask editing and generated media save/reopen are verified in [native component lifecycle](proof/studio-complete-lifecycle.json). The private local fixture is signed out and does not qualify ordinary-account authorization or all twelve product gates.

## 7. Visual proof and corrections

- [Actual DINO boxes](proof/qa/real-detections.png), [actual mask sequence](proof/qa/real-masks-over-time.png), [opaque alpha sequence](proof/qa/real-alpha-over-time.png).
- [Actual Wan frames](proof/qa/generation-decoded-frames.png), [actual final frames](proof/qa/final-decoded-frames.png), [actual native final playback receipt](proof/final-native-playback.json).
- The first Qwen attempt produced invalid gallery indices; a subsequent wrong-image dispatch was cancelled. Numeric model IDs in the next result were normalized as representation only; timestamps/facts were not repaired. Real inference was rerun and accepted only after output validation.
- SAM v1 incorrectly used confidence as opacity. The rejected immutable artifact is retained; SAM v2 reran inference with binary foreground membership and edge-only feathering.
- Wan v1 failed before frame generation because `ftfy` was missing. The CPU image build now executes the actual prompt cleaner; v2 performed real generation.
- The full Wan artifact includes an unrequested hand at the opening. The canonical timeline excludes frames 0–11 and uses generated source 0.5–5.041667s. The immutable original is retained.
- Final v1 used the wrong `subject_vfx` field and rendered untreated source. Pixel inspection rejected it. The assembler now preserves the existing `subjectVfx` field; the private transport rejects unknown render fields. The corrected final was rerendered and inspected, with real occlusion/callout visible.
- The final native screenshot playback reached completion with 29 dropped presentation frames. Independent decode passed all 181 frames. Audio is stereo/48kHz with no clipped samples; no fresh human listening or creative approval is claimed.

## 8. Remaining blockers

- Production application, feature flags, Firestore/Storage rules and IAM rollout are staged only; normal-account lifecycle and twelve-gate release qualification remain open.
- Legacy feature-owned providers remain compatible and are not all migrated. The private subject export transports a real owned resolved artifact; the normal API resolver still needs a generic artifact bridge.
- TAPNext++ point correspondence is pinned but disabled; current tracking is deterministic geometry from real SAM masks.
- Image-only source binding, multi-object tracking, broad media/occlusion/cut calibration, full preview/final conformance and operational load testing remain.
- Wan cold checkpoint loading measured 568.60 seconds. Cache transport and production latency/cost budgets need further qualification.
- Native screenshot playback dropped presentation frames; independent decode passes, but broad playback performance, fresh human listening and founder creative approval are not claimed.

CPU verification: 35 runtime checks, 4 worker media/integrity checks, two observed local emulator cases and 17 retained canonical/revision Jest checks pass. Required Studio record validator PASS; canonical kernel --check, Python compilation and git diff checks PASS. Whole-Studio readiness remains 2 UNIMPLEMENTED / 1 BROKEN / 9 PARTIAL / 17 FUNCTIONAL / 0 PRO-READY / 0 PRODUCTION-READY. Shared continuation remains S02.

## 9. Recommended next integration

TAPNext++: true long-range point correspondence, with occlusion/cut tests; do not label mask centroids as TAP.

Before broader rollout, complete the generic legacy artifact resolver bridge, staged security/IAM release and ordinary-account lifecycle tests. The production feature flag remains off.
