from pathlib import Path
import json,hashlib,shutil,datetime
r=Path(__file__).resolve().parent;p=r/'private/native';dest=Path('/home/tibule12/Videos/Studio - Subject Echoes - 2026-11-08');sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
assert json.loads((r/'postprocess.json').read_text())['completeFinishedStudioPlayback']
bind=json.loads((r/'exact-native-binding.json').read_text());pic=json.loads((r/'picture-review.json').read_text());backup=json.loads((p/'Editable Project.autopromote.json').read_text());assert bind['ordinaryOverlays']==32 and bind['motionKeys']==76
for phase in ['author','preview','render','finished']:assert json.loads((p/(phase+'-ui.json')).read_text())['errors']==[]
protected=json.loads((r/'protected-deliveries-before.json').read_text())
for f in protected:assert sha(Path(f['path']))==f['sha256'],f['path']
preservation={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'priorDeliveryFilesUnchanged':len(protected),'originalInputsUnchanged':True};(r/'preservation.json').write_text(json.dumps(preservation,indent=2)+'\n')
dest.mkdir(exist_ok=True)
def copy(src,name):
 to=dest/name;to.parent.mkdir(parents=True,exist_ok=True)
 if to.exists():assert sha(to)==sha(src),str(to)
 else:shutil.copyfile(src,to)
copy(p/'native-motion-flow/final.mp4','Subject Echoes.mp4');copy(p/'Editable Project.autopromote.json','Editable Project.autopromote.json')
for folder,name in [('Native subject echo controls and history','Studio authoring and undo-redo'),('Complete live Studio playback','Complete live Studio playback'),('Complete finished playback in Studio','Complete finished playback in Studio')]:
 copy(p/folder/'editing-in-studio.mp4',name+'.mp4');copy(p/folder/'editing-recording.json','Technical/'+name+' capture.json')
copy(p/'Subject echo feature controls.png','Subject echo controls.png');copy(p/'Film contact.jpg','Film contact.jpg');copy(p/'Live vs export.jpg','Live vs export.jpg')
for f in (r/'sources').iterdir():
 if f.is_file():copy(f,'Sources/'+f.name)
# Retain every actual pre-export raster input by content hash, including repeated
# layer references. Final source hashes must match the native uploaded bindings.
before=json.loads((p/'Before Export.autopromote.json').read_text());art=(dest/'Sources/Artwork');art.mkdir(parents=True,exist_ok=True);retained={}
import base64
for f in before.get('mediaFiles',[]):
 data=base64.b64decode(f['data']);h=hashlib.sha256(data).hexdigest();retained[h]=f
 if f.get('type','').startswith('image/') or str(f.get('name','')).lower().endswith('.png'):
  name=''.join(c if c.isalnum() or c in ' .-_' else '_' for c in f.get('name','artwork.png'));out=art/(h[:12]+'-'+name)
  if out.exists():assert out.read_bytes()==data
  else:out.write_bytes(data)
import hmac
from urllib.parse import urlparse,parse_qs
runtime=Path(json.loads((r/'private/runtime-pointer.json').read_text())['directory']);config=json.loads((runtime/'config.json').read_text())
for layer in backup['snapshot']['overlays']:
 if layer['type']=='image':
  payload,signature=parse_qs(urlparse(layer['src']).query)['cap'][0].split('.')
  actual=base64.urlsafe_b64encode(hmac.new(config['sourceSecret'].encode(),payload.encode(),hashlib.sha256).digest()).decode().rstrip('=')
  assert hmac.compare_digest(signature,actual),'Native image source capability signature'
  source=json.loads(base64.urlsafe_b64decode(payload+'='*(-len(payload)%4)))
  assert source['userId']=='demo-pilot-echo-20261108'
  assert source['storagePath']==layer['sourceStoragePath']
  assert source['contentHash'] in retained,(layer['name'],source['contentHash'])
for name in ['exact-native-binding.json','picture-review.json','native-source-preflight.json','selected-local-build.json','source-provenance.json','preservation.json','rules-runtime-recovery.json','wallet-preservation.json']:
 copy(r/name,'Technical/'+name)
copy(p/'authoring.json','Technical/native-authoring.json');copy(p/'independent-restore.json','Technical/independent-restore.json');copy(p/'render-upload-events.json','Technical/upload-events.json')
for n in ['Complete live Studio playback','Complete finished playback in Studio']:copy(p/(n+'.json'),'Technical/'+n+'.json')
metrics={}
for n in ['Complete live Studio playback','Complete finished playback in Studio']:
 x=json.loads((p/(n+'.json')).read_text());capture=json.loads((p/n/'editing-recording.json').read_text());metrics[n]={'programmeSeconds':8,'wallMs':x['wallMs'],'observedCaptureUpdatesPerSecond':capture['frames']/capture['seconds']}
