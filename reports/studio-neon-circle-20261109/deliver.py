from pathlib import Path
import json,hashlib,shutil
r=Path(__file__).resolve().parent;p=r/'private/one';v=json.loads((r/'verification.json').read_text());b=json.loads((p/'exact-native-binding.json').read_text())
assert v['movieSha256']==b['movieSha256']
dest=Path('/home/tibule12/Videos/Studio - Neon Circle - 2026-11-09');dest.mkdir(exist_ok=True)
def copy(source,name):
    target=dest/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
copy(p/'native-motion-flow/final.mp4','Neon circle.mp4')
copy(p/'Editable Project.autopromote.json','Editable Project.autopromote.json')
for name in ['Copy circle still.png','Film contact.jpg','Live vs native export.jpg','README.md','verification.json']:
    copy(r/name,name)
for name in ['native-source-preflight.json','selected-local-build.json','verified-assets.json','capture-review.json','visual-review.json','wallet-preservation.json','emulator-final-snapshot.json','surface-pixel-check.json','preservation.json']:
    copy(r/name,'Technical/'+name)
for name in ['exact-native-binding.json','authoring.json','surface-controls.json','independent-restore.json']:
    copy(p/name,'Technical/'+name)
copy(p/'Reviewed circle rebuild.json','Native graphics and scene actions.json')
copy(p/'Native rim and reflection controls.png','Rim and reflection controls.png')
copy(p/'native-motion-flow/render-receipt.json','Technical/render-receipt.json')
for name in ['Native copy-circle authoring','Native rim and reflection controls','Complete live Studio playback','Complete finished playback in Studio']:
    copy(p/name/'editing-in-studio.mp4',name+'.mp4');copy(p/name/'editing-recording.json','Technical/'+name+' capture.json')
for source in (r/'prepared').glob('*.mp4'):copy(source,'Sources/'+source.name)
copy(Path('/home/tibule12/Videos/number one dance.mp4'),'Sources/number one dance - untouched original.mp4')
sha=lambda f:hashlib.file_digest(f.open('rb'),'sha256').hexdigest()
files={str(f.relative_to(dest)):sha(f)for f in dest.rglob('*')if f.is_file()and f.name!='SHA256.json'}
(dest/'SHA256.json').write_text(json.dumps(files,indent=2)+'\n');(r/'delivery-manifest.json').write_text(json.dumps({'directory':str(dest),'movieSha256':v['movieSha256'],'files':files},indent=2)+'\n')
print(json.dumps({'delivery':str(dest),'files':len(files),'movieSha256':v['movieSha256']}))
