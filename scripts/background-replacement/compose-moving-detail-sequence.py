"""Review exact current Studio effects against diagnostic moving-detail alpha.

This is the canonical compositor, but NOT a native Studio artifact/export.
"""
import argparse,json,subprocess
from pathlib import Path
import numpy as np,cv2
from PIL import Image,ImageDraw
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
p=argparse.ArgumentParser();p.add_argument('detail',type=Path);p.add_argument('out',type=Path);p.add_argument('--resume-encoded-frames',action='store_true');a=p.parse_args();a.out.mkdir(exist_ok=a.resume_encoded_frames)
w=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/6e0c5d5c-e7d8-43de-8c3a-961939bd7622');spec=json.loads((w/'spec.json').read_text())['spec'];sourcecache=CachedSubjectMatte(w/'matte',w/'source.mp4')
class DiagnosticCache:
 manifest=sourcecache.manifest;artifact_sha256='diagnostic-unpublished';directory=None
 def frame(self,index):return np.asarray(Image.open(a.detail/'masks'/f'matte_{index:04d}.png'))
plan={'version':1,'source_sha256':sha256(w/'source.mp4'),'matte_sha256':'diagnostic-unpublished','effects':spec['scene']['effects']};assets={v['assetId']:w/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer(plan,DiagnosticCache(),asset_resolver=assets.__getitem__)
source=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/95d7eae50defbb48aa4d96b1890342f2d6b56c4585874c53ece8248c44dd2fc3/c86ff0c1-50fd-4481-a01d-e659883290e8/outputs/rgb');frames=a.out/'frames';frames.mkdir(exist_ok=a.resume_encoded_frames);alphas=a.out/'alpha';alphas.mkdir(exist_ok=a.resume_encoded_frames);cv2.setNumThreads(2)
for i in range(48):
 if a.resume_encoded_frames:
  assert (frames/f'{i:04d}.png').exists() and (alphas/f'{i:04d}.png').exists();continue
 rgb=Image.open(source/f'rgb_{i:04d}.png').convert('RGB');renderer.render(rgb,i).save(frames/f'{i:04d}.png');_,alpha=renderer._prepare_foreground(rgb,Image.fromarray(DiagnosticCache().frame(i)),[e for e in plan['effects'] if e['start']<=i/24<e['end']],1430,1000);alpha.save(alphas/f'{i:04d}.png')
 if i%12==0:print('CANONICAL_DIAGNOSTIC_DETAIL_COMPOSITE',i,flush=True)
subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-framerate','24','-i',str(frames/'%04d.png'),'-i',str(w/'original.mp4'),'-map','0:v:0','-map','1:a:0','-t','2','-c:v','libx264','-threads','2','-crf','12','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',str(a.out/'Diagnostic moving detail.mp4')],check=True)
for name,box in {'head':(660,45,1040,480),'left-hand':(280,240,680,720),'right-hand':(1040,170,1430,760),'props':(0,720,910,1000),'body':(320,430,1430,1000)}.items():
 for page in range(4):
  sw,sh=280,round((box[3]-box[1])*280/(box[2]-box[0]));sheet=Image.new('RGB',(sw*6,(sh+20)*4));draw=ImageDraw.Draw(sheet)
  for cell,i in enumerate(range(page*12,page*12+12)):
   x=cell%3*sw*2;y=cell//3*(sh+20);draw.text((x,y),f'{i} SOURCE / DIAGNOSTIC',fill='white')
   for k,im in enumerate([Image.open(source/f'rgb_{i:04d}.png'),Image.open(frames/f'{i:04d}.png')]):sheet.paste(im.crop(box).resize((sw,sh),Image.Resampling.LANCZOS),(x+k*sw,y+20))
  sheet.save(a.out/f'{name}-{page}.jpg',quality=97)
(a.out/'evaluation.json').write_text(json.dumps({'actualFrames':48,'canonicalCompositor':True,'nativeStudioExport':False,'visualPass':False},indent=2));print('ACTUAL_CANONICAL_DETAIL_COMPOSITE_COMPLETE',flush=True)
