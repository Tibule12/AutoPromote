from pathlib import Path
import shutil,json,hashlib
r=Path(__file__).resolve().parent;p=r/'private/two';v=json.loads((r/'verification.json').read_text());b=json.loads((p/'exact-native-binding.json').read_text());assert v['movieSha256']==b['movieSha256'];assert v['audio']['truePeakDbtp']<=-1.5
dest=Path('/home/tibule12/Videos/Studio - Grounded Dance Revision - 2026-11-08/Corrected');dest.mkdir(exist_ok=True)
def copy(source,name):
    target=dest/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
copy(p/'native-motion-flow/final.mp4','Grounded doubles - corrected.mp4');copy(p/'Editable Project.autopromote.json','Editable Project.autopromote.json')
for name in ['Before and corrected.jpg','Corner correction comparison.jpg','verification.json','README.md']:
    copy(r/name,name)
readme=dest/'README.md';text=readme.read_text().replace('(native-corrections.json)','(Technical/native-corrections.json)').replace('(wallet-preservation.json)','(Technical/wallet-preservation.json)').replace('(delivery-manifest.json)','(SHA256.json)');readme.write_text(text)
for name in ['native-corrections.json','matte-refinement.json','native-source-preflight.json','verified-assets.json','selected-local-build.json','wallet-preservation.json','emulator-final-snapshot.json']:
    if (r/name).exists():copy(r/name,'Technical/'+name)
for name in ['exact-native-binding.json','correction-authoring.json','independent-restore.json']:
    copy(p/name,'Technical/'+name)
for name in ['Native finishing corrections','Complete live Studio playback','Complete finished playback in Studio']:
    copy(p/name/'editing-in-studio.mp4',name+'.mp4');copy(p/name/'editing-recording.json','Technical/'+name+' capture.json')
copy(r/'prepared/Two - firmer detailed matte.mp4','Sources/Two - firmer detailed matte.mp4')
for source in (r.parent/'studio-dance-realism-20261108/prepared').glob('*.mp4'):
    copy(source,'Sources/'+source.name)
sha=lambda path:hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
files={str(f.relative_to(dest)):sha(f)for f in dest.rglob('*')if f.is_file()and f.name!='SHA256.json'};(dest/'SHA256.json').write_text(json.dumps(files,indent=2)+'\n');(r/'delivery-manifest.json').write_text(json.dumps({'directory':str(dest),'movieSha256':v['movieSha256'],'files':files},indent=2)+'\n');print(json.dumps({'delivery':str(dest),'files':len(files),'movieSha256':v['movieSha256']}))
