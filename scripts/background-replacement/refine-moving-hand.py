"""Bounded moving-hand correction through the shared source compositor."""
from pathlib import Path
import importlib.util,copy,json,argparse
import numpy as np,cv2,onnxruntime as ort
from PIL import Image
from pymatting import estimate_alpha_cf,estimate_foreground_ml
from pymatting.preconditioner.ichol import ichol
s=importlib.util.spec_from_file_location('roi_compositor',Path(__file__).with_name('repair-microphone-windscreen.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class HandRepair:
 box=(250,300,610,735)
 def __init__(self):
  opts=ort.SessionOptions();opts.intra_op_num_threads=1;opts.inter_op_num_threads=1;self.model=ort.InferenceSession('/home/tibule12/.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx',sess_options=opts,providers=['CPUExecutionProvider']);self.states=None;self.cache=m.MicrophoneRepair(self.box)
 def repair(self,source,frame,alpha,index):
  if source.shape[1]!=1430:source=cv2.resize(source,(1430,1000),interpolation=cv2.INTER_LANCZOS4)
  if self.states is None:self.states={f'r{j}i':np.zeros((1,1,1,1),np.float32) for j in range(1,5)}
  _,pha,*nextstates=self.model.run(None,{'src':source.transpose(2,0,1)[None].astype(np.float32)/255,'downsample_ratio':np.array([.35],np.float32),**self.states});self.states={f'r{j}i':v for j,v in enumerate(nextstates,1)};person=np.rint(pha[0,0].clip(0,1)*255).astype(np.uint8);x0,y0,x1,y1=self.box;rgb=source[y0:y1,x0:x1];mask=person[y0:y1,x0:x1];tri=np.full(mask.shape,.5);binary=(mask>=128).astype(np.uint8);tri[cv2.erode(binary,np.ones((3,3),np.uint8))>0]=1;tri[cv2.dilate(binary,np.ones((7,7),np.uint8))==0]=0;red=(rgb[:,:,0]>230)&(rgb[:,:,1]<135)&(rgb[:,:,2]<130);tri[red]=0
  value=estimate_alpha_cf(rgb.astype(np.float64)/255,tri,laplacian_kwargs={'epsilon':1e-6},preconditioner=lambda v:ichol(v,shifts=[.01,.1,1,10,100]),cg_kwargs={'rtol':1e-5,'maxiter':500});self.cache.alpha=np.rint(value.clip(0,1)*255).astype(np.uint8);foreground=estimate_foreground_ml(rgb.astype(np.float64)/255,value);foreground[(self.cache.alpha==0)|(self.cache.alpha==255)]=rgb[(self.cache.alpha==0)|(self.cache.alpha==255)]/255;rendered=np.array(self.cache.renderer.render(Image.fromarray(np.rint(foreground.clip(0,1)*255).astype(np.uint8)),index));frame[y0:y1,x0:x1]=rendered;alpha[y0:y1,x0:x1]=self.cache.alpha;return frame,alpha
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('output');a=p.parse_args();out=Path(a.output);out.mkdir(exist_ok=False);root=Path('/dev/shm/autopromote-background-four-minute-r9');frame=5400;rgb=np.array(Image.open(root/'interval-180/samples/source-05400.jpg'));current=np.array(Image.open(root/'finished-180/samples/after-05400.jpg'));alpha=np.array(Image.open(root/'finished-180/samples/alpha-05400.png'));repair=HandRepair();current,alpha=repair.repair(rgb,current,alpha,frame);Image.fromarray(current).save(out/'frame.png');Image.fromarray(alpha).save(out/'alpha.png');Image.fromarray(current).crop((240,300,620,735)).resize((760,870)).save(out/'hand.jpg');print('ACTUAL_CURRENT_HAND_ALPHA_REFINED',flush=True)
