from pathlib import Path
import json, hashlib, shutil, datetime, urllib.request, urllib.parse, re
r=Path(__file__).resolve().parent;root=r.parent.parent;p=r/'private/native';out=Path.home()/'Videos/Studio - Make It Move - 2026-11-08'
def read(f):return json.loads(Path(f).read_text())
def sha(f):return hashlib.sha256(Path(f).read_bytes()).hexdigest()
def copy(a,b):
 a=Path(a);b=Path(b);b.parent.mkdir(parents=True,exist_ok=True)
 if b.exists() and sha(a)!=sha(b):raise RuntimeError('Preserve previous delivered bytes: '+str(b))
 shutil.copy2(a,b)
protected=[]
for name in ['Studio - Director Creates the Edit - 2026-11-07','Studio - Phase Shift - 2026-11-06','Studio Template Collection - 2026-11-04','Studio - City into Sea - 2026-11-07','Studio - Landscape Constellation - 2026-11-07','Studio - Cut Through - 2026-11-08']:
 d=Path.home()/'Videos'/name;m=read(d/'SHA256.json')
 for f,h in m.items():assert sha(d/f)==h,(name,f)
 protected.append({'directory':str(d),'unchangedFiles':len(m)})
binding=read(r/'exact-native-binding.json');movie=p/'native-motion-flow/final.mp4';assert sha(movie)==binding['movieSha256']
backup=read(p/'Editable Project.autopromote.json');assert len(backup['snapshot']['overlays'])==56
review=read(p/'motion-design-review.json');assert review['manuallyReviewedPoster']['words']==['MAKE','IT','MOVE']
assert read(p/'independent-restore.json')['exactDecisions']
wallet=read(r/'private/wallet-final.json');assert wallet['activeOperations']==0
copy(movie,out/'Make It Move.mp4');copy(p/'Editable Project.autopromote.json',out/'Editable Project.autopromote.json');tech=out/'Technical';sources=out/'Sources';captures={}
for name,title in [('Director planning and native apply','Director review and native Apply.mp4'),('Native motion and sound controls','Edit motion keys and sound in Studio.mp4'),('Live Studio playback','Complete live Studio playback.mp4'),('Finished movie in Studio','Complete finished playback in Studio.mp4')]:
 copy(p/name/'editing-in-studio.mp4',out/title);c=read(p/name/'editing-recording.json');c['observedCaptureFps']=c['frames']/c['seconds'];captures[name]=c;(tech).mkdir(exist_ok=True);(tech/(name+' capture.json')).write_text(json.dumps(c,indent=2))
for a,b in [('Decoded frames/0216.png','Preview.png'),('Film contact.jpg','Film contact.jpg'),('Live vs export.jpg','Live and export comparison.jpg'),('Director node graph.png','Native node graph.png'),('Editable motion controls.png','Editable motion controls.png'),('Reviewed motion design controls.png','Director review controls.png')]:copy(p/a,out/b)
footage=root.parent/'AutoPromote-ae-fusion-20261031/reports/studio-motion-flow-takeover-20261031/video-texture/open-world-sources'
for name in ['City','Coast']:copy(footage/(name+'.mp4'),sources/(name+'.mp4'))
score=root.parent/'AutoPromote-ae-fusion-20261031/reports/studio-make-your-move-20261102/Make your move - original score.wav';copy(score,sources/score.name)
for i,layer in enumerate(backup['snapshot']['overlays']):
 if layer['type']=='image' and not layer.get('isNullRig'):
  u=urllib.parse.urlsplit(layer['src']);assert u.hostname in ['127.0.0.1','localhost'];data=urllib.request.urlopen(layer['src'],timeout=30).read();dest=sources/f"{i:02d}-{re.sub(r'[^A-Za-z0-9_-]','_',layer['name'])}.png"
  if dest.exists():assert dest.read_bytes()==data
  dest.write_bytes(data)