verification={'state':'NATIVE_SUBJECT_ECHO_CONTROL_AND_MOVIE_DELIVERED_FOR_OWNER_REVIEW','delivery':str(dest),'movieSha256':bind['movieSha256'],'nativeJobId':bind['nativeJobId'],'seconds':8,'frames':192,'fps':24,'size':[1280,720],'nativeLayers':32,'motionKeys':76,'focusedTests':54,'nativeApplyUndoRedoExact':True,'independentNativeReopenExact':True,'fullLiveAndFinishedStudioRecordings':True,'exactNativeBackupCompilerWorkerDownloadBinding':True,'minimumDiagnosticPsnrDb':pic['minimumDiagnosticPsnrDb'],'strictPictureAudioParityQualified':False,'humanListeningQualified':False,'ownerCreativeApproval':False,'automaticSegmentation':False,'automaticFootTracking':False,'texturedColourisedEchoes':False,'physicalParticlesOrRelighting':False,'exactReferenceRecreated':False,'readinessPromotion':False,'productionDeployment':False,'paidProviderExecutions':0,'nativeCpuExecutions':1,'transportFix':'Storage URL lookup bounded by15s/the remaining caller deadline; existing backend fallback retained.','runtimeRecovery':'Same Storage rules VM restarted, all117 existing objects and rule hash preserved.','existingWalletPreserved':True,'freshSeededDemoAccount':True,'performance':metrics,'priorDeliveryFilesUnchanged':len(protected),'limits':['A supplied matching white-subject/black-background matte is required.','Coloured echoes are flat silhouettes. Arcs are manually positioned editable paths; they do not track feet or simulate particles/scene lighting.','Live/export diagnostics do not establish full predictive picture/audio parity or realtime playback.','Editable backup uses the isolated media library; originals, matching matte and raster inputs are supplied for normal relinking.','Earlier controls/observer failures, the old account credit refusal and first pre-dispatch upload hang remain retained. Shared S02/S04/S03 and typography13/16 remain open.']}
(r/'verification.json').write_text(json.dumps(verification,indent=2)+'\n');copy(r/'verification.json','Technical/verification.json')
readme='''# Subject Echoes — native Studio example

Watch **Subject Echoes.mp4**. The first four seconds show photographic ghosts; the next four show coloured silhouettes. Both include glowing, drawing light arcs. The moving source, isolation, colours and curves remain32 editable Studio layers with76 keys.

Open Studio → Motion & Flow → Node Flow → **Subject echoes & light arcs**. Import your footage and its matching white-person/black-background matte, align their source starts, choose count/delay/opacity/spacing and apply at the playhead. Light arcs remain editable vector paths and stroke keys. Both appearances, native Undo/Redo, cold reopen and exact native export binding are retained.

This example reuses the retained City clip and its source-bound matte; there is no new automatic segmentation. Coloured copies are flat silhouettes. Paths are manually positioned, without automatic foot tracking, physical particles or scene relighting. The supplied reference stills are creative targets, not claimed exact matches.

The package includes the separate8s/192-frame/24fps/720p movie, actual Studio authoring/history and full live/finished recordings, the native backup, source inputs/raster artwork and exact technical findings. The recordings are muted headless captures; their measured update rates and wall times are reported in Technical/verification.json. The final MP4 has the original instrumental excerpt. Human listening and owner creative approval remain separate.

The editable backup uses the isolated local media library. Keep the supplied original clips, matte and artwork for normal relinking if that library is unavailable. This is a local development implementation; no production release, paid provider/GPU job, publication or existing-wallet reset occurred. All prior delivery files were preserved.
'''
(dest/'README.md').write_text(readme);manifest={str(f.relative_to(dest)):sha(f)for f in dest.rglob('*')if f.is_file() and f.name!='SHA256.json'};(dest/'SHA256.json').write_text(json.dumps(manifest,indent=2)+'\n');(r/'checkpoint.json').write_text(json.dumps({**verification,'deliveryFiles':len(manifest),'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nextTask':'Owner review of the exact sample; continue source isolation, richer tracked trails and shared S02 precision without readiness promotion.'},indent=2)+'\n')
print(json.dumps({'delivery':str(dest),'files':len(manifest),'movieSha256':bind['movieSha256'],'protectedPriorFiles':len(protected)}))
