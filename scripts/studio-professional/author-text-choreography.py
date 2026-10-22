#!/usr/bin/env python3
"""Author an interchange composition and original score; Studio renders it."""
import json
import math
import wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'reports/studio-text-choreography-20261018'
ASSETS = OUT / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)
metrics = json.loads((ROOT / 'python_media_worker/assets/studio-text-metrics.v1.json').read_text())['weights']['900']['advances']
layers = []
def key(prop, t, value, easing='linear', curve=None):
    return dict(property=prop, time=t, value=value, easing=easing, **({'curve': curve} if curve else {}))
def artwork(name, svg, start, duration, x=50, y=50, width=100, height=100, keys=None, opacity=1):
    layers.append(dict(id=name, name=name, type='artwork', svg=svg, startTime=start, duration=duration,
                       x=x, y=y, width=width, height=height, scale=1, rotation=0, opacity=opacity, keys=keys or []))
def title(name, text, start, duration, scale, y, color='#f5f0e5', animator=None, keys=None, rotation=0):
    layers.append(dict(id=name, name=name, type='text', text=text, startTime=start, duration=duration,
                       x=50, y=y, width=90, scale=scale, rotation=rotation, opacity=1, fontWeight=900,
                       textAlign='center', color=color, keys=keys or [],
                       **({'textAnimator': animator, 'textProgress': 100} if animator else {})))
artwork('Midnight drafting grid', '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#070b13"/><g stroke="#101b28" stroke-width="1">' + ''.join(f'<path d="M {x} 0 V 720"/>' for x in range(0,1281,80)) + ''.join(f'<path d="M 0 {y} H 1280"/>' for y in range(0,721,80)) + '</g></svg>', 0, 60)
scenes = [
    (5, 'MAKE THEM\nLOOK TWICE.', 'An idea deserves more than a scroll.', 'character', 'center_out', -1.3, -1.8, -135, .2, .8),
    (5, 'ONE GOOD IDEA.\nSO MANY TABS.', 'The manual posting routine feels familiar.', 'word', 'reverse', 3, 0, 24, 1.5, .1),
    (6, 'WRITE.\nPOST.\nREPEAT?', 'Your creativity should not feel repetitive.', 'character', 'forward', -.6, 2, -110, .15, .6),
    (6, 'LET THE WORK\nMOVE WITH YOU.', 'Make room for the part you enjoy.', 'word', 'center_out', 0, -2.4, 18, .25, -.65),
    (6, 'EVERY LETTER.\nITS OWN\nPERSONALITY.', 'One editable title. Independent letter motion.', 'character', 'edges_in', 1, 2.5, 165, .1, .75),
    (6, 'WORDS\nWITH\nPRESENCE.', 'Change the rhythm. Keep the message.', 'word', 'forward', -3, 0, -24, .35, .8),
    (6, 'FROM SCATTERED\nTO FOCUSED.', 'A center-out assembly, driven by progress keys.', 'character', 'center_out', 0, -2, 150, .1, 1),
    (6, 'YOUR MESSAGE.\nYOUR RHYTHM.', 'Reverse it. Hold it. Bring it back.', 'character', 'reverse', 0, 1.9, -85, .4, .5),
    (7, 'LESS REPETITION.\nMORE CREATION.', 'Use the time for your next good idea.', 'word', 'edges_in', 2.5, -.8, 24, .4, -.5),
    (7, 'WHAT WOULD\nYOU MAKE\nMOVE?', 'A word, a headline or your next campaign?', 'character', 'center_out', 0, 2.2, -160, .1, .8),
]
time = 0
boundaries = []
for i, (duration, copy, caption, unit, order, x, y, rotation, scale, tracking) in enumerate(scenes):
    end, accent = time + duration, ['#d8ff53', '#ff665d', '#a99bff'][i % 3]
    boundaries.append(dict(index=i+1, start=time, end=end, text=copy, unit=unit, order=order))
    # Typography is the hero. Graphic rails, a large fine ring and a leaning
    # colour panel frame the motion without masking the letter construction.
    artwork(f'Accent rail {i+1}', f'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="20"><rect x="0" y="8" width="800" height="4" rx="2" fill="{accent}"/></svg>', time, duration,
            x=50, y=24, width=75, height=3,
            keys=[key('scale',time,.1),key('scale',time+.8,1,'bezier',[.12,.8,.25,1]),key('scale',end-.5,1),key('scale',end,.1,'ease_in')])
    artwork(f'Orbit {i+1}', f'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><circle cx="300" cy="300" r="278" fill="none" stroke="{accent}" stroke-width="2"/><path d="M 300 2 V 32 M 568 300 H 598 M 300 568 V 598 M 2 300 H 32" stroke="{accent}" stroke-width="3"/></svg>', time, duration,
            x=82 if i % 2 else 18, y=53, width=40, height=71.111, opacity=.15,
            keys=[key('rotation',time,-20),key('rotation',end,160),key('scale',time,.65),key('scale',end,1.2)])
    animator = dict(version=1,unit=unit,order=order,stagger=62 if unit=='character' else 45,
                    fromX=x,fromY=y,fromScale=scale,fromRotation=rotation,fromOpacity=0,tracking=tracking,
                    rangeStart=0,rangeEnd=100,easing='back_out')
    longest = max(sum(metrics[c] for c in line) for line in copy.split('\n')) + 32
    hero_scale = min(4.3, 1060 / longest, 385 / (len(copy.split('\n'))*50.4+16))
    progress = [key('textProgress',time,0),key('textProgress',time+1.7,100),
                key('textProgress',end-.55,100),key('textProgress',end,0)]
    if i == 0:
        progress = [key('textProgress',0,100),key('textProgress',.8,100),key('textProgress',1.45,0),key('textProgress',3.1,100),key('textProgress',4.5,100),key('textProgress',5,0)]
    if i == 7:
        progress = [key('textProgress',time,0),key('textProgress',time+1.5,100),key('textProgress',time+2.3,100),key('textProgress',time+3.15,22),key('textProgress',time+4.3,100),key('textProgress',end-.5,100),key('textProgress',end,0)]
    title(f'Hero {i+1} — editable copy',copy,time,duration,hero_scale,51,accent if i in (2,4,7,9) else '#f5f0e5',animator,
          progress+[key('rotation',time,-3 if i%2 else 3),key('rotation',time+1.8,0,'ease_out'),key('scale',time,hero_scale*.94),key('scale',time+2,hero_scale,'ease_out'),key('scale',end,hero_scale*1.025)])
    title(f'Caption {i+1}',caption,time,duration,.64,86,'#bbc5cf',
          keys=[key('opacity',time,0),key('opacity',time+.6,1,'ease_out'),key('opacity',end-.45,1),key('opacity',end,0)])
    title(f'Scene {i+1}',f'{i+1:02d} / 10',time,duration,.52,15,accent,
          keys=[key('opacity',time,0),key('opacity',time+.3,1),key('opacity',end-.3,1),key('opacity',end,0)])
    time = end
