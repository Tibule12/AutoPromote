#!/usr/bin/env python3
"""Author source graphics/audio. Studio imports, evaluates and renders the edit."""
import json
import math
import random
import struct
import wave
from pathlib import Path
from PIL import ImageFont

ROOT = Path('reports/studio-make-some-noise-20261016')
ASSETS = ROOT / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)
ACID, BLUE, INK, PAPER = '#dfff00', '#1729de', '#101115', '#fffdf4'
FONT = ImageFont.truetype('python_media_worker/assets/fonts/Inter-Black.ttf', 36)
layers, groups = [], []
curve, spring = [.16, 1, .3, 1], [.18, 1.25, .3, 1]

def key(layer, prop, points):
    for point in points:
        time, value = point[:2]
        easing = point[2] if len(point) > 2 else 'bezier'
        layer['keys'].append(dict(property=prop, time=round(time*90000)/90000,
            value=value, easing=easing, **({'curve': point[3] if len(point)>3 else curve} if easing=='bezier' else {})))

def text(id, copy, start, end, x=50, y=50, scale=4.8, color=INK, **extra):
    item=dict(id=id, name=id, type='text', text=copy, startTime=start,
        duration=round((end-start)*90000)/90000, x=x, y=y, scale=scale,
        rotation=0, opacity=1, width=95, fontWeight=900, textAlign='center', color=color, keys=[])
    item.update(extra)
    layers.append(item)
    return item

def art(id, svg, start, end, x=50, y=50, width=100, height=100):
    item=dict(id=id, name=id, type='artwork', svg=svg, startTime=start, duration=end-start,
        x=x, y=y, width=width, height=height, scale=1, rotation=0, opacity=1, keys=[])
    layers.append(item)
    return item

def rect(color):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="{color}"/></svg>'

def group(id, children, start, end, zoom):
    item=dict(id=id, name=id, layerIds=[l['id'] for l in children], startTime=start, duration=end-start, keys=[])
    key(item, 'scale', [(start, zoom), (end-.5, zoom, 'hold'), (end, zoom*1.04, 'ease_in')])
    groups.append(item)
    return item

def centers(word, size):
    return [50+(FONT.getlength(word[:i])+FONT.getlength(c)/2-FONT.getlength(word)/2)*size/1280*100 for i,c in enumerate(word)]

# These are real background layers over the clean ink source, with hard cuts
# at the same three-second beats as the word groups. No stock/video underlay.
art('00 · Acid paper', rect(ACID), 0, 12)
art('02 · Blue paper', rect(BLUE), 3, 6)
art('04 · Blue paper', rect(BLUE), 9, 12)

make=[]
for i,(c,x) in enumerate(zip('MAKE',centers('MAKE',4.8))):
    start=i*.12
    l=text(f'01 · MAKE {i+1} / {c}',c,start,3,x=x)
    key(l,'x',[(start,[12,85,20,88][i]),(.65+i*.04,x),(3,x,'hold')])
    key(l,'y',[(start,[92,8,84,12][i]),(.65+i*.04,50,'bezier',spring),(2.6,50,'hold'),(3,47,'ease_in')])
    key(l,'rotation',[(start,[-140,110,-90,140][i]),(.65+i*.04,0,'bezier',spring),(2.5,0,'hold'),(3,-8,'ease_in')])
    key(l,'scale',[(start,.1),(.4+i*.06,5),(.7+i*.06,4.8),(1.5+i*.09,4.8,'hold'),(1.65+i*.09,5),(1.85+i*.09,4.8),(3,4.8,'hold')])
    make.append(l)
g=group('01 · MAKE / assemble',make,0,3,1.6)
tag=text('01 · A LITTLE COURAGE.','A LITTLE COURAGE.',.75,2.8,y=17,scale=.65,fontWeight=600)
key(tag,'opacity',[(.75,0,'linear'),(1.0,1,'linear'),(2.6,1,'hold'),(2.8,0,'linear')])

some=[]
for i,(c,x) in enumerate(zip('SOME',centers('SOME',4.8))):
    start=3+i*.1
    l=text(f'02 · SOME {i+1} / {c}',c,start,6,x=x,color=ACID)
    key(l,'x',[(start,x+(-12 if i%2 else 12)),(start+.55,x),(6,x,'hold')])
    key(l,'y',[(start,18 if i%2 else 82),(start+.55,50,'bezier',spring),(5.5,50,'hold'),(6,50,'hold')])
    key(l,'rotation',[(start,90 if i%2 else -90),(start+.55,0,'bezier',spring),(6,0,'hold')])
    key(l,'scale',[(start,.1),(start+.3,5),(start+.6,4.8),(6,4.8,'hold')])
    some.append(l)
for i,y in enumerate([20,80]):
    l=text(f'02 · SOME outline {i+1}','SOME',3,6,y=y,scale=4.8,color=BLUE,strokeWidth=1.5,strokeColor=ACID)
    l['opacity']=.3
    key(l,'x',[(3,38 if i else 62),(4.1,50),(6,62 if i else 38,'ease_in')])
    some.insert(0,l)
for l in some:
    layers.remove(l)
layers.extend(some)
group('02 · SOME / countertype',some,3,6,1.6)

