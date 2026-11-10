from pathlib import Path
import json,hashlib,shutil,datetime
r=Path(__file__).resolve().parent
dest=Path('/home/tibule12/Videos/Studio - Strong Dance Echoes - 2026-11-08')
sha=lambda f:hashlib.file_digest(f.open('rb'),'sha256').hexdigest()
protected=json.loads((r/'private/preserved-before-delivery.json').read_text())
for f in protected:assert sha(Path(f['path']))==f['sha256'],f['path']
def copy(src,name):
 out=dest/name;out.parent.mkdir(parents=True,exist_ok=True)
 if out.exists():assert sha(out)==sha(src),str(out)
 else:shutil.copyfile(src,out)
 return out
cases={}
for word in ['one','two','three','four']:
 p=r/'private'/word;binding=json.loads((p/'exact-native-binding.json').read_text());picture=json.loads((p/'picture-and-audio-review.json').read_text());backup=json.loads((p/'Editable Project.autopromote.json').read_text());s=backup['snapshot'];prep=json.loads((r/(word+'-preparation.json')).read_text())
 assert picture['frames']==192 and picture['fullDecodePassed']
 assert picture['audio']['waveformCorrelation']>.97 and picture['audio']['bestLagSamplesAt16k']==0
 assert sha(p/'native-motion-flow/final.mp4')==binding['movieSha256']
 assert binding['watermarkSettingsExactlyMatchNativeBackupAndWorker'] and binding['watermarkCleanup']['status']=='applied'
 tinted=[o for o in s['overlays']if o.get('colorize',{}).get('enabled')]
 for o in tinted:assert max(k['value']for k in s['motionKeyframes']if k['targetId']==o['id']and k['property']=='opacity')==1
 for phase in ['author','watermark','preview','finished']:assert json.loads((p/(phase+'-ui.json')).read_text())['errors']==[]
 assert any((p/(phase+'-ui.json')).exists()for phase in ['render','recover'])
 name=word.capitalize()+' - Strong colour echoes.mp4';copy(p/'native-motion-flow/final.mp4',name)
 for filename in ['Editable Project.autopromote.json','Film contact.jpg','Live vs export.jpg']:copy(p/filename,word.capitalize()+'/'+filename)
 capture={}
 for folder in ['Native dance authoring and history','Native cleanup box controls','Complete live Studio playback','Complete finished playback in Studio']:
  copy(p/folder/'editing-in-studio.mp4',word.capitalize()+'/'+folder+'.mp4');record=json.loads((p/folder/'editing-recording.json').read_text());copy(p/folder/'editing-recording.json',word.capitalize()+'/Technical/'+folder+' capture.json');capture[folder]={'captureSeconds':record['seconds'],'capturedUpdates':record['frames'],'observedCaptureUpdatesPerSecond':record['frames']/record['seconds'],'audio':'muted headless Studio recording'}
  if folder.startswith('Complete'):
   clock=json.loads((p/(folder+'.json')).read_text());assert clock['complete'];capture[folder]['playbackWallMs']=clock['wallMs'];copy(p/(folder+'.json'),word.capitalize()+'/Technical/'+folder+' clock.json')
 for filename in [prep['sourceName'],f'number {word} - subject matte.mp4']:copy(r/'prepared'/filename,word.capitalize()+'/Sources/'+filename)
 for filename in ['exact-native-binding.json','picture-and-audio-review.json','authoring.json','cleanup-controls.json','independent-restore.json']:copy(p/filename,word.capitalize()+'/Technical/'+filename)
 copy(r/(word+'-preparation.json'),word.capitalize()+'/Technical/source-preparation.json')
 cases[word]={'movie':name,'sha256':binding['movieSha256'],'nativeJob':binding['nativeJobId'],'seconds':8,'frames':192,'fps':24,'size':[576,1024],'sourceInterval':[prep['sourceStart'],prep['sourceStart']+8],'sourceSha256':prep['sourceSha256'],'copies':len(tinted),'settledCopyOpacity':1,'tintStrength':.86,'tintGamma':.78,'tintShadowLift':.012,'keys':len(s['motionKeyframes']),'nativeVideoLayers':len(s['overlays']),'music':picture['audio'],'cleanup':binding['watermarkCleanup'],'nativeResource':binding['worker'],'capture':capture,'strictPredictivePictureAudioParityQualified':False}
