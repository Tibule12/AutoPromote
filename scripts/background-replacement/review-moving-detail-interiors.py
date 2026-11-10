"""Actual-pixel diagnostic of soft detail alpha with preserved hand interiors."""
import argparse,json
from pathlib import Path
import numpy as np,cv2
from PIL import Image,ImageDraw
from pymatting import estimate_foreground_ml

p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/95d7eae50defbb48aa4d96b1890342f2d6b56c4585874c53ece8248c44dd2fc3/c86ff0c1-50fd-4481-a01d-e659883290e8');m=json.loads((root/'component_dependency/manifest.json').read_text());ev=json.loads((a.input/'evaluation.json').read_text());plate=np.asarray(Image.open('reports/background-replacement-20261101/private/replacement.png').convert('RGB')).astype(np.float64)/255
cv2.setNumThreads(2)
for row in ev['tested']:
 if row['variant']!='observed-trimap-tile':continue
 i,c=row['frame'],row['component'];x0,y0,x1,y1=row['crop'];sl=np.s_[y0:y1,x0:x1];tag=f'{i:04d}-hand{c}';src=np.asarray(Image.open(root/'outputs/rgb'/f'rgb_{i:04d}.png'))[sl];old=np.asarray(Image.open(root/'outputs/subject_masks'/f'matte_{i:04d}.png'))[sl].astype(float)/255;hand=np.asarray(Image.open(root/'component_dependency'/m['components'][c]['frames'][i]['file']));depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)[sl]
 alpha=np.asarray(Image.open(a.input/'observed-trimap-tile'/f'alpha-{tag}.png')).astype(float)/255
 weight=np.clip((depth-16)/12,0,1);alpha=np.maximum(alpha,old*weight)
 fg=estimate_foreground_ml(src.astype(np.float64)/255,alpha).clip(0,1);result=np.rint((fg*alpha[...,None]+plate[sl]*(1-alpha[...,None]))*255).astype(np.uint8)
 h,w=alpha.shape;sheet=Image.new('RGB',(w*3,h+24));d=ImageDraw.Draw(sheet)
 for j,(label,im) in enumerate([('Actual source',src),('Detail + opaque interior',result),('Effective alpha',np.repeat(np.rint(alpha*255).astype(np.uint8)[...,None],3,2))]):sheet.paste(Image.fromarray(im),(j*w,24));d.text((j*w,0),label,fill='white')
 sheet.save(a.out/f'comparison-{tag}.jpg',quality=97);Image.fromarray(np.rint(alpha*255).astype(np.uint8)).save(a.out/f'alpha-{tag}.png');Image.fromarray(result).save(a.out/f'composite-{tag}.png');print('ACTUAL_DETAIL_INTERIOR',i,c,flush=True)
(a.out/'evaluation.json').write_text(json.dumps({'tested':ev['tested'],'visualPass':False,'nativeExport':False},indent=2))
