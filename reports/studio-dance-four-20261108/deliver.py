from pathlib import Path
import json,hashlib,shutil,base64,datetime,sys
r=Path(__file__).resolve().parent;dest=Path('/home/tibule12/Videos/Studio - Your Dance Videos - 2026-11-08');names={'one':'One - Silver afterbeats','two':'Two - Red double-take','three':'Three - Group timeprint','four':'Four - Electric footwork'};sha=lambda f:hashlib.file_digest(f.open('rb'),'sha256').hexdigest()
def copy(src,name):
 out=dest/name;out.parent.mkdir(parents=True,exist_ok=True)
 if out.exists():assert sha(out)==sha(src),out
 else:shutil.copyfile(src,out)
 return out
words=[sys.argv[1]] if len(sys.argv)>1 else list(names);entries=[]
for word in words:
 p=r/'private'/word;bind=json.loads((p/'exact-native-binding.json').read_text());review=json.loads((p/'picture-and-audio-review.json').read_text());assert review['fullDecodePassed'] and review['workingSelectedDecodedFramesExactlyMatchOriginal'];assert review['audio']['waveformCorrelation']>.97
 for phase in ['author','preview','finished']:assert json.loads((p/(phase+'-ui.json')).read_text())['errors']==[]
 if word!='one':assert json.loads((p/'render-ui.json').read_text())['errors']==[]
 assert bind['nativeBackupMatchesRenderedDocument'] and bind['workerCompositionMatchesNativeGraph'];assert sha(p/'native-motion-flow/final.mp4')==bind['movieSha256']
 movie=copy(p/'native-motion-flow/final.mp4',names[word]+'.mp4');base=Path('Projects and evidence')/word
 for f in ['Editable Project.autopromote.json','Before export.autopromote.json','Reviewed dance direction.json','authoring.json','independent-restore.json','exact-native-binding.json','picture-and-audio-review.json','Film contact.jpg','Live vs export.jpg']:
  copy(p/f,base/f)
 metrics={}
 for folder,label in [('Native dance authoring and history','Studio authoring and history'),('Complete live Studio playback','Studio live playback'),('Complete finished playback in Studio','Studio finished playback')]:
  copy(p/folder/'editing-in-studio.mp4',base/(label+'.mp4'));record=json.loads((p/folder/'editing-recording.json').read_text());copy(p/folder/'editing-recording.json',base/(label+' capture.json'));metrics[label]={'captureSeconds':record['seconds'],'capturedUpdates':record['frames'],'observedCaptureUpdatesPerSecond':record['frames']/record['seconds'],'audio':'muted native UI capture'}
  if 'playback' in folder.lower():
   play=json.loads((p/(folder+'.json')).read_text());assert play['complete'];metrics[label].update({'programmeSeconds':8,'playbackWallMs':play['wallMs']});copy(p/(folder+'.json'),base/(label+' clock samples.json'))
 prep=json.loads((r/(word+'-preparation.json')).read_text());copy(r/(word+'-preparation.json'),base/'Source and matte preparation.json');copy(r/'prepared'/prep['sourceName'],base/('Sources/'+prep['sourceName']));copy(r/'prepared'/f'number {word} - subject matte.mp4',base/('Sources/'+f'number {word} - subject matte.mp4'))
 before=json.loads((p/'Before export.autopromote.json').read_text())
 for f in before.get('mediaFiles',[]):
  data=base64.b64decode(f['data']);h=hashlib.sha256(data).hexdigest();name=''.join(c if c.isalnum()or c in' .-_'else'_'for c in f['name']);out=dest/base/'Sources/Artwork'/(h[:12]+'-'+name);out.parent.mkdir(parents=True,exist_ok=True)
  if out.exists():assert out.read_bytes()==data
  else:out.write_bytes(data)
 # Check uploaded raster sources against retained pre-export content, not guessed paths.
 from urllib.parse import urlparse,parse_qs
 import hmac
 config=json.loads((Path(json.loads((r/'private/runtime-pointer.json').read_text())['directory'])/'config.json').read_text());retained={hashlib.sha256(base64.b64decode(f['data'])).hexdigest()for f in before.get('mediaFiles',[])};backup=json.loads((p/'Editable Project.autopromote.json').read_text())
 for o in backup['snapshot']['overlays']:
  if o['type']=='image':
   payload,signature=parse_qs(urlparse(o['src']).query)['cap'][0].split('.');actual=base64.urlsafe_b64encode(hmac.new(config['sourceSecret'].encode(),payload.encode(),hashlib.sha256).digest()).decode().rstrip('=');assert hmac.compare_digest(signature,actual);cap=json.loads(base64.urlsafe_b64decode(payload+'='*(-len(payload)%4)));assert cap['contentHash']in retained;assert cap['userId']=='demo-pilot-echo-20261108'
 entry={'word':word,'movie':str(movie),'movieSha256':bind['movieSha256'],'nativeJobId':bind['nativeJobId'],'sourceName':prep['sourceName'],'sourceRange':review['originalSelectedRange'],'seconds':8,'frames':192,'fps':24,'size':[576,1024],'layers':bind['ordinaryOverlays'],'keys':bind['motionKeys'],'originalMusic':True,'audio':review['audio'],'nativeSourceAndCompilerBinding':True,'normalNativeUndoRedoAndRestore':True,'preparedExternalMatte':True,'nativeAutomaticSegmentation':False,'automaticFootTracking':False,'manuallyArtDirected':True,'autonomousDirectorOutput':False,'minimumDiagnosticPsnrDb':review['minimumDiagnosticPsnrDb'],'strictPredictiveParityQualified':False,'capture':metrics,'workerResource':bind['worker'],'humanListeningQualified':False,'ownerCreativeApproval':False}
 (p/'delivered.json').write_text(json.dumps(entry,indent=2)+'\n');copy(p/'delivered.json',base/'Verification.json');entries.append(entry)
