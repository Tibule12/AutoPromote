"""Source-alpha diagnostic: uncertain enclosed prop evidence stays unknown.

Convex envelopes only release background seeds; they never assert opacity.
Actual source colours, stable strong model interiors and authored clicks supply
the foreground/background constraints for the image Laplacian.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw,ImageOps
from pymatting import estimate_alpha_cf
from pymatting.preconditioner.ichol import ichol
from model_workers.common import sha,write_json


def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('out',type=Path);parser.add_argument('--colour-seeds',action='store_true');a=parser.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
 private=Path('reports/background-replacement-20261101/private');archive=private/'separate-props-no-plant-classifier-r250-20261106/camera-00-0000-0001/frames-0000-0001';receipt=json.loads((archive/'receipt.json').read_text())
 for row in receipt['maskArchives']:
  if sha(archive/row['file'])!=row['sha256']:raise ValueError('Saved source evidence changed')
 def plane(file):
  cap=cv2.VideoCapture(str(archive/file));ok,rgb=cap.read();cap.release()
  if not ok:raise ValueError('Mask archive did not decode')
  return rgb[:,:,0]
 source=private/'authored-body-points-r222-20261106/actual-source.png'
 if sha(source)!='16a4fb39f996d18fc59d32a55f9162d7da207a6d522583dd50dfcda56f6852ce':raise ValueError('Registered source changed')
 rgb=np.asarray(Image.open(source).convert('RGB'));alpha=plane('alpha-lossless.mkv');data=json.loads((archive/'component-manifest.json').read_text());masks=[plane(f'component-{i:02d}-selection-lossless.mkv')for i in range(len(data['components']))]
 height,width=alpha.shape;x0,y0,x1,y1=815,440,1430,1000;region=np.s_[y0:y1,x0:x1]
 fixed=np.maximum.reduce(masks[1:]);envelope=np.zeros(alpha.shape,np.uint8)
 for component,mask in zip(data['components'][1:],masks[1:]):
  points=cv2.findNonZero((mask>=128).astype(np.uint8))
  if points is not None:cv2.fillConvexPoly(envelope,cv2.convexHull(points),1)
 envelope=cv2.dilate(envelope,np.ones((15,15),np.uint8))
 tri=np.full(alpha.shape,.5,np.float64)
 tri[(envelope==0)&(fixed<24)]=0
 tri[cv2.erode((fixed>=224).astype(np.uint8),np.ones((3,3),np.uint8))>0]=1
 # Current person pixels remain unchanged; this is fixed-object classification.
 protected=cv2.dilate((masks[0]>=24).astype(np.uint8),np.ones((7,7),np.uint8))>0
 tri[protected]=1
 positives=[];negatives=[]
 for c in data['components'][1:]:
  for pt in c['selection']['points']:
   px,py=[round(v*s)for v,s in zip(pt['position'],[width,height])]
   (positives if pt['label']else negatives).append((min(width-1,px),min(height-1,py)))
 if a.colour_seeds:
  samples={label:[]for label in [0,1]}
  for label,points in [(0,negatives),(1,positives)]:
   for x,y in points:samples[label].extend(rgb[max(0,y-1):min(height,y+2),max(0,x-1):min(width,x+2)].reshape(-1,3))
  picture=rgb[region].astype(np.float32)
  def nearest(values):
   distance=np.full(picture.shape[:2],np.inf,np.float32)
   for sample in np.unique(np.asarray(values,np.float32),axis=0):distance=np.minimum(distance,np.linalg.norm(picture-sample,axis=2))
   return distance
  foreground=nearest(samples[1]);background=nearest(samples[0]);current=tri[region]
  current[(foreground<12)&(foreground+24<background)&(envelope[region]>0)]=1
  # Bright, distinctly sampled screen colours may provide real BG seeds;
  # ambiguous dark bezel/leaf/metal colours do not authorize this exclusion.
  current[(background<28)&(background+24<foreground)&(picture.max(2)>150)&~protected[region]]=0
 for x,y in negatives:
  if not protected[y,x]:cv2.circle(tri,(x,y),2,0.,-1)
 for x,y in positives:cv2.circle(tri,(x,y),2,1.,-1)
 tri=tri[region];picture=rgb[region];Image.fromarray(np.rint(tri*255).astype(np.uint8)).save(a.out/'source-guided-trimap.png')
 started=time.monotonic();values=estimate_alpha_cf(picture.astype(np.float64)/255,tri,laplacian_kwargs={'epsilon':1e-7},preconditioner=lambda matrix:ichol(matrix,shifts=[.01,.1,1,10,100,1000]),cg_kwargs={'rtol':1e-6,'maxiter':1500})
 if not np.isfinite(values).all():raise ValueError('Nonfinite source alpha')
 result=alpha.copy();candidate=np.rint(values.clip(0,1)*255).astype(np.uint8);allowed=~protected[region];result[region][allowed]=candidate[allowed];Image.fromarray(result).save(a.out/'alpha.png')
 background=ImageOps.fit(Image.open(private/'replacement.png').convert('RGB'),(width,height))
 before=Image.composite(Image.fromarray(rgb),background,Image.fromarray(alpha));after=Image.composite(Image.fromarray(rgb),background,Image.fromarray(result));after.save(a.out/'diagnostic-composite.png')
 sheet=Image.new('RGB',(1845,584));draw=ImageDraw.Draw(sheet)
 for i,(name,pic)in enumerate([('Actual source',Image.fromarray(rgb)),('Saved alpha',before),('Released uncertain fixed-object trimap',after)]):sheet.paste(pic.crop((815,440,1430,1000)),(i*615,24));draw.text((i*615+3,4),name,fill='white')
 sheet.save(a.out/'actual-comparison.jpg',quality=98)
 write_json(a.out/'receipt.json',{'sourcePngSha256':sha(source),'sourceArchiveReceiptSha256':sha(archive/'receipt.json'),'seconds':time.monotonic()-started,'envelopesOnlySetUnknown':True,'actualSourceColoursAndClicks':True,'otherPersonPixelsExact':bool(np.array_equal(result[protected],alpha[protected])),'nativeAdmission':False,'registeredAdapterChanged':False,'fourMinuteProof':False,'visualReviewPending':True,'paidCloud':False})
 print('Source-guided uncertain-prop solve complete',time.monotonic()-started,flush=True)


if __name__=='__main__':main()
