#!/usr/bin/env python3
"""Native Graphics interchange, edit decision sheet and original effect cues.

No source video is cut or pre-composited here: Studio owns the actual edit.
"""
import json, math, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'reports/studio-real-footage-edit-20261018'
ASSETS = OUT / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)
shots = [
    ('40967',6,9), ('43232',2,4), ('13261',1,3),
    ('40954',.5,2.5), ('43233',3,5), ('13258',6,8), ('40967',9,11),
    ('43232',9.5,12.5), ('43233',5,8), ('43232',12,14), ('43233',0,2),
    ('13258',2,5), ('15875',1,3), ('13261',6,10), ('13258',9,11),
    ('40967',1,3), ('40954',3,5), ('40967',4,7), ('40954',5,7),
    ('43232',15,17), ('13258',4,6), ('40967',10,12), ('43233',7,9),
    ('13261',10,13), ('40967',4.5,12.5),
]
time = 0; edl = []
for asset,a,b in shots:
    edl.append(dict(assetId=asset, sourceIn=a, sourceOut=b, programmeIn=time, programmeOut=time+b-a))
    time += b-a
assert time == 64
(OUT/'edit-decisions.json').write_text(json.dumps(dict(name='CRAFT — no accident', preRampSeconds=time,
    finalSeconds=60, shots=edl, ending='Final native trim follows the output clock after the editable boxing speed ramp.'),indent=2)+'\n')

layers=[]
WHITE, LIME, INK = '#fff9ee', '#d8ff53', '#101316'
def key(prop,t,v,e='linear'):
    return dict(property=prop,time=t,value=v,easing=e)
def title(name,copy,a,b,x=50,y=76,scale=2.8,color=WHITE,anim=False):
    l=dict(id=f'craft-{len(layers):03}',name=name,type='text',text=copy,startTime=a,duration=b-a,
        x=x,y=y,width=94,scale=scale,rotation=0,opacity=1,color=color,fontWeight=900,textAlign='center',keys=[])
    if anim:
        l['textAnimator']=dict(version=1,unit='character',order='center_out',stagger=54,
            fromX=.15,fromY=1.25,fromScale=.25,fromRotation=-22,fromOpacity=0,tracking=.45,
            rangeStart=0,rangeEnd=100,easing='back_out')
        l['textProgress']=100
        l['keys']=[key('textProgress',a,0),key('textProgress',a+.8,100),key('textProgress',b-.3,100),key('textProgress',b,0)]
    else:
        l['keys']=[key('opacity',a,0),key('opacity',a+.12,1),key('opacity',b-.15,1),key('opacity',b,0)]
    layers.append(l);return l
def art(name,svg,a,b,x=50,y=50,w=100,h=100,opacity=1):
    l=dict(id=f'craft-{len(layers):03}',name=name,type='artwork',svg=svg,startTime=a,duration=b-a,
        x=x,y=y,width=w,height=h,scale=1,rotation=0,opacity=opacity,keys=[])
    layers.append(l);return l

# A transparent lower gradient keeps the original filmed action visible.
art('Lower-third contrast veil', '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0.5" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.75"/></linearGradient></defs><rect width="1280" height="720" fill="url(#v)"/></svg>',0,60)
title('Opening / Great work','GREAT WORK.',0,1.4,y=78,scale=3.5,anim=True)
title('Opening / No accident','IS NO ACCIDENT.',1.4,3,y=78,scale=2.7,color=LIME,anim=True)
for name,copy,a,b,col in [('Detail','THE DETAIL.',3,5,WHITE),('Finish','THE FINISH.',5,7,LIME),('Timing','THE TIMING.',7,9,WHITE),('Repeat','THE REPEAT.',9,11,LIME),('Small choices','SMALL CHOICES.',11,13,WHITE),('One mindset','ONE MINDSET.',13,15,LIME)]:
    title(name,copy,a,b,y=78,scale=2.4,color=col,anim=True)
for number,headline,sub,a,b in [
    ('01','PRECISION','Every millimetre matters.',15,25),
    ('02','INTENTION','The last touch changes everything.',25,36),
    ('03','TIMING','Read the moment. Then commit.',36,45)]:
    title(number+' / chapter',number+'   /   THE CRAFT',a,b,x=50,y=12,scale=.55,color=LIME)
    title(number+' / hero',headline,a,a+3,y=76,scale=3.4,color=WHITE,anim=True)
    title(number+' / supporting copy',sub,a+3,b,y=84,scale=.8,color=WHITE)
    line=art(number+' / moving rule','<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="10"><rect width="1024" height="10" fill="#d8ff53"/></svg>',a,a+3,x=50,y=89,w=80,h=1)
    line['keys']=[key('scale',a,.1),key('scale',a+.6,1,'ease_out'),key('scale',a+2.6,1),key('scale',a+3,.1,'ease_in')]
