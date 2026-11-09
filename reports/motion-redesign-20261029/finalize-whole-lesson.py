"""Deliver verified native files privately; this tool cannot schedule anything."""
from pathlib import Path
import json,hashlib,shutil,os,datetime
ROOT=Path(__file__).resolve().parent;repo=ROOT.parent.parent;lesson=ROOT/'proof/lesson-r2';core=ROOT/'proof/product/whole-studio-r1'
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
validation=read(lesson/'final/independent-validation.json');review=read(lesson/'agent-final-review.json')
assert review['nativeMovieSha256']==validation['nativeMovieSha256'] and review['ownerApproved'] is False
for base,name in [(lesson,'final'),(core,'result')]:
 receipt=read(base/name/'render-receipt.json');playback=read(base/name/'studio-playback.json');restore=read(base/'independent-restore.json')
 assert playback['nativeFinishedOutput'] and playback['timelineVisible'] and playback['playback']['ended']
 assert playback['outputSha256']==restore['outputSha256']==receipt['outputSha256']==sha(base/name/'final.mp4')
 assert playback['canonicalHash']==restore['canonicalHash']==receipt['projectHash']
protected=read(ROOT/'original-preservation-rechecked.private.json')
for item in protected:assert sha(Path(item['path']))==item['sha256']
destination=Path('/home/tibule12/Videos/AutoPromote-Whole-Studio-2026-10-29');destination.mkdir(exist_ok=True,mode=0o700);os.chmod(destination,0o700)
copies=[(lesson/'final/final.mp4','01-Whole-Studio-Walkthrough.mp4'),(core/'result/final.mp4','02-ZEST-Portrait-Motion-Result.mp4'),
 (lesson/'thumbnail.png','01-Whole-Studio-Thumbnail.png'),(core/'authoring-editing-in-studio.mp4','Studio-recordings/Actual-Motion-Authoring.mp4'),
 (core/'result/edited-in-studio.mp4','Studio-recordings/Motion-Result-With-Editable-Timeline.mp4'),
 (lesson/'final/edited-in-studio.mp4','Studio-recordings/Whole-Walkthrough-With-Editable-Timeline.mp4'),
 (core/'MOTION-RESULT.autopromote.json','Editable-projects/PRODUCT-MOTION.autopromote.json'),
 (lesson/'WHOLE-STUDIO-LESSON.autopromote.json','Editable-projects/WHOLE-STUDIO-LESSON.autopromote.json'),
 (core/'source-art.graphics.json','Starter-artwork/ZEST-SEPARATE-ARTWORK.graphics.json')]
delivered=[]
for source,name in copies:
 target=destination/name;target.parent.mkdir(exist_ok=True,mode=0o700)
 if target.exists():assert sha(target)==sha(source),'Preserve an existing delivery instead of overwriting it.'
 else:shutil.copy2(source,target)
 os.chmod(target,0o600);assert sha(target)==sha(source);delivered.append(dict(file=name,sha256=sha(target),bytes=target.stat().st_size))
