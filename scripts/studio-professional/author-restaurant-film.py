#!/usr/bin/env python3
"""Source decisions, public native graphics interchange and sample-free sound.

No video compositor: all picture cutting, photo motion, vector draw-on and
mixing are authored in the normal Studio and rendered by its canonical worker.
"""
import hashlib
import json
import math
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'reports/studio-restaurant-film-20261020'
A = OUT / 'assets'
A.mkdir(parents=True, exist_ok=True)

# Exact 60-second programme. Held-photo layouts intentionally cover identified
# source intervals; no frozen/precomposited video is prepared outside Studio.
shots = [
    ('13261', 11, 13.5, 'Result first / plate detail'),
    ('13261', 3, 5.5, 'Hand / detail match'),
    ('13261', 10, 14, 'Opening editorial hold'),
    ('13258', 0, 3, 'Preparation / wide'),
    ('13258', 3, 6, 'Preparation / hands'),
    ('13258', 7, 9.5, 'Preparation / placement'),
    ('15875', 0, 2.5, 'Service / moving layout'),
    ('15875', 2.5, 5, 'Service / moving layout'),
    ('13258', 6, 11, 'Mise en place / editorial layout'),
    ('13258', 4, 6.5, 'Preparation / exact held-frame return to movement'),
    ('13261', 0, 3, 'Finishing / face and hand'),
    ('13261', 3, 6, 'Finishing / plate'),
    ('13261', 6, 10, 'Three finishing instants / editorial layout'),
    ('13261', 6, 9, 'Finishing / return to movement'),
    ('13261', 9, 12, 'Final touches / detail'),
    ('15875', 1, 3.5, 'Service / wider context'),
    ('13261', 11, 13.5, 'Result / detail'),
    ('13261', 7, 9.5, 'Final hand placement'),
    ('13261', 12, 14.5, 'Result / hold before finish'),
    ('13261', 10, 14, 'Closing photographic title'),
]
edl = []
t = 0
for asset, a, b, label in shots:
    edl.append(dict(assetId=asset, sourceIn=a, sourceOut=b,
                    programmeIn=t, programmeOut=t+b-a, label=label))
    t += b-a
assert t == 60
(OUT/'edit-decisions.json').write_text(json.dumps(dict(
    shots=edl, finalSeconds=t, speedMap='1x native programme',
    continuity='Stock kitchen film study; the sources do not document one continuous dish or service.'
), indent=2)+'\n')

PAPER = '#f4eee2'
GREEN = '#203c2e'
RED = '#b64f34'
OLIVE = '#b4c36c'
layers = []

def key(prop, time, value, easing='ease_in_out'):
    return dict(property=prop, time=time, value=value, easing=easing)

def art(name, a, b, x=50, y=50, w=100, h=100, color=PAPER):
    layer = dict(id=f'kitchen-{len(layers):03}', name=name, type='artwork',
                 svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="{color}"/></svg>',
                 startTime=a, duration=b-a, x=x, y=y, width=w, height=h,
                 scale=1, rotation=0, opacity=1, keys=[])
    layers.append(layer)
    return layer

for a, b, c in [(5,9,PAPER), (17.5,22.5,GREEN),
                 (22.5,27.5,PAPER), (36,40,GREEN), (56,60,PAPER)]:
    art(f'Editorial stage / {a:g}–{b:g}', a, b, color=c)

# Small rules and moving menu-like dividers provide hierarchy around the
# actual photos. There is no simulated restaurant endorsement or price list.
for a, b, x, y, w, c in [(5,9,26,22,37,RED),
                         (22.5,27.5,26,26,35,RED),
                         (36,40,50,84,83,OLIVE),
                         (56,60,25,72,34,RED)]:
    line=art('Fine rule', a, b, x,y,w,1,c)
    line['svg']=f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect y="270" width="1280" height="180" fill="{c}"/></svg>'
    line['keys']=[key('scale',a,.1), key('scale',a+.5,1),
                  key('opacity',a,0),key('opacity',a+.18,1)]

