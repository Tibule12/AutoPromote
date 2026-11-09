from pathlib import Path
import json,hashlib,shutil,datetime,base64,urllib.request,urllib.parse
r=Path(__file__).resolve().parent;root=r.parent.parent;p=r/'private/native';out=Path.home()/'Videos/Studio - Landscape Constellation - 2026-11-07';out.mkdir(exist_ok=True);tech=out/'Technical';tech.mkdir(exist_ok=True);sources=out/'Sources';sources.mkdir(exist_ok=True)
def read(f):return json.loads(Path(f).read_text())
def sha(f):return hashlib.sha256(Path(f).read_bytes()).hexdigest()
def copy(a,b):
 a=Path(a);b=Path(b)
 if b.exists() and sha(a)!=sha(b):raise RuntimeError('Preserve previous delivered bytes: '+str(b))
 shutil.copy2(a,b)
protected=[]
for name in ['Studio - Director Creates the Edit - 2026-11-07','Studio - Phase Shift - 2026-11-06','Studio Template Collection - 2026-11-04','Studio - City into Sea - 2026-11-07']:
 d=Path.home()/'Videos'/name
 for f,h in read(d/'SHA256.json').items():assert sha(d/f)==h,(name,f)
 protected.append({'directory':str(d),'unchangedFiles':len(read(d/'SHA256.json'))})
binding=read(r/'exact-native-binding.json');movie=p/'native-motion-flow/final.mp4';assert sha(movie)==binding['movieSha256'];copy(movie,out/'Landscape Constellation.mp4');copy(p/'Editable Project.autopromote.json',out/'Editable Project.autopromote.json')
for name,title in [('Director planning and native apply','Director creates and applies the nodes.mp4'),('Native node driver adjustment','Adjust the generated controller.mp4'),('Live Studio playback','Complete live Studio playback.mp4'),('Finished movie in Studio','Complete finished playback in Studio.mp4')]:
 copy(p/name/'editing-in-studio.mp4',out/title);copy(p/name/'editing-recording.json',tech/(name+' capture.json'))
for a,b in [('Decoded frames/0036.png','Preview.png'),('Film contact.jpg','Film contact.jpg'),('Live vs export.jpg','Live and export comparison.jpg'),('Director node graph.png','Director node graph.png'),('Editable procedural controls.png','Editable procedural controls.png')]:copy(p/a,out/b)
footage=root.parent/'AutoPromote-ae-fusion-20261031/reports/studio-motion-flow-takeover-20261031/video-texture/open-world-sources'
for name in ['Summit','Coast','Autumn']:copy(footage/(name+'.mp4'),sources/(name+'.mp4'))
score=root.parent/'AutoPromote-ae-fusion-20261031/reports/studio-make-your-move-20261102/Make your move - original score.wav';copy(score,sources/score.name)
backup=read(p/'Editable Project.autopromote.json')
for item in backup.get('mediaFiles',[]):
 if item['type']=='image/png':(sources/item['name']).write_bytes(base64.b64decode(item['data']))
for layer in backup['snapshot']['overlays']:
 if layer['type']=='image':
  u=urllib.parse.urlsplit(layer['src']);assert u.hostname in ['127.0.0.1','localhost'];data=urllib.request.urlopen(layer['src'],timeout=20).read();dest=sources/(layer['name']+'.png')
  if dest.exists():assert dest.read_bytes()==data
  dest.write_bytes(data)
