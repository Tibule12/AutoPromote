"""Publish a local review index only after actual native evidence is complete."""
from pathlib import Path
import json, hashlib, html, subprocess
ROOT=Path(__file__).resolve().parent
rejection=ROOT/'creative-rejection.json'
if rejection.exists() and json.loads(rejection.read_text()).get('status','').startswith('REJECTED'):
 raise SystemExit('Creative rejection blocks marking this package finished. Preserve the rejection and technical evidence.')
rows=[]
names={'product':'Build a product reveal','logo':'Assemble the selected logo','transition':'Build a connected wipe'}
descriptions={'product':'Layered can, lime and leaf choreography, shadow and editable type.',
 'logo':'Native component assembly using the original selected gradient identity.',
 'transition':'Headphone layer motion, an ellipse mask and a circular cover/reveal.'}
for story in ['product','logo','transition']:
 folder=ROOT/'proof'/story/'visible-controls/tutorial'
 if story!='product':folder/='native-recovered-portrait' if story=='transition' else 'camera-r3'
 load=lambda name:json.loads((folder/name).read_text())
 receipt=load('final/render-receipt.json');validation=load('final/independent-validation.json')
 restore=load('independent-restore.json');playback=load('final/studio-playback.json')
 review=load('encoded-picture-review.json');fit=load('phone-fit-observation.json')
 sha=hashlib.sha256((folder/'final/final.mp4').read_bytes()).hexdigest()
 assert sha==receipt['outputSha256']==receipt['serverOutputSha256']==validation['nativeMovieSha256']
 assert sha==restore['nativeOwnedDownloadSha256']==review['movieSha256']
 assert restore['submissions']==0 and restore['exactCanonicalHash']==receipt['projectHash']
 assert playback['playback']['ended'] and playback['canonicalHash']==receipt['projectHash']
 assert playback['timelineVisible'] and playback['nativeFinishedOutput']
 assert validation['independentFullDecode'] and validation['zeroOffsetVoiceCorrelation']>.98
 assert review['agentEncodedPictureReview'] and not review['ownerApproved']
 assert fit['actualNativeMovie'] and not fit['fabricatedPlatformUI']
 assert (folder/'FINAL-TUTORIAL.autopromote.json').is_file()
 if story=='transition':
  original=ROOT/'proof/transition/visible-controls/tutorial/camera-r3'
  source_restore=json.loads((original/'source-only-independent-restore.json').read_text())
  assert source_restore['nativeLayeredBackupRestored'] and source_restore['originalHttpJobStillFailed']
  assert not source_restore['completedReceiptRecoveryClaimed']
 base=folder.relative_to(ROOT).as_posix();seconds=validation['duration']
 feed=ROOT/'proof'/story/'visible-controls/tutorial/feed-4-5'
 feedload=lambda name:json.loads((feed/name).read_text())
 fv=feedload('final/independent-validation.json');fr=feedload('final/render-receipt.json')
 fs=feedload('independent-restore.json');fp=feedload('final/studio-playback.json');fi=feedload('encoded-picture-review.json')
 feedsha=hashlib.sha256((feed/'final/final.mp4').read_bytes()).hexdigest()
 assert feedsha==fv['nativeMovieSha256']==fr['outputSha256']==fr['serverOutputSha256']==fs['nativeOwnedDownloadSha256']==fi['movieSha256']
 assert fv['dimensions']==[720,900] and fv['duration']==seconds and fv['frames']==validation['frames']
 assert fs['submissions']==0 and fs['exactCanonicalHash']==fr['projectHash']
 assert fp['playback']['ended'] and fp['timelineVisible'] and fp['canonicalHash']==fr['projectHash']
 assert fi['agentEncodedPictureReview'] and not fi['ownerApproved']
 rows.append(dict(story=story,name=names[story],description=descriptions[story],base=base,
  durationSeconds=seconds,durationLabel=f'{int(seconds//60)}:{int(seconds%60):02}',frames=validation['frames'],
  movieSha256=sha,thumbnailSha256=validation['thumbnail']['sha256'],projectHash=receipt['projectHash'],
  wholeMatchingTimelinePlayback=True,independentExactRestore=True,fullDecode=True,
  zeroOffsetVoiceCorrelation=validation['zeroOffsetVoiceCorrelation'],
  agentPictureReviewed=True,ownerApproved=False,scheduled=False,physicalIPhonePlatformVerified=False,
  deliveryProjectIsImportedCompletedFilm=story=='transition',
  originalLayeredJobSucceeded=story!='transition',
  feed=dict(base=feed.relative_to(ROOT).as_posix(),dimensions=[720,900],movieSha256=feedsha,
   thumbnailSha256=fv['thumbnail']['sha256'],projectHash=fr['projectHash'],
   wholeMatchingTimelinePlayback=True,independentExactRestore=True,agentPictureReviewed=True,
   zeroOffsetVoiceCorrelation=fv['zeroOffsetVoiceCorrelation'])))
