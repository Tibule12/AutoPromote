"""Write factual review from retained native receipts and measurements."""
from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[2]
P=ROOT/'reports/studio-make-your-move-20261102/episode'
def load(name):return json.loads((P/name).read_text())
receipt=load('native-motion-flow/render-receipt.json')
technical=load('technical.json');pairs=load('paired-measurements.json')['samples']
live,finished=load('live-playback.json'),load('finished-playback.json')
live_capture,finished_capture=load('live-playback/editing-recording.json'),load('finished-playback/editing-recording.json')
native=load('Editable Project.autopromote.json');s=native['snapshot']
validation=dict(frontendScopedTests=54,focusedFullEditorTests=3,fullEditorCasesOutsideSelectedCommands=153,
 pythonUnittestCases=3,localResourceBoundAssertions=18,workerGeometrySamples=2,welcomeChecksPerBuild=8,
 nativeColdReopenEdit=load('reopen-edit.json'),nativeMatteSourceGuard=load('matte-source-guard.json'),
 independentNormalSignin=True,headless=True,muted=True,loopbackOnly=True,
 nativeMovieFullyDecodes=True,nativeFrames=technical['frames'],nativeFps=24,
 wholePictureParityPassed=False,liveRealtimeQualified=False,creativeApproved=False,humanListeningApproved=False,
 paidCalls=0,productionWrites=False,merge=False,deployment=False,
 notes=['One concurrent wider editor test process ended without a result. Its three selected cases pass in isolated 1-case and 2-case reruns.',
 'pytest was unavailable in checked environments; actual resource helpers were exercised through AST with 18 assertions. Three separate real unittest cases pass.',
 'Two mixed-operator warnings in an inherited inspector condition remain. No skipped assertion or threshold change qualifies this result.'])
(P/'validation.json').write_text(json.dumps(validation,indent=2))
verdict=dict(status='REVIEW_CANDIDATE_NOT_PROFESSIONAL_READINESS',
 observation='The full moving result uses independent letter choreography, footage mattes, foreground emergence, kinetic word animation, source-strip construction and a parented closing poster. It replaces the rejected bending direction with a typography-led edit.',
 strengths=['The source-bound figure breaks out of the moving typography against negative space.',
 'The closing poster has independent editable letters and shared rig motion.',
 'Footage and input pixels remain moving; graphics are native layers and compositing decisions.'],
 limitations=['This is one thirty-second creative production, not After Effects/Fusion feature parity.',
 'The source-bound luma input was prepared using a pinned local CPU analysis model, not a completed Studio automatic-rotoscoping integration.',
 'The rejected wrist callout was removed from the visible edit because it did not convincingly attach to the action.',
 'No true 3D camera/light system, particle system, general displacement or animated contour reconstruction is demonstrated.',
 'Live preview still runs slower than programme time. Screen capture has fewer distinct updates than the 24fps final file.',
 'At the 3.5-second opening zoom, paused live preview lacks MAKE while the export retains it. The figure reveal geometry is repaired, but this separate preview discrepancy remains. Paired pictures also have residual glyph/raster/colour/edge differences. There is no whole-picture parity or professional-quality pass.',
 'Browser QA is muted. Human soundtrack/listening and owner creative approval remain unqualified.'],
 nativeMovieSha256=receipt['outputSha256'],fullMovieInspected=True,inspectionFrameCount=len(technical['inspectionFrames']),
 pairs=len(pairs),minimumSsim=min(x['ssim'] for x in pairs),minimumPsnr=min(x['psnr'] for x in pairs),
 liveProgrammeSeconds=30,liveWallSeconds=live['elapsedMs']/1000,finishedWallSeconds=finished['elapsedMs']/1000)
