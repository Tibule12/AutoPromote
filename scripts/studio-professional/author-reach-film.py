#!/usr/bin/env python3
"""Native editable typography; writes importable layers and original audio only."""
import json
import math
from pathlib import Path
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'reports/studio-creator-film-20261018/type'
ASSETS = OUT / 'assets'
assert not (OUT / 'proof/native-design.json').exists(), 'Preserve the native edit'
ASSETS.mkdir(parents=True, exist_ok=True)
D = 16
INK, PAPER, CYAN, PURPLE, PINK = '#0b0c19', '#f7f2e9', '#55e6ef', '#a38bff', '#ff80bd'
EASE = [.19, 1, .22, 1]
layers = []
def layer(name,a,b,**kw):
    item=dict(id=f'reach-{len(layers):03}',name=name,startTime=round(a*30)/30,
        duration=round(b*30)/30-round(a*30)/30,x=50,y=50,width=95,
        scale=1,rotation=0,opacity=1,keys=[])
    item.update(kw);layers.append(item);return item
def key(item,prop,points):
    for t,v,*options in points:
        k=dict(property=prop,time=round(t*30)/30,value=v,easing=options[0] if options else 'bezier')
        if k['easing']=='bezier':k['curve']=EASE
        item['keys'].append(k)
    return item
def text(name,copy,a,b,x=50,y=50,size=4,color=PAPER,**kw):
    return layer(name,a,b,type='text',text=copy,x=x,y=y,scale=size,
        color=color,fontWeight=900,textAlign='center',**kw)