assert subprocess.run(['systemctl','--user','is-active','--quiet','autopromote-daily-studio.timer']).returncode!=0
document='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Motion graphics — private review</title><style>body{margin:0;padding:32px;background:#101017;color:#f6f3e9;font:16px/1.5 system-ui}main{max-width:1120px;margin:auto}h1{font-size:32px}p{color:#c7c4d1}.films{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}article{padding:20px;border:1px solid #373242;border-radius:16px}video{width:100%;max-height:540px;background:#15151e;border-radius:8px}a{color:#c9baff}small{display:block;color:#c7c4d1}h2{font-size:21px}</style><main><h1>Motion graphics demonstrations</h1><p>Finished private review copies. Scheduling is paused.</p><div class="films">'''
for row in rows:
 base=html.escape(row['base']);name=html.escape(row['name'])
 feedbase=html.escape(row['feed']['base'])
 document+=f'''<article><video controls playsinline preload="metadata" poster="{base}/thumbnail.png" src="{base}/final/final.mp4"></video><h2>{name}</h2><small>{row['durationLabel']} · spoken walkthrough</small><p>{html.escape(row['description'])}</p><p><a href="{base}/final/final.mp4">Portrait movie</a> · <a href="{base}/thumbnail.png">Thumbnail</a> · <a href="{base}/final/edited-in-studio.mp4">Studio timeline</a></p><p><a href="{feedbase}/final/final.mp4">Fitted 4:5 feed movie</a> · <a href="{feedbase}/thumbnail.png">Feed thumbnail</a></p></article>'''
document+='</div><p>Narration uses a synthetic preset voice. Sample product and headphone artwork are illustrations.</p><p><a href="motion-study-source-art.zip">Source artwork kit</a> · <a href="README.md">Editing and verification notes</a></p></main></html>'
(ROOT/'WATCH-LATER.html').write_text(document)
(ROOT/'delivery-evidence.json').write_text(json.dumps({'films':rows,'ownerApprovalRecorded':False,'scheduled':False,
 'dailyCreativeTimer':'disabled/inactive','limits':'Agent inspection and declared phone/feed simulations; physical iPhone, external platform UI, human listening and whole predictive parity remain unqualified.'},indent=2)+'\n')