source_manifest=read(footage.parent/'open-world-source-manifest.json');(sources/'Source provenance.json').write_text(json.dumps([v for v in source_manifest if v['name'] in ['Summit.mp4','Coast.mp4','Autumn.mp4']],indent=2))
for name in ['exact-native-binding.json','native-source-preflight.json','selected-local-build.json','bounded-worker.json','picture-review.json']:copy(r/name,tech/name)
for name in ['manual-node-edit.json','independent-restore.json','paused-preview.json','Live Studio playback.json','Finished movie in Studio.json','authoring.json']:copy(p/name,tech/name)
for name in ['render-receipt.json','final.mp4.technical.json','native-render-completed.json']:copy(p/'native-motion-flow'/name,tech/name)
proposal=read(p/'director-api-responses.json')[-1]['response']['plan'];(tech/'Director proposal.json').write_text(json.dumps(proposal,indent=2))
captures={name:read(p/name/'editing-recording.json')for name in ['Director planning and native apply','Native node driver adjustment','Live Studio playback','Finished movie in Studio']}
for v in captures.values():v['observedCaptureFps']=v['frames']/v['seconds']
clock=read(p/'paused-preview.json');deltas=[abs(d['effective']-s['time'])for s in clock for d in s['decoders']];assert len(deltas)==39 and max(deltas)<1/24
peaks=read(r/'private/intermediate-peaks.json');maxfile=max(peaks.values());verification={'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':'DIRECTOR_NATIVE_NODE_CREATIVE_DELIVERED_WITH_LIMITS','delivery':str(out),'movieSha256':sha(movie),'seconds':6,'frames':144,'fps':24,'size':[1280,720],'actualStudioFrontend':True,'normalEmulatorSignIn':True,'model':proposal['provenance'],'noPreparedPlanImport':True,'nativeAuthoring':read(p/'authoring.json'),'manualNodeEdit':read(p/'manual-node-edit.json'),'independentRestore':read(p/'independent-restore.json'),'binding':binding,'nativeRenderExecutions':2,'firstRenderFailedAndRefunded':True,'successfulExecutions':1,'previewCORSFailureBeforeAnyDispatch':True,'boundedLocalWorker':read(r/'bounded-worker.json'),'largestObservedIntermediateBytes':maxfile,'priorFileCeilingBytes':128*1024**2,'fileCeilingDiagnosisSupported':maxfile>128*1024**2,'previewSamples':13,'effectiveSourceTimestampSamples':39,'maximumSourceTimeDelta':max(deltas),'livePlayback':read(p/'Live Studio playback.json'),'finishedPlayback':read(p/'Finished movie in Studio.json'),'capture':captures,'pictureReview':read(r/'picture-review.json'),'tests':{'frontend':63,'backend':28,'selectedFullEditor':3,'distinctTotal':94,'fullEditorSuiteRun':False},'welcomeComparisons':8,'normalSignedInHelp':True,'productionDeployment':False,'paidProviderCalls':0,'cloudGpuJobs':0,'productionWrites':0,'publishingScheduling':False,'creativeApproval':False,'wholePictureAudioParityQualified':False,'realtimeSmoothnessQualified':False,'humanListeningQualified':False,'readinessPromotion':False,'protectedDeliveries':protected,'limits':['The model selects bounded media-window intent or validated explicit nodes; it is not unrestricted AE/Fusion planning.','Window authoring geometry is qualified here only for landscape16:9.','finish:fill calculates explicit terminal coverage and companion fade keys; earlier travel poses, colours and controller settings are model choices.','Source measurements are hash-bound colours and frame differences, not semantic vision, transcript or beat understanding.','The original score was selected manually.','Native recordings are silent QA captures; listen to the separate finished movie.','Paused pairs and exact clocks do not establish whole colour/edge/audio parity or real-time smoothness.','The Director flags are enabled in this isolated demo only; no ordinary-account or production release is claimed.'],'nextTask':'Improve general composition reliability and scene/audio grounding, then S02 pixel/edge/audio throughput with native node editing and shared S04/S03 preservation.'}
(r/'verification.json').write_text(json.dumps(verification,indent=2));copy(r/'verification.json',tech/'verification.json')
(out/'README.md').write_text('''# Landscape Constellation

[Watch the film](Landscape%20Constellation.mp4) · [Director creates the nodes](Director%20creates%20and%20applies%20the%20nodes.mp4) · [Adjust the controller](Adjust%20the%20generated%20controller.mp4) · [Live Studio timeline](Complete%20live%20Studio%20playback.mp4) · [Finished movie in Studio](Complete%20finished%20playback%20in%20Studio.mp4).

A mountain landscape opens into moving ocean and autumn windows, outlined by warm rings. One shared controller moves their masks; the ocean grows to fill the final frame. The local Director selected the source windows, poses, colours and controller motion from the brief. Studio lowered that typed intent into eight editable layers, six genuine Parent/Mask connections and two procedural drivers. The declared fill operation calculates final coverage and companion fade keys. No prepared scene plan was imported to substitute for the model result.

The film is a native CPU export: six seconds, 144 frames, 24fps,1280×720,H.264/AAC. The matching editable project, original footage, score, graphics, actual Director/native editing recordings and thirteen live/export still pairs are included. The score was selected manually. Recordings are silent QA captures; the separate film contains audio.

New shared integrations let Director author actual node connections and drivers. Native driver controls, Fit graph and Inspect node support continued manual editing. Bitmap mattes now sample real alpha/luma and request CORS access after owned Storage upload. One render failed at the local intermediate-file boundary and was refunded; one unchanged native rerun succeeded under a finite384MiB per-file allowance. Earlier model drafts and failed checks remain retained in the workspace report.

This is a bounded Director/node example, not unrestricted AE/Fusion equivalence. Whole picture/audio parity, real-time capture smoothness, listening approval and owner creative approval remain open. Nothing was published, scheduled, purchased or deployed.
''')
manifest={str(f.relative_to(out)):sha(f)for f in sorted(out.rglob('*'))if f.is_file()and f.name!='SHA256.json'};(out/'SHA256.json').write_text(json.dumps(manifest,indent=2));assert all(sha(out/f)==h for f,h in manifest.items());print(json.dumps({'delivery':str(out),'files':len(manifest),'bytes':sum((out/f).stat().st_size for f in manifest),'protectedFiles':sum(d['unchangedFiles']for d in protected),'movieSha256':sha(movie)},indent=2))