(destination/'Read-me.txt').write_text('PRIVATE REVIEW CANDIDATE — NOT SCHEDULED\n\n01: Narrated landscape walkthrough showing the complete Studio workspace and timeline through one illustrated product-motion edit.\n02: Separate portrait result.\nStudio-recordings: Actual native authoring and complete matching finished playback.\nEditable-projects: Native backups with private owned source links; keep these private.\n\nThe earlier rejected batch is preserved in its original folder. Nothing here is approved for scheduling.\n')
(destination/'Starter-artwork/Read-me.txt').write_text('Original fictional illustrated product artwork for this walkthrough. No motion or account data is included.\n\nIn an ordinary ten-second blank portrait project, open Graphics and import ZEST-SEPARATE-ARTWORK.graphics.json through the Graphics composition file control. The can, two slices, leaf, shadow, circle and editable headline become separate native layers. Follow the walkthrough to author the motion, or restore the private PRODUCT-MOTION backup for the finished editable example.\n')
summary=dict(state='PRIVATE_NATIVE_REVIEW_CANDIDATE',date='2026-10-29',report='reports/motion-redesign-20261029/README.md',
 ownerDirection='Keep the complete Studio workspace, tools, preview and editable timeline visible. Teach the actual edit with narration and show its result.',
 durationSeconds=validation['durationSeconds'],dimensions=validation['dimensions'],frames=validation['frames'],fps=24,
 nativeMovieSha256=validation['nativeMovieSha256'],thumbnailSha256=validation['thumbnail']['sha256'],portraitResultSha256=sha(core/'result/final.mp4'),
 wholeWorkspaceChapters=11,renderedResultShots=5,sourceScreenCropping=False,nativeMainSequence=True,graphInjection=False,
 nativeCoreWholePlaybackAndExactRestore=True,nativeGuideWholePlaybackAndExactRestore=True,
 narration='Cached synthetic Kokoro bf_emma preset; no cloned voice or music bed.',zeroOffsetSpeechCorrelation=validation['zeroOffsetSpeechCorrelation'],loudness=validation['loudness'],
 originalProtectedFilesByteIdentical=len(protected),earlierBatch='Rejected and retained; generated speech and browser observation supplements retained in verified lossless private archives.',
 ownerApproved=False,scheduled=False,schedulingHeld=True,physicalIPhoneVerified=False,allStudioFeaturesQualified=False,wholePredictiveParityQualified=False,
 formalReadinessCountsUnchanged=True,sharedRemaining=['S02 whole picture/audio/colour/edge/low-alpha/latency and long-job reconciliation','S04 motion/vector/glyph depth','S03 occurrence/group/source ownership'],
 nextTask='Owner review of the exact finished movie and thumbnail before any scheduling; retain the rejected batch and five Queue holds. Continue the shared precision backlog.',
 videosDirectory=str(destination),delivered=delivered)
