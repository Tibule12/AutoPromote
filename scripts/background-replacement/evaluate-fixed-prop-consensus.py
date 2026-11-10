"""Actual-sequence check of bounded fixed-prop consensus; retain input alpha."""
import argparse,json,shutil
from pathlib import Path
import cv2,numpy as np
from PIL import Image
from model_workers.adapters.temporal_alpha import stabilize_stationary_source
p=argparse.ArgumentParser();p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
jobs=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs');sam=jobs/'3e171fc81d43aa0c1f6c04012747b57450ec6b1a44cec4638e87cc7bbeb5a636/32f7d3c3-be48-4faf-bd76-7af2bd31db4b/outputs/component_masks';rgb_dir=jobs/'2ffcb14a6f49829c8367f70a0e2acf88c680677ea16c867b2b06e16625b50d8b/8bdb364c-fc94-4289-b720-4374bcefcc9a/outputs/rgb';before=Path('/dev/shm/autopromote-fixed-alpha-motion-r39-20261104');moving=np.zeros((1000,1430),np.uint8);fixed=moving.copy()
for c in range(6):
 for i in range(48 if c<3 else 1):
  values=(np.asarray(Image.open(sam/f'component_{c:02d}_{i:04d}.png'))>=(64 if c<3 else 24)).astype(np.uint8)
  if c<3:moving|=values
  else:fixed|=values
domain=(cv2.dilate(fixed,np.ones((7,7),np.uint8))>0)&(cv2.dilate(moving,np.ones((31,31),np.uint8))==0);Image.fromarray(domain.astype(np.uint8)*255).save(a.out/'fixed-domain.png')
for i in range(48):shutil.copy2(before/f'{i:04d}.png',a.out/f'matte_{i:04d}.png')
report=stabilize_stationary_source(rgb_dir,a.out,a.out,48,selection_domain=domain,maximum_source_range=32)
rows=[];previous=None;outside_exact=True
for i in range(48):
 picture=np.asarray(Image.open(rgb_dir/f'rgb_{i:04d}.png'));new=np.asarray(Image.open(a.out/f'matte_{i:04d}.png'));old=np.asarray(Image.open(before/f'{i:04d}.png'));outside_exact&=np.array_equal(new[~domain],old[~domain]);sl=np.s_[760:992,:176]
 if previous:
  old_rgb,old_alpha=previous;stable=np.max(np.abs(picture[sl].astype(int)-old_rgb[sl].astype(int)),2)<=2;delta=np.abs(new[sl].astype(int)-old_alpha[sl].astype(int));rows.append({'frame':i,'unchangedSourceAlphaChangesOver8':int(np.count_nonzero(stable&(delta>8)))})
 previous=(picture,new)
report.update(actualFrames=48,allMovingForegroundAndOutsideDomainExact=bool(outside_exact),standBoundaryInDomain=bool(domain[760,170]),rows=rows)
assert outside_exact;(a.out/'consensus-check.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k not in ['rows','intervals']}));print('remaining unchanged-source changes over8:',sum(r['unchangedSourceAlphaChangesOver8'] for r in rows))
