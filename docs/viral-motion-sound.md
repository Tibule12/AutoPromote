# Viral Clip Studio: motion and sound, contract v1

The Motion workspace contains Impact title, Word cascade, Number reveal, Versus
card, Speaker intro, Focus callout and Moving brand. Scenes have editable text,
timing, accent, opacity, start/end transforms and easing. Moving brand supplies
its own corner path. Position controls use canvas percentages.

Moving brand measures the rotated artwork against the actual video aspect
ratio in both preview and export. It keeps edge padding throughout its path,
including its entrance, and fits oversized brands inside the canvas. Horizontal,
vertical, square and ultrawide videos share the same geometry checks.

Each scene can own a synthesized sound cue. Moving, duplicating, removing or
cutting a scene also updates its cue. Standalone sounds retain their existing
upload, trim, volume, fade and enable controls. The Sound inspector and linked
cue editor display waveforms with seeking. The built-in palette includes sweep,
impact, pop, click, riser, chime, reverse pull, glitch and sub drop.

## Timing and export

All `startTime`, `duration` and `soundOffset` values use edited timeline seconds
**before speed changes**. Motion poses depend on that clock, rather than elapsed
wall time, so seeking is reversible. The renderer inverts the existing speed
plan to evaluate poses and audio at the correct output time. SFX change pitch
with playback speed; source speech uses the existing speed pipeline.

Timeline sound previews stop while video is buffering or seeking. Once playback
resumes, cues restart at the current edit-clock offset. A playback-rate change
replaces active synthesized sources using the video's actual playback rate.

The frontend exports `motion_graphics: {version: 1, scenes: [...]}` and the
combined `sound_effects` array. Linked sound IDs are `motion-sfx-<scene id>`;
the worker does not regenerate these cues a second time. The Node service must
forward both fields. The worker composites graphics and mixes SFX after the
existing video composition, before audio verification and upload. Failure of
this stage rejects the export instead of returning an incomplete video.

Preview and render share a bundled DejaVu font, primitive geometry, easing and
deterministic synthesis formulas. Font rasterization can differ between SVG and
Pillow. The cross-language tests compare geometry and PCM, and FFmpeg tests
check real output frames, duration, speed-mapped cues, uploaded audio trim and
preservation of source audio. No speech generation or third-party SFX service is
required.

## Deployment and limits

Deploy the frontend, the API service and the Python media worker together. The
worker needs its `assets/fonts` directory; the current Dockerfile copies it.
No new Python or npm dependency is required. Existing projects without motion
or SFX skip the extra render stage.

Limits: 24 motion scenes, 128 combined cues, 60 seconds per scene and 15 seconds
per cue. Motion rendering supports up to 4K and two hours per exported clip;
long/high-resolution performance has not been benchmarked. Keyframes are
creator-authored. Subject masking and automatic object/face tracking are not
part of this implementation.

## Verification commands

From `frontend`:

```sh
CI=true npm test -- --watchAll=false --runInBand --testTimeout=15000 --runTestsByPath src/components/motion/motion.test.js src/components/__tests__/ViralClipStudio.test.js src/components/__tests__/viralRenderPayload.test.js
CI=true npm run build
```

From the repository root with server dependencies installed:

```sh
npm run test:jest -- src/services/__tests__/videoEditingService.viralPayload.test.js
python -m unittest python_media_worker.test_viral_render_contract python_media_worker.test_viral_creative_effects -v
```

From `python_media_worker`:

```sh
python -m unittest test_viral_motion_graphics -v
```

All render tests use generated local media and temporary files. They do not
create production jobs, upload media or consume AutoPromote credits.