for i,(copy,a,b) in enumerate([('LOOK CLOSER.',45,47),('STAY INTENTIONAL.',47,49),('FIND THE MOMENT.',49,51),('REFINE IT.',51,53),('FINISH STRONG.',53,56)]):
    title('Final build / '+str(i),copy,a,b,y=78,scale=2.65,color=LIME if i%2 else WHITE,anim=True)
# Two masked halves assemble the closing word: actual editable ordinary layers.
for i,(top,bottom) in enumerate([(0,50),(50,100)]):
    l=title('Closing / CRAFT half '+str(i+1),'CRAFT.',56,60,y=72,scale=4.5,color=WHITE if i==0 else LIME)
    l['mask']=dict(enabled=True,shape='polygon',path=f'polygon(0% {top}%,100% {top}%,100% {bottom}%,0% {bottom}%)',feather=0,inverted=False)
    l['keys'] += [key('x',56,15 if i==0 else 85),key('x',56.55,50,'ease_out'),key('rotation',56,-10 if i==0 else 10),key('rotation',56.55,0,'ease_out')]
title('Closing / question','Which craft would you make your own?',57,60,y=89,scale=.7,color=WHITE)
title('Source disclosure','STOCK FOOTAGE / CREATIVE EDIT',0,60,y=96,scale=.28,color=WHITE)
package=dict(format='autopromote-graphics',version=1,name='CRAFT — cinematic footage edit',width=1280,height=720,duration=60,layers=layers,groups=[])
(ASSETS/'craft-output-clock.graphics.json').write_text(json.dumps(package,indent=2)+'\n')
# The public interchange uses programme time. Preserve the editorial output
# design, then convert it through the exact native plan after the UI ramp/trim.
native_document = OUT / 'proof/one-minute-cut-document.json'
if native_document.exists():
    document = json.loads(native_document.read_text())
    def programme_time(seconds):
        tick = round(seconds * 90000)
        for segment in document['outputTimeMap']:
            output, programme = segment['outputRange'], segment['programmeRange']
            if output['startTick'] <= tick <= output['endTick']:
                return round(programme['startTick'] + (tick-output['startTick']) *
                    (programme['endTick']-programme['startTick']) /
                    (output['endTick']-output['startTick'])) / 90000
        raise ValueError('Editorial time is outside the native output clock')
    for item in layers:
        start, end = item['startTime'], item['startTime'] + item['duration']
        item['startTime'] = programme_time(start)
        item['duration'] = programme_time(end) - item['startTime']
        for point in item['keys']: point['time'] = programme_time(point['time'])
    package['duration'] = programme_time(60)
    (OUT/'graphics-clock-binding.json').write_text(json.dumps(dict(
        desiredOutputSeconds=60, nativeProgrammeSeconds=package['duration'],
        mappingSource='proof/one-minute-cut-document.json', publicGraphicsImportOnly=True,
        graphInjection=False, note='Desired output times mapped through the native saved speed plan before normal Graphics import.'),indent=2)+'\n')
(ASSETS/'craft.graphics.json').write_text(json.dumps(package,indent=2)+'\n')
(OUT/'design.json').write_text(json.dumps(dict(seconds=60,layers=len(layers),keys=sum(len(l['keys']) for l in layers),nativeSourceCuts=len(edl),nativeSpeedRamp=True,sourceFootageVisible=True),indent=2)+'\n')

# Original, short effects imported as separate editable Studio Sound cues.
rate=48000;rng=np.random.default_rng(181026)
for kind in ['whoosh','impact']:
    duration=.65 if kind=='whoosh' else .7;t=np.arange(round(duration*rate))/rate
    noise=rng.normal(0,1,len(t));noise=np.convolve(noise,np.ones(7)/7,mode='same')
    if kind=='whoosh': signal=noise*np.sin(np.pi*t/duration)**2*.65
    else:signal=(np.sin(2*np.pi*(44*t+45*.03*(1-np.exp(-t/.03))))*np.exp(-t*10)+noise*np.exp(-t*23)*.4)*.7
    signal=np.tanh(signal);stereo=np.column_stack([signal,signal])
    with wave.open(str(ASSETS/f'original-{kind}.wav'),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(rate);f.writeframes((stereo*26000).astype('<i2').tobytes())
print('Authored 25 native shot decisions,',len(layers),'editable graphic layers and two original effect sources. No video preprocessing.')