noise=[]
for i,(c,x) in enumerate(zip('NOISE',centers('NOISE',4.8))):
    start=6+i*.08
    l=text(f'03 · NOISE {i+1} / {c}',c,start,9,x=x,y=45,color=BLUE if i%2 else INK)
    key(l,'y',[(start,82 if i%2 else 8),(start+.5,45,'bezier',spring),(7.0+i*.1,45,'hold'),(7.2+i*.1,37),(7.45+i*.1,45),(8.5,45,'hold'),(9,45,'hold')])
    key(l,'rotation',[(start,110 if i%2 else -110),(start+.5,0,'bezier',spring),(7.0+i*.1,0,'hold'),(7.2+i*.1,12 if i%2 else -12),(7.45+i*.1,0),(9,0,'hold')])
    key(l,'scale',[(start,.1),(start+.35,5),(start+.6,4.8),(9,4.8,'hold')])
    noise.append(l)
group('03 · NOISE / travelling accent',noise,6,9,1.5)
for i,x in enumerate([43,50,57]):
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="160"><rect width="40" height="160" rx="20" fill="{BLUE}"/></svg>'
    l=art(f'03 · Meter {i+1}',svg,6,9,x=x,y=77,width=1.1,height=8)
    key(l,'scale',[(6,.1),(6.25+i*.08,1),(6.75,.35),(7.15+i*.06,1.35),(7.7,.5),(8.15+i*.05,1),(8.7,.35),(9,.1)])
text('03 · LET THEM HEAR YOU.','LET THEM HEAR YOU.',6.6,8.8,y=92,scale=.6,fontWeight=600)

ending=[]
for i,(copy,y,size) in enumerate([('MAKE',28,3.8),('SOME',48,3.8),('NOISE.',71,4.8)]):
    start=9+i*.16
    l=text(f'04 · {copy}',copy,start,12,y=y,scale=size,color=ACID if i==2 else PAPER)
    key(l,'x',[(start,15 if i%2 else 85),(start+.6,50,'bezier',spring),(12,50,'hold')])
    key(l,'rotation',[(start,-20 if i%2 else 20),(start+.6,0,'bezier',spring),(12,0,'hold')])
    key(l,'opacity',[(start,0,'linear'),(start+.15,1,'linear')])
    ending.append(l)
group('04 · MAKE SOME NOISE / resolve',ending,9,12,1.15)
text('04 · YOUR VOICE. YOUR RULES.','YOUR VOICE. YOUR RULES.',10,12,y=94,scale=.55,color=PAPER,fontWeight=600)
lines=''.join(f'<line x1="100" y1="10" x2="100" y2="55" stroke="{ACID}" stroke-width="6" transform="rotate({i*45} 100 100)"/>' for i in range(8))
l=art('04 · Sound burst',f'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">{lines}</svg>',9,10.6,x=84,y=30,width=10,height=18)
key(l,'scale',[(9,.1),(9.5,1.2,'bezier',spring),(10.1,1),(10.6,.1,'ease_in')])
key(l,'rotation',[(9,-90),(10.6,45,'linear')])
key(l,'opacity',[(9,0,'linear'),(9.2,1,'linear'),(10.2,1,'hold'),(10.6,0,'linear')])

spec=dict(format='autopromote-graphics',version=1,name='MAKE SOME NOISE — kinetic poster',width=1280,height=720,duration=12,layers=layers,groups=groups)
(ASSETS/'make-some-noise.graphics.json').write_text(json.dumps(spec,indent=2)+'\n')
(ROOT/'design.json').write_text(json.dumps(dict(copy='MAKE SOME NOISE',duration=12,palette=[ACID,BLUE,INK,PAPER],layers=len(layers),groups=len(groups),keys=sum(len(l['keys']) for l in layers+groups),direction='Four-corner MAKE assembly; counter-rotating SOME with sliding outline poster rows; travelling NOISE accent and meter; three-line resolution. All motion becomes ordinary Studio keys.',nativeImportRequired=True),indent=2)+'\n')

# Original 120 BPM score: tonal kicks, noisy claps, ticks and pitched plucks.
rate=48000
samples=[0.0]*(rate*12)
rng=random.Random(16102026)
def add(at,duration,fn):
    start=round(at*rate)
    for j in range(round(duration*rate)):
        if start+j<len(samples): samples[start+j]+=fn(j/rate)
for beat in range(24):
    t=beat*.5
    add(t,.25,lambda s: .55*math.sin(2*math.pi*(48*s+8*(1-math.exp(-22*s))))*math.exp(-18*s))
    if beat%2: add(t,.12,lambda s: .18*rng.uniform(-1,1)*math.exp(-35*s))
    for sub in range(2): add(t+sub*.25,.035,lambda s: .06*rng.uniform(-1,1)*math.exp(-100*s))
    hz=[164.81,196,146.83,220][beat//6]
    add(t+.125,.32,lambda s,hz=hz: .18*(math.sin(2*math.pi*hz*s)+.25*math.sin(2*math.pi*hz*2*s))*math.exp(-12*s))
for stage in range(4):
    for letter in range(4 if stage<2 else 5 if stage==2 else 3):
        add(stage*3+letter*(.12 if stage<2 else .08 if stage==2 else .16),.08,
            lambda s: .13*rng.uniform(-1,1)*math.exp(-55*s)+.13*math.sin(2*math.pi*880*s)*math.exp(-70*s))
peak=max(abs(s) for s in samples)
with wave.open(str(ASSETS/'noise-score-source.wav'),'wb') as out:
    out.setnchannels(2);out.setsampwidth(2);out.setframerate(rate)
    for i,s in enumerate(samples):
        fade=min(1,i/(rate*.02),(len(samples)-i)/(rate*.22))
        value=round(s/peak*.82*fade*32767)
        out.writeframesraw(struct.pack('<hh',value,value))
print(f'Authored {len(layers)} layers, {len(groups)} groups and {sum(len(l["keys"]) for l in layers+groups)} editable keys.')
