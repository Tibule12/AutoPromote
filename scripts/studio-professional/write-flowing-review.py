"""Write the review from retained observations; partial playback cannot qualify."""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[2]
P=ROOT/'reports/studio-folded-space-20261101/flowing-ribbon/episode'
T=Path.home()/'Videos/AutoPromote Motion and Flow - 2026-11-01/Cinematic Episode/Flowing worlds - 2026-11-02'


def read(name):return json.loads((P/name).read_text())


def main():
    live,finished=read('live-playback.json'),read('finished-playback.json')
    assert live['complete'] and live['terminal']['programmeTime']>=35.9
    assert finished['complete'] and finished['terminal']['mediaTime']>=35.9
    pairs=read('paired-measurements.json')['samples']
    native=read('native-media-validation.json');reopen=read('reopen-edit.json');guard=read('guard-ui.json')
    receipt=read('native-motion-flow/render-receipt.json')
    assert read('finished-file-identity.json')['sha256']==native['sha256']==receipt['outputSha256']
    assert reopen['exactRestored'] and guard['exactProjectPreserved']
    captures={kind:read(kind+'-playback/editing-recording.json') for kind in ['live','finished']}
    ls,fs=live['elapsedMs']/1000,finished['elapsedMs']/1000
    low=min(r['ssim'] for r in pairs);psnr=min(r['psnr'] for r in pairs)
    summary={'nativeExport':native,'normalDemoAuth':True,'nativeColdReopenAndEdit':reopen,
      'unsupportedCombinedTrajectory':guard,'actualSourceSharing':read('native-shared-source-observations.json'),
      'pairedFrames':len(pairs),'minSsim':low,'minPsnr':psnr,
      'liveProgrammeEnd':live['terminal']['programmeTime'],'liveWallSeconds':ls,
      'finishedMediaEnd':finished['terminal']['mediaTime'],'finishedWallSeconds':fs,'captures':captures,
      'liveRealtimeQualified':False,'wholePictureParityQualified':False,'humanListeningApproved':False,
      'creativeProfessionalStandardMet':False,'publicShowroomQualified':False,'readinessPromotion':False,
      'tests':{'frontendScoped':57,'workerScoped':29,'archiveBoundaries':4,'serviceQueueUnit':2},
      'nativeExports':1,'paidCalls':0,'productionWrites':False}
    (P/'validation.json').write_text(json.dumps(summary,indent=2)+'\n')
    progress=read('creative-progress.json');progress.update(status='NATIVE_REVIEW_DELIVERED_PROFESSIONAL_TARGET_UNMET',
      outputSha256=native['sha256'],canonicalProjectHash=receipt['projectHash'],
      wholePictureParityQualified=False,liveRealtimeQualified=False,
      firstPartialLiveCaptureCorrected=True,fullLiveEnd=live['terminal']['programmeTime'])
    (P/'creative-progress.json').write_text(json.dumps(progress,indent=2)+'\n')
    (P/'README.md').write_text(f'''# Flowing worlds — 2 November 2026

[Watch the new 36-second native film](<{T}/Flowing worlds.mp4>) · [editable Studio project](<{T}/Editable Project.autopromote.json>) · [synchronized raw/edited comparison](<{T}/Raw vs flowing worlds.mp4>) · [creative feedback](Feedback.md).

The detached city cutout, landscape columns and nested rectangular portals from the rejected revision are removed. At 20–28 seconds, a moving landscape bends into a joined surface, changes to moving mountain footage and returns to that same source at its next frame. The first typography, water-subject moment, score and selected identity remain. Earlier movies, sources, projects and recordings are preserved.

This is an actual ordinary Studio project: **49 overlays, 50 compiled layers including programme, 10,968 keys and eight source cuts**. Native Motion and Composite controls expose the source regions and corner coordinates. Cold reopen, a corner edit/Undo and source-region edit/Undo/Redo restore the exact original decisions. All evaluated effects render through the canonical AutoPromote CPU compositor. No external effect film substitutes for native motion. Source regions and independent corner keys are reusable tools; this scene's numeric directions are authored through the ordinary reviewed-plan importer.

The result is a review candidate. **The requested professional creative standard is still unmet.** The surface remains visibly faceted, and changing landscapes through a dissolve is a restrained transition. It does not establish a continuous deformable 3D mesh, free camera/light simulation or AE/Fusion completeness. The first six-section folded study was rejected internally. Read the candid feedback before treating the movie as a showcase.

## Playback and visual evidence

[Full live Studio recording](<{T}/Live Playback.mp4>) · [full finished-film Studio recording](<{T}/Finished Playback.mp4>) · [native authoring recording](<{T}/Native Authoring.mp4>) · [measured live/export comparisons](<{T}/Live vs export.jpg>).

| Observation | Result |
| --- | --- |
| Export | 36.000 seconds, 864 frames, 24fps, 1280×720 H.264; stereo 48kHz AAC; full decode passes. |
| Complete live programme | Reaches {live['terminal']['programmeTime']:.6f}s in **{ls:.3f} wall seconds**. Real-time throughput remains unqualified. |
| Complete finished-file playback | Exact output bytes verified; reaches {finished['terminal']['mediaTime']:.6f}s in {fs:.3f} wall seconds. Browser counters and events are retained. |
| Live capture updates | {captures['live']['frames']} over {captures['live']['seconds']:.3f}s ({captures['live']['frames']/captures['live']['seconds']:.2f}/s). |
| Finished capture updates | {captures['finished']['frames']} over {captures['finished']['seconds']:.3f}s ({captures['finished']['frames']/captures['finished']['seconds']:.2f}/s). |
| Paused preview/export | {len(pairs)} measured pairs; minimum SSIM {low:.6f}, minimum PSNR {psnr:.4f}dB. Whole-picture parity remains unqualified; no threshold was lowered to claim success. |
| Sound | Native score and cues are present. Headless QA is muted; human listening remains open. |

Capture updates are not display-frame counts. Decoded video counters tied to a pooled source are not whole-programme counters. Full native 24fps encoding does not prove real-time editor playback or perceptual polish. The local headless browser uses software rendering; its measured limitations do not establish GPU-enabled desktop performance.

The first observer mistakenly treated an intermediate source's `ended` event at programme 10 seconds as completion. Its incorrect complete flag and recording remain under `First partial playback capture`, with an explicit correction. The corrected observer requires the final programme timestamp. A separate finished-video pause-button race is retained. These failed observations are excluded from full-playback qualification.

## Bounded engineering changes

Source-region selection now composes directly into the CPU inverse homography, avoiding a measured extra-resampling shift. Eight corner channels use Linear/Hold keys, with whole-interval winding and edge-collapse checks. Changing Perspective progress while animating corners is refused until that higher-order trajectory is qualified; the native rejected-plan check preserves the exact project. Existing whole-image planes keep their earlier geometry bounds.

In Motion & Flow, silent pieces with the same owned source path, digest and source-clock offset share decoded pictures. All ten autumn pieces share the programme frame; the two-world measurement has eighteen pieces sharing two owners. Different takes, ownership, offsets, loops, audio and unsettled seeks remain separate. Creator-mode observations remain retained and do not qualify this shared path. Pixel-region canvases reduce repeated full-frame copying.

The actual dense job retains its complete 3,781,917-byte options JSON in a 713,803-byte gzip archive. The limits are 768 KiB compressed and 4 MiB expanded, leaving metadata room in Firestore. The canonical composition and editor timeline match the submitted request exactly; existing refreshed transport URLs differ as expected. No layers or keys were removed to fit storage. The worker received all options and completed one accepted export. Two local fixture credits were consumed; no real payment or production wallet changed.

Validation: 57 scoped frontend tests, 29 worker tests, four archive checks and two service queue unit checks. Repeated/overlapping runs are not added to those counts. Native workflows, exact backup/render binding, actual archive decode and normal emulator authentication provide separate application evidence. Each frontend candidate preserved eight anonymous welcome comparisons and signed-in help. No creative/readiness promotion follows from these checks.

Exact build/runtime/source records are in [Technical/final-preflight.json](<{T}/Technical/final-preflight.json>). The original render/paired-preview build and the later validation-only guard build are distinguished. The supported episode compiles identically; no replacement render was required for the guard. Build-copy deduplication preserved all bytes/paths and recovered measured scratch capacity without lowering the 5 GiB reserve.

Project `{receipt['projectId']}`. Canonical hash `{receipt['projectHash']}`. Movie SHA-256 `{native['sha256']}`.

Raw source cuts are explicitly utility packaging of original footage following the exact native timeline, including the corrected final mountain in-point. The side-by-side file packages these raw cuts beside the completed native film and uses its soundtrack. Earlier original source movies remain in the parent Sources directory. All evaluated graphics remain native.

No paid model/provider/GPU call, production write, push, merge or deployment occurred. Continue S02 live clock/throughput and colour/edge parity, then S04 depth and S03 ownership. The broader shared creative system and professional output requirement remain open.
''')
    (P/'Feedback.md').write_text('''# Candid creative verdict — Flowing worlds

The previous revision was rejected by the owner. Its cutout beside a tilted video, landscape columns and nested cards read as separate tool demonstrations. Those scenes are removed from this duplicate.

The new passage develops one visual action: a moving landscape bends, a second moving landscape takes its place, and the surface returns to a full source shot with continuous source time. That makes the transition easier to follow. The first typography and water-subject moment remain the clearest retained ideas.

**This does not yet meet the requested professional “how did you do that?” standard.**

- The surface has ten projected sections. Curvature and texture derivatives still reveal faceting; it is not a seamless 3D environment.
- The landscape dissolve is conventional. The film still feels like a motion study built from separate stock shots, and the opening/ending remain familiar brand-film devices.
- Some source people enter the moving landscape during the transition. This is actual source footage, but their appearance is not yet motivated as a deliberate visual story.
- The native 24fps movie preserves moving footage, masks and motion. Decoding, geometry checks and a completed file do not constitute a creative-quality pass.
- Live preview still requires the measured waits and does not qualify real-time production. Paused picture/colour/edge agreement remains incomplete. Human listening has not been approved by the muted QA.

The useful engineering result is general editable source regions and corner animation, connected to actual Studio controls, persistence and the CPU renderer. The remaining creative work is to turn that freedom into a stronger, coherent sequence with cleaner spatial continuity and fewer visible construction seams. A larger effect count would not solve that.

The complete film, editable project, raw comparison, actual timeline recordings and retained failures are supplied for direct review. No public showcase or full-production approval is claimed.
''')
    print(json.dumps({'fullLiveEnd':live['terminal']['programmeTime'],'liveSeconds':ls,'finishedSeconds':fs,'pairs':len(pairs),'creativeStandardMet':False}))


if __name__=='__main__':main()
