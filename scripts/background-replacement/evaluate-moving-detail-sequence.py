"""Validate the exact integrated helper on the retained failed two-second source."""
import argparse,json,shutil
from pathlib import Path
import cv2,numpy as np,torch
from PIL import Image
from transformers import VitMatteForImageMatting
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from model_workers.adapters.moving_detail_alpha import refine_moving_details
from model_workers.adapters.temporal_alpha import stabilize,condition_trimap_clicks

p=argparse.ArgumentParser();p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/95d7eae50defbb48aa4d96b1890342f2d6b56c4585874c53ece8248c44dd2fc3/c86ff0c1-50fd-4481-a01d-e659883290e8');masks=a.out/'masks';tri=a.out/'trimaps';masks.mkdir();tri.mkdir();rgbdir=root/'outputs/rgb'
for i in range(48):
 for old,new in [(root/'outputs/subject_masks'/f'matte_{i:04d}.png',masks/f'matte_{i:04d}.png'),(root/'outputs/trimaps'/f'trimap_{i:04d}.png',tri/f'trimap_{i:04d}.png')]:shutil.copy2(old,new)
cv2.setNumThreads(2);torch.set_num_threads(4);torch.set_num_interop_threads(1)
cache=CachedSubjectMatte(root/'dependency',root/'outputs/normalized_source.mp4');manifest=json.loads((root/'component_dependency/manifest.json').read_text());manifest['_reference_rgb']=np.asarray(Image.open(rgbdir/'rgb_0000.png'))
model=VitMatteForImageMatting.from_pretrained('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned',local_files_only=True).eval()
result=refine_moving_details(rgbdir,masks,tri,(root/'component_dependency',manifest),cache,model,count=48)
for i in range(48):
 components=[(c['selection'],np.asarray(Image.open(root/'component_dependency'/c['frames'][i]['file']))) for c in manifest['components']]
 rgb=np.asarray(Image.open(rgbdir/f'rgb_{i:04d}.png'));v=np.asarray(Image.open(masks/f'matte_{i:04d}.png'));v=condition_trimap_clicks(v,rgb,manifest['_reference_rgb'],components,i);Image.fromarray(v).save(masks/f'matte_{i:04d}.png')
boundaries=sorted({p['frameIndex'] for c in manifest['components'] for p in c['selection'].get('shotPrompts',[])})
result['temporal']=stabilize(rgbdir,masks,tri,48,boundaries,repair_outliers=True)
(a.out/'evaluation.json').write_text(json.dumps({'actualSequence':result,'visualPass':False,'nativeExport':False},indent=2));print('ACTUAL_48_FRAME_DETAIL_ALPHA_COMPLETE',flush=True)