(P/'creative-verdict.json').write_text(json.dumps(verdict,indent=2))
target=Path.home()/'Videos/AutoPromote Motion and Flow - 2026-11-02/Make your move'
readme=f'''# Make your move — native Studio edit

[Play the 30-second movie](Make%20your%20move.mp4) · [actual live Studio and timeline](Live%20Studio%20playback.mp4) · [raw/edited comparison](Raw%20vs%20Studio.mp4) · [editable project](Editable%20Project.autopromote.json).

This edit follows the owner's After Effects-style direction. Moving footage fills independently animated letters; a source-bound person emerges in front of the typography, six source strips assemble a landscape, and a parented kinetic poster closes the piece. All evaluated transforms, mattes, occlusion, typography, vector strokes, motion blur, ordering and sound cues are in the ordinary Studio project and canonical CPU export. The earlier bending films remain preserved.

The project contains **{len(s['overlays'])} overlays, {len(s['motionKeyframes']):,} keys, four timeline shots and three null rigs**. The removed wrist callout remains editable at zero opacity. Source-bound grayscale matte footage is an input, generated with a pinned cached CPU model; the actual foreground RGB, masking, layer order and motion render natively. This is not a newly completed automatic tracking/rotoscoping product feature. No paid generation or GPU execution occurred.

The exact final is **30s / 720 frames / 24fps / 1280×720 / H.264 + AAC**. SHA256 `{receipt['outputSha256']}`. Its complete finished-file playback is recorded inside Studio beside the matching timeline. The finished video bytes are checked against the owned native receipt. Normal sign-in, independent native backup restore, text edit/playback, luma/inverted-luma edit, Undo/Redo and exact decision restoration pass. Unsupported effects on the video matte source are refused before project mutation. Review these actual controls in `Native editing and recovery.mp4` and `Video matte source guard.mp4`.

Live Studio needs **{live['elapsedMs']/1000:.3f}s for the 30s programme**. The silent live capture has {live_capture['frames']} distinct updates across {live_capture['seconds']:.3f}s ({live_capture['frames']/live_capture['seconds']:.2f}/s). Finished playback takes {finished['elapsedMs']/1000:.3f}s; its capture has {finished_capture['frames']} updates/{finished_capture['seconds']:.3f}s. These capture rates are not the final movie's 24fps. **Real-time preview is unfinished.**

`Live vs export.jpg` pairs {len(pairs)} actual paused Studio pictures with decoded native output frames at measured programme times. Minimum SSIM {min(x['ssim'] for x in pairs):.6f}, minimum PSNR {min(x['psnr'] for x in pairs):.3f}dB. These diagnostic scores have no newly invented pass threshold. At 3.5s, the paused live zoom omits MAKE while the export retains it; this separate preview discrepancy remains. Whole-picture glyph/raster/colour/edge parity remains unqualified. The seven inspection sheets include cuts, matte boundaries and the final actual picture; {len(technical['inspectionFrames'])} decoded samples were inspected as well as full playback. Browser checks are muted; human listening and owner creative approval remain open.

Three shared repairs were needed. Preview video mattes now read their decoded pixels instead of a rectangle. Static video matte sources/fills now use the canonical canvas rasterizer, preserving their declared scale/anchors instead of legacy B-roll sizing. Unsupported source-effect changes are checked before UI mutation. Director/manual authoring and native export keep the same document and renderer. There is no effect movie or alternative editor behind this result.

The first native attempt terminated at the local harness's 600 CPU-second limit. Its signed failure and returned fixture credits are retained. A bounded local setting now allows 1,200 CPU seconds per process with the existing 1,800-second wall limit (the recorded CPU sum includes children); file/artifact limits and production worker settings are unchanged. The second completed movie was rejected because its video matte geometry clipped the figure. It and its exact comparison evidence remain in the worktree. The third native run includes the geometry repair; it is the supplied movie. No failed job was silently replayed.

Validation: **54 scoped frontend tests, three selected full-editor cases, three Python unittest cases, 18 resource-bound assertions**, two actual CPU geometry samples, eight anonymous welcome comparisons per rebuilt candidate, normally signed-in Studio/help/restore/guard flows, shared Director kernel check and contract validation. The other 153 full-editor cases were outside those selected commands. One combined editor run was interrupted; its selected cases pass in separate reruns. Two inherited mixed-operator build warnings remain. Formal Studio readiness is unchanged.

The raw file and synchronized comparison are utility packaging of already retained source ranges/native output. They add no evaluated creative effect. Retained source clips, input matte, original score and original artwork pixels are supplied. The exact native backup references the isolated demo's owned media; cold restore is verified in that environment. If its emulators/storage are removed, use the supplied sources and native relinking controls. This backup is not advertised as a self-contained offline project.

**Candid verdict:** a real typography/occlusion production with a stronger visual idea than the rejected bending study. It does not establish an After Effects/Fusion-class platform, professional readiness, complete parity or owner acceptance. Remaining work includes preview performance, visible raster/edge precision and broader reusable camera/light/VFX capability.

Worktree: `{ROOT}`; branch `feat/studio-motion-flow-20261031`. Sources/build/worker hashes are in `Technical/preflight.json`. No push, merge, deployment, production-data write or provider purchase. Complete review folder: `{target}`.
'''
(P/'README.md').write_text(readme)
print(json.dumps(dict(report=str(P/'README.md'),candidate=True,creativeApproved=False)))
