"""Repair actual background revealed under moving sleeves, retaining the rig."""
from pathlib import Path
import json,importlib.util,argparse
import cv2,numpy as np,onnxruntime as ort
from PIL import Image
from pymatting import estimate_foreground_ml
spec=importlib.util.spec_from_file_location('small_compositor',Path(__file__).with_name('repair-microphone-windscreen.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class RevealedBackgroundRepair:
 def __init__(self):
  opts=ort.SessionOptions();opts.intra_op_num_threads=1;opts.inter_op_num_threads=1;self.neural=ort.InferenceSession('/home/tibule12/.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx',sess_options=opts,providers=['CPUExecutionProvider']);self.states=None;self.regions=[module.MicrophoneRepair(box) for box in [(245,780,650,1000),(1150,700,1430,1000)]]
 def repair(self,source,frame,alpha,index,reset=False):
  if source.shape[1]!=1430:source=cv2.resize(source,(1430,1000),interpolation=cv2.INTER_LANCZOS4)
  if reset or self.states is None:self.states={f'r{j}i':np.zeros((1,1,1,1),np.float32) for j in range(1,5)}
  _,pha,*nextstates=self.neural.run(None,{'src':source.transpose(2,0,1)[None].astype(np.float32)/255,'downsample_ratio':np.array([.35],np.float32),**self.states});self.states={f'r{j}i':v for j,v in enumerate(nextstates,1)};person=np.rint(pha[0,0].clip(0,1)*255).astype(np.uint8)
  contours,_=cv2.findContours((person>=192).astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);assert contours,'Current person silhouette absent';solid=np.zeros(person.shape,np.uint8);cv2.drawContours(solid,[max(contours,key=cv2.contourArea)],-1,255,cv2.FILLED);outside=cv2.dilate(solid,np.ones((7,7),np.uint8))==0;inside=cv2.erode(solid,np.ones((7,7),np.uint8))>0;person[outside]=0;person[inside]=255
  # The photographed green screen graphic under this cream-clothed speaker's
  # elbow is an explicit source-bound background exclusion, not a body colour.
  hsv=cv2.cvtColor(source[810:940,400:650],cv2.COLOR_RGB2HSV);screen=(hsv[:,:,0]>35)&(hsv[:,:,0]<95)&(hsv[:,:,1]>70);person[810:940,400:650][screen]=0;count=0
  for j,cache in enumerate(self.regions):
   x0,y0,x1,y1=cache.box;old=alpha[y0:y1,x0:x1].copy();rgb=source[y0:y1,x0:x1];body=person[y0:y1,x0:x1];new=np.minimum(old,body);new[body>=247]=255
   if j==0:
    # The actual horizontal boom remains a separate opaque object; it is not
    # included in the person's recurrent neural matte.
    y=np.arange(y0,y1)[:,None];rig=(y<815)&(np.max(rgb,axis=2)<115);new[rig]=old[rig]
   cache.alpha=new;pixels=rgb.astype(np.float64)/255;foreground=estimate_foreground_ml(pixels,new.astype(np.float64)/255);foreground[(new==0)|(new==255)]=pixels[(new==0)|(new==255)];rendered=np.array(cache.renderer.render(Image.fromarray(np.rint(foreground.clip(0,1)*255).astype(np.uint8)),index));changed=new!=old;view=frame[y0:y1,x0:x1];view[changed]=rendered[changed];alpha[y0:y1,x0:x1]=new;count+=int(changed.sum())
  return frame,alpha,count
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('output');a=p.parse_args();out=Path(a.output);out.mkdir(exist_ok=False);repair=RevealedBackgroundRepair()
 for frame,start in [(4800,180),(3768,120),(1320,0)]:
  root=Path(f'/dev/shm/autopromote-background-four-minute-r9/interval-{start}/samples');source=np.array(Image.open(root/f'source-{frame:05d}.jpg'));current=np.array(Image.open(root/f'after-{frame:05d}.jpg'));alpha=np.array(Image.open(root/f'alpha-{frame:05d}.png'));current,alpha,count=repair.repair(source,current,alpha,frame,True);Image.fromarray(current).save(out/f'frame-{frame:05d}.png');Image.fromarray(alpha).save(out/f'alpha-{frame:05d}.png');print('ACTUAL_REVEALED_BACKGROUND_REPAIR',frame,count,flush=True)