DEFAULT_ANIMATOR=dict(version=1,unit='character',order='forward',stagger=55,
    fromX=0,fromY=.9,fromScale=.85,fromRotation=12,fromOpacity=0,
    tracking=.2,rangeStart=0,rangeEnd=100,easing='back_out')

def title(copy,a,b,x,y,w,scale,color=GREEN,weight=900,animate=False,align='left'):
    layer=dict(id=f'kitchen-{len(layers):03}',name=copy,type='text',text=copy,
        startTime=a,duration=b-a,x=x,y=y,width=w,scale=scale,rotation=0,
        opacity=1,color=color,fontWeight=weight,textAlign=align,keys=[])
    if animate:
        layer['textAnimator']={**DEFAULT_ANIMATOR}
        layer['textProgress']=0
        layer['keys']=[key('textProgress',a,0,'linear'),key('textProgress',a+.85,100,'linear')]
    else:
        layer['keys']=[key('opacity',a,0),key('opacity',a+.24,1),key('y',a,y+2),key('y',a+.24,y)]
    layers.append(layer)
    return layer

title('THE',5.08,9,26,34,37,1.5,RED,800,True)
title('LAST',5.22,9,26,48,37,2.05,GREEN,900,True)
title('TOUCH.',5.42,9,26,64,37,1.64,GREEN,900,True)
title('A KITCHEN FILM STUDY',5.75,9,26,79,37,.34,RED,600)
title('SERVICE',17.75,22.5,17,12,24,.42,PAPER,600)
title('mise en',22.65,27.5,25,42,34,.98,GREEN,600,True)
title('PLACE.',22.85,27.5,25,57,34,1.43,RED,900,True)
title('PREPARATION / DETAIL / CARE',23.05,27.5,25,74,35,.27,GREEN,400)
title('THE SMALL DETAILS',36.15,40,50,14,80,.38,PAPER,600,False,'center')
title('THE LAST',56.15,60,25,38,40,1.14,GREEN,900,True)
title('TOUCH.',56.32,60,25,54,40,1.79,RED,900,True)
title('A KITCHEN FILM STUDY',56.85,60,25,66,37,.32,GREEN,600)
title('STOCK FOOTAGE · ORIGINAL SCORE',57.05,60,25,81,38,.23,GREEN,400)

# A true editable plate-outline contour; trim is authored subsequently in
# Motion, since stroke keys are deliberately not part of the v1 interchange.
k=22.0914
circle=dict(version=1,closed=True,nodes=[
    dict(x=50,y=10,**{'in':[-k,0],'out':[k,0]}),
    dict(x=90,y=50,**{'in':[0,-k],'out':[0,k]}),
    dict(x=50,y=90,**{'in':[k,0],'out':[-k,0]}),
    dict(x=10,y=50,**{'in':[0,k],'out':[0,-k]})],
    fill=dict(kind='none',color=RED,endColor=RED,start=[0,0],end=[100,100]),
    stroke=dict(color=RED,width=.55))
for a,b in [(5,9),(56,60)]:
    layers.append(dict(id=f'kitchen-{len(layers):03}',name=f'Plate outline {a:g}',
        type='artwork',vectorShape=circle,startTime=a,duration=b-a,
        x=74,y=50,width=56,height=99.55,scale=1,rotation=-90,opacity=1,keys=[]))

package=dict(format='autopromote-graphics',version=1,
    name='THE LAST TOUCH / native editorial design',width=1280,height=720,
    duration=60,layers=layers,groups=[])
(A/'restaurant.graphics.json').write_text(json.dumps(package,indent=2)+'\n')

# Each original PNG is an unaltered decoded frame, imported through B-roll.
# Native transforms/masks do all framing and movement.
photos=[]
def photo(file,a,b,w,h,poses,fit='contain',mask=None):
    photos.append(dict(file=file,start=a,end=b,width=w,height=h,poses=poses,
                       fit=fit,**({'mask':mask} if mask else {})))
