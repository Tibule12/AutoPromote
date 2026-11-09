"""Local photographed-background unmixing diagnostic on real moving hands."""
import argparse,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from scipy.spatial import cKDTree
from pymatting import estimate_foreground_ml
from pymatting.laplacian.cf_laplacian import cf_laplacian
from pymatting.preconditioner.ichol import ichol
from pymatting.solver.cg import cg
from scipy.sparse import diags
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='23,8,24,36,6');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
r=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/95d7eae50defbb48aa4d96b1890342f2d6b56c4585874c53ece8248c44dd2fc3/c86ff0c1-50fd-4481-a01d-e659883290e8');m=json.loads((r/'component_dependency/manifest.json').read_text());obs=Path('/dev/shm/autopromote-motion-detail-r22-20261104/observed_detail');reference=np.asarray(Image.open(obs/'photographed-reference.png'));support=np.asarray(Image.open(obs/'observed-support.png'))>0;plate=np.asarray(Image.open('reports/background-replacement-20261101/private/replacement.png').convert('RGB')).astype(float)/255
for i in map(int,a.indices.split(',')):
 rgb=np.asarray(Image.open(r/'outputs/rgb'/f'rgb_{i:04d}.png'));prior=np.asarray(Image.open(r/'outputs/subject_masks'/f'matte_{i:04d}.png'));union=np.asarray(Image.open(r/'dependency'/f'matte_{i:04d}.png'))
 for c in [1,2]:
  hand=np.asarray(Image.open(r/'component_dependency'/m['components'][c]['frames'][i]['file']));depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5);binary=(hand>=128).astype(np.uint8);domain=(cv2.dilate(binary,np.ones((31,31),np.uint8))>0)&support;ys,xs=np.where(binary)
  if not len(xs):continue
  box=[max(0,int(xs.min())-55),max(0,int(ys.min())-55),min(1430,int(xs.max())+56),min(1000,int(ys.max())+56)];x0,y0,x1,y1=box;sl=np.s_[y0:y1,x0:x1];current=rgb[sl].astype(np.float32);bg=reference[sl].astype(np.float32);old=prior[sl].astype(float)/255;dep=depth[sl];known=support[sl];reg=domain[sl]
  hsv=cv2.cvtColor(current.astype(np.uint8),cv2.COLOR_RGB2HSV)
  skin=(hsv[:,:,1]>65)&(hsv[:,:,2]<220)&((current[:,:,0]-current[:,:,1])>.75*(current[:,:,1]-current[:,:,2]))
  seed=(dep>22)&(prior[sl]>=254)&known&(np.linalg.norm(current-bg,axis=2)>40)&skin
  sy,sx=np.where(seed);assert len(sy)>32
  # Sparse actual current-frame opaque colour samples, never an imagined hand.
  take=np.arange(0,len(sy),max(1,len(sy)//5000));sy,sx=sy[take],sx[take];tree=cKDTree(np.stack([sy,sx],axis=1));yy,xx=np.where(reg&(dep<30)&skin);dist,neighbors=tree.query(np.stack([yy,xx],axis=1),k=24);f=current[sy[neighbors],sx[neighbors]];B=bg[yy,xx];C=current[yy,xx];v=f-B[:,None];delta=C-B
  candidate=np.clip(np.sum(delta[:,None]*v,2)/np.maximum(np.sum(v*v,2),1),0,1);residual=np.mean((delta[:,None]-candidate[...,None]*v)**2,2)
  score=residual+(.045*dist)**2+3*(1-candidate)**2;winner=np.argmin(score,1);row=np.arange(len(yy));alpha=candidate[row,winner];error=np.sqrt(residual[row,winner]);alpha[np.linalg.norm(delta,axis=1)<8]=0
  confidence=np.clip((14-error)/6,0,1);weight=confidence*np.minimum(cv2.distanceTransform(reg.astype(np.uint8),cv2.DIST_L2,5)[yy,xx]/12,1)*np.clip((30-dep[yy,xx])/8,0,1)
  solved=old.copy();solved[yy,xx]=old[yy,xx]*(1-weight)+alpha*weight
  # Solve the source-colour Laplacian with the observed unmix as a soft
  # measurement, retaining exact matte outside this photographed boundary.
  blend=np.zeros(old.shape);blend[yy,xx]=weight
  allowed=reg&(dep<28)&skin;unary=np.full(old.shape,100.);unary[allowed]=.3*blend[allowed]+.005
  target=old.copy();target[allowed]=solved[allowed]
  opaque=(dep>=28)&(old>.99);target[opaque]=1
  known_bg=reg&(np.linalg.norm(current-bg,axis=2)<8)&(dep<28);target[known_bg]=0;unary[known_bg]=100
  L=cf_laplacian(current.astype(float)/255,epsilon=1e-6);A=L+diags(unary.ravel());b=unary.ravel()*target.ravel()
  solved=cg(A,b,M=ichol(A,shifts=[.01,.1,1,10]),rtol=1e-5,maxiter=500).reshape(old.shape).clip(0,1)
  solved[~allowed]=old[~allowed];solved[known_bg]=0
  F=estimate_foreground_ml(current.astype(float)/255,solved).clip(0,1)
  out=np.rint((F*solved[...,None]+plate[sl]*(1-solved[...,None]))*255).astype(np.uint8);h,w=old.shape;sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
  for j,(label,im) in enumerate([('Actual source',current.astype(np.uint8)),('Observed local unmix (diagnostic)',out),('Alpha',np.repeat(np.rint(solved*255).astype(np.uint8)[...,None],3,2))]):sheet.paste(Image.fromarray(im),(j*w,24));draw.text((j*w,0),label,fill='white')
  tag=f'{i:04d}-hand{c}';sheet.save(a.out/f'comparison-{tag}.jpg',quality=97);Image.fromarray(np.rint(solved*255).astype(np.uint8)).save(a.out/f'alpha-{tag}.png');Image.fromarray(out).save(a.out/f'composite-{tag}.png');print('ACTUAL_LOCAL_UNMIX',i,c,flush=True)
