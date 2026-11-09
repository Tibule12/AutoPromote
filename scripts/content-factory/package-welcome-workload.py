"""Prepare immutable input/runtime archives on CPU; no cloud or GPU execution."""
from pathlib import Path
import hashlib
import json
import tarfile
import sys

repo=Path(__file__).resolve().parents[2]
root=repo/'reports/welcome-cinematic-20261009'
runtime=Path('/home/tibule12/.cache/autopromote-cinematic-runtime')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def filtered(info):
    if '__pycache__' in info.name or info.name.endswith('.pyc'):return None
    return info
if '--inputs-only' not in sys.argv:
    with tarfile.open(runtime/'runtime.tar.gz','w:gz',compresslevel=3) as t:
        t.add(runtime/'worker-venv/lib/python3.12/site-packages',arcname='python',filter=filtered)
        for p in (repo/'python_media_worker').glob('*.py'):t.add(p,arcname='worker/'+p.name)
        t.add(repo/'python_media_worker/assets/fonts',arcname='worker/assets/fonts')
        t.add(repo/'scripts/content-factory/render-existing-studio.py',arcname='scripts/render_existing_studio.py')
        t.add(repo/'scripts/local_media_http.py',arcname='scripts/local_media_http.py')
if '--runtime-only' in sys.argv:
    print(json.dumps({'runtimeBytes':(runtime/'runtime.tar.gz').stat().st_size,'sha256':sha(runtime/'runtime.tar.gz')}))
    sys.exit()
input_name='inputs-v5.tar.gz' if '--inputs-only' in sys.argv else 'inputs.tar.gz'
with tarfile.open(root/input_name,'w:gz',compresslevel=3) as t:
    for f in ['story-plan.json','assets/welcome-world.blend','assets/author_welcome_world.py','assets/vector_geometry.py','assets/logo-geometry.json','assets/score.wav','assets/cues.wav','assets/founder-studio.png','assets/founder-story.png','assets/founder-foreground.png','assets/story-landscape.png','assets/photographic-provenance.json','outputs/final/render-request.json']:
        t.add(root/f,arcname='film/'+f)
manifest=json.loads((root/'workload-inputs.json').read_text()) if '--inputs-only' in sys.argv else {'version':1,'prefix':'founder_films/welcome-cinematic-20261009/v1','files':{}}
if '--inputs-only' in sys.argv:
    manifest.update({'version':5,'prefix':'founder_films/welcome-cinematic-20261009/v5','assetPrefix':'founder_films/welcome-cinematic-20261009/v1','inputObject':input_name})
files=[('inputs.tar.gz',root/input_name)] if '--inputs-only' in sys.argv else [('runtime.tar.gz',runtime/'runtime.tar.gz'),('inputs.tar.gz',root/input_name),('blender.tar.xz',runtime/'blender.tar.xz')]
for name,p in files:
    manifest['files'][name]={'localPath':str(p),'sha256':sha(p),'bytes':p.stat().st_size}
manifest['nativeSceneSha256']=sha(root/'assets/welcome-world.blend')
manifest['workerSha256']=sha(repo/'python_media_worker/main_media_server.py')
(root/'workload-inputs.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({n:{'bytes':v['bytes'],'sha256':v['sha256']} for n,v in manifest['files'].items()}))
