from pathlib import Path
import json,shutil,hashlib,datetime
r=Path(__file__).resolve().parent;p=r/'private/two';dest=Path('/home/tibule12/Videos/Studio - Grounded Dance Revision - 2026-11-08');sha=lambda f:hashlib.file_digest(f.open('rb'),'sha256').hexdigest()
binding=json.load(open(p/'exact-native-binding.json'));picture=json.load(open(p/'picture-and-audio-review.json'));prep=json.load(open(r/'two-preparation.json'));backup=json.load(open(p/'Editable Project.autopromote.json'));s=backup['snapshot']
assert picture['fullDecodePassed']and picture['frames']==144 and picture['seconds']==6
assert picture['audio']['waveformCorrelation']>.97 and picture['audio']['bestLagSamplesAt16k']==0
assert sha(p/'native-motion-flow/final.mp4')==binding['movieSha256']
assert len([o for o in s['overlays']if o.get('colorize',{}).get('enabled')])==2
assert not any('clean plate' in o.get('name','').lower()for o in s['overlays'])
for phase in ['author','watermark','preview','render','finished']:assert json.load(open(p/(phase+'-ui.json')))['errors']==[]
protected=json.load(open(r/'private/preserved-before.json'))
for f in protected:assert sha(Path(f['path']))==f['sha256'],f['path']
def copy(src,name):
 out=dest/name;out.parent.mkdir(parents=True,exist_ok=True)
 if out.exists():assert sha(out)==sha(src),str(out)
 else:shutil.copyfile(src,out)
 return out
copy(p/'native-motion-flow/final.mp4','Grounded doubles.mp4');copy(p/'Editable Project.autopromote.json','Editable Project.autopromote.json');copy(p/'Film contact.jpg','Film contact.jpg');copy(p/'Live vs export.jpg','Live vs export.jpg')
capture={}
for folder in ['Native dance authoring and history','Native cleanup box controls','Complete live Studio playback','Complete finished playback in Studio']:
 copy(p/folder/'editing-in-studio.mp4',folder+'.mp4');record=json.load(open(p/folder/'editing-recording.json'));copy(p/folder/'editing-recording.json','Technical/'+folder+' capture.json');capture[folder]={'seconds':record['seconds'],'capturedUpdates':record['frames'],'observedUpdatesPerSecond':record['frames']/record['seconds'],'audio':'muted native Studio capture'}
 if folder.startswith('Complete'):
  clock=json.load(open(p/(folder+'.json')));assert clock['complete'];capture[folder]['playbackWallMs']=clock['wallMs'];copy(p/(folder+'.json'),'Technical/'+folder+' clock.json')
for file in [prep['sourceName'],'number two - subject matte.mp4',prep['foregroundName']]:copy(r/'prepared'/file,'Sources/'+file)
for file in ['exact-native-binding.json','picture-and-audio-review.json','authoring.json','cleanup-controls.json','independent-restore.json']:copy(p/file,'Technical/'+file)
for file in ['two-preparation.json','selected-local-build.json','native-source-preflight.json','verified-assets.json','owner-rejection.json','wallet-preservation.json','emulator-final-snapshot.json']:copy(r/file,'Technical/'+file)
verification={'deliveredAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'delivery':str(dest),'movieSha256':binding['movieSha256'],'nativeJobId':binding['nativeJobId'],'seconds':6,'frames':144,'fps':24,'size':[576,1024],'sourceInterval':[8,14],'ordinaryLayers':len(s['overlays']),'motionKeys':len(s['motionKeyframes']),'photographicCopies':2,'copyOpacity':1,'tint':{'strength':.52,'gamma':.45,'lift':0},'preparedMatteSize':[576,1024],'matteModelSha256':prep['modelSha256'],'modelDevice':'CPU','modelIsPreparedPrivateInputNotAutomaticProductIntegration':True,'sourceForegroundUsesRecoveredMatteModelFgr':True,'authoredContactCues':4,'contactCuesAreMeasuredFootDrivenEllipsesNotPhysicalLighting':True,'nativeApplyUndoRedoAndIndependentRestore':True,'exactBackupCompilerRequestWorkerDownloadBinding':True,'fullLiveAndFinishedNativeStudioRecordings':True,'priorBatchCreativeVerdict':'Owner rejected: not clean and real.','ownerAccepted':False,'photorealReferenceMatched':False,'strictPredictivePixelAudioParityQualified':False,'music':picture['audio'],'watermarkCleanup':binding['watermarkCleanup'],'sourcePlateDraftRejectedBeforeExport':True,'registrationDiagnosticRejected':True,'sourceCodeChangedForThisRevision':False,'nativeCpuExecutions':1,'newPaidProviderOrGpuExecutions':0,'productionWriteOrDeployment':False,'publishingScheduling':False,'protectedEarlierFiles':len(protected),'capture':capture,'resource':binding['worker'],'remaining':['The compressed576×1024 source and source-dependent fine boundaries remain visible; this is not reference-quality photoreal integration.','The contact cues are authored soft shadows, not solved geometry/lighting.','Existing masked badge reconstruction can still show temporal/texture differences; entire pixel/edge/sound parity and display smoothness are unqualified.','RVM ResNet50 supplied foreground/alpha is private source preparation, not automatic Studio subject isolation.','Owner creative approval and shared S02/S04/S03 remain open.']}
(r/'verification.json').write_text(json.dumps(verification,indent=2)+'\n');copy(r/'verification.json','Technical/verification.json');preservation={'allEarlierProtectedHashesExact':True,'files':len(protected),'originalsAndRejectedEditsOverwritten':False};(r/'preservation.json').write_text(json.dumps(preservation,indent=2));copy(r/'preservation.json','Technical/preservation.json')
(dest/'README.md').write_text('''# Grounded doubles — one-shot revision

Watch Grounded doubles.mp4. This6-second/144-frame/24fps/576×1024 native Studio candidate uses original number two dance.mp4 source8–14s, with its music and speed retained.

Two full-opacity moving doubles retain more original clothing/face shading. Their masks and recovered foreground are576×1024 recurrent CPU RVM ResNet50 inputs instead of the previous288×512 matte. Four restrained native soft ellipses follow measured source foot positions. These are authored contact cues, not solved physical lighting. The copies, source-bound masks, tint and foot keys remain editable.

The four previous stronger-colour/cleanup films remain creatively rejected by the owner. This revision is a candidate for review, not a claim of photoreal equivalence to the reference. Fine hair/foot boundaries, compressed source detail and the existing masked watermark reconstruction still have limits. An earlier-source corner plate and unreliable registration test were rejected before export. No replacement source generation or paid/provider/GPU run occurred.

Actual native authoring/history/cleanup controls, independent restore and complete live/finished Studio timeline recordings accompany the separate movie and native backup. Captures are muted; their measured update/playback rates are in Technical. Original music is in the final movie. Supplied foreground/alpha is private prepared source analysis, not a new automatically deployed Studio isolation feature. Original videos and all previous edits are preserved. Keep Sources for relinking if the isolated library is unavailable.
''')
files={str(f.relative_to(dest)):sha(f)for f in dest.rglob('*')if f.is_file()and f.name!='SHA256.json'};(dest/'SHA256.json').write_text(json.dumps(files,indent=2));(r/'delivery-manifest.json').write_text(json.dumps({'directory':str(dest),'files':files},indent=2));print(json.dumps({'delivery':str(dest),'files':len(files),'sha256':binding['movieSha256'],'protected':len(protected)}))
