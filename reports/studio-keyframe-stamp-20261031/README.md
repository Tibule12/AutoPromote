# Composition keyframe stamping repair — 31 October 2026

Adding a key in Comp & Rig recorded the evaluated world pose. Parenting and
motion drivers then ran again over that value. A rotated child jumped and a
spinning layer acquired a second rotation offset. Keys now record the authored,
interpolated local value; the shared preview/compiler applies the rig and driver.

Changed product file: `frontend/src/components/StudioCompWorkbench.js`.

Validation:

- Seven new component cases reproduce six failures before the repair (opacity
  already passed). All seven pass after it. Together with the existing workbench,
  rigging and node-flow suites: **17 passed**.
- [Actual Studio browser receipt](browser-receipt.json): a 45-degree parent keeps
  the child's authored -45-degree key and unchanged visible pose. Adding a key
  while its spin driver runs keeps the visible 90-degree rotation at two seconds.
  Normal keyboard Undo/Redo and exact canonical cold reopen pass.
- [Compiled native project](native-compiled-project.json) and
  [actual worker pose checks](worker-pose-receipt.json): six sampled export
  rotations match the intended single 45-degree/second spin.
- Headless, muted, fresh signed-out loopback fixture; zero API calls, remote
  requests, paid generation or GPU work. Existing App builds and accounts are
  untouched. The isolated fixture used port 5043.

The retained browser failures are test-harness errors: direct media pause left
Studio's play intent active; a reader used the old key location instead of
`linkedTiming.keys`; the cold-reopen reader initially skipped Show media.
Using the normal Pause/Show media controls and current document schema resolves
them. They are not additional product fixes or passing runs.

This is a bounded authoring/worker-pose repair. No new MP4, normal-account export,
whole picture/audio parity, smoothness, professional or creative qualification is
claimed. Existing S02/S04/S03 and full-minute blockers remain. Next: qualify
animated reparenting and long/high-frequency driver bakes alongside the existing
live preview/export precision work.

Commands:

```sh
cd frontend
CI=true npm test -- --watch=false --runInBand --runTestsByPath src/components/__tests__/StudioCompKeyframeStamp.test.js src/components/__tests__/StudioMotionFlowWorkbench.test.js src/components/__tests__/studioCompRigging.test.js src/components/__tests__/studioNodeFlow.test.js
```

Start a separate fixture with `scripts/run-studio-interaction-preview.js`,
`STUDIO_MOTIONFLOW_FIXTURE=1`, `STUDIO_INTERACTION_PORT=5043`, and a private
`STUDIO_INTERACTION_FOLDER`. Then run
`node test/e2e/playwright/verify-studio-keyframe-stamp.cjs`. Both tools use the
existing installed dependencies; this worktree needs its shared `NODE_PATH`.
