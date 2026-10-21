#!/usr/bin/env python3
"""Author source decisions, native Graphics interchange and original foley.

Video cutting, photo transforms, masks, speed and mixing remain Studio edits.
The photographs are unaltered exact decoded frames from the filmed sources.
"""
import json, math, wave
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'reports/studio-boxing-edit-20261019'; A=OUT/'assets'
A.mkdir(parents=True,exist_ok=True)
shots=[('40967',0,2),('40967',2,4),('40967',2,6),('40972',1,4),
 ('40954',0,6),('40954',6,7),('40967',0,1),('40967',6,12),
 ('40967',2,8),('40967',8,11),('40954',1,4),('40954',1,5),
 ('40967',0,2),('40972',4,7),('40954',3,6),('40967',2,3.5),
 ('40954',1.5,3),('40967',6,7.5),('40954',4.5,6),('40967',.5,1.5),('40967',3,11)]
edl=[];t=0
for asset,a,b in shots:
 edl.append(dict(assetId=asset,sourceIn=a,sourceOut=b,programmeIn=t,programmeOut=t+b-a));t+=b-a
assert t==64
(OUT/'edit-decisions.json').write_text(json.dumps(dict(shots=edl,preRampSeconds=t,finalSeconds=60),indent=2)+'\n')

def key(p,t,v,e='ease_out'):return dict(property=p,time=t,value=v,easing=e)
layers=[];INK='#0b1117';CREAM='#f3efdf';RED='#ff523c'
def art(name,svg,a,b,x=50,y=50,w=100,h=100):
 l=dict(id=f'boxing-{len(layers):03}',name=name,type='artwork',svg=svg,startTime=a,duration=b-a,x=x,y=y,width=w,height=h,scale=1,rotation=0,opacity=1,keys=[]);layers.append(l);return l