assert time == 60
package = dict(format='autopromote-graphics',version=1,name='Make them look twice — text choreography',width=1280,height=720,duration=60,layers=layers,groups=[])
(ASSETS/'make-them-look-twice.graphics.json').write_text(json.dumps(package,indent=2))
(OUT/'design.json').write_text(json.dumps(dict(seconds=60,layers=len(layers),groups=0,keys=sum(len(l['keys']) for l in layers),scenes=boundaries),indent=2))
# Original local synthesis: no sample library, commercial music or model call.
rate, seconds = 48000, 60
audio = np.zeros((rate*seconds,2),dtype=np.float32)
rng = np.random.default_rng(20261018)
def add(start, signal, gain=1, pan=0):
    first = round(start*rate); end = min(len(audio),first+len(signal))
    if first >= end: return
    audio[first:end,0] += signal[:end-first]*gain*math.sqrt((1-pan)/2)
    audio[first:end,1] += signal[:end-first]*gain*math.sqrt((1+pan)/2)
for beat in np.arange(0,60,.5):
    t=np.arange(round(.32*rate))/rate
    kick=np.sin(2*np.pi*(42*t+55*.025*(1-np.exp(-t/.025))))*np.exp(-t*17)
    add(beat,kick,.36)
    t=np.arange(round(.08*rate))/rate
    add(beat+.25,rng.standard_normal(len(t)).astype(np.float32)*np.exp(-t*75),.025,.35 if int(beat*2)%2 else -.35)
for i,chord in enumerate([(130.81,164.81,196),(110,130.81,164.81),(87.31,110,130.81),(98,123.47,146.83)]*4):
    start=i*4
    if start>=60: break
    t=np.arange(4*rate)/rate
    env=np.minimum(t/.15,1)*np.minimum((4-t)/.5,1)
    signal=sum(np.sin(2*np.pi*f*t+.09*np.sin(2*np.pi*.23*t)) for f in chord)/3
    add(start,signal*env,.12,(-.3 if i%2 else .3))
for scene in boundaries:
    start=scene['start']
    t=np.arange(round(.45*rate))/rate
    noise=rng.standard_normal(len(t)); sweep=np.sin(2*np.pi*(210*t+1300*t*t))
    add(start, (noise*.12+sweep*.25)*np.sin(np.pi*t/.45)**2,.12,-.4)
    t=np.arange(round(.8*rate))/rate
    add(start+1.7,np.sin(2*np.pi*880*t)*np.exp(-t*9)+np.sin(2*np.pi*1320*t)*np.exp(-t*12)*.4,.13,.3)
peak=float(np.max(np.abs(audio))); audio *= .88 / peak
fade=np.minimum(np.arange(len(audio))/(rate*.04),1)*np.minimum((len(audio)-1-np.arange(len(audio)))/(rate*.35),1)
audio *= fade[:,None]
with wave.open(str(ASSETS/'Make-them-look-twice-original-score.wav'),'wb') as wav:
    wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(rate);wav.writeframes((audio*32767).astype('<i2').tobytes())
(ASSETS/'sound-provenance.json').write_text(json.dumps(dict(kind='original local mathematical synthesis',seed=20261018,sampleRate=rate,seconds=60,providerJobs=0,samplesImported=0),indent=2))
print(json.dumps(dict(seconds=60,layers=len(layers),keys=sum(len(l['keys']) for l in layers))))
