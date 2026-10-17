#!/usr/bin/env python3
"""A specific editable kinetic-type composition, imported by ordinary Studio.

This writes layers/keys and an original score, never video frames or an editing
graph. The existing native importer and canonical renderer own the movie.
"""
import json
import math
import argparse
from pathlib import Path
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, default=Path('reports/daily-studio/2026-10-17/schedule-first-v3/type'))
parser.add_argument('--project', default='STOP POSTING — kinetic editorial v3')
args = parser.parse_args()
OUT = ROOT / args.out
ASSETS = OUT / 'assets'
assert not (OUT / 'proof/native-design.json').exists(), 'Preserve the native edit'
ASSETS.mkdir(parents=True, exist_ok=True)
D = 12
BG, PAPER, LIME, CORAL = '#101311', '#f2eedf', '#d6fc52', '#ff694e'
layers = []
EASE = [.16, 1, .3, 1]


def key(item, prop, points):
    for time, value, *style in points:
        easing = style[0] if style else 'bezier'
        item['keys'].append(dict(property=prop, time=round(time*30)/30,
            value=value, easing=easing, **({'curve': EASE} if easing == 'bezier' else {})))
    return item


def layer(name, start, end, **kw):
    item = dict(id=f'take-time-{len(layers):02}', name=name, startTime=round(start*30)/30,
        duration=round(end*30)/30-round(start*30)/30, x=50, y=50, width=95,
        scale=1, rotation=0, opacity=1, keys=[])
    item.update(kw)
    layers.append(item)
    return item


def text(name, copy, a, b, x=50, y=50, scale=4, color=PAPER, **kw):
    return layer(name, a, b, type='text', text=copy, x=x, y=y,
        scale=scale, color=color, fontWeight=900, textAlign='center', **kw)


