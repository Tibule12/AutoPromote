# Project Intelligence V1 hardening verification — 2026-10-02

## Identity

- Branch: `agent/director-project-intelligence-v1`.
- Starting head: `848eda1af8ce3d47b2f31b8470dd7751e765c327`.
- Hardening commit: `Harden Project Intelligence V1 integrity and verification` (this receipt is in that commit). The exact final SHA is `git rev-parse HEAD` when checked out at this branch head; the review handoff reports its literal value. A Git commit cannot contain its own SHA without changing that SHA.
- Main was not directly modified. No deployment, cloud job, GPU resource, billing, quota or IAM operation was performed. Cam Combiner behavior was not redesigned.

## Final verification results

| Gate                                                                                                                                                                                                                    | Result | Pass / fail / skip                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| Relevant JavaScript suites: Project Intelligence, service/routes, canonical project, Studio time/commands/capabilities, Director proposal/replay/review, semantic timeline, captions, render contracts and Cam Combiner | PASS   | 27 suites; 221 tests passed / 0 failed / 0 skipped                                          |
| Studio caption/choir reviewed lyric regression and related payload/story tests                                                                                                                                          | PASS   | 4 suites; 106 tests passed / 0 failed / 0 skipped                                           |
| Relevant Python worker caption, render-contract and Cam Combiner tests                                                                                                                                                  | PASS   | 232 tests passed / 0 failed / 0 skipped; 43 subtests passed; 5 warnings                     |
| Frontend production build                                                                                                                                                                                               | PASS   | Compiled successfully; existing bundle-size advisory and Node `fs.F_OK` deprecation warning |
| Direct ESLint on touched source and tests                                                                                                                                                                               | PASS   | 0 errors, 0 warnings                                                                        |
| Director replay generated-bundle check                                                                                                                                                                                  | PASS   | Bundle regenerated after the validator change and matched the command kernel                |
| Local preflight and route imports                                                                                                                                                                                       | PASS   | Both commands exited 0                                                                      |
| `git diff --check`                                                                                                                                                                                                      | PASS   | No whitespace errors                                                                        |

The replay-bundle check failed once before regeneration because the canonical document validator had changed. `npm run build:studio-director-replay` regenerated the committed bundle, and the subsequent check passed. No known pre-existing test failures appeared in the executed suites. Python emitted two existing protobuf deprecations and three existing Pydantic `copy` deprecations; these were warnings, not failures.

The complete monorepo command `npm run test:jest` and browser/media end-to-end command `npm run test:e2e:playwright` were not executed. This verification used the complete relevant named suites below; the full monorepo command includes unrelated product areas, and the browser/media end-to-end command requires a larger service/media environment outside this bounded, CPU-only contract review. No cloud or GPU tests were invoked.

## Exact commands

Run from the AutoPromote repository root. Line continuations below preserve the exact argument lists used.

```bash
npx jest --runInBand --silent --runTestsByPath \
  test/studioProjectIntelligence.jest.test.js \
  test/studioProjectIntelligenceService.jest.test.js \
  test/studioProjectRevisionRoutes.jest.test.js \
  test/studioDirectorProjectBinding.jest.test.js \
  test/studioDirectorReviewRoutes.jest.test.js \
  test/studioDirectorReplayService.jest.test.js \
  test/studioSourceShotArtifact.jest.test.js \
  test/mediaRenderMulticam.jest.test.js \
  test/captions-download.test.js \
  test/captions-routes.test.js \
  frontend/src/components/__tests__/studioProjectDocument.test.js \
  frontend/src/components/__tests__/studioCapabilities.test.js \
  frontend/src/components/__tests__/studioTime.test.js \
  frontend/src/components/__tests__/studioCommands.test.js \
  frontend/src/components/__tests__/studioSemanticTimeline.test.js \
  frontend/src/components/__tests__/studioRenderCompiler.test.js \
  frontend/src/components/__tests__/studioDirectorProposals.test.js \
  frontend/src/components/__tests__/studioDirectorEvidenceProposals.test.js \
  frontend/src/components/__tests__/studioDirectorReviewDiff.test.js \
  frontend/src/components/__tests__/studioDirectorReviewRegressions.test.js \
  frontend/src/components/__tests__/studioDirectorReviewClient.test.js \
  frontend/src/components/__tests__/studioDirectorProjectRevisionClient.test.js \
  frontend/src/components/__tests__/captionReadability.test.js \
  frontend/src/components/__tests__/MultiCamCombiner.studioHandoff.test.js \
  frontend/src/components/__tests__/MultiCamCombiner.renderApproval.test.js \
  frontend/src/components/__tests__/MultiCamCombiner.proofMode.test.js \
  frontend/src/components/__tests__/MultiCamCombiner.checkpointRender.test.js \
  frontend/src/components/__tests__/multicamUtils.test.js \
  frontend/src/components/__tests__/studioTimelineEdits.test.js

npx jest --runInBand --silent --runTestsByPath \
  frontend/src/components/__tests__/ViralClipStudio.test.js \
  frontend/src/components/__tests__/viralRenderPayload.test.js \
  frontend/src/components/__tests__/storyBeatPlanner.test.js \
  frontend/src/components/__tests__/flowEditUtils.test.js

python_media_worker/.venv/bin/python -m pytest -q \
  python_media_worker/test_caption_quality.py \
  python_media_worker/test_studio_multicam_filters.py \
  python_media_worker/test_multicam_chunking.py \
  python_media_worker/test_multicam_checkpoint_integration.py \
  python_media_worker/test_multicam_job_runner_retry.py \
  python_media_worker/test_cam_combiner_release_contract.py \
  python_media_worker/test_viral_render_contract.py \
  python_media_worker/test_multicam_episode_regression.py \
  python_media_worker/test_multicam_director_rules.py \
  python_media_worker/test_studio_trim_timing_contract.py

npm --prefix frontend run build
npx eslint src/services/studioProjectIntelligenceContract.js src/services/studioProjectIntelligenceService.js src/services/studioProjectRevisionService.js src/routes/studioProjectIntelligenceRoutes.js src/server.js test/studioProjectIntelligence.jest.test.js test/studioProjectIntelligenceService.jest.test.js test/studioProjectRevisionRoutes.jest.test.js test/fixtures/studioProjectIntelligenceFixtures.js frontend/src/components/studioProjectDocument.js frontend/src/components/__tests__/studioProjectDocument.test.js
npm run build:studio-director-replay
npm run check:studio-director-replay
npm run preflight:local
npm run test:routes
git diff --check
```
