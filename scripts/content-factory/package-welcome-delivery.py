"""Package the actual editable project and media, excluding runtime archives."""
from pathlib import Path
import hashlib,json,zipfile

repo=Path(__file__).resolve().parents[2];root=repo/'reports/welcome-cinematic-20261009'
assert json.loads((root/'final-validation.json').read_text())['status']=='PASS'
files=[]
for p in [root/'assets',root/'outputs/final',root/'outputs/proxy']:
    files.extend(f for f in p.rglob('*') if f.is_file() and f.suffix not in ['.blend1','.f32'] and 'unmastered' not in f.name)
for n in ['README.md','story-plan.json','final-validation.json','gpu-final-receipt.json','gpu-zero-after.json','cloud-time-accounting.json','studio-open-evidence.json','studio-final-open.json','studio-fixture-project.json','index.html','hero-poster.jpg','preview-review.json','final-creative-review.json','preview-final-parity.json','browser-player-final.json','browser-player-proxy.json']:
    files.append(root/n)
manifest=[]
for f in files:
    assert f.exists(),f
    manifest.append({'path':str(f.relative_to(root)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
(root/'delivery-manifest.json').write_text(json.dumps(manifest,indent=2))
with zipfile.ZipFile(root/'AutoPromote-editable-project.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=3) as z:
    for f in files+[root/'delivery-manifest.json']:z.write(f,str(f.relative_to(root)))
print(json.dumps({'zip':str(root/'AutoPromote-editable-project.zip'),'bytes':(root/'AutoPromote-editable-project.zip').stat().st_size,'files':len(files)+1}))