photo('payoff-14.00.png',5,9,42,68,
    [[5,74,50,1.35,0,1],[5.5,74,50,1,0,1],[8.6,74,50,1.04,0,1],[8.98,74,50,1.02,0,1]],'cover','ellipse')
# Two actual stages of preparation slide into an asymmetrical food editorial.
photo('preparation-4.00.png',22.5,27.5,46,46,
    [[22.5,76,50,1.25,-7,0],[23.05,73,43,1,0,1],[26.95,73,43,1.035,0,1],[27.49,50,50,2.18,0,1]])
photo('preparation-8.00.png',22.7,27.5,24,24,
    [[22.7,73,84,.6,12,0],[23.25,54,76,1,-5,1],[26.7,54,76,1.04,-5,1],[27.35,54,86,.6,-8,0],[27.49,54,86,.6,-8,0]])
# Three photographs of the actual finishing action use a stepped assembly.
for i,(f,x,y,r) in enumerate([('payoff-0.00.png',21,50,-5),
                             ('payoff-12.00.png',50,50,0),
                             ('payoff-6.00.png',79,50,5)]):
    a=36+i*.15
    poses=[[a,x,56,.7,r,0],[a+.42,x,y,1,r,1],[38.8,x,y,1.035,r,1]]
    if i==2:poses += [[39.6,50,50,100/30,0,1],[39.99,50,50,100/30,0,1]]
    else:poses += [[39.55,x,55,.8,r,0],[39.99,x,55,.8,r,0]]
    photo(f,a,40,30,30 if i==2 else 44,poses,'cover')
photo('payoff-14.00.png',56,60,42,68,
    [[56,74,50,1.32,0,1],[56.6,74,50,1,0,1],[59.98,74,50,1.035,0,1]],'cover','ellipse')
(OUT/'photo-decisions.json').write_text(json.dumps(photos,indent=2)+'\n')

# A new warm, restrained original score: electric-piano-like partials, plucked
# bass, soft brush noise and dry taps. No samples or external music generation.
SR=48000
rng=np.random.default_rng(20261020)
score=np.zeros((60*SR,2),np.float64)
def add(buffer,start,samples,gain=1,pan=0):
    i=round(start*SR)
    if i<0:samples=samples[-i:];i=0
    n=min(len(samples),len(buffer)-i)
    if n<=0:return
    left=math.cos((pan+1)*math.pi/4);right=math.sin((pan+1)*math.pi/4)
    buffer[i:i+n,0]+=samples[:n]*gain*left
    buffer[i:i+n,1]+=samples[:n]*gain*right
def freq(midi):return 440*2**((midi-69)/12)
def piano(midi,seconds=2.7):
    t=np.arange(round(seconds*SR))/SR;f=freq(midi)
    env=(1-np.exp(-t*100))*np.exp(-t*1.7)
    return env*(np.sin(2*np.pi*f*t+.6*np.sin(2*np.pi*f*2*t)*np.exp(-t*3))+
                .19*np.sin(2*np.pi*f*3*t)*np.exp(-t*2))
def bass(midi,seconds=.65):
    t=np.arange(round(seconds*SR))/SR;f=freq(midi)
    return (1-np.exp(-t*240))*np.exp(-t*5)*(np.sin(2*np.pi*f*t)+.18*np.sin(4*np.pi*f*t))
def brush(seconds=.12):
    t=np.arange(round(seconds*SR))/SR;n=rng.normal(0,1,len(t))
    n=np.diff(n,prepend=0)
    return n*np.exp(-t*48)*(1-np.exp(-t*500))
def tap():
    t=np.arange(round(.14*SR))/SR
    return (np.sin(2*np.pi*950*t)+.3*np.sin(2*np.pi*1400*t))*np.exp(-t*72)
