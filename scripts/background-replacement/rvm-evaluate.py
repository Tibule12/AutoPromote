"""Actual recurrent-video alpha evaluation, constrained by source-bound SAM masks.
No production model/default change. GPL-3.0 checkpoint and MIT closed-form solver.
"""
import json,time,sys
from pathlib import Path
import numpy as np,cv2,onnxruntime as ort
from PIL import Image
sys.path.insert(0,str(Path('../AutoPromote-podcast-revision-20261031/reports/unmuted-cinematic-revision-20261031/shot-correction/private/native-edge-deps').resolve()))
from pymatting import estimate_alpha_cf
from pymatting.preconditioner.ichol import ichol
from model_workers.adapters.temporal_alpha import make_trimap
p=Path('reports/background-replacement-20261101/private');s=np.asarray(Image.open(p/'native-mask-review/source-0000.png').convert('RGB'))
root=Path('/tmp/autopromote-application-demo-DmTyGn/model-jobs/331c9030f85c40b06299e86ba2622971ab0b8dbb31800553f08870ebb1d5cfb5/4c30c11d-1091-4ac8-b29f-713317a0158d/outputs');mask=np.array(Image.open(root/'subject_masks/matte_0000.png'));person=np.array(Image.open(root/'component_masks/component_00_0000.png'))
t=time.monotonic();opt=ort.SessionOptions();opt.intra_op_num_threads=2;opt.inter_op_num_threads=1
model=ort.InferenceSession('/home/tibule12/.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx',sess_options=opt,providers=['CPUExecutionProvider'])
inputs={'src':s.transpose(2,0,1)[None].astype(np.float32)/255,'downsample_ratio':np.array([.25],np.float32),**{f'r{i}i':np.zeros((1,1,1,1),np.float32) for i in range(1,5)}}
fgr,pha,*states=model.run(None,inputs);print('RVM seconds',time.monotonic()-t,flush=True)
trimap=make_trimap((mask>=128).astype(np.uint8),6)/255
start=time.monotonic();alpha=estimate_alpha_cf(s.astype(float)/255,trimap,laplacian_kwargs={'epsilon':1e-6},preconditioner=lambda m:ichol(m,shifts=[.01,.1,.5,1,10,100]),cg_kwargs={'rtol':1e-5,'maxiter':300});print('CF seconds',time.monotonic()-start,flush=True)
region=cv2.dilate((person>=128).astype(np.uint8),np.ones((13,13),np.uint8))>0
border=(trimap>0)&(trimap<1)&region
alpha[border]=pha[0,0][border];alpha[trimap==1]=1;alpha[trimap==0]=0
Image.fromarray(np.rint(alpha.clip(0,1)*255).astype(np.uint8)).save(p/'rvm-eval-alpha.png');b=Image.open(p/'replacement.png').convert('RGB');b.paste(Image.fromarray(s),mask=Image.open(p/'rvm-eval-alpha.png'));b.save(p/'rvm-eval-composite.png')
