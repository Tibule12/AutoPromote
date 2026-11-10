"""Measure all 5,760 actual frames; do not modify media or accept visual quality.

Room-only reference features constrain camera registration. Existing per-frame
camera IDs bound cuts; unreliable candidates remain explicitly unaccepted.
"""
import argparse, json, subprocess, time
from pathlib import Path
import cv2
import numpy as np

p=argparse.ArgumentParser();p.add_argument('out',type=Path);args=p.parse_args()
args.out.mkdir(parents=True,exist_ok=False);cv2.setNumThreads(2)
oldroot=Path('reports/background-replacement-20261101/private/long-podcast-r7')
coarse=json.load(open(oldroot/'registration.json'))['rows']
cuts=json.load(open(oldroot/'frame-camera-verification.json'))['exactTransitions']
camera=np.zeros(5760,np.uint8)
for i,cut in enumerate(cuts):camera[cut['frame']:cuts[i+1]['frame'] if i+1<len(cuts) else 5760]=cut['angle']
sift=cv2.SIFT_create(nfeatures=2500);matcher=cv2.BFMatcher();references=[]
for angle,file in enumerate(['reports/background-replacement-20261101/private/source-3s.mp4','reports/background-replacement-20261101/private/two-speaker-r4/Speaker 2 - source 54-57s.mp4']):
    cap=cv2.VideoCapture(file);ok,bgr=cap.read();cap.release();assert ok
    small=cv2.resize(bgr,(bgr.shape[1]//2,bgr.shape[0]//2));gray=cv2.cvtColor(small,cv2.COLOR_BGR2GRAY)
    mask=np.full(gray.shape,255,np.uint8)
    if angle==0:mask[:440,:430]=0
    else:mask[:480,170:]=0
    keys,descriptors=sift.detectAndCompute(gray,mask);references.append((keys,descriptors))
source=Path('/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4')
cmd=['ffmpeg','-nostdin','-v','error','-threads','2','-i',str(source),'-t','240','-vf','fps=24,scale=960:540','-an','-pix_fmt','gray','-f','rawvideo','pipe:1']
decoder=subprocess.Popen(cmd,stdout=subprocess.PIPE);rows=[];started=time.monotonic()
try:
    for index in range(5760):
        raw=decoder.stdout.read(960*540);assert len(raw)==960*540,index
        gray=np.frombuffer(raw,np.uint8).reshape(540,960);keys,desc=sift.detectAndCompute(gray,None)
        angle=int(camera[index]);refkeys,refdesc=references[angle]
        good=[] if desc is None else [m for m,n in matcher.knnMatch(desc,refdesc,k=2) if m.distance<.68*n.distance]
        row={'frame':index,'seconds':index/24,'angle':angle,'accepted':False,'matches':len(good)}
        if len(good)>=12:
            src=np.float32([keys[m.queryIdx].pt for m in good]);dst=np.float32([refkeys[m.trainIdx].pt for m in good])
            mat,inliers=cv2.estimateAffinePartial2D(src,dst,method=cv2.RANSAC,ransacReprojThreshold=1.3,maxIters=3000,confidence=.999)
            if mat is not None:
                use=inliers[:,0]>0;error=np.linalg.norm(src@mat[:,:2].T+mat[:,2]-dst,axis=1)
                full=mat.copy();full[:,2]*=2;scale=float(np.linalg.norm(mat[0,:2]));previous=coarse[index//6]
                # Same-shot coarse evidence is a sanity bound, not a frozen
                # transform. A mismatch cannot silently become accepted data.
                expected=np.asarray(previous['matrix']);anchors=np.array([[0,0],[960,540],[480,270]],float)
                delta=float(np.max(np.linalg.norm(anchors@full[:,:2].T+full[:,2]-anchors@expected[:,:2].T-expected[:,2],axis=1)))
                row.update(matrix=full.tolist(),inliers=int(use.sum()),medianErrorHalfPixels=float(np.median(error[use])),referenceScale=scale,coarseDifferencePixels=delta)
                row['accepted']=bool(use.sum()>=12 and .55<scale<1.5 and np.median(error[use])<.8 and previous['angle']==angle and delta<16)
        rows.append(row)
        if index%48==0 or index==5759:
            status={'completedFrames':index+1,'totalFrames':5760,'acceptedFrames':sum(r['accepted'] for r in rows),'runtimeSeconds':time.monotonic()-started,'visualPass':False,'renderStarted':False}
            (args.out/'progress.json').write_text(json.dumps(status)+'\n');print(json.dumps(status),flush=True)
    assert not decoder.stdout.read(1) and decoder.wait()==0
    (args.out/'registration.json').write_text(json.dumps({'source':str(source),'frameCount':5760,'fps':24,'cameraIntervals':len(cuts),'rows':rows,'visualPass':False,'noMediaChanged':True,'runtimeSeconds':time.monotonic()-started},indent=2)+'\n')
finally:
    if decoder.poll() is None:decoder.kill();decoder.wait()