table='\n'.join(f"| {r['name']} | {r['durationLabel']} | [movie]({r['base']}/final/final.mp4) · [thumbnail]({r['base']}/thumbnail.png) | [movie]({r['feed']['base']}/final/final.mp4) · [thumbnail]({r['feed']['base']}/thumbnail.png) | [recording]({r['base']}/final/edited-in-studio.mp4) |" for r in rows)
notes=f'''# Native motion graphics and narrated demonstrations — 29 October 2026

[Open the finished private review package](WATCH-LATER.html). Scheduling remains paused until the owner watches and approves the exact final movie and thumbnail. Duration follows each demonstration; no fixed one-minute target is imposed.

| Demonstration | Duration | Portrait | Fitted 4:5 feed | Full Studio playback |
| --- | ---: | --- | --- | --- |
{table}

Each delivery folder retains its native `FINAL-TUTORIAL.autopromote.json`, independent exact restore, byte-verified download, decoded frame samples, narration measurements and complete matching native delivery timeline playback. The fitted feed folders also retain their own matching timeline recordings.

## Actual editing and source artwork

The films open on the motion result, demonstrate real Studio controls with enlarged recorded inspector views and spoken guidance, then return to the result. The ZEST can/limes/leaf/shadow and headphone pieces are original illustrated sample assets. Their transforms, timing, word choreography, ellipse mask and circular reveal were edited through ordinary native controls. The selected AutoPromote logo retains its original gradient and lettering; its assembled pieces are masked bitmap components, not inferred editable vector contours or 3D geometry.

Original native motion source projects, recordings and complete result playback remain under `proof/product/`, `proof/transition/` and `proof/logo/`. The later `visible-controls/` recordings put the demonstrated fields in view; their normalized native visual recipes match the original result projects. Raw recordings, initial failed captures and their approximate wall-clock recovery alignments remain preserved. They do not establish frame-accurate instruction synchronization.

[Source artwork kit](motion-study-source-art.zip) · [byte manifest](source-kit-manifest.json). The kit contains static import compositions, portrait stage movies and the existing selected logo. It contains no login, owner project backups or signed media capabilities. Motion is authored inside Studio. Narration uses the cached, disclosed Kokoro `bf_emma` synthetic preset; there is no music bed, cloned voice, new model download or paid speech API call.

## Framing and measured verification

All six delivery files fully decode at 24fps. The portrait films are 720×1280 and their feed copies are 720×900; exact durations/frame counts are retained in [sanitised delivery evidence](delivery-evidence.json). Every version has an independently restored native delivery project and an exact owned download. Narration correlation, integrated loudness and true peak are recorded per file; none of those measurements substitutes for human listening approval.

The unmodified portrait master clips part of its opening headline in a 4:5 centre-fill preview. Its separate fitted feed export uses ordinary Studio **Reframe → 4:5 → Fit full**, preserving the entire portrait source in the encoded file. Use the copy for its destination frame. Declared phone/feed simulations use actual encoded movies and no fabricated platform UI. A physical iPhone and external platform controls/crops remain unverified.

Complete native movie playback is observed with the editable delivery timeline visible. Sparse observational screen capture does not qualify playback smoothness or whole predictive preview/render parity. The earlier strict typography colour/edge failures remain 13/16; thresholds and global readiness are unchanged.

## Preserved failures and the transition delivery boundary

The first completed logo/transition tutorials used an older local runtime after a port collision; their encoded control views were too wide. Both movies/projects are retained and rejected. The foreign service was preserved. Fresh native assemblies use the verified task-owned current renderer. Mixed-bucket links from earlier attempts were not silently rewritten. The corrected transition source trim shows its actual circular-wipe fade instead of preceding setup.

The product job outlived its browser observer and was recovered through normal export-receipt controls with zero resubmissions. The longer transition worker completed its genuine 175.125-second film, but the API reached its 62-minute HTTP limit just before delivery. That original job remains **failed**; its status, receipts and financial state were not manually repaired or represented as a successful original-job recovery.

The completed local worker artifact is retained and fully decoded in `proof/transition/visible-controls/tutorial/camera-r3/completed-worker-artifact/`. It was imported normally into a new native Studio delivery project and exported, downloaded, restored and played in full. The final transition delivery project therefore contains an imported completed film. Its original layered tutorial assembly is retained separately at [the original backup](proof/transition/visible-controls/tutorial/camera-r3/FINAL-TUTORIAL.autopromote.json), with [an exact independent source-only restore](proof/transition/visible-controls/tutorial/camera-r3/source-only-independent-restore.json). This is not durable long-job reconciliation or financial settlement qualification; the API timeout behaviour remains open. No original motion job was resubmitted.

The repeated-File upload fix is present in the isolated client builds. Eight anonymous welcome comparisons and three actual signed-in workspace/help checks passed per qualified build. The owned raw-image/audio recovery checks remain enforced. Two focused frontend tests and 20 server tests passed earlier; the attempted full component-file run did not complete. Sixteen publication-policy/contract tests pass. Native capture teardown now handles its outstanding frame acknowledgement while stopping; the actual source correction and later complete-playback captures exercised it.

## Holds, preservation and remaining work

All 25 original source/project/movie/Auth files retain their hashes. All earlier rejected movies and the five held Queue destinations remain. The daily creative/publishing timer is disabled; retention/observation timers were preserved. The current old runner must not be re-enabled merely because these files exist. An actual owner approval message tied to the exact movie and thumbnail hashes is required; agent picture inspection and passing tests do not provide it.

Only recorded, closed scratch intermediates/symlinks for two completed rejected jobs were cleaned up. Their rejected final movies were hash-verified before cleanup. Redundant native JSON observations were losslessly archived and every archived byte hash verified; no original movie, source project or Auth file was removed.

No new schedules, publications, main push/merge, deployment, GPU allocation, external model generation, cloud worker execution or public-showroom promotion occurred. Normal owned Storage is used for native source/output delivery; no zero-billing or invoice-cost claim is made. Analytics work remains deferred.

Formal readiness stays 17 FUNCTIONAL, 9 PARTIAL, 1 BROKEN and 2 UNIMPLEMENTED, with zero PRO-READY/PRODUCTION-READY. After owner review, retain shared S02 picture/audio/colour/edge/low-alpha/latency and long-job outcome reconciliation, S04 motion/vector/glyph depth and S03 occurrence/group/source ownership. These private examples do not establish broad production or creative acceptance.
'''
(ROOT/'README.md').write_text(notes)
print('Three completed native films and three fitted feed copies verified. Local review index written. No scheduling approval exists.')