for filename in ['selected-local-build.json','native-source-preflight.json','verified-assets.json','wallet-preservation.json','emulator-final-snapshot.json']:copy(r/filename,'Technical/'+filename)
verification={'deliveredAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'delivery':str(dest),'cases':cases,'normalStudioAuthoringAndExport':True,'nativeUndoRedoAndIndependentRestore':True,'completeMatchingStudioLiveAndFinishedRecordings':True,'nativeCleanupControlsExposedInReframe':True,'finalCanonicalPictureConsumesSavedCleanupSettings':True,'cleanupPreviewIsPlacementGuideOnly':True,'noAddedLines':True,'sourceSpeedUnchanged':True,'originalMusicPreserved':True,'localCpuNativeExecutions':4,'paidProviderGpuExecutions':0,'productionOperations':0,'publishingSchedulingDeployment':False,'workerTests':17,'welcomeComparisons':8,'normalSignInAndHelp':True,'ownerCreativeApproval':False,'priorOriginalAndDeliveredFilesPreserved':len(protected),'limitations':['Watermark cleanup interpolates visible neighbouring pixels; the covered picture is not exactly recoverable. The cleaned rectangles show softening/smear, especially where the badge overlaps a dancer.','The live cleanup rectangle is a placement guide; full predictive cleanup parity is not qualified.','Prepared matching RVM mattes remain source-dependent; crowded groups and fine edges are imperfect. This does not establish automatic product isolation.','These are the four selected eight-second studies, not full-length edits. Whole editor parity, display smoothness, human listening and owner creative acceptance remain unqualified.','Shared S02/S04/S03 and strict typography13/16 failures remain open.']}
(r/'verification.json').write_text(json.dumps(verification,indent=2)+'\n');copy(r/'verification.json','Technical/verification.json')
preservation={'allProtectedPriorHashesMatch':True,'priorOriginalAndDeliveredFilesUnchanged':len(protected),'originalSourcesOverwritten':False};(r/'preservation.json').write_text(json.dumps(preservation,indent=2)+'\n');copy(r/'preservation.json','Technical/preservation.json')
(dest/'README.md').write_text('''# Strong photographic dance echoes

Watch the four MP4s in this folder. Every coloured moving copy reaches full opacity, with photographic source faces/clothing retained. Tint is mixed with 14% original colour and uses less lifted shadows. The natural-colour lead remains in front; original music and dance speed are preserved. There are no added line graphics.

These are four eight-second native Studio studies: one5–13s, two8–16s, three0–8s, four12–20s, each192 frames at24fps/576×1024. The original full videos remain untouched. Each folder contains the editable native project, source-bound matte and working source, actual Studio authoring/cleanup controls, and complete live/finished playback beside the timeline.

Studio → Reframe → Watermark cleanup exposes saved manual boxes using the existing cleanup path. The final native picture now consumes those settings, including over the subject copies. TikTok badges are cleaned, but the interpolated rectangles are visibly softer; covered background/body detail cannot be recovered exactly. The third clip's badge overlaps the left dancer. Its cleaned area is visibly compromised, so it is not a seamless-removal example. The live rectangle only guides placement; full predictive cleanup parity is not qualified. “New trend” in the fourth original is preserved.

Matching mattes are previously prepared local CPU RVM inputs, not new automatic product segmentation. Crowded overlaps/fine edges remain imperfect. This local implementation is not a production deployment or owner creative approval. No paid/provider/GPU execution, production data write, publishing or scheduling occurred. Earlier files are preserved. Keep Sources for native relinking if the isolated library is unavailable. Exact build/job/hash/audio/capture findings are in Technical.
''')
files={str(f.relative_to(dest)):sha(f)for f in dest.rglob('*')if f.is_file()and f.name!='SHA256.json'};(dest/'SHA256.json').write_text(json.dumps(files,indent=2)+'\n');(r/'delivery-manifest.json').write_text(json.dumps({'directory':str(dest),'files':files},indent=2)+'\n');print(json.dumps({'delivery':str(dest),'files':len(files),'protectedPriorFiles':len(protected),'movies':{k:v['sha256']for k,v in cases.items()}}))
