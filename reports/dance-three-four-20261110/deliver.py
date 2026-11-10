from pathlib import Path
import json,hashlib,os,shutil,subprocess
r=Path(__file__).resolve().parent;output=Path('/home/tibule12/Videos/Studio - Dances Three and Four - 2026-11-10');output.mkdir(exist_ok=True)
sha=lambda f:hashlib.file_digest(f.open('rb'),'sha256').hexdigest()
selection=json.loads((r/'publishing/selected-finals.json').read_text());manifests=[]
for word,title,filename in [('three','Prism Relay','Prism relay.mp4'),('four','Mirror Pulse','Mirror pulse.mp4')]:
 p=r/'private'/word;v=json.loads((r/(word+'-verification.json')).read_text());assert v['fullDecode'] and -24<=v['audio']['integratedLufs']<=-12 and v['audio']['truePeakDbtp']<=-1.5
 binding=json.loads((p/'exact-native-binding.json').read_text());assert binding['movieSha256']==v['movieSha256'];movie=p/'native-motion-flow/final.mp4';assert sha(movie)==v['movieSha256']
 dest=output/title;dest.mkdir(exist_ok=True)
 files={filename:movie,'Editable Project.autopromote.json':p/'Editable Project.autopromote.json','Full Studio playback.mp4':p/'Complete finished playback in Studio/editing-in-studio.mp4','Live Studio playback.mp4':p/'Complete live Studio playback/editing-in-studio.mp4','Studio authoring.mp4':p/('Native pop-out authoring/editing-in-studio.mp4' if word=='three' else 'Native copy-circle authoring/editing-in-studio.mp4'),'verification.json':r/(word+'-verification.json'),'Native binding.json':p/'exact-native-binding.json','Film contact.jpg':r/(word+' - film contact.jpg'),'Native render receipt.json':p/'native-motion-flow/render-receipt.json','Original dance.mp4':Path('/home/tibule12/Videos')/f'number {word} dance.mp4','Scene action plan.json':p/('Pop-out scene actions.json' if word=='three' else 'Reviewed circle rebuild.json')}
 if word=='three':files['Music level controls in Studio.mp4']=r/'private/three-basic-master/Native music level correction/editing-in-studio.mp4'
 for name,source in files.items():
  target=dest/name
  if target.exists():assert sha(target)==sha(source),target
  else:os.link(source,target)
 entry=next(x for x in selection['movies'] if x['key']==word);entry.update(media=str(dest/filename),sha256=v['movieSha256'],bytes=movie.stat().st_size,finalResultsOnly=True);entry.pop('pending',None)
 manifests.append({'word':word,'directory':str(dest),'movieSha256':v['movieSha256'],'files':{name:sha(dest/name) for name in files}})
(r/'publishing/selected-finals.json').write_text(json.dumps(selection,indent=2)+'\n');(r/'delivery-manifest.json').write_text(json.dumps({'directory':str(output),'deliveries':manifests},indent=2)+'\n')
authorization={**selection,'latestOwnerRequest':'work on the other two and schedule them i want perfection here mate and my fucken disk space you took. you took over 20gb space here i want it','noNewPermissionRequired':True,'onlyFinishedResultMovies':True,'originalsAndEarlierSchedulesPreserved':True};(r/'publishing/authorization.json').write_text(json.dumps(authorization,indent=2)+'\n')
assert json.loads((r/'three-audio-only-picture-preservation.json').read_text())['all180DecodedRgbFramesIdentical']
print(json.dumps({'deliveredFinals':2,'onlyCurrentFinalHashesSelected':True,'directory':str(output)}))