def art(name, a, b, markup, width=100, height=100, **kw):
    w, h = max(2, round(width*12.8)), max(2, round(height*7.2))
    return layer(name, a, b, type='artwork', width=width, height=height,
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 1000 1000" preserveAspectRatio="none">{markup}</svg>', **kw)


def rect(name, a, b, color, width=100, height=100, **kw):
    return art(name, a, b, f'<rect width="1000" height="1000" fill="{color}"/>', width, height, **kw)


def fade(item, a, b, attack=.1, release=.1):
    key(item, 'opacity', [(a,0), (a+attack,1), (b-release,1), (b,0)])


rect('Stage / charcoal', 0, D, BG)
grid = art('Stage / measured field', 0, D,
    '<path d="M80 0V1000M920 0V1000M0 120H1000M0 880H1000" fill="none" stroke="#363c30" stroke-width="1"/>')
grid['opacity'] = .6
# First word is four independent heavy characters. A timed mechanical snap
# lands each one, rather than scaling a single static title.
for i, char in enumerate('STOP'):
    x = 26+i*16
    a = i/15
    item = text(f'STOP / character {i+1}', char, a, 1.5, x=x, scale=5)
    key(item, 'y', [(a,9 if i%2 else 91), (a+.2,48), (a+.3,50), (1.15,50), (1.5,15 if i%2 else 85)])
    key(item, 'rotation', [(a,(-1 if i%2 else 1)*22), (a+.26,0), (1.15,0), (1.5,(-1 if i%2 else 1)*18)])
    fade(item,a,1.5,.067,.15)
rail = rect('STOP / brake rail', .3, 1.45, CORAL, width=68, height=1.3, y=72)
key(rail,'scale',[(.3,.1),(.6,1),(1.1,1),(1.45,.1)])
# Three editable masked text bands fracture, settle, then tear apart.
for i, (top,bottom) in enumerate([(0,40),(39,63),(62,100)]):
    a = 1.2+i/30
    mask = dict(enabled=True, shape='polygon',
        path=f'polygon(0% {top}%,100% {top}%,100% {bottom}%,0% {bottom}%)', feather=0, inverted=False)
    item = text(f'POSTING / sliced band {i+1}', 'POSTING.', a, 3.4, scale=4.3,
        color=CORAL if i==1 else PAPER, mask=mask)
    key(item,'x',[(a,14 if i%2 else 86),(1.8,50),(2.5,50),(3.4,94 if i%2 else 6)])
    key(item,'y',[(a,50),(2.5,50),(3.4,30+i*20)])
    key(item,'rotation',[(a,(-1 if i%2 else 1)*8),(1.8,0),(2.5,0),(3.4,(i-1)*20)])
    fade(item,a,3.4,.1,.3)
for i in range(9):
    a = 2.7+i/60
    bar = rect(f'Break / shutter {i+1}', a, 3.6, LIME, width=12, height=100,
        x=6+i*11, y=100)
    key(bar,'y',[(a,100),(3.17+i/60,50),(3.6,0)])
    fade(bar,a,3.6,.1,.15)
# START arrives as a staggered counter-rotation into an oblique new field.
field = rect('START / new page',3.3,8.5,LIME)
key(field,'opacity',[(3.3,0),(3.6,1),(8.1,1),(8.5,0)])
for i, char in enumerate('START'):
    a = 3.4+i*.067
    item = text(f'START / character {i+1}',char,a,4.9,x=23+i*13.5,scale=4.7,color=BG)
    key(item,'y',[(a,85),(a+.3,50),(4.35,50),(4.9,15)])
    key(item,'rotation',[(a,35-i*15),(a+.4,-7),(4.35,-7),(4.9,-17)])
    fade(item,a,4.9,.1,.15)
# A typographic conveyor resolves into a precisely aligned hero word.
for i, char in enumerate('CREATING'):
    a = 4.5+i*.1
    x = 15+i*10
    item = text(f'CREATING / character {i+1}',char,a,8.4,x=x,scale=4.4,color=BG)
    key(item,'x',[(a,8 if i%2 else 92),(a+.45,x),(6.6,x),(7.4,x),(8.4,50)])
    key(item,'y',[(a,17+i*9),(a+.45,50),(6.6,50),(7.4,50),(8.4,50)])
    key(item,'rotation',[(a,(-1 if i%2 else 1)*55),(a+.5,0),(7.4,0),(8.4,(-1 if i%2 else 1)*90)])
    key(item,'scale',[(a,.2),(a+.36,4.7),(a+.55,4.4),(7.4,4.4),(8.4,.1)])
    fade(item,a,8.4,.1,.3)
for i in range(4):
    a=5.4+i*.1
    x=24+i*17.3
    orbit=art(f'Creation / orbit {i+1}',a,7.6,
        f'<circle cx="500" cy="500" r="420" fill="none" stroke="{BG}" stroke-width="18" stroke-dasharray="700 300"/>',
        width=11,height=19.56,x=x,y=76)
    key(orbit,'rotation',[(a,-80),(7.6,180,'linear')]);fade(orbit,a,7.6,.15,.2)
beam=rect('Creation / underline',5.7,7.9,BG,width=82,height=1.1,y=66)
key(beam,'scale',[(5.7,.1),(6.3,1),(7.4,1),(7.9,.1)])
again=text('AGAIN / hero','AGAIN.',8,9.4,scale=4.8,color=LIME)
key(again,'rotation',[(8,-16),(8.3,4),(8.55,0),(9.1,0),(9.4,7)])
key(again,'scale',[(8,.3),(8.3,5),(8.55,4.8),(9.1,4.8),(9.4,3)])
fade(again,8,9.4,.1,.15)
# The final full phrase is held long enough to read while the frame resolves.
for i,(copy,y,size) in enumerate([('START',25,2.6),('CREATING',48,4.1),('AGAIN.',73,3.8)]):
    a=9.1+i/15
    item=text(f'Payoff / {copy}',copy,a,D,y=y,scale=size,color=LIME if i==1 else PAPER)
    key(item,'x',[(a,27 if i%2 else 73),(a+.5,50),(D,50)])
    key(item,'y',[(a,y+8),(a+.5,y),(D,y)])
    key(item,'rotation',[(a,-7 if i%2 else 7),(a+.5,0),(D,0)])
    fade(item,a,D,.2,.1)
for i,(x,y,rotation) in enumerate([(12,15,0),(88,15,90),(88,85,180),(12,85,270)]):
    item=art(f'Payoff / frame corner {i+1}',9.2,D,
        f'<path d="M950 70H70V950" fill="none" stroke="{CORAL}" stroke-width="45"/>',
        width=5,height=8.89,x=x,y=y,rotation=rotation)
    key(item,'scale',[(9.2,.1),(9.8,1),(D,1)])
    fade(item,9.2,D,.15,.1)
spec=dict(format='autopromote-graphics',version=1,name='Stop posting. Start creating again.',
    width=1280,height=720,duration=D,layers=layers,groups=[])
for item in layers:
    for k in item['keys']:
        assert item['startTime']-1e-5<=k['time']<=item['startTime']+item['duration']+1e-5,(item['name'],k)
        if k['property']=='scale':assert .1<=k['value']<=5
        if k['property'] in ('x','y'):assert 0<=k['value']<=100
(ASSETS/'graphics.json').write_text(json.dumps(spec,indent=2)+'\n')
accents=[0,.067,.133,.2,.6,1.2,1.6,2.7,3.3,3.4,3.6,3.8,4.5,4.7,4.9,5.1,5.2,5.7,6.3,7.7,8,8.3,9.1,9.3,9.5]
design=dict(name=spec['name'],seconds=D,layers=len(layers),groups=0,
    keys=sum(len(l['keys']) for l in layers),words=['STOP','POSTING','START','CREATING','AGAIN'],
    concept='Brake, fracture, shutter, staggered letters, typographic conveyor and a framed resolve.',
    problem='The creative time lost to repetitive manual publishing.',hook='The actual schedule dashboard leads the complete film.',
    payoff='Start creating again.',soundAccents=accents)
(OUT/'design.json').write_text(json.dumps(design,indent=2)+'\n')
(OUT/'config.json').write_text(json.dumps(dict(projectName=args.project,output='stop-posting',
    baseProject='MAKE EVERY FRAME FEEL ALIVE — studio cut',graphics='assets/graphics.json',score='assets/score.wav',
    backupName='STOP-POSTING.autopromote.json',poses=[.4,1,1.8,2.9,3.9,4.9,5.8,6.6,8.5,9.8,11.4]),indent=2)+'\n')
# Original stereo percussion/tonal bed, with explicit sound events at motion
# decisions. Its file is imported by Studio Sound; no finished video is muxed.
rate=48000
audio=np.zeros((D*rate,2),dtype=np.float64)
rng=np.random.default_rng(171003)
def add(at, signal, pan=0):
    start=round(at*rate);n=min(len(signal),len(audio)-start)
    if n>0:audio[start:start+n,0]+=signal[:n]*math.sqrt((1-pan)/2);audio[start:start+n,1]+=signal[:n]*math.sqrt((1+pan)/2)
for j,at in enumerate(accents):
    t=np.arange(round(.48*rate))/rate
    bass=np.sin(2*np.pi*(43*t+1.8*(1-np.exp(-24*t))))*np.exp(-15*t)
    body=np.sin(2*np.pi*[146.83,174.61,220,293.66][j%4]*t)*np.exp(-20*t)
    crack=rng.normal(0,1,len(t));crack=np.convolve(crack,[1,-.65],mode='same')*np.exp(-60*t)
    add(at,.48*bass+.12*body+.08*crack,(-1 if j%2 else 1)*.35)
for at in [1.05,2.5,3.1,4.3,7.5,8.8]:
    t=np.arange(round(.4*rate))/rate
    noise=rng.normal(0,1,len(t));noise=np.convolve(noise,np.ones(18)/18,mode='same')
    add(at,.18*noise*np.sin(np.pi*t/.4)**2, -.5 if at<4 else .5)
for at in np.arange(0,D,.535714):
    t=np.arange(round(.13*rate))/rate
    add(float(at),rng.normal(0,1,len(t))*.016*np.exp(-45*t),.5 if round(at*2)%2 else -.5)
t=np.arange(len(audio))/rate
for freq in [73.416,110,146.832]:
    pad=.018*np.sin(2*np.pi*freq*t)*np.sin(np.pi*np.minimum(t/.8,1)/2)*np.minimum((D-t)/.4,1)
    audio[:,0]+=pad;audio[:,1]+=pad
audio*=.86/max(.01,np.abs(audio).max());audio[-9600:]*=np.linspace(1,0,9600)[:,None]
sf.write(ASSETS/'score.wav',audio,rate,subtype='PCM_16')
print(json.dumps(design))
