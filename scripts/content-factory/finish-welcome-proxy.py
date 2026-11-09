"""Complete only the local CPU proxy once its native frame cache is ready."""
from pathlib import Path
import json,subprocess,time,hashlib

repo=Path(__file__).resolve().parents[2];root=repo/'reports/welcome-cinematic-20261009'
deadline=time.monotonic()+240
while not (root/'proxy-frames/frame_0911.png').exists():
    if time.monotonic()>deadline:raise TimeoutError('Native CPU proxy did not finish')
    time.sleep(1)
# Renderer receipt is written after the final PNG has closed.
while not (root/'proxy-frames/receipt.json').exists():
    if time.monotonic()>deadline:raise TimeoutError('Native CPU receipt missing')
    time.sleep(1)
receipt=json.loads((root/'proxy-frames/receipt.json').read_text())
assert receipt['frameCount']==456
subprocess.run(['python3',str(repo/'scripts/content-factory/materialize-welcome-proxy.py'),str(root)],check=True)
times=[3,6,10,13,16,18,20,23,26,29,34,36]
select='+'.join('eq(n,%d)'%(t*12) for t in times)
subprocess.run(['ffmpeg','-v','error','-y','-framerate','12','-pattern_type','glob','-i',str(root/'proxy-frames/frame_*.png'),'-vf',"select='"+select+"',scale=320:180,tile=4x3",'-frames:v','1',str(root/'cpu-story-sheet.jpg')],check=True)
subprocess.run(['node',str(repo/'scripts/content-factory/compile-welcome-story.js'),str(root),'proxy'],check=True)
saved=json.loads((root/'outputs/proxy/studio-saved-project.json').read_text())
(root/'studio-fixture-project.json').write_text(json.dumps({'project':saved,'clip':saved['snapshot']['orderedClips'][0]},indent=2))
# Build the prepared final payload from the same editorial decisions, changing
# only the normal generated-media transport and delivery resolution.
request=json.loads((root/'outputs/proxy/render-request.json').read_text())
def final(v):
    if isinstance(v,dict):return {k:final(x) for k,x in v.items()}
    if isinstance(v,list):return [final(x) for x in v]
    return v.replace('/assets/proxy/','/assets/final/') if isinstance(v,str) else v
request=final(request);request['output_settings']={'resolution':'1080p','fps':24,'codec':'h264','audioCodec':'aac'}
(root/'outputs/final/render-request.json').write_text(json.dumps(request,indent=2))
print(json.dumps({'event':'proxy_sources_compiled','nativeSceneSha256':hashlib.sha256((root/'assets/welcome-world.blend').read_bytes()).hexdigest()}),flush=True)
