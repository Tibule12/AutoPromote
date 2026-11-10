"""Footage-bound overlap review; preserve moving source RGB and original body alpha.

This is corrective review orchestration for the retained podcast, not a model
registry entry, learned general matting model, or production default.
"""
from pathlib import Path
import json,copy,argparse
import numpy as np,cv2
from PIL import Image,ImageDraw
from pymatting import estimate_alpha_cf,estimate_foreground_ml
from pymatting.preconditioner.ichol import ichol
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
R=Path('reports/background-replacement-20261101/private/four-minute-r9')
CONTACT=(543,590,751,711)
class OverlapRepair:
 def __init__(self):
  self.reference=np.array(Image.open(R/'source-115.png'))
  self.person=np.array(Image.open(R/'raw-person-115.png'))
  self.static=np.array(Image.open('reports/background-replacement-20261101/private/fine-props-r8/native-effective-alpha/effective-alpha/alpha_0000.png'))
  self.equipment=cv2.dilate((np.array(Image.open(R/'equipment-reference-probability.png'))>=128).astype(np.uint8),np.ones((3,3),np.uint8))>0
  x0,y0,x1,y1=CONTACT;yy,xx=np.mgrid[y0:y1,x0:x1]
  # Wall observations come only from the exposed photographed surface,
  # independently outside the person, retained soft alpha and selected rig.
  self.rig=np.array(Image.open(R/'equipment-reference-probability.png'))[y0:y1,x0:x1]>=180
  self.wall=(xx>=686)&(yy<666)
  self.background=self.wall&(self.person[y0:y1,x0:x1]<64)&(self.static[y0:y1,x0:x1]<64)&~self.equipment[y0:y1,x0:x1]
 def alpha(self,rgb,old,current,person=None):
  x0,y0,x1,y1=CONTACT;values=current.copy();prior=old[y0:y1,x0:x1].copy();im=rgb[y0:y1,x0:x1];distance=np.linalg.norm(im.astype(np.float32)-self.reference[y0:y1,x0:x1],axis=2)
  # Original dynamic body alpha is the default. Current source differences
  # keep a hand/sleeve crossing a previously observed background pixel.
  known_bg=self.background&(distance<12)
  known_fg=(prior>=247)&(~self.wall|(distance>35))
  # High-confidence rig interiors and real blue upholstery are opaque; soft
  # source-colour mixtures remain unknown for the local alpha solve.
  rig=self.rig
  hsv=cv2.cvtColor(im,cv2.COLOR_RGB2HSV);blue=(hsv[:,:,0]>95)&(hsv[:,:,0]<130)&(hsv[:,:,1]>55)
  known_fg|=rig|blue
  if person is not None:
   body=person[y0:y1,x0:x1]
   known_bg&=body<64
   known_fg|=cv2.dilate((body>=160).astype(np.uint8),np.ones((3,3),np.uint8))>0
  tri=np.full(prior.shape,.5);tri[known_bg]=0;tri[known_fg]=1;tri[(prior<8)&~self.background]=0
  if np.any(tri==0) and np.any(tri==1):
   solved=estimate_alpha_cf(im.astype(np.float64)/255,tri,laplacian_kwargs={'epsilon':1e-6},preconditioner=lambda m:ichol(m,shifts=[.01,.1,1,10,100]),cg_kwargs={'rtol':1e-5,'maxiter':500})
   corrected=np.rint(np.clip(solved,0,1)*255).astype(np.uint8)
  else:corrected=prior
  corrected[~self.wall]=prior[~self.wall]
  corrected[rig|blue]=255
  corrected[:,-6:]=current[y0:y1,x1-6:x1]
  values[y0:y1,x0:x1]=corrected
  return values
 def foreground(self,rgb,alpha):
  x0,y0,x1,y1=CONTACT;x0-=8;y0-=8;x1+=8;y1+=8
  image=rgb.astype(np.float64)/255;clean=estimate_foreground_ml(image[y0:y1,x0:x1],alpha[y0:y1,x0:x1].astype(np.float64)/255);clean[(alpha[y0:y1,x0:x1]==0)|(alpha[y0:y1,x0:x1]==255)]=image[y0:y1,x0:x1][(alpha[y0:y1,x0:x1]==0)|(alpha[y0:y1,x0:x1]==255)];result=rgb.copy();result[y0:y1,x0:x1]=np.rint(clean.clip(0,1)*255).astype(np.uint8);return result
class Cache:
 artifact_sha256='0'*64;directory=None
 def __init__(self):self.manifest={'width':1430,'height':1000,'frame_count':5760,'fps':24,'fps_fraction':'24/1','source_sha256':'0'*64}
 def frame(self,i):return self.value

def compositor(cache):
 scene=json.load(open('reports/background-replacement-20261101/private/fine-props-r8/native-scoped-final/final-project.autopromote.json'))['snapshot']['subjectVfxScenes'][0]['scene'];effects=[copy.deepcopy(e) for e in scene['effects'] if e['type'] in ['background_replace','foreground_grade']]
 for e in effects:e['start']=0;e['end']=240
 return VfxFrameRenderer({'version':1,'source_sha256':'0'*64,'matte_sha256':'0'*64,'effects':effects},cache,lambda _:Path('reports/background-replacement-20261101/private/replacement.png'))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('output');a=p.parse_args();out=Path(a.output);out.mkdir(exist_ok=False);repair=OverlapRepair();cache=Cache();renderer=compositor(cache);cap=cv2.VideoCapture('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Four-minute movement test/Full alpha matte - lossless.mkv');canvas=Image.new('RGB',(1728,1404));draw=ImageDraw.Draw(canvas)
 for j,t in enumerate([0,15,44,66,75,115]):
  file=Path(f'/dev/shm/autopromote-background-four-minute-r9/interval-60/samples/source-{t*24:05d}.jpg') if t==66 else R/f'source-{t:03d}.png';rgb=np.array(Image.open(file));cap.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,bgr=cap.read();assert ok;old=cv2.cvtColor(bgr,cv2.COLOR_BGR2GRAY);values=repair.alpha(rgb,old,old);cache.value=values;frame=renderer.render(Image.fromarray(repair.foreground(rgb,values)),t*24);frame.save(out/f'frame-{t:03d}.png');Image.fromarray(values).save(out/f'alpha-{t:03d}.png');x=j%3*576;y=j//3*702
  canvas.paste(Image.fromarray(rgb).crop((500,570,788,740)).resize((576,340)),(x,y));canvas.paste(frame.crop((500,570,788,740)).resize((576,340)),(x,y+340));draw.text((x,y+680),str(t),fill='white')
 canvas.save(out/'overlap-comparison.jpg');Image.fromarray(repair.background.astype(np.uint8)*255).save(out/'confirmed-reference-background.png');cap.release();print('ACTUAL_OVERLAP_REVIEW_WRITTEN',int(repair.background.sum()),flush=True)