def art(name,a,b,body,width=100,height=100,**kw):
    w,h=round(width*12.8),round(height*7.2)
    return layer(name,a,b,type='artwork',width=width,height=height,
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 1000 1000" preserveAspectRatio="none">{body}</svg>',**kw)
def rect(name,a,b,color,width=100,height=100,**kw):
    return art(name,a,b,f'<rect width="1000" height="1000" fill="{color}"/>',width,height,**kw)
def fade(item,a,b,attack=.1,release=.15):
    key(item,'opacity',[(a,0),(a+attack,1),(b-release,1),(b,0)])
def mask(top,bottom):
    return dict(enabled=True,shape='polygon',path=f'polygon(0% {top}%,100% {top}%,100% {bottom}%,0% {bottom}%)',feather=0,inverted=False)

rect('Stage / midnight',0,D,INK)
# Restrained editorial grid and peripheral marks leave a clear type stage.
field=art('Stage / composition guides',0,D,
    '<path d="M80 0V1000M920 0V1000M0 150H1000M0 850H1000" stroke="#27283f" stroke-width="1" fill="none"/>')
field['opacity']=.6
for x in [7,93]:
    mark=text('Stage / registration', '+',0,D,x=x,y=50,size=.6,color=PURPLE)
    key(mark,'rotation',[(0,0),(16,180,'linear')])
# YOUR: alternating mirrored halves land with a small overshoot. The seam
# closes; the initial photograph-free result is already moving on frame one.
for i,char in enumerate('YOUR'):
    for side,(top,bottom) in enumerate([(0,50),(50,100)]):
        a=i*.055+side*.0333333333;x=26+i*16
        item=text(f'YOUR / {char} / half {side+1}',char,a,2.15,x=x,size=5,mask=mask(top,bottom),color=PAPER if not side else CYAN)
        key(item,'x',[(a,x+(-15 if side else 15)),(a+.35,x),(1.65,x),(2.15,50)])
        key(item,'y',[(a,18 if side else 82),(a+.3,48 if side else 52),(a+.48,50),(1.65,50),(2.15,10 if side else 90)])
        key(item,'rotation',[(a,-22 if side else 22),(a+.35,0),(1.65,0),(2.15,-25 if side else 25)])
        fade(item,a,2.15,.067,.2)
rail=rect('YOUR / ownership line',.3,1.9,CYAN,width=68,height=1,y=72)
key(rail,'scale',[(.3,.1),(.8,1),(1.5,1),(1.9,.1)])
tag=text('YOUR / label','THIS IS YOUR TIME.',.5,1.8,y=82,size=.55,color=PURPLE);fade(tag,.5,1.8)
# IDEAS: broken staggered type bands form a coherent word, with little orbital
# pieces continuing through the transition rather than a generic title wipe.
for i,(top,bottom) in enumerate([(0,36),(35,64),(63,100)]):
    a=1.8+i*.067
    item=text(f'IDEAS / ribbon {i+1}','IDEAS',a,4.05,size=5,color=[PURPLE,PAPER,CYAN][i],mask=mask(top,bottom))
    key(item,'x',[(a,12 if i%2 else 88),(2.5,50),(3.35,50),(4.05,18 if i%2 else 82)])
    key(item,'y',[(a,45+i*5),(2.5,50),(3.35,50),(4.05,42+i*8)])
    key(item,'rotation',[(a,(i-1)*12),(2.5,0),(3.35,0),(4.05,(i-1)*-18)])
    fade(item,a,4.05,.1,.2)
for i in range(8):
    a=2.35+i*.04;angle=i*math.pi/4
    x,y=50+32*math.cos(angle),50+35*math.sin(angle)
    item=rect(f'IDEAS / spark {i+1}',a,3.8,[CYAN,PURPLE,PINK][i%3],width=1.3,height=2.3,x=x,y=y,rotation=i*45)
    key(item,'x',[(a,50),(a+.4,x),(3.8,x+8*math.cos(angle))]);key(item,'y',[(a,50),(a+.4,y),(3.8,y+8*math.sin(angle))])
    key(item,'rotation',[(a,0),(3.8,(180+i*45+180)%360-180)]);fade(item,a,3.8,.05,.3)
# DESERVE: independent characters join from two baselines, rotate into an
# oblique lockup, then tilt as a whole through synchronised ordinary keys.
page=rect('DESERVE / paper field',3.8,6.7,PAPER)
key(page,'scale',[(3.8,.1),(4.15,1),(6.25,1),(6.7,.1)])
key(page,'rotation',[(3.8,12),(4.15,0),(6.25,0),(6.7,-12)]);fade(page,3.8,6.7)
for i,char in enumerate('DESERVE'):
    a=3.9+i*.067;x=17+i*11
    item=text(f'DESERVE / letter {i+1}',char,a,6.6,x=x,size=4.4,color=INK)
    key(item,'x',[(a,50),(a+.4,x),(5.85,x),(6.6,50)])
    key(item,'y',[(a,15 if i%2 else 85),(a+.3,53 if i%2 else 47),(a+.5,50),(5.85,50),(6.6,50)])
    key(item,'rotation',[(a,60 if i%2 else -60),(a+.4,-6),(5.85,-6),(6.6,60 if i%2 else -60)])
    key(item,'scale',[(a,.1),(a+.3,4.7),(a+.5,4.4),(5.85,4.4),(6.6,.1)]);fade(item,a,6.6,.067,.3)
tag=text('DESERVE / belief','DON’T LET THE UPLOADS WIN.',4.6,6.1,y=78,size=.58,color=INK);fade(tag,4.6,6.1)
# MORE: depth-like echoes expand into a wide face, with editorial countertext.
for i in range(5):
    a=6.2+i*.067
    item=text(f'MORE / expanding echo {i+1}','MORE',a,8.65,y=50,size=4.9,color=PAPER if i==4 else [PURPLE,CYAN,PINK,PURPLE][i],strokeWidth=0 if i==4 else 2,strokeColor=CYAN)
    key(item,'y',[(a,50),(7.1,50+(i-2)*12),(7.8,50+(i-2)*12),(8.65,50)])
    key(item,'scale',[(a,.2),(7.1,3.6+i*.2),(7.8,3.6+i*.2),(8.65,.2)])
    key(item,'rotation',[(a,(i-2)*10),(7.1,0),(7.8,0),(8.65,(i-2)*-10)]);fade(item,a,8.65,.067,.25)
# REACH: five letters travel out along their own tracks, pause, and resolve
# into a wide, legible lockup. Growing routing lines make the meaning visible.
for i,char in enumerate('REACH'):
    a=8.2+i*.1;x=18+i*16
    item=text(f'REACH / letter {i+1}',char,a,11.1,x=x,size=4.8,color=CYAN if i%2==0 else PAPER)
    key(item,'x',[(a,50),(a+.5,x),(10.4,x),(11.1,50)])
    key(item,'y',[(a,50),(a+.3,45 if i%2 else 55),(a+.6,50),(10.4,50),(11.1,50)])
    key(item,'rotation',[(a,(i-2)*40),(a+.55,0),(10.4,0),(11.1,(i-2)*20)])
    key(item,'scale',[(a,.1),(a+.4,5),(a+.65,4.8),(10.4,4.8),(11.1,.1)]);fade(item,a,11.1,.067,.25)
for i in range(6):
    a=8.6+i*.055;angle=i*60
    item=art(f'REACH / outward route {i+1}',a,10.85,
        f'<path d="M50 500H900L750 350M900 500L750 650" stroke="{PURPLE}" stroke-width="24" fill="none"/>',width=16,height=7,x=50,y=50,rotation=angle)
    key(item,'x',[(a,50),(9.5,50+35*math.cos(math.radians(angle))),(10.85,50+42*math.cos(math.radians(angle)))])
    key(item,'y',[(a,50),(9.5,50+37*math.sin(math.radians(angle))),(10.85,50+44*math.sin(math.radians(angle)))])
    key(item,'scale',[(a,.1),(9.5,1),(10.85,.3)]);fade(item,a,10.85,.1,.3)
# Final resolve is five readable words, no invented performance promise.
for i,(copy,y,size,color) in enumerate([('YOUR IDEAS',27,2.8,PAPER),('DESERVE',48,3.5,PURPLE),('MORE REACH.',72,3.3,CYAN)]):
    a=10.7+i*.1
    item=text('Resolve / '+copy,copy,a,D,y=y,size=size,color=color)
    key(item,'x',[(a,25 if i%2 else 75),(a+.65,50),(D,50)])
    key(item,'y',[(a,y+10),(a+.65,y),(D,y)])
    key(item,'rotation',[(a,-8 if i%2 else 8),(a+.65,0),(D,0)]);fade(item,a,D,.2,.1)
for i,(x,y,rot) in enumerate([(8,13,0),(92,13,90),(92,88,180),(8,88,270)]):
    item=art(f'Resolve / corner {i+1}',11,D,f'<path d="M950 60H60V950" fill="none" stroke="{PINK}" stroke-width="35"/>',width=5,height=8.9,x=x,y=y,rotation=rot)
    key(item,'scale',[(11,.1),(11.6,1),(D,1)]);fade(item,11,D,.2,.1)
for item in layers:
    item['rotation']=(item['rotation']+180)%360-180
    for k in item['keys']:
        assert item['startTime']-1e-5<=k['time']<=item['startTime']+item['duration']+1e-5,(item['name'],k)
        if k['property']=='scale':assert .1<=k['value']<=5
        if k['property'] in ('x','y'):assert 0<=k['value']<=100
spec=dict(format='autopromote-graphics',version=1,name='Your ideas deserve more reach',width=1280,height=720,duration=D,layers=layers,groups=[])
(ASSETS/'graphics.json').write_text(json.dumps(spec,indent=2)+'\n')
design=dict(name=spec['name'],seconds=D,layers=len(layers),groups=0,keys=sum(len(l['keys']) for l in layers),words=['YOUR','IDEAS','DESERVE','MORE','REACH'],concept='Split letters, fractured ribbons, alternating baselines, expanding echoes and outward routing resolve.')
(OUT/'design.json').write_text(json.dumps(design,indent=2)+'\n')
(OUT/'config.json').write_text(json.dumps(dict(projectName='Your ideas deserve more reach — native film 20261018',output='reach',baseProject='MAKE EVERY FRAME FEEL ALIVE — studio cut',graphics='assets/graphics.json',score='assets/score.wav',backupName='REACH.autopromote.json',poses=[.4,1.2,2.7,4.8,5.5,7.35,9.5,11.7,14.5]),indent=2)+'\n')
# An original 120-BPM stereo score. This remains a normal imported Sound file.
rate=48000;audio=np.zeros((D*rate,2));rng=np.random.default_rng(181026)
def add(at,signal,pan=0):
    start=round(at*rate);n=min(len(signal),len(audio)-start)
    if n>0:
        audio[start:start+n,0]+=signal[:n]*math.sqrt((1-pan)/2)
        audio[start:start+n,1]+=signal[:n]*math.sqrt((1+pan)/2)
for j,at in enumerate(np.arange(0,D,.5)):
    t=np.arange(round(.42*rate))/rate
    kick=np.sin(2*np.pi*(48*t+2*(1-np.exp(-23*t))))*np.exp(-14*t)
    clap=rng.normal(0,1,len(t))*np.exp(-45*t)
    add(float(at),.35*kick+(.055*clap if j%2 else 0),0)
    note=[146.832,220,293.664,369.994,329.628,220,293.664,246.942][j%8]
    pluck=(np.sin(2*np.pi*note*t)+.22*np.sin(4*np.pi*note*t))*np.exp(-12*t)
    add(float(at)+.25,pluck*.12,(-1 if j%2 else 1)*.6)
for j,at in enumerate([0,.1,.2,.3,1.8,1.87,1.93,2.5,3.8,4.1,4.3,4.5,6.2,6.4,6.6,6.8,7.1,8.2,8.3,8.4,8.5,8.6,9.5,10.7,10.8,10.9,11.6]):
    t=np.arange(round(.3*rate))/rate
    tick=(np.sin(2*np.pi*880*t)*.1+rng.normal(0,1,len(t))*.08)*np.exp(-40*t)
    add(at,tick,(-1 if j%2 else 1)*.45)
for at in [1.55,3.5,5.95,7.95,10.45]:
    t=np.arange(round(.42*rate))/rate;noise=rng.normal(0,1,len(t));noise=np.convolve(noise,np.ones(24)/24,mode='same')
    add(at,noise*.3*np.sin(np.pi*t/.42)**2, -.4 if at<6 else .4)
t=np.arange(len(audio))/rate
for f in [73.416,110,146.832]:
    pad=.024*np.sin(2*np.pi*f*t)*np.minimum(t/.2,1)*np.minimum((D-t)/.5,1)
    audio+=pad[:,None]
audio*=.85/max(.01,np.abs(audio).max());audio[-14400:]*=np.linspace(1,0,14400)[:,None]
sf.write(ASSETS/'score.wav',audio,rate,subtype='PCM_16')
print(json.dumps(design))