(sources/'Source provenance.json').write_text(json.dumps({'backgroundProgrammeMedia':[v for v in read(footage.parent/'open-world-source-manifest.json') if v['name'] in ['City.mp4','Coast.mp4']],'visibleDesign':'Native vector glyphs from bundled logoGlyphs.v1.json, authored shapes, masks, ordinary native motion keys and Parent connections. Opaque graphics cover the underlying City programme; source media remains necessary to this saved project.','music':'Previously authored Make your move original score; manually selected. Four native airy-whoosh presets were manually added.'},indent=2))
proposal=read(p/'director-api-responses.json')[-1]['response']['plan'];(tech/'Original model proposal.json').write_text(json.dumps(proposal,indent=2))
for name in ['exact-native-binding.json','native-source-preflight.json','selected-local-build.json','bounded-worker.json','picture-review.json']:copy(r/name,tech/name)
for name in ['manual-continuation.json','motion-design-review.json','independent-restore.json','paused-preview.json','Live Studio playback.json','Finished movie in Studio.json','authoring.json']:copy(p/name,tech/name)
for name in ['render-receipt.json','final.mp4.technical.json','native-render-completed.json']:copy(p/'native-motion-flow'/name,tech/name)
verification={'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':'NATIVE_KINETIC_MOTION_DESIGN_DELIVERED_FOR_OWNER_REVIEW','delivery':str(out),'movieSha256':sha(movie),'seconds':10,'frames':240,'fps':24,'size':[1280,720],'actualStudioFrontend':True,'normalEmulatorSignIn':True,'nativeLayers':56,'parentConnections':18,'motionKeys':len(backup['snapshot']['motionKeyframes']),'editableCompoundVectorGlyphs':True,'constructionMasks':12,'strokeEndAndOffsetKeys':True,'director':{'localModel':proposal['provenance'],'originalPoster':proposal['poster'],'manualReview':review,'authoredMotionDesignOperator':True,'unrestrictedAutonomousChoreography':False},'nativeAuthoring':read(p/'authoring.json'),'manualKeyEditing':read(p/'manual-continuation.json'),'independentRestore':read(p/'independent-restore.json'),'binding':binding,'nativeRenderExecutions':1,'successfulExecutions':1,'previewSamples':21,'livePlayback':read(p/'Live Studio playback.json'),'finishedPlayback':read(p/'Finished movie in Studio.json'),'captures':captures,'pictureReview':read(r/'picture-review.json'),'tests':{'frontend':52,'backend':24,'distinctTotal':76},'welcomeComparisons':8,'normalSignedInHelp':True,'demoWallet':wallet,'protectedDeliveries':protected,'creativeApproval':False,'wholePictureAudioParityQualified':False,'realtimeSmoothnessQualified':False,'humanListeningQualified':False,'readinessPromotion':False,'productionDeployment':False,'paidProviderCalls':0,'cloudGpuJobs':0,'productionWrites':0,'publishingScheduling':False,'limits':['This is one reusable, authored motion-design composition. Director chooses a bounded copy/palette/energy intent; it does not invent arbitrary After Effects choreography.','The first model response supplied wrong wording. Its unapplied-to-export draft and picture findings remain private. Final copy, palette and energy are explicitly reviewed through new native controls before Apply.','The project retains a City programme clock and imported media below opaque graphics; this is not qualification of a media-free project.','Manual score/whoosh selection, native key editing and review are separate from model planning.','Complete Studio playback, sampled preview/export pairs and decoder checks do not establish strict whole-picture/audio parity, real-time smoothness or human listening approval.','No production release, paid execution or public showroom approval. Existing S02/S04/S03 and strict typography failures remain open.'],'nextTask':'Owner review of exact movie; broaden native authored motion design and Director composition beyond this bounded operator while retaining S02 picture/audio/throughput and S04/S03 guards.'}
(r/'verification.json').write_text(json.dumps(verification,indent=2));copy(r/'verification.json',tech/'verification.json')
(out/'README.md').write_text('''# Make It Move — 8 November 2026

[Watch the film](Make%20It%20Move.mp4) · [Director review and Apply](Director%20review%20and%20native%20Apply.mp4) · [Edit motion and sound](Edit%20motion%20keys%20and%20sound%20in%20Studio.mp4) · [Live Studio timeline](Complete%20live%20Studio%20playback.mp4) · [Finished film in Studio](Complete%20finished%20playback%20in%20Studio.mp4).

MAKE assembles from twelve moving letter pieces. An orange wipe carries an animated orbit into IT. MOVE lands over lime with outlined echoes. The final orange asterisk and stacked type share one camera move. Ten seconds,240 frames,24fps,1280×720,H.264/AAC.

The actual Studio frontend creates and exports the design.56 ordinary editable layers include compound vector lettering, masks, stroke animation and18 Parent connections. Director proposes copy,palette and energy for an authored motion-design operator. The words are explicitly corrected/reviewed before native Apply; the model did not invent this choreography. Music and four quiet whooshes are manually selected. This is a private review film, not a claim of full After Effects equivalence or autonomous creative success.

The editable native backup, original imported media/score, artwork fallbacks, real authoring/key-edit recordings, complete live/finished Studio playback, decoded contact sheet and21 measured preview/export pairs are included. The City source remains underneath opaque artwork as the saved programme clock. Prior deliveries are preserved.

Strict predictive picture/audio parity, real-time capture smoothness, human listening and owner creative approval remain open. QA recordings are muted; the separate movie includes sound. Nothing was published, scheduled, deployed or purchased.
''')
manifest={str(f.relative_to(out)):sha(f)for f in sorted(out.rglob('*'))if f.is_file()and f.name!='SHA256.json'};(out/'SHA256.json').write_text(json.dumps(manifest,indent=2));assert all(sha(out/f)==h for f,h in manifest.items());print(json.dumps({'delivery':str(out),'files':len(manifest),'bytes':sum((out/f).stat().st_size for f in manifest),'protectedFiles':sum(d['unchangedFiles']for d in protected),'movieSha256':sha(movie)},indent=2))