def rect(name,col,a,b,x=50,y=50,w=100,h=100):
 return art(name,f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="{col}"/></svg>',a,b,x,y,w,h)
for a,b in [(2,4),(17,19),(31,37),(37,43),(56,60)]:rect(f'Picture stage {a:g}–{b:g}',INK,a,b)

# Small source frames sit above these ordinary moving paper mounts.
photos=[]
def photo(file,a,b,w,h,poses,mask=None):
 photos.append(dict(file=file,start=a,end=b,width=w,height=h,poses=poses,**(dict(mask=mask) if mask else {})))
# Three moments of the same action expand from one full-frame hold.
for i,(f,x,rot) in enumerate([('action-1.50.png',18,-5),('action-2.50.png',82,5),('action-2.00.png',50,0)]):
 if i<2: poses=[[2,50,50,.3,0,0],[2.32,x,50,1,rot,1],[3.65,x,50,1.025,rot,1],[3.99,50,50,.9,0,0]];w=h=36
 else: poses=[[2,50,50,1.62,0,1],[2.34,50,50,1,0,1],[3.68,50,50,1.04,0,1],[3.99,50,50,1.62,0,1]];w=h=62
 photo(f,2,4,w,h,poses)
# Overhead source remains portrait; lateral stills use original aspect.
for f,x,rot in [('action-4.50.png',16,-4),('exchange-2.00.png',84,4)]:
 photo(f,8,11,29,29,[[8,x,58,.85,rot,0],[8.25,x,50,1,rot,1],[10.7,x,50,1.06,rot,1],[10.99,x,42,1,rot,0]])
# A two-piece seam separates two instants in a real exchange.
photo('exchange-2.00.png',17,19,100,100,[[17,33,50,1.43,0,1],[17.35,35,50,1.35,0,1],[18.65,35,50,1.4,0,1],[18.99,25,50,1.45,0,0]],'polygon(0% 0%,54% 0%,46% 100%,0% 100%)')
photo('exchange-2.50.png',17,19,100,100,[[17,37,50,1.43,0,1],[17.35,35,50,1.35,0,1],[18.65,35,50,1.4,0,1],[18.99,45,50,1.45,0,0]],'polygon(54% 0%,100% 0%,100% 100%,46% 100%)')
# The second sequence studies three successive positions of the same boxer.
for i,(f,x,y,r) in enumerate([('action-6.00.png',25,44,-8),('action-6.50.png',75,56,8),('action-7.00.png',50,50,0)]):
 a=31+i*.18;b=37;w=h=58 if i==2 else 48
 poses=[[a,50,50,.45,r,0],[a+.32,x,y,1,r,1],[34.6,x,y,1.05,r,1]]
 poses+=([[36,50,50,1.73,0,1],[36.99,50,50,1.73,0,1]] if i==2 else [[35.5,x,50,.65,r,0],[36.99,x,50,.65,r,0]])
 photo(f,a,b,w,h,poses)
# A hand-authored native still mask lets the foreground boxer separate from
# that same exact frame during the last half-second of the photo expansion.
# This is an editable still cutout, not neural segmentation or video tracking.
photo('action-7.00.png',35.65,37,100,100,
 [[35.65,50,50,1.0034,0,0],[35.85,50,50,1.0034,0,1],
  [36.65,52,51,1.14,-1,1],[36.99,52,51,1.14,-1,0]],
 'polygon(36.8% 14%,41% 16%,44% 22%,45% 28%,44% 35%,43% 42%,50% 44%,55% 49%,60% 53%,62% 56%,64% 57%,67% 66%,64% 69%,59% 69%,54% 66%,49% 63%,46% 61%,45% 68%,45% 75%,45% 86%,46% 93%,47% 100%,20% 100%,21% 96%,24% 90%,24% 82%,24% 74%,24% 69%,20% 75%,17% 79%,14% 78%,13% 75%,13% 70%,14% 67%,16% 61%,17% 56%,18% 49%,20% 43%,22% 41%,26% 40%,29% 39%,29% 35%,29% 28%,30% 21%,32% 17%)')
# Closing editorial still, with room for one proper title lockup.
photo('action-6.50.png',56,60,50,50,[[56,73,50,1.12,-3,0],[56.45,73,50,1,0,1],[59.98,73,50,1.055,0,1]])

# A few brief diagonal shutters are composition transitions, not slogans.
for t in [3.85,10.85,18.85,36.85,42.85,48.85,55.85]:
 l=rect(f'Diagonal shutter at {t:g}',CREAM,t,t+.3,w=32,h=100)
 l['rotation']=-17;l['scale']=1.6;l['keys']=[key('x',t,0,'linear'),key('x',t+.3,100,'linear'),key('opacity',t,0),key('opacity',t+.05,1),key('opacity',t+.25,1),key('opacity',t+.3,0)]
def title(copy,x,y,scale,width,a,b,weight=900,color=CREAM):
 l=dict(id=f'boxing-{len(layers):03}',name='Closing / '+copy,type='text',text=copy,startTime=a,duration=b-a,x=x,y=y,width=width,scale=scale,rotation=0,opacity=1,color=color,fontWeight=weight,textAlign='left',keys=[key('opacity',a,0),key('opacity',a+.35,1),key('y',a,y+4),key('y',a+.35,y)])
 layers.append(l)
title('IN THE',22,35,2.25,40,56.3,60)
title('POCKET.',22,49,2.6,43,56.45,60)
title('A BOXING FILM STUDY',22,67,.42,36,57,60,600,RED)
title('STOCK FOOTAGE · DESIGNED SOUND',22,73,.23,38,57.2,60,400)

# The native speed map supplies the public interchange's programme clock.
document=OUT/'proof/picture-cut-document.json'
def programme(seconds):
 if not document.exists():return seconds
 tick=round(seconds*90000)
 for s in json.loads(document.read_text())['outputTimeMap']:
  o,p=s['outputRange'],s['programmeRange']
  if o['startTick']<=tick<=o['endTick']:
   return round(p['startTick']+(tick-o['startTick'])*(p['endTick']-p['startTick'])/(o['endTick']-o['startTick']))/90000
 raise ValueError(seconds)
outpackage=dict(format='autopromote-graphics',version=1,name='IN THE POCKET / picture stages and closing title',width=1280,height=720,duration=60,layers=layers,groups=[])
(A/'picture-output-clock.graphics.json').write_text(json.dumps(outpackage,indent=2)+'\n')
for l in layers:
 a,b=l['startTime'],l['startTime']+l['duration'];l['startTime']=programme(a);l['duration']=programme(b)-l['startTime']
 for k in l['keys']:k['time']=programme(k['time'])
outpackage['duration']=programme(60)
(A/'picture.graphics.json').write_text(json.dumps(outpackage,indent=2)+'\n')
(OUT/'photo-decisions.json').write_text(json.dumps(photos,indent=2)+'\n')

# Four short sample-free foley sources, placed independently through Sound.
rate=48000;rng=np.random.default_rng(191026)
for kind,d in [('glove',.22),('body',.38),('shutter',.12),('sweep',.5)]:
 t=np.arange(round(d*rate))/rate;n=rng.normal(0,1,len(t));low=np.convolve(n,np.ones(9)/9,mode='same')
 if kind=='glove':v=(low*.65*np.exp(-t*36)+n*.12*np.exp(-t*80)+np.sin(2*np.pi*(92*t-38*t*t))*np.exp(-t*27)*.7)
 elif kind=='body':v=np.sin(2*np.pi*(75*t-35*t*t))*np.exp(-t*15)*.7+low*np.exp(-t*25)*.5
 elif kind=='shutter':v=n*.45*np.exp(-t*90)+low*.3*np.exp(-np.maximum(0,t-.04)*100)*(t>.04)
 else:v=low*np.sin(np.pi*t/d)**2*.75
 v=np.tanh(v);stereo=np.column_stack([v,v*.985]);
 with wave.open(str(A/f'{kind}-original.wav'),'wb') as f:
  f.setnchannels(2);f.setsampwidth(2);f.setframerate(rate);f.writeframes((stereo*24000).astype('<i2').tobytes())
(OUT/'creative-direction.json').write_text(json.dumps(dict(title='IN THE POCKET',subject='Boxing only',seconds=60,structure='Actual exchange → held instants → return to action → overhead and two-view study → accelerating finish → title.',pictureTechniques=['21 native source cuts','Native moving freeze-frame triptych','Two-piece diagonal frame seam','Three-frame photographic expansion','Simultaneous native video panels','Main-footage camera keyframes','One native speed ramp'],text='One four-line closing title only; no motivational captions over the action.',sound='Licensed music and separate original foley cues timed to visible exchanges; source footage is silent.',continuity='A disclosed stock boxing film, not a continuous documented bout or synchronized multicamera event.',creativeApproval=False),indent=2)+'\n')
print('Authored 21 native source decisions,',len(photos),'unaltered photo layers and',len(layers),'ordinary graphic layers. No precomposited movie.')