(ROOT/'validation-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
readme=f'''# Whole Studio motion walkthrough — private review candidate

29 October 2026. The owner required the complete Studio workspace to stay visible. The new **{validation['durationSeconds']:.1f}-second landscape walkthrough** shows Graphics import, native layer motion, editable word choreography, the full timeline and an actual completed export. Eleven workspace chapters retain every recorded screen pixel; five large result shots connect the controls to their consequences. Chapter labels occupy a reserved header. Spoken preset narration guides the edit; there is no music bed.

The files are in [{destination.name}]({destination}). The main movie is [01-Whole-Studio-Walkthrough.mp4]({destination/'01-Whole-Studio-Walkthrough.mp4'}), with a separate portrait result and a thumbnail taken from the actual native opening. Actual authoring, matching complete finished playback and editable native backups accompany them. This covers one product-motion workflow; it does not demonstrate every Studio feature.

Both the ten-second layered motion project and the narrated native sequence have complete matching Studio playback and independent backup restores with exact owned downloads. The guide decodes to {validation['frames']:,} frames at 1600×900 / 24 fps. Decoded narration correlates {validation['zeroOffsetSpeechCorrelation']:.6f} with its source; the selected mix measures {validation['loudness']['input_i']} LUFS / {validation['loudness']['input_tp']} dBTP. The actual source/full-workspace edit and its normal export are retained under `proof/product/whole-studio-r1`; final assembly and checks are under `proof/lesson-r2`.

Static original fictional product artwork entered through ordinary Graphics import. All motion, typography, final sequence and voice-over use the ordinary signed-in Studio and canonical CPU renderer. Screen sources only receive documented cuts, timestamp normalization, scaling and padding; no inspector crop, fabricated identity, injected graph/provider result, alternative final compositor, paid model generation or paid GPU execution was used. Native result exports before and after recording the complete edit are byte-identical.

Earlier focused/presentation attempts, the first timestamp-short source cuts, an interrupted media-library pagination attempt and the first observer path error remain retained. These were corrected before the selected final export. An accepted render is never resubmitted after an observer deadline. The historical long transition job remains failed and is not reclassified by this work.

All {len(protected)} protected original media/project/Auth files remain byte-identical. Existing native movies and backups stay available. Superseded generated speech and browser observations are retained in verified lossless private archives described by `proof/retired-generated-speech-archive.json` and `proof/superseded-browser-observation-archive.json`; original model/source libraries and the live original Auth file were untouched. Only this checkout's proven regenerable Jest transform cache was removed. RAM held bounded capture/render scratch, and the storage guard remains unchanged.

Agent picture/timing and decoded speech checks do not establish human listening approval, actual external-platform/iPhone crop qualification, capture smoothness or whole predictive preview/render parity. Editing screen capture was observational; the native movie remains 24 fps. Formal readiness stays **17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY**. Shared S02 picture/audio/colour/edge/low-alpha/latency and long-job reconciliation, S04 motion/vector/glyph depth and S03 ownership remain open; the earlier strict typography colour/edge result remains 13/16 failures.

**Owner approval is absent. Nothing new was scheduled, published, resumed or requeued.** The daily creative timer remains disabled/inactive and the five earlier Queue holds remain untouched. The earlier delivered batch is still rejected. Next: owner review of the exact final movie/thumbnail before any scheduling, followed by the shared precision backlog. No main integration, push or deployment occurred.
'''
(ROOT/'README.md').write_text(readme)
paragraph='29 October full-workspace correction: [the private native walkthrough](../reports/motion-redesign-20261029/README.md) now shows the complete Studio workspace and editable timeline throughout eleven recorded editing chapters, with five rendered result shots and spoken preset guidance. The selected 161.5-second landscape film and separate portrait result have complete matching native playback, exact independent restores and owned downloads. One product-motion workflow is covered; other Studio features, human listening, actual external-platform/iPhone cropping, capture smoothness and whole predictive parity remain unqualified. The earlier batch stays rejected, all original movies/backups and25 protected originals/Auth are preserved, and scheduling remains held pending owner approval of exact final movie/thumbnail hashes. Superseded speech/browser observations are retained in verified lossless private archives. Formal counts and shared S02 picture/audio/colour/edge/low-alpha/latency/long-job reconciliation, S04 motion/vector/glyph depth and S03 ownership remain unchanged.'
for name in ['docs/STUDIO-COMPLETION-CONTRACT.md','docs/STUDIO-PRODUCT-READINESS.md','docs/CREATIVE-SHOWROOM-CONTRACT.md']:
 p=repo/name;text=p.read_text();marker='<!-- whole-studio-20261029 -->';assert marker not in text
 first,rest=text.split('\n',1);p.write_text(first+'\n\n'+marker+'\n'+paragraph+'\n<!-- /whole-studio-20261029 -->\n'+rest)
for name in ['test/e2e/studio-capability-matrix.json','test/e2e/studio-combination-matrix.json','test/e2e/studio-preview-render-parity.json']:
 p=repo/name;text=p.read_text();assert '"wholeStudioWalkthrough20261029"' not in text
 entry={k:v for k,v in summary.items() if k not in ['videosDirectory','delivered','loudness']}
 prefix=json.dumps(dict(wholeStudioWalkthrough20261029=entry),indent=2,ensure_ascii=False)
 p.write_text(prefix[:-2]+',\n'+text[2:])
p=repo/'AGENTS.md';text=p.read_text();first,rest=text.split('\n',1)
p.write_text(first+'\n\n29 October full-workspace owner correction: keep the whole Studio workspace, tools, preview and editable timeline visible in the narrated teaching film. [The new private161.5-second native walkthrough](reports/motion-redesign-20261029/README.md) and separate portrait result have full matching playback and exact independent restores. This covers one product-motion workflow, not every Studio feature. Earlier deliveries remain rejected; do not schedule/publish/resume/requeue without explicit owner approval of exact final movie/thumbnail hashes. Formal counts and shared S02/S04/S03 limits remain unchanged. Preserve all originals, archives and the five held destinations.\n'+rest)
old=repo/'reports/motion-graphics-rebuild-20261029/README.md'
with old.open('a') as f:f.write('\n29 October storage preservation: supplemental generated speech and superseded browser observations are retained byte-for-byte in verified lossless private archives described in the [whole-workspace follow-up](../motion-redesign-20261029/README.md). Native movies/backups and the original source/model/Auth libraries remain unchanged. This batch remains rejected.\n')
print(json.dumps(dict(delivered=str(destination),files=len(copies),seconds=validation['durationSeconds'],scheduled=False)))
