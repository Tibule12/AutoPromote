"""Bounded source-object repair using the existing compositor on its actual ROI."""
from pathlib import Path
import argparse,json,copy,importlib.util
import cv2,numpy as np
from PIL import Image,ImageOps
from pymatting import estimate_alpha_cf,estimate_foreground_ml
from pymatting.preconditioner.ichol import ichol
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
class MicrophoneRepair:
 box=(790,485,925,630)
 def __init__(self,box=None):
  if box is not None:self.box=box
  x0,y0,x1,y1=self.box;self.alpha=np.zeros((y1-y0,x1-x0),np.uint8);self.manifest={'width':x1-x0,'height':y1-y0,'frame_count':5760,'fps':24,'fps_fraction':'24/1','source_sha256':'0'*64};self.artifact_sha256='0'*64;self.directory=None
  scene=json.load(open('reports/background-replacement-20261101/private/fine-props-r8/native-scoped-final/final-project.autopromote.json'))['snapshot']['subjectVfxScenes'][0]['scene'];effects=[copy.deepcopy(e) for e in scene['effects'] if e['type'] in ['background_replace','foreground_grade']]
  for e in effects:e['start']=0;e['end']=240
  self.renderer=VfxFrameRenderer({'version':1,'source_sha256':'0'*64,'matte_sha256':'0'*64,'effects':effects},self,lambda _:Path('reports/background-replacement-20261101/private/replacement.png'))
  background=ImageOps.fit(Image.open('reports/background-replacement-20261101/private/replacement.png').convert('RGB'),(1440,1000),method=Image.Resampling.LANCZOS).resize((1430,1000),Image.Resampling.LANCZOS);self.renderer.assets[next(e['id'] for e in effects if e['type']=='background_replace')]=background.crop(self.box)
 def frame(self,index):return self.alpha
 def repair(self,source,current,alpha,index):
  if source.shape[1]!=1430:source=cv2.resize(source,(1430,1000),interpolation=cv2.INTER_LANCZOS4)
  x0,y0,x1,y1=self.box;rgb=source[y0:y1,x0:x1];binary=(np.max(rgb,axis=2)<150).astype(np.uint8);n,labels,stats,_=cv2.connectedComponentsWithStats(binary);assert n>1,'Actual microphone component absent';label=1+np.argmax(stats[1:,cv2.CC_STAT_AREA]);binary=(labels==label).astype(np.uint8);assert stats[label,cv2.CC_STAT_AREA]>=1000,'Ambiguous microphone component'
  tri=np.full(binary.shape,.5);tri[cv2.erode(binary,np.ones((3,3),np.uint8))>0]=1;tri[cv2.dilate(binary,np.ones((5,5),np.uint8))==0]=0;matte=estimate_alpha_cf(rgb.astype(np.float64)/255,tri,laplacian_kwargs={'epsilon':1e-6},preconditioner=lambda v:ichol(v,shifts=[.01,.1,1,10,100]),cg_kwargs={'rtol':1e-5,'maxiter':500});new=np.rint(matte.clip(0,1)*255).astype(np.uint8);old=alpha[y0:y1,x0:x1];self.alpha=np.maximum(old,new);fg=estimate_foreground_ml(rgb.astype(np.float64)/255,self.alpha.astype(np.float64)/255);fg[(self.alpha==0)|(self.alpha==255)]=rgb[(self.alpha==0)|(self.alpha==255)]/255;rendered=np.array(self.renderer.render(Image.fromarray(np.rint(fg.clip(0,1)*255).astype(np.uint8)),index));patch=current[y0:y1,x0:x1];changed=new>old;patch[changed]=rendered[changed];old[:]=self.alpha;return current,alpha,int(changed.sum())
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('output');a=p.parse_args();out=Path(a.output);out.mkdir(exist_ok=False);root=Path('reports/background-replacement-20261101/private/four-minute-r9');repair=MicrophoneRepair()
 for frame,start in [(3294,120),(4782,180),(1224,0),(4488,180)]:
  path=Path(f'/dev/shm/autopromote-background-four-minute-r9/interval-{start}/samples');source=np.array(Image.open(path/f'source-{frame:05d}.jpg'));current=np.array(Image.open(path/f'after-{frame:05d}.jpg'));alpha=np.array(Image.open(path/f'alpha-{frame:05d}.png'));current,alpha,changed=repair.repair(source,current,alpha,frame);Image.fromarray(current).save(out/f'frame-{frame:05d}.png');Image.fromarray(alpha).save(out/f'alpha-{frame:05d}.png');Image.fromarray(current).crop((770,470,940,670)).resize((680,800)).save(out/f'wind-{frame:05d}.jpg');print('ACTUAL_MICROPHONE_CORE_REPAIR',frame,changed,flush=True)