chords=[[53,60,63,67,72],[56,60,63,67,70],[51,58,62,65,70],[58,65,68,72,75]]
beat=.625
for b in range(24):
    start=b*4*beat
    chord=chords[b%4]
    for j,n in enumerate(chord):add(score,start+j*.018,piano(n),.055,[-.45,-.2,.2,.45,0][j])
    for offset,n in [(0,chord[0]-12),(1.5,chord[0]-12),(2,chord[0]-5),(3.5,chord[0]-12)]:
        add(score,start+offset*beat,bass(n),.13,-.08)
    for j in range(8):add(score,start+j*beat/2,brush(),.018 if j%2 else .024,.45 if j%2 else -.45)
    for j in [1,3]:add(score,start+j*beat,tap(),.035,-.25)
# A sparse high-register motif answers every other bar.
for start,notes in [(10,[72,75,79]),(20,[70,75,79]),(30,[74,77,82]),(40,[72,75,79]),(50,[70,75,79])]:
    for j,n in enumerate(notes):add(score,start+j*beat,piano(n,1.8),.07,.25)
fade=np.minimum(1,np.arange(len(score))/(SR*.035))*np.minimum(1,(len(score)-np.arange(len(score)))/(SR*1.2))
score*=fade[:,None]
score*=.72/max(abs(score.min()),abs(score.max()))
def wav(name,samples):
    if samples.ndim==1:samples=np.column_stack([samples,samples])
    data=np.round(np.clip(samples,-.98,.98)*32767).astype('<i2')
    p=A/name
    with wave.open(str(p),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes(data.tobytes())
    return dict(file=name,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),seconds=len(samples)/SR,original=True,sampleFree=True)
sound=[wav('Last-Touch-original-score.wav',score)]
# Disclosure: these are editorial kitchen-inspired sounds, not location audio.
for kind,duration in [('plate',.45),('slice',.16),('paper',.38),('pour',.7)]:
    t=np.arange(round(duration*SR))/SR;n=rng.normal(0,1,len(t))
    if kind=='plate':s=(np.sin(2*np.pi*1420*t)+.37*np.sin(2*np.pi*2303*t)+.22*np.sin(2*np.pi*3590*t))*np.exp(-t*19)
    elif kind=='slice':s=np.diff(n,prepend=0)*np.exp(-t*40)*np.minimum(1,t*500)
    elif kind=='paper':s=(n*.3+np.sin(2*np.pi*(200*t+1200*t*t))*.1)*np.sin(np.pi*t/duration)**2
    else:s=np.convolve(n,np.ones(9)/9,mode='same')*np.sin(np.pi*t/duration)**2+.12*np.sin(2*np.pi*520*t)*np.exp(-t*5)
    s*=.65/max(abs(s.min()),abs(s.max()))
    sound.append(wav(f'{kind}-original.wav',s))
(A/'sound-provenance.json').write_text(json.dumps(dict(
    creator='Original procedural composition authored for this Studio edit',
    tempoBpm=96,sourceAudio='All three source videos are silent',
    disclosure='Designed kitchen-inspired sound; no claim of synchronous recorded location audio.',files=sound),indent=2)+'\n')

direction=dict(title='THE LAST TOUCH',seconds=60,audience='Food filmmakers, chefs and restaurant creators',
    hook='The plate and final hand movement fill the frame before the opening editorial lockup.',
    structure=['Result first','Preparation','Service','Detail study','Final touches','Closing identity'],
    palette={'paper':PAPER,'forest':GREEN,'terracotta':RED,'olive':OLIVE},
    nativeOnly=True,publicGraphicsInterchange=True,externalVideoCompositor=False,
    sourceContinuityDisclosure='Stock kitchen film study; separate kitchens/dishes, no restaurant endorsement.',
    creativeApproval=False,publicUseAllowed=False)
(OUT/'creative-direction.json').write_text(json.dumps(direction,indent=2)+'\n')
print(json.dumps({'seconds':60,'nativeShots':len(edl),'graphicsLayers':len(layers),'photoLayers':len(photos),'originalSoundFiles':len(sound)}))
