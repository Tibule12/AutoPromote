"""Actual fixed-object correction scope diagnostic; preserve all old artifacts."""
import argparse,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from model_workers.adapters.source_edge_alpha import refine_corrected_object_alpha
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
r=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/95d7eae50defbb48aa4d96b1890342f2d6b56c4585874c53ece8248c44dd2fc3/c86ff0c1-50fd-4481-a01d-e659883290e8');g=r/'component_dependency';m=json.loads((g/'manifest.json').read_text());rgb=np.asarray(Image.open(r/'outputs/rgb/rgb_0008.png'));ref=np.asarray(Image.open(r/'outputs/rgb/rgb_0000.png'));alpha=np.asarray(Image.open(r/'outputs/subject_masks/matte_0008.png'));person=np.asarray(Image.open(g/m['components'][0]['frames'][8]['file']));protect=cv2.dilate((person>=24).astype(np.uint8),np.ones((7,7),np.uint8));changed=alpha.copy()
for c in m['components'][3:]:
 changed=refine_corrected_object_alpha(rgb,changed,ref,c['selection']['points'],c['roi'],protect)
Image.fromarray(changed).save(a.out/'roi-alpha.png')
w=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/6e0c5d5c-e7d8-43de-8c3a-961939bd7622');spec=json.loads((w/'spec.json').read_text())['spec'];base=CachedSubjectMatte(w/'matte',w/'source.mp4')
class Cache:
 manifest=base.manifest;artifact_sha256='diagnostic';directory=None
 def frame(self,index):return changed
assets={v['assetId']:w/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(w/'source.mp4'),'matte_sha256':'diagnostic','effects':spec['scene']['effects']},Cache(),asset_resolver=assets.__getitem__);result=renderer.render(Image.fromarray(rgb),8);result.save(a.out/'roi-composite.png')
box=(0,710,380,1000);im=Image.new('RGB',(1140,314));d=ImageDraw.Draw(im)
for j,(label,picture) in enumerate([('Source',Image.fromarray(rgb)),('Current native preview',Image.open('/dev/shm/autopromote-native-motion-review-r23-20261104/preview/0008.png')),('Expanded selected ROI (diagnostic)',result)]):im.paste(picture.crop(box),(380*j,24));d.text((380*j,0),label,fill='white')
im.save(a.out/'comparison.jpg',quality=97);print('ACTUAL_FIXED_ROI_DIAGNOSTIC',int(np.count_nonzero(alpha!=changed)))
