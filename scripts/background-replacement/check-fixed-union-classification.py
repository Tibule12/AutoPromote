"""Private actual-frame fixed-foreground ownership ablation, not native output."""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image,ImageDraw,ImageOps
from pymatting import estimate_alpha_cf
from pymatting.preconditioner.ichol import ichol
from model_workers.common import sha,write_json


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path);p.add_argument('--propagate-background',action='store_true');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
 private=Path('reports/background-replacement-20261101/private');archive=private/'foreground-details-current-pipeline-r233-20261106/camera-00-0000-0001/frames-0000-0001'
 receipt=json.loads((archive/'receipt.json').read_text())
 for row in receipt['maskArchives']:
  if sha(archive/row['file'])!=row['sha256']:raise ValueError('Actual mask archive changed')
 def plane(file):
  cap=cv2.VideoCapture(str(archive/file));ok,v=cap.read();cap.release()
  if not ok:raise ValueError('Mask did not decode')
  return v[:,:,0]
 data=json.loads((archive/'component-manifest.json').read_text());masks=[plane(f'component-{i:02d}-selection-lossless.mkv')for i in range(len(data['components']))]
 source=private/'authored-body-points-r222-20261106/actual-source.png'
 if sha(source)!='16a4fb39f996d18fc59d32a55f9162d7da207a6d522583dd50dfcda56f6852ce':raise ValueError('Source changed')
 rgb=np.asarray(Image.open(source).convert('RGB'));alpha=plane('alpha-lossless.mkv');h,w=alpha.shape
 sl=np.s_[450:1000,815:1430];prior=np.maximum.reduce(masks[1:])[sl];picture=rgb[sl].copy()
 labels=np.full(prior.shape,cv2.GC_PR_BGD,np.uint8);labels[prior>=128]=cv2.GC_PR_FGD
 labels[cv2.erode((prior>=224).astype(np.uint8),np.ones((3,3),np.uint8))>0]=cv2.GC_FGD
 # Whole-set foreground and source background clicks compete once, so an
 # excluded wooden bench pixel cannot be permanently removed by a neighboring
 # plant classifier. Person pixels are protected by their independent track.
 for c in data['components'][1:]:
  for pt in c['selection']['points']:
   x,y=round(pt['position'][0]*w)-815,round(pt['position'][1]*h)-450
   if 0<=x<615 and 0<=y<550:cv2.circle(labels,(x,y),2,cv2.GC_FGD if pt['label']else cv2.GC_BGD,-1)
 protected=cv2.dilate((masks[0][sl]>=24).astype(np.uint8),np.ones((7,7),np.uint8))>0
 labels[protected]=cv2.GC_FGD
 if a.propagate_background:
  blocked=(labels==cv2.GC_FGD).astype(np.uint8)
  negatives=[pt for c in data['components'][1:]for pt in c['selection']['points']if not pt['label']]
  for pt in negatives:
   x,y=round(pt['position'][0]*w)-815,round(pt['position'][1]*h)-450
   if not(0<=x<615 and 0<=y<550)or blocked[y,x]:continue
   flood=np.zeros((552,617),np.uint8);flood[1:-1,1:-1]=blocked
   cv2.floodFill(picture.copy(),flood,(x,y),(0,0,0),(24,24,24),(24,24,24),4|cv2.FLOODFILL_FIXED_RANGE|cv2.FLOODFILL_MASK_ONLY|(2<<8))
   labels[flood[1:-1,1:-1]==2]=cv2.GC_BGD
 cv2.setRNGSeed(0);cv2.grabCut(picture,labels,None,np.zeros((1,65)),np.zeros((1,65)),8,cv2.GC_INIT_WITH_MASK)
 selected=np.isin(labels,[cv2.GC_FGD,cv2.GC_PR_FGD]).astype(np.uint8)
 tri=np.full(prior.shape,.5);tri[cv2.erode(selected,np.ones((3,3),np.uint8))>0]=1;tri[cv2.dilate(selected,np.ones((5,5),np.uint8))==0]=0
 tri[labels==cv2.GC_FGD]=1;tri[labels==cv2.GC_BGD]=0
 estimate=estimate_alpha_cf(picture.astype(np.float64)/255,tri,laplacian_kwargs={'epsilon':1e-6},preconditioner=lambda m:ichol(m,shifts=[.01,.1,1,10,100,1000]),cg_kwargs={'rtol':1e-6,'maxiter':1000})
 changed=alpha.copy();region=changed[sl];candidate=np.rint(estimate.clip(0,1)*255).astype(np.uint8);region[~protected]=candidate[~protected]
 assert np.array_equal(changed[:450],alpha[:450]);Image.fromarray(changed).save(a.out/'alpha.png')
 background=ImageOps.fit(Image.open(private/'replacement.png').convert('RGB'),(w,h));results=[]
 for name,values in [('prior',alpha),('union',changed)]:
  pic=Image.composite(Image.fromarray(rgb),background,Image.fromarray(values));pic.save(a.out/f'diagnostic-{name}.png');results.append(pic)
 crop=(815,450,1430,1000);sheet=Image.new('RGB',(1845,574));draw=ImageDraw.Draw(sheet)
 for i,(name,pic)in enumerate(zip(['Actual source','Prior matte','Fixed union classifier'],[Image.fromarray(rgb),*results])):
  sheet.paste(pic.crop(crop),(i*615,24));draw.text((i*615+3,4),name,fill='white')
 sheet.save(a.out/'actual-comparison.jpg',quality=98)
 write_json(a.out/'receipt.json',{'sourceSha256':sha(source),'sourceFrame':0,'sourceReceiptSha256':sha(archive/'receipt.json'),'sharedRegisteredAdapterChanged':False,'finalColourRecovery':False,'nativeAdmission':False,'visualReviewPending':True,'fourMinuteProof':False,'paidCloud':False})
 print('Actual fixed-union classification complete; visual review pending',flush=True)


if __name__=='__main__':main()
