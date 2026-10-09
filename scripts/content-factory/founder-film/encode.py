import json,sys,hashlib,subprocess
from pathlib import Path
root=Path(sys.argv[1]);story=json.loads((root/'storyboard.json').read_text())
for s in story['scenes']:
 p=root/'assets'/s['id'];n=len(list(p.glob('frame-*.png')))
 if n!=round(s['duration']*24):raise RuntimeError('Incomplete source sequence: '+s['id'])
 target=p/'video.mp4';subprocess.run(['ffmpeg','-v','error','-y','-framerate','24','-i',str(p/'frame-%04d.png'),'-an','-c:v','libx264','-threads','2','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],check=True)
 v=json.loads((p/'render-receipt.json').read_text());v['artifact']={'path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'duration':s['duration'],'fps':24,'container':'mp4','codec':'h264','nativeScene':'scene.blend'};(p/'render-receipt.json').write_text(json.dumps(v,indent=2));print(json.dumps({'event':'encoded_scene','id':s['id'],'frames':n,'bytes':target.stat().st_size}),flush=True)
