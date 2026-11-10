"""Private, source-specific correction of the rejected movie's 4–7s interval.

Uses the existing local matte model and Blender scene. No application feature,
external inference, cloud access, generated person or source overwrite.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
REPORT = ROOT.parent
sys.path.insert(0, str(REPORT / 'private-local/matting-deps'))
os.environ.update(OMP_NUM_THREADS='2', OPENBLAS_NUM_THREADS='1', CUDA_VISIBLE_DEVICES='')
import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

SOURCE = Path('/home/tibule12/Videos/cam-combiner-60sec.mp4')
MODEL = Path.home()/'.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx'
work = ROOT/'private'
frames = work/'presenter'
frames.mkdir(parents=True, exist_ok=True)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == '7a16b8ba2eba836eac74bcfb1f830313907ac0e19f314e636d4b7f833643578c'
assert hashlib.sha256(MODEL.read_bytes()).hexdigest() == '88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828'
opts=ort.SessionOptions(); opts.intra_op_num_threads=2; opts.inter_op_num_threads=1
session=ort.InferenceSession(str(MODEL), sess_options=opts, providers=['CPUExecutionProvider'])
cv2.setNumThreads(1)
states=[np.zeros((1,1,1,1),np.float32) for _ in range(4)]
# Retain the actual microphone elbow/post, previously outside the old crop.
width,height=800,720
decoder=subprocess.Popen(['ffmpeg','-v','error','-threads','1','-ss',str(515/24),'-i',str(SOURCE),'-t','4',
    '-an','-vf','fps=24,crop=1110:1000:170:40,scale=800:720','-threads','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)
def polygon(points):
    out=np.zeros((height,width),np.uint8)
    pts=np.array([[(x-170)*width/1110,(y-40)*height/1000] for x,y in points],np.int32)
    cv2.fillPoly(out,[pts],255)
    return out
# The stationary chair's actual silhouette, excluding the adjacent sofa/plant.
chair=polygon([(207,783),(232,752),(288,721),(349,704),(379,710),(394,759),
    (420,811),(431,878),(441,971),(403,1040),(209,1040)])
chair=np.maximum(chair,polygon([(882,742),(941,718),(990,738),(1014,772),(1013,919),
    (978,949),(948,1000),(867,1040),(837,1040),(851,905)]))
# This narrow polygon follows the real rails and their mounting elbow. Colour
# selection retains dark hardware while removing the old orange monitor gaps.
hardware=polygon([(771,683),(1187,590),(1221,594),(1235,626),(1224,698),
    (1226,1040),(1171,1040),(1175,683),(839,741),(791,732)])
interior=polygon([(555,449),(772,449),(823,510),(849,625),(867,734),
    (830,867),(802,1040),(488,1040),(472,858),(470,728),(486,572)])>0
start=time.monotonic()
previous_gray=None
tracking=None
origin=None
for decode_index in range(96):
    raw=decoder.stdout.read(width*height*3)
    assert len(raw)==width*height*3,(decode_index,len(raw))
    rgb=np.frombuffer(raw,np.uint8).reshape(height,width,3).copy()
    _,alpha,*states=session.run(None,{'src':rgb.transpose(2,0,1)[None].astype(np.float32)/255,
        **{f'r{j+1}i':s for j,s in enumerate(states)},'downsample_ratio':np.array([.5],np.float32)})
    if decode_index<24:
        continue
    i=decode_index-24
    gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY)
    if tracking is None:
        tracking=np.array([[(x-170)*width/1110,(y-40)*height/1000]
            for x,y in [(650,292),(718,298),(680,343),(680,250)]],np.float32).reshape(-1,1,2)
        origin=tracking.copy()
    else:
        tracked,ok,_=cv2.calcOpticalFlowPyrLK(previous_gray,gray,tracking,None)
        if ok.sum()>=3:
            tracking=tracked
    dx,dy=np.median((tracking-origin).reshape(-1,2),axis=0)
    previous_gray=gray
    person=np.clip((alpha[0,0]-.15)/.80,0,1)
    person[interior]=1
    person=cv2.erode(person,np.ones((2,2),np.uint8))
    # Track the ear correction with actual face features. Skin-colour gating
    # excludes the beige/grey old walls within these small source-specific ROIs.
    skin=(rgb[:,:,0]>rgb[:,:,1]*1.12)&(rgb[:,:,0]>rgb[:,:,2]*1.12)&(rgb.max(2)<215)
    for (x0,y0,x1,y1) in [(589,313,619,367),(757,313,788,375)]:
        a,b=round((x0-170)*width/1110+dx),round((y0-40)*height/1000+dy)
        c,d=round((x1-170)*width/1110+dx),round((y1-40)*height/1000+dy)
        person[b:d,a:c]=np.maximum(person[b:d,a:c],skin[b:d,a:c].astype(float))
    # Preserve only actual blue chair pixels inside the reviewed chair outline.
    b,g,r=rgb[:,:,2].astype(float),rgb[:,:,1].astype(float),rgb[:,:,0].astype(float)
    blue=(b>r*1.1)&(b>g*.98)&(b<200)
    chair_alpha=(chair>0)&blue
    # Equipment is near black; an anti-aliased luma gate avoids white/orange
    # backing fringes and leaves the spaces between the microphone rails open.
    lum=rgb.max(2).astype(float)
    neutral=(rgb.max(2).astype(float)-rgb.min(2).astype(float))<45
    hardware_alpha=np.clip((115-lum)/45,0,1)*(hardware>0)*neutral
    # The stand below its photographed elbow is occluded by the old plant.
    # Repair that short straight support in Blender, not with plant-coloured RGB.
    hardware_alpha[round((657-40)*height/1000):,round((1160-170)*width/1110):]=0
    combined=np.maximum(person,np.maximum(chair_alpha.astype(float),hardware_alpha))
    # Camera-locked background garbage matte: person/seat occupy the left;
    # right-side retention is solely the actual microphone hardware.
    combined[:,660:]=hardware_alpha[:,660:]
    combined[:100,:]=0
    combined=cv2.GaussianBlur(combined.astype(np.float32),(3,3),.45)
    # Recover edge colour from the nearest opaque source pixel; the source's
    # bright old wall must not stay baked into semi-transparent shoulder pixels.
    opaque=combined>.98
    _,labels=cv2.distanceTransformWithLabels((~opaque).astype(np.uint8),cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
    lookup=np.zeros((int(labels.max())+1,3),np.uint8)
    lookup[labels[opaque]]=rgb[opaque]
    near=lookup[labels]
    edges=(combined>.01)&(combined<.97)
    rgb[edges]=np.rint(rgb[edges]*.2+near[edges]*.8).astype(np.uint8)
    metal=(hardware_alpha>.01)&(person<.5)
    metal_gray=np.rint(rgb[metal].astype(float)@np.array([.2126,.7152,.0722])).astype(np.uint8)
    rgb[metal]=metal_gray[:,None]
    rgba=np.dstack([rgb,np.rint(combined*255).astype(np.uint8)])
    Image.fromarray(rgba).save(frames/f'{i+1:06d}.png')
    if i in [0,24,48,71]:
        plate=np.array([.16,.19,.21])
        review=(rgb/255*combined[:,:,None]+plate*(1-combined[:,:,None]))
        Image.fromarray(np.rint(review*255).astype(np.uint8)).save(ROOT/'frames'/f'matte-{i:03d}.png')
    if (i+1)%12==0:
        print(json.dumps({'matteFrames':i+1,'seconds':round(time.monotonic()-start,1)}),flush=True)
decoder.stdout.close(); assert decoder.wait()==0
(ROOT/'source-selection.json').write_text(json.dumps({'rejectedProgrammeInterval':[4,7],
    'originalSourceInterval':[539/24,611/24],'frames':72,'fps':24,'crop':[170,40,1110,1000],
    'alphaSize':[800,720],'method':'Existing private RVM CPU prior plus source-specific chair/hardware selections',
    'modelSha256':hashlib.sha256(MODEL.read_bytes()).hexdigest(),
    'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest()},indent=2)+'\n')
