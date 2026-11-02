"""Export the actual shared compositor's effective alpha for visual inspection.

The native preview remains the canonical video. This diagnostic repeats its
source/mask/foreground commands, records their hashes, and never substitutes
new pixels or a different movie into the Studio project.
"""
import argparse,hashlib,json,subprocess,os
from pathlib import Path
import cv2,numpy as np
from PIL import Image
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
p=argparse.ArgumentParser();p.add_argument('preview_job');p.add_argument('output');a=p.parse_args()
root=Path(a.preview_job);out=Path(a.output);out.mkdir(parents=True,exist_ok=True);masks=out/'effective-alpha';masks.mkdir()
spec=json.loads((root/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(root/'matte',root/'source.mp4')
effects=spec['scene']['effects'];plan={'version':1,'source_sha256':cache.manifest['source_sha256'],'matte_sha256':cache.artifact_sha256,'effects':effects}
renderer=VfxFrameRenderer(plan,cache,lambda _:root/'replacement-0.asset');cv2.setNumThreads(4)
decoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-i',str(root/'source.mp4'),'-map','0:v:0','-vsync','0','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
rows=[];w,h=cache.manifest['width'],cache.manifest['height']
try:
 for index in range(cache.manifest['frame_count']):
  data=decoder.stdout.read(w*h*3)
  if len(data)!=w*h*3:raise ValueError('Diagnostic source ended early')
  frame=Image.frombytes('RGB',(w,h),data);alpha=Image.fromarray(cache.frame(index));active=[e for e in effects if e['start']<=index/24<e['end']]
  foreground,alpha=renderer._prepare_foreground(frame,alpha,active,w,h)
  name=f'alpha_{index:04d}.png';alpha.save(masks/name);rows.append({'index':index,'time':index/24,'file':name,'sha256':sha256(masks/name)})
  if index%12==0:print(json.dumps({'effective_alpha':index,'total':72}),flush=True)
 if decoder.stdout.read(1) or decoder.wait(timeout=30):raise ValueError('Diagnostic source clock changed')
finally:
 if decoder.poll() is None:decoder.kill();decoder.wait()
manifest={'kind':'effective_compositor_alpha','frames':rows,'sourceSha256':sha256(root/'source.mp4'),'parentModelMaskManifest':cache.artifact_sha256,
 'rendererSha256':sha256(Path('python_media_worker/studio_vfx_plan.py')),'effects':effects,'width':w,'height':h,'fps':24,
 'scope':'Exact shared compositor alpha, including saved native edge/colour controls; derived diagnostic, not another model prediction.'}
(out/'effective-alpha.json').write_text(json.dumps(manifest,indent=2))
subprocess.run(['ffmpeg','-nostdin','-v','error','-framerate','24','-i',str(masks/'alpha_%04d.png'),'-c:v','libx264','-crf','12','-pix_fmt','yuv420p','-movflags','+faststart',str(out/'Effective alpha matte.mp4')],check=True)
print('Effective source-bound compositor alpha exported.',flush=True)
