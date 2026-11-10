"""Actual moving-frame evidence and temporal diagnostics, never creative approval."""
from pathlib import Path
import argparse,json,subprocess
import cv2,numpy as np
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('movie');p.add_argument('output');a=p.parse_args();movie=Path(a.movie);out=Path(a.output);out.mkdir(parents=True,exist_ok=False);cap=cv2.VideoCapture(str(movie));n=int(cap.get(cv2.CAP_PROP_FRAME_COUNT));assert n==5760;cuts=json.load(open('reports/background-replacement-20261101/private/long-podcast-r7/frame-camera-verification.json'))['exactTransitions'];starts={r['frame'] for r in cuts};cam=np.zeros(5760,np.uint8)
for j,c in enumerate(cuts):cam[c['frame']:cuts[j+1]['frame'] if j+1<len(cuts) else 5760]=c['angle']
selected=set(range(0,5760,24))|{min(5759,max(0,f+d)) for f in starts for d in [-2,-1,0,1,2,6]}|{5759};samples=[];previous=None;metrics=[]
# Every decoded output frame contributes to the stationary replacement-region
# metric; it cannot establish foreground completeness without labelled truth.
for i in range(n):
 ok,bgr=cap.read();assert ok;rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)
 if previous is not None and cam[i]==cam[i-1]:
  patch=rgb[20:120,1000:1250].astype(np.int16);prior=previous[20:120,1000:1250].astype(np.int16);delta=np.abs(patch-prior);metrics.append({'frame':i,'backgroundRegionMeanDelta':float(delta.mean()),'backgroundRegionP99Delta':float(np.percentile(delta,99))})
 if i in selected:
  file=out/f'frame-{i:05d}.jpg';Image.fromarray(rgb).save(file,quality=96);samples.append((i,file))
 previous=rgb
assert not cap.read()[0];cap.release()
for start in range(0,len(samples),12):
 canvas=Image.new('RGB',(1716,1296));draw=ImageDraw.Draw(canvas)
 for j,(frame,file) in enumerate(samples[start:start+12]):
  x=j%3*572;y=j//3*324;im=Image.open(file).resize((457,320));canvas.paste(im,(x,y));draw.text((x+459,y+8),f'{frame/24:.3f}s',fill='white')
 canvas.save(out/f'all-samples-{start//12+1:02d}.jpg',quality=94)
(out/'review-index.json').write_text(json.dumps({'fullFramesDecoded':n,'sampleFrameCount':len(samples),'sampleFrames':[i for i,_ in samples],'allCameraIntervals':len(cuts),'cutNeighbourFramesIncluded':True,'staticBackgroundMeasurements':metrics,'metricDoesNotQualifyBodyEdges':True,'visualReviewStillRequired':True,'creativeGate':False},indent=2));print('ACTUAL_FOUR_MINUTE_REVIEW_FRAMES',n,len(samples),flush=True)