if len(words)==4:
 protected=json.loads((r/'private/preserved-before-delivery.json').read_text())
 for f in protected:assert sha(Path(f['path']))==f['sha256'],f['path']
 preservation={'priorFilesPreserved':len(protected),'fullOriginalNumberedVideosUnchanged':True};(r/'preservation.json').write_text(json.dumps(preservation,indent=2)+'\n');copy(r/'preservation.json','Technical/preservation.json');copy(r/'native-source-preflight.json','Technical/native-source-preflight.json');copy(r/'selected-local-build.json','Technical/selected-local-build.json');copy(r/'source-inventory.json','Technical/source-inventory.json');copy(r/'verified-assets.json','Technical/verified-assets.json');copy(r/'runtime-reboot-recovery.json','Technical/runtime-reboot-recovery.json')
 result={'deliveredAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'delivery':str(dest),'movies':entries,'preservation':preservation,'nativeCpuExecutions':4,'paidOrProductionExecutions':0,'readinessPromotion':False,'sameNativeStudioSceneActionsCompilerCpu':True,'allOriginalMusicPreserved':True,'referenceStillsExactlyRecreated':False,'remaining':['Subject masks are externally prepared local CPU analysis inputs; these films do not prove automatic in-product segmentation.','Coloured copies are silhouettes, not relit or textured duplicates. Light arcs are manually placed vector paths, not foot tracking, 3D particles or physical scene lighting.','Paused picture diagnostics and music correlation do not establish full predictive/live audio, smoothness or pixel/edge/colour parity.','Manual art direction supplied these four native plans; no autonomous Director claim.','Eight-second studies use selected excerpts, not four full-length edits.','Shared S02/S04/S03 and typography13/16 remain open.']};(r/'verification.json').write_text(json.dumps(result,indent=2)+'\n');copy(r/'verification.json','Technical/verification.json')
 (dest/'README.md').write_text('''# Your four dance videos — native Studio edits

Watch the four numbered MP4s in this folder. Each is an eight-second study using the corresponding original dancing video and its own music at the original speed. No replacement score or new text was added; embedded source watermarks/titles remain.

One uses photographic grey echoes; Two uses a red duo double image; Three uses warm group silhouettes; Four uses green/cyan/violet echoes around the neon trio. Editable vector light arcs pulse around measured musical accents. Accent detection is not a reviewed tempo grid.

Each result was authored and exported through the real AutoPromote Studio frontend and canonical CPU compositor. Projects and evidence contains native backups, the actual authoring/history recording, full live and finished playback with the timeline, exact source/job hashes, original working stream-copies, matching mattes and raster artwork for relinking. Full originals remain in your Videos folder. The backups reference the isolated local media library; if unavailable, use the supplied exact media to relink through Studio.

Reusable controls: Studio → Motion & Flow → Node Flow → Subject echoes & light arcs. These controls require a matching white-person/black-background video matte. This package prepared those mattes separately with the cached local CPU model. Effects remain ordinary editable Studio layers, keys and vector paths; no finished effect movie was imported. These four scenes were manually art-directed, not autonomously composed by Director.

These studies do not exactly reproduce the reference images. Coloured copies are flat silhouettes; paths are manually positioned without automatic foot tracking, particles or physical relighting. Group matte edges remain imperfect. Muted headless Studio recordings report their observed capture/update rates; they are not proof of realtime smoothness or a human listening pass. Technical/verification.json records exact timings, soundtrack correlation and limits. No production deployment, paid generation, publication or scheduling occurred. All earlier delivered files were preserved.
''')
 manifest={str(f.relative_to(dest)):sha(f)for f in dest.rglob('*')if f.is_file()and f.name!='SHA256.json'};(dest/'SHA256.json').write_text(json.dumps(manifest,indent=2)+'\n');(r/'delivery-manifest.json').write_text(json.dumps({'directory':str(dest),'files':manifest},indent=2)+'\n')
print(json.dumps({'delivery':str(dest),'movies':[e['movie']for e in entries]}))
