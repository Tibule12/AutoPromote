"""48 actual-frame temporal preflight for the corrected fixed prop classifier."""
import argparse,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from model_workers.adapters.source_edge_alpha import classify_corrected_fixed_object
p=argparse.ArgumentParser();p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
r=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/2ffcb14a6f49829c8367f70a0e2acf88c680677ea16c867b2b06e16625b50d8b/8bdb364c-fc94-4289-b720-4374bcefcc9a');directory=r/'component_dependency';manifest=json.loads((directory/'manifest.json').read_text());reference=np.asarray(Image.open(r/'outputs/rgb/rgb_0000.png'));probe=Path('/dev/shm/autopromote-corrected-plant-r33-20261104');evidence=np.asarray(Image.open(probe/'corrected-tv-alpha.png'));selection=json.loads((probe/'corrected-tv-selection.json').read_text());previous=None;rows=[]
for i in range(48):
 rgb=np.asarray(Image.open(r/f'outputs/rgb/rgb_{i:04d}.png'));prior=np.asarray(Image.open(r/f'outputs/subject_masks/matte_{i:04d}.png'));person=np.asarray(Image.open(directory/manifest['components'][0]['frames'][i]['file']));protect=cv2.dilate((person>=24).astype(np.uint8),np.ones((7,7),np.uint8))
 for component in manifest['components'][1:-1]:protect|=cv2.dilate((np.asarray(Image.open(directory/component['frames'][i]['file']))>=128).astype(np.uint8),np.ones((7,7),np.uint8))
 changed=classify_corrected_fixed_object(rgb,prior,reference,selection['points'],[0,760,200,1000],evidence,protect);assert changed is not None;Image.fromarray(changed).save(a.out/f'{i:04d}.png')
 sl=np.s_[760:992,:176]
 if previous:
  old_rgb,old_alpha,old_protect=previous;stable=(np.max(np.abs(rgb[sl].astype(int)-old_rgb[sl].astype(int)),2)<=2)&~protect[sl].astype(bool)&~old_protect[sl].astype(bool);delta=np.abs(changed[sl].astype(int)-old_alpha[sl].astype(int));rows.append({'frame':i,'unchangedSourcePixels':int(stable.sum()),'changedAlphaOver8':int(np.count_nonzero(stable&(delta>8))),'alphaP95':float(np.quantile(delta[stable],.95)) if stable.any() else None,'alphaMax':int(delta[stable].max()) if stable.any() else None})
 previous=(rgb,changed,protect)
 if i%12==0:print('ACTUAL_FIXED_ALPHA_FRAME',i,flush=True)
for page in range(4):
 sheet=Image.new('RGB',(1056,1024));draw=ImageDraw.Draw(sheet)
 for cell,i in enumerate(range(page*12,(page+1)*12)):
  x=cell%3*352;y=cell//3*256;source=Image.open(r/f'outputs/rgb/rgb_{i:04d}.png').crop((0,760,176,992));alpha=Image.open(a.out/f'{i:04d}.png').crop((0,760,176,992)).convert('RGB');sheet.paste(source,(x,y+24));sheet.paste(alpha,(x+176,y+24));draw.text((x,y),f'Actual source / alpha | frame {i}',fill='white')
 sheet.save(a.out/f'contact-{page}.jpg',quality=97)
(a.out/'temporal-check.json').write_text(json.dumps({'actualFrames':48,'visualApproval':False,'rows':rows},indent=2));print('ACTUAL_FIXED_ALPHA_TEMPORAL_DIAGNOSTIC_COMPLETE')
